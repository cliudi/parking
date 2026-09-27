/* Destination results have their own request and data; GPS/map loads cannot replace them. */
window.ParkyDestination=(()=>{
  let target=null,rows=[],segments=[],choices=[],state='idle',radius=300,sequence=0,controller=null,searchSequence=0,searchController=null;
  const ui={
    ru:{title:'Куда вы едете?',subtitle:'Выберите место — найдём парковки рядом. Картой пользоваться необязательно.',ph:'Название места или адрес',searching:'Ищем место…',choose:'Выберите место назначения',none:'Место не найдено. Уточните адрес или выберите точку на карте.',error:'Не удалось выполнить поиск. Попробуйте ещё раз.',loading:'Ищем парковки рядом…',near:'Парковки рядом с',empty:'В пределах 1 км опубликованных парковок не найдено.',distance:'Примерное расстояние по прямой до места назначения, не пеший маршрут.',expanded:'Ближе вариантов нет. Радиус расширен до',retry:'Повторить',map:'На карте',route:'Маршрут',details:'Подробнее',missing:'Карта ещё загружается. Повторите через несколько секунд.',partial:'Часть сведений об условиях или уличных участках недоступна. Повторите загрузку.',addressOnly:'Поиск организаций недоступен; показаны адресные результаты.'},
    en:{title:'Where are you going?',subtitle:'Choose a destination to find parking nearby.',ph:'Place or address',searching:'Searching…',choose:'Choose a destination',none:'No places found. Try an address or choose a point on the map.',error:'Search failed. Please try again.',loading:'Finding nearby parking…',near:'Parking near',empty:'No published parking found within 1 km.',distance:'Approximate straight-line distance to the destination, not a walking route.',expanded:'No closer results. Radius expanded to',retry:'Retry',map:'Map',route:'Navigate',details:'Details',missing:'Map is still loading. Try again shortly.',partial:'Some conditions or street sections are unavailable. Retry loading.',addressOnly:'Place search unavailable; showing address results.'},
    uz:{title:'Qayerga bormoqchisiz?',subtitle:'Manzilni tanlang — yaqin avtoturargohlarni topamiz.',ph:'Joy nomi yoki manzil',searching:'Qidirilmoqda…',choose:'Manzilni tanlang',none:'Joy topilmadi. Manzilni aniqlashtiring yoki xaritadan tanlang.',error:'Qidiruv bajarilmadi. Qayta urinib ko‘ring.',loading:'Yaqin avtoturargohlar qidirilmoqda…',near:'Yaqin avtoturargohlar:',empty:'1 km ichida e’lon qilingan avtoturargoh topilmadi.',distance:'Manzilgacha taxminiy to‘g‘ri chiziqli masofa, piyoda yo‘li emas.',expanded:'Yaqinroq joy yo‘q. Radius kengaytirildi:',retry:'Qayta urinish',map:'Xaritada',route:'Yo‘nalish',details:'Batafsil',missing:'Xarita yuklanmoqda. Birozdan so‘ng qayta urining.',partial:'Ayrim shartlar yoki ko‘cha qismlari yuklanmadi. Qayta urinib ko‘ring.',addressOnly:'Tashkilotlar qidiruvi ishlamayapti; manzillar ko‘rsatilgan.'}
  };
  let partial=false;
  // First release intentionally searches addresses, not organization branches.
  Object.assign(ui.ru,{ph:'Улица и номер дома',subtitle:'Введите адрес или выберите точку на карте — найдём парковки рядом.',addressOnly:'Поиск по адресу. Поиск организаций пока не подключён.'});
  Object.assign(ui.en,{ph:'Street and building number',subtitle:'Enter an address or choose a map point to find parking nearby.',addressOnly:'Address search. Business search is not enabled yet.'});
  Object.assign(ui.uz,{ph:'Ko‘cha va uy raqami',subtitle:'Manzil kiriting yoki xaritadan nuqta tanlang — yaqin avtoturargohlarni topamiz.',addressOnly:'Manzil bo‘yicha qidiruv. Tashkilotlar qidiruvi hali yoqilmagan.'});
  const copy=()=>ui[lang]||ui.ru,el=id=>document.getElementById(id);
  function labels(){const c=copy();el('homeHeadline').textContent=c.title;el('homeSubtitle').textContent=c.subtitle;el('homeSearch').placeholder=c.ph;el('homeSearch').setAttribute('aria-label',c.ph);el('destinationNearbyButton').textContent=t('homeNear');el('destinationSearchButton').textContent=({ru:'Найти парковку',en:'Find parking',uz:'Avtoturargoh topish'})[lang]}
  function recent(){
    const box=el('destinationChoices');box.replaceChildren();
    const history=loadSearchHistory().slice(0,4);if(!history.length)return;
    const heading=document.createElement('small');heading.textContent=t('recentSearches');box.append(heading);
    history.forEach(query=>{const b=document.createElement('button');b.type='button';b.textContent=query;b.onclick=()=>{el('homeSearch').value=query;search()};box.append(b)});
  }
  async function json(url,options,signal){
    let response;try{response=await fetch(url,{...options,signal})}catch(e){if(signal.aborted)throw e;response=await fetch(url,{...options,signal})}
    if([502,503,504].includes(response.status))response=await fetch(url,{...options,signal});
    if(!response.ok)throw new Error('HTTP '+response.status);return response.json();
  }
  function input(){searchSequence++;searchController?.abort();el('destinationChoices').replaceChildren();if(!el('homeSearch').value.trim())recent()}
  async function search(){
    const query=el('homeSearch').value.trim();if(query.length<2){el('homeSearch').focus();return}
    searchController?.abort();searchController=new AbortController();const ctrl=searchController,id=++searchSequence;
    const timeout=setTimeout(()=>ctrl.abort(),15000);el('destinationChoices').textContent=copy().searching;
    try{
      let data;
      // Existing Yandex key is restricted to the website; use its real browser origin.
      try{
        const params=new URLSearchParams({apikey:YANDEX_GEOCODER_API_KEY,geocode:query,format:'json',lang:lang==='en'?'en_US':'ru_RU',results:'8',ll:'69.265,41.3111',spn:'0.65,0.5',rspn:'1'});
        const result=await json('https://geocode-maps.yandex.ru/v1/?'+params,{referrerPolicy:'strict-origin-when-cross-origin'},ctrl.signal);
        if(!result?.response?.GeoObjectCollection)throw new Error('Invalid geocoder response');
        data={addressOnly:true,results:(result?.response?.GeoObjectCollection?.featureMember||[]).map(({GeoObject:o})=>{const [lng,lat]=String(o.Point?.pos||'').split(/\s+/).map(Number);return {coords:[lat,lng],label:o.name,description:o.description}})};
      }catch(e){
        if(ctrl.signal.aborted)throw e;
        data=await json(SUPABASE_URL+'/functions/v1/parkly-geocode',{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({query,mode:'search-address'})},ctrl.signal);
      }
      if(id!==searchSequence)return;
      if(!Array.isArray(data.results))throw new Error('Invalid address response');
      choices=(data.results||[]).filter(x=>ParkyStreetGeometry.point(x.coords)).slice(0,8);
      const box=el('destinationChoices');box.innerHTML='<p>'+escapeHtml(choices.length?copy().choose:copy().none)+'</p>'+(data.addressOnly?'<small>'+escapeHtml(copy().addressOnly)+'</small>':'');
      choices.forEach(choice=>{const button=document.createElement('button');button.type='button';button.innerHTML=escapeHtml(choice.label)+'<small>'+escapeHtml(choice.description||'')+'</small>';button.onclick=()=>choose(choice);box.append(button)});
    }catch(e){if(id===searchSequence)el('destinationChoices').textContent=copy().error}
    finally{clearTimeout(timeout)}
  }
  async function choose(choice){
    if(!ParkyStreetGeometry.point(choice.coords))return;
    input();target={...choice};el('homeSearch').value=choice.label;rememberSearch(choice.label);await load();
  }
  async function load(){
    if(!target)return;controller?.abort();controller=new AbortController();const ctrl=controller,id=++sequence,destination={...target};
    state='loading';partial=false;rows=[];render();renderParkingLoadState();
    const timeout=setTimeout(()=>ctrl.abort(),20000);
    const headers={'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY};
    try{
      // One query up to 1 km; display the smallest nonempty band without repeated round-trips.
      const linesPromise=json(SUPABASE_URL+'/rest/v1/rpc/street_parking_segments_v2',{method:'POST',headers,body:'{}'},ctrl.signal).catch(()=>null);
      const data=await json(SUPABASE_URL+'/rest/v1/rpc/parkings_nearby',{method:'POST',headers,body:JSON.stringify({lat:destination.coords[0],lng:destination.coords[1],radius_m:1000,only_free:false,only_ev:false,max_price:null,lim:500})},ctrl.signal);
      if(!Array.isArray(data))throw new Error('Invalid parking response');
      if(id!==sequence)return;
      const convert=(details,lines)=>data.map(r=>fromDbRow({...r,...details.get(String(r.id))})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>{
        const s=lines?.find(s=>String(s.parking_id)===p.id);
        if(p.category==='STREET_ALLOWED'&&!s)return null;
        if(p.category==='STREET_ALLOWED'&&!s.details?.legacy_point&&(!ParkyStreetGeometry.valid(s.path)||!['free','paid'].includes(p.price_type)))return null;
        const n=s&&!s.details?.legacy_point?ParkyStreetGeometry.nearest(s.path,destination.coords):null;
        return {p:{...p,_accessLoaded:details.has(p.id)},d:ParkyStreetGeometry.distance(destination.coords,n?[n.lat,n.lng]:[p.lat,p.lng])};
      }).filter(x=>x&&x.d<=1000).sort((a,b)=>a.d-b.d);
      const update=()=>{radius=[300,500,1000].find(r=>rows.some(x=>x.d<=r))||1000;render()};
      rows=convert(new Map(),[]);state='enriching';update();
      const [details,lines]=await Promise.all([loadParkingAccess(data,ctrl.signal).catch(()=>new Map()),linesPromise]);
      if(id!==sequence)return;segments=Array.isArray(lines)?lines:[];
      partial=!Array.isArray(lines)||details.size<data.length;
      rows=convert(details,segments);state='ready';update();
    }catch(e){if(id===sequence){state='error';render()}}finally{clearTimeout(timeout)}
  }
  function activate(p){
    if(!PARKINGS.some(x=>x.id===p.id))PARKINGS.push(p);else PARKINGS=PARKINGS.map(x=>x.id===p.id?p:x);
    const ids=new Set(segments.map(s=>String(s.parking_id)));streetSegments=[...streetSegments.filter(s=>!ids.has(String(s.parking_id))),...segments];streetSegmentIds=new Set(streetSegments.map(s=>String(s.parking_id)));
  }
  function showMap(){if(!ymap){toast(copy().missing);return}rows.forEach(x=>activate(x.p));switchTab('map');ymap.setCenter(target.coords,16);setSelectedPoint(target.coords,target.label);drawMarkers(true);drawStreetSegments()}
  function render(){
    labels();if(!target)return false;
    el('homeRadius').hidden=true;el('homeNearTitle').textContent=target.label;el('homeParkingTitle').textContent=copy().near+' '+target.label;
    const list=el('homeParkingList');list.replaceChildren();
    const summary=document.createElement('div');summary.className='destination-summary';summary.setAttribute('role','status');
    summary.textContent=state==='loading'?copy().loading:state==='error'?copy().error:state==='enriching'?copy().loading:(rows.length?(radius>300?copy().expanded+' '+radius+' '+t('unitM')+'. ':'')+copy().distance:copy().empty);
    if(partial)summary.textContent+=' '+copy().partial;
    if(state==='error'||partial){const retry=document.createElement('button');retry.type='button';retry.textContent=copy().retry;retry.onclick=load;summary.append(retry)}
    list.append(summary);
    rows.filter(x=>x.d<=radius).forEach(({p,d})=>{
      const card=document.createElement('article');card.className='destination-card';
      const terms=p._accessLoaded?[p.has_barrier?t('hasBarrier'):'',p.has_free_period?freePeriodLabel(p.free_period_minutes):'',afterFreePeriodLabel(p),p.requires_purchase?t('purchaseOnly'):'',p.requires_receipt?t('receiptRequired'):''].filter(Boolean).join(' · '):(state==='enriching'?copy().loading:copy().partial);
      card.innerHTML='<h3>'+escapeHtml(p.name)+'</h3><p>'+escapeHtml(p.addr)+'</p><strong>'+Math.round(d)+' '+t('unitM')+' · '+escapeHtml(priceLabel(p))+'</strong><p>'+escapeHtml(terms)+'</p><div class="destination-actions"></div>';
      const actions=card.querySelector('.destination-actions');
      [[copy().route,()=>{activate(p);requestNavigation(p)}],[copy().details,()=>{activate(p);openHomeParking(p.id)}]].forEach(([text,fn])=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;actions.append(b)});list.append(card);
    });
    if(state!=='loading'){const button=document.createElement('button');button.type='button';button.className='btn-outline';button.textContent=copy().map;button.onclick=showMap;list.append(button)}
    return true;
  }
  function nearby(){
    input();controller?.abort();sequence++;target=null;state='idle';rows=[];el('homeSearch').value='';el('homeRadius').hidden=false;el('homeNearTitle').textContent=t('homeNear');el('homeParkingTitle').textContent=t('homeParkingTitle');renderHome();recent();
    loadParkingsFromDB(mePos?.lat,mePos?.lng,15000);
  }
  function fromPoint(){if(!selectedDestination)return;const point={coords:[selectedDestination.lat,selectedDestination.lng],label:selectedDestination.label||t('selectedPoint')};switchTab('home');choose(point)}
  labels();recent();
  return {search,input,choose,nearby,render,fromPoint,map:()=>target?showMap():switchTab('map'),active:()=>!!target};
})();
