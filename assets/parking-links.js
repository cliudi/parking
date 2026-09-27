/* Public navigation only: Telegram start_param is NOT an identity or permission.
   Shared URLs contain only a parking UUID, never location/auth launch data. */
window.ParkyLinks=(()=>{
  const base='https://cliudi.github.io/parking/';
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const valid=id=>typeof id==='string'&&uuid.test(id);
  const webUrl=id=>valid(id)?base+'?parking='+id.toLowerCase():null;
  const telegramUrl=id=>valid(id)?'https://t.me/parky_app_bot?startapp=parking_'+id.toLowerCase():null;
  const words={
    ru:{loading:'Открываем парковку…',missing:'Парковка недоступна. Возможно, она скрыта или удалена.',error:'Не удалось загрузить парковку. Проверьте интернет и повторите.',invalid:'Ссылка на парковку некорректна.',retry:'Повторить',copy:'Скопировать ссылку',manual:'Не удалось скопировать автоматически. Выделите ссылку и скопируйте её.',title:'Поделиться парковкой'},
    en:{loading:'Opening parking…',missing:'Parking unavailable. It may be hidden or deleted.',error:'Could not load parking. Check your connection and retry.',invalid:'Invalid parking link.',retry:'Retry',copy:'Copy link',manual:'Could not copy automatically. Select and copy the link.',title:'Share parking'},
    uz:{loading:'Avtoturargoh ochilmoqda…',missing:'Avtoturargoh mavjud emas. U yashirilgan yoki o‘chirilgan bo‘lishi mumkin.',error:'Yuklab bo‘lmadi. Internetni tekshiring va qayta urining.',invalid:'Avtoturargoh havolasi noto‘g‘ri.',retry:'Qayta urinish',copy:'Havolani nusxalash',manual:'Avtomatik nusxalanmadi. Havolani belgilang va nusxalang.',title:'Avtoturargohni ulashish'}
  };
  const copy=()=>words[lang]||words.ru;
  let controller=null,sequence=0,shared=null,sharedSegment=null,launchHandled=false;
  function parseLaunch(){
    const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
    if(query.has('parking'))return query.get('parking');
    const start=query.get('tgWebAppStartParam')||hash.get('tgWebAppStartParam')||window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if(!start)return null;
    return typeof start==='string'&&start.startsWith('parking_')?start.slice(8):'';
  }
  // PostGIS geography is returned by the existing public API as EWKB Point.
  // Accept only finite WGS84 points; no generic binary geometry parser needed.
  function coordinates(value){
    if(typeof value!=='string'||!/^[0-9a-f]{50}$/i.test(value))throw Error('Invalid point');
    const bytes=Uint8Array.from(value.match(/../g),x=>parseInt(x,16)),view=new DataView(bytes.buffer);
    if(bytes[0]!==0&&bytes[0]!==1)throw Error('Invalid byte order');
    const little=bytes[0]===1;
    if(view.getUint32(1,little)!==0x20000001||view.getUint32(5,little)!==4326)throw Error('Invalid point reference');
    const lng=view.getFloat64(9,little),lat=view.getFloat64(17,little);
    if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)throw Error('Invalid coordinates');
    return {lat,lng};
  }
  function cancel(){sequence++;controller?.abort();controller=null}
  function message(text,retry){
    openSheet('<div class="parking-link-panel" data-parky-link><button class="sheet-close" aria-label="'+escapeHtml(t('close'))+'">×</button><h2>Parky</h2><p role="status"></p><div class="parking-link-actions"></div></div>');
    const panel=document.querySelector('[data-parky-link]');
    panel.querySelector('p').textContent=text;
    panel.querySelector('button').onclick=()=>{cancel();closeSheet()};
    if(retry){const button=document.createElement('button');button.className='btn-primary';button.textContent=copy().retry;button.onclick=retry;panel.querySelector('.parking-link-actions').append(button)}
  }
  function attach(){
    if(!shared)return;
    PARKINGS=[...PARKINGS.filter(p=>p.id!==shared.id),shared];
    if(sharedSegment){streetSegments=[...streetSegments.filter(s=>String(s.parking_id)!==shared.id),sharedSegment];streetSegmentIds=new Set(streetSegments.map(s=>String(s.parking_id)))}
  }
  function isOpen(){return shared&&activeTab==='map'&&selectedId===shared.id&&(document.getElementById('minicard').classList.contains('on')||document.getElementById('mask').classList.contains('open'))}
  function retain(){if(isOpen())attach()}
  function mapReady(){if(isOpen()&&activeTab==='map'&&ymap){userPanned=true;ymap.setCenter([shared.lat,shared.lng],16);drawMarkers(true);drawStreetSegments()}}
  async function open(id){
    cancel();shared=null;sharedSegment=null;
    if(!valid(id)){message(copy().invalid);return}
    id=id.toLowerCase();const version=sequence,ctrl=new AbortController();controller=ctrl;
    message(copy().loading);userPanned=true;
    const timeout=setTimeout(()=>ctrl.abort(),15000);
    try{
      // Explicit allowlist: no owner IDs, moderation notes or private metadata.
      const fields='id,name,address,location,status,category,kind,price_type,price_hour,price_day,price_note,capacity,capacity_est,hours,is_247,height_limit,has_cctv,has_disabled,payment_methods,has_ev,ev_connectors,photos,source,verified_at,has_barrier,barrier_at_entry,barrier_at_exit,requires_ticket,entry_rules,exit_rules,has_free_period,free_period_minutes,price_after_free_period,price_after_free_period_unit,requires_purchase,requires_receipt,tariff_note,tariff_verified_at,tariff_source_ref';
      const query=new URLSearchParams({select:fields,id:'eq.'+id,status:'eq.APPROVED',limit:'1'});
      // Always anonymous, even if an administrator is logged in in this browser.
      const response=await fetch(SUPABASE_URL+'/rest/v1/parkings?'+query,{signal:ctrl.signal,headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});
      if(!response.ok)throw Error('Parking unavailable');
      const rows=await response.json();
      if(!Array.isArray(rows))throw Error('Invalid response');
      if(version!==sequence)return;
      const row=rows.find(r=>r.id===id&&r.status==='APPROVED');
      if(!row){message(copy().missing);return}
      const point=coordinates(row.location);
      const parking=fromDbRow({...row,lat_out:point.lat,lng_out:point.lng});
      let segment=null;
      if(parking.category==='STREET_ALLOWED'){
        const lines=await loadStreetSegments(ctrl.signal);
        if(version!==sequence)return;
        if(!lines)throw Error('Section unavailable');
        segment=lines.find(s=>String(s.parking_id)===id);
        if(!segment||(!segment.details?.legacy_point&&!['free','paid'].includes(parking.price_type))){message(copy().missing);return}
      }
      if(version!==sequence)return;
      controller=null;shared=parking;sharedSegment=segment;
      closeSheet();clearSelectedPoint();attach();switchTab('map');selectParking(id);mapReady();
    }catch(e){if(version===sequence)message(copy().error,()=>open(id))}
    finally{clearTimeout(timeout);if(controller===ctrl)controller=null}
  }
  function sharePanel(p,url){
    openSheet('<div class="parking-link-panel"><button class="sheet-close" aria-label="'+escapeHtml(t('close'))+'">×</button><h2></h2><label></label><input readonly class="parking-share-url"><p role="status"></p><div class="parking-link-actions"></div></div>');
    const panel=document.querySelector('.parking-link-panel'),input=panel.querySelector('input');
    panel.querySelector('.sheet-close').onclick=closeSheet;
    panel.querySelector('h2').textContent=copy().title;panel.querySelector('label').textContent=p.name;
    input.value=url;input.setAttribute('aria-label',copy().copy);input.onclick=()=>input.select();
    const button=document.createElement('button');button.className='btn-primary';button.textContent=copy().copy;
    button.onclick=async()=>{try{await navigator.clipboard.writeText(url);toast(t('linkCopied'))}catch{panel.querySelector('p').textContent=copy().manual;input.focus();input.select()}};
    panel.querySelector('.parking-link-actions').append(button);
    const tg=document.createElement('a');tg.className='btn-outline';tg.textContent=({ru:'Поделиться в Telegram',en:'Share in Telegram',uz:'Telegram orqali ulashish'})[lang];
    tg.href='https://t.me/share/url?'+new URLSearchParams({url:telegramUrl(p.id),text:p.name});tg.target='_blank';tg.rel='noopener noreferrer';
    tg.onclick=event=>{const app=window.Telegram?.WebApp;if(app?.isVersionAtLeast?.('6.1')&&app.openTelegramLink){event.preventDefault();app.openTelegramLink(tg.href)}};
    panel.querySelector('.parking-link-actions').append(tg);
  }
  async function share(id){
    const p=PARKINGS.find(p=>p.id===id),url=webUrl(id);if(!p||!url)return;
    const primary=document.documentElement.classList.contains('telegram-app')?telegramUrl(id):url;
    if(navigator.share){try{await navigator.share({title:p.name,text:p.addr,url:primary});return}catch(e){if(e.name==='AbortError')return}}
    sharePanel(p,url);
  }
  async function launch(){
    if(launchHandled)return;
    const id=parseLaunch();if(id===null)return;
    launchHandled=true;
    await onboardingReady;
    open(id);
  }
  new MutationObserver(()=>{
    if(controller&&(!document.getElementById('mask').classList.contains('open')||!document.querySelector('[data-parky-link]')))cancel();
  }).observe(document.getElementById('mask'),{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('parky:telegram-ready',launch);
  launch();
  return {share,open,retain,mapReady,webUrl,telegramUrl,coordinates,parseLaunch};
})();
