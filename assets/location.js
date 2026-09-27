/* Device estimates are not proof of actual location. Manual origin is explicit,
   session-only, and cannot be overwritten by late provider callbacks. */
window.ParkyLocation=(()=>{
  let sample=null,generation=0,watch=null,watchNative=null,timer=null,busy=false,error='',choosing=false,finish=null,lastUsable=null,pending=null;
  const copy=()=>({
    ru:{none:'Место не определено',search:'Определяем место…',manual:'Место указано вручную',old:'Последнее известное место',approx:'Приблизительное место',device:'Место по данным устройства',fail:'Не удалось уточнить место. Укажите его на карте.',denied:'Нет доступа к геолокации. Разрешите доступ или укажите место на карте.',pick:'Нажмите на карту, затем «Я здесь».',button:'Моя точка неверна — указать на карте',unknown:'Точность неизвестна'},
    en:{none:'Location unknown',search:'Finding location…',manual:'Manually selected location',old:'Last known location',approx:'Approximate location',device:'Device location estimate',fail:'Could not refine location. Select it on the map.',denied:'Location access denied. Allow access or select a map point.',pick:'Tap the map, then “I am here”.',button:'Wrong location? Choose on the map',unknown:'Accuracy unknown'},
    uz:{none:'Joylashuv aniqlanmadi',search:'Joylashuv aniqlanmoqda…',manual:'Joylashuv qo‘lda tanlangan',old:'Oxirgi ma’lum joylashuv',approx:'Taxminiy joylashuv',device:'Qurilma aniqlagan joylashuv',fail:'Joylashuv aniqlanmadi. Xaritadan tanlang.',denied:'Joylashuvga ruxsat yo‘q. Ruxsat bering yoki xaritadan tanlang.',pick:'Xaritani bosing, keyin “Men shu yerdaman”.',button:'Joylashuv noto‘g‘rimi? Xaritadan tanlash',unknown:'Aniqlik noma’lum'}
  })[lang]||{};
  const stale=()=>sample?.source!=='manual'&&Date.now()-(sample?.ts||0)>60000;
  function label(){const c=copy();return !sample?c.none:sample.source==='manual'?c.manual:stale()?c.old:sample.acc>100?c.approx:c.device}
  function accuracy(){return !sample?'':sample.source==='manual'?copy().manual:sample.unknown?copy().unknown:'±'+Math.round(sample.acc)+' '+t('unitM')}
  function render(){
    const c=copy(),node=document.getElementById('locationStatus');
    if(node)node.textContent=[busy?c.search:'',label(),sample&&sample.source!=='manual'?(sample.unknown?c.unknown:'±'+Math.round(sample.acc)+' '+t('unitM')):'',error].filter(Boolean).join(' · ');
    document.getElementById('manualLocationButton').textContent=c.button;
    const badge=document.getElementById('accbadge');
    if(badge){
      const message=choosing?c.pick:busy?c.search:error||(!sample?c.none:label()+(sample.source==='manual'?'':sample.unknown?' · '+c.unknown:' · ±'+Math.round(sample.acc)+' '+t('unitM')));
      const actions=(!sample||!!error)&&!busy&&!choosing;
      const signature=JSON.stringify([message,actions,lang]);
      if(badge.dataset.state!==signature){
        badge.dataset.state=signature;badge.replaceChildren();
        const text=document.createElement('span');text.textContent=message;badge.append(text);
        if(actions){
          const row=document.createElement('div');row.className='location-actions';
          for(const [title,action] of [
            [({ru:'Определить',en:'Locate me',uz:'Aniqlash'})[lang],()=>request(true)],
            [({ru:'На карте',en:'Choose on map',uz:'Xaritadan'})[lang],pick]
          ]){const button=document.createElement('button');button.type='button';button.textContent=title;button.onclick=event=>{event.stopPropagation();action()};row.append(button)}
          badge.append(row);
        }
      }
      badge.className='accbadge on '+(error||!sample||stale()||sample.acc>100?'bad':'good');
    }
    if(!window.ParkyDestination?.active())document.getElementById('homeNearTitle').textContent=label();
    const usable=!!origin();
    if(lastUsable!==usable){lastUsable=usable;requestAnimationFrame(()=>renderHomeList())}
  }
  function normal(p){
    const c=p?.coords,ts=Number(p?.timestamp),age=Date.now()-ts;
    if(!c||!Number.isFinite(c.latitude)||Math.abs(c.latitude)>90||!Number.isFinite(c.longitude)||Math.abs(c.longitude)>180||!Number.isFinite(ts)||age< -5000||age>120000)throw Error('Invalid or expired measurement');
    const unknown=c.accuracy==null;
    if(!unknown&&(!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>100000))throw Error('Invalid accuracy');
    return {lat:c.latitude,lng:c.longitude,acc:unknown?100000:Math.max(1,c.accuracy),unknown,ts,source:'device',heading:c.heading,speed:c.speed};
  }
  function accept(p,id){
    if(id!==generation||choosing||sample?.source==='manual')return false;
    let next;try{next=normal(p)}catch{return false}
    if(sample){
      if(next.ts<sample.ts)return false;
      // A late coarse answer cannot displace a recent better fix.
      if(!stale()&&next.acc>sample.acc*1.5)return false;
    }
    sample=next;error='';
    applyFix(next.lat,next.lng,next.acc,null,next.acc<=60,next.heading,next.speed,next.ts);
    render();return true;
  }
  function stop(){
    generation++;clearTimeout(timer);timer=null;
    if(watch!=null){if(watchNative)watchNative.clearWatch({id:watch}).catch(()=>{});else navigator.geolocation?.clearWatch(watch)}
    watch=null;watchNative=null;busy=false;
    if(finish){finish(false);finish=null}
  }
  async function request(explicit=false){
    if(busy){if(explicit)userPanned=false;return pending||false}
    if(!explicit&&sample?.source==='manual')return false;
    stop();const id=generation;choosing=false;
    if(sample?.source==='manual')sample={...sample,source:'device',acc:100000,unknown:true,ts:0};
    if(explicit)userPanned=false;
    dbReloadedForUser=false;busy=true;error='';render();
    let got=false,denied=false;
    const done=new Promise(resolve=>{finish=resolve});
    pending=done;
    const complete=()=>{
      if(id!==generation||!busy)return;
      if(!got)error=denied?copy().denied:copy().fail;
      const resolve=finish;finish=null;clearTimeout(timer);timer=null;busy=false;
      if(!got)stop();
      render();resolve?.(got);
    };
    const receive=p=>{if(accept(p,id)){got=true;if(sample.acc<=60){complete()}}};
    const failure=e=>{if(id!==generation)return;if(e?.code===1){denied=true;complete()}};
    timer=setTimeout(complete,22000);
    const startDevice=async()=>{
      if(id!==generation||!busy)return;
      try{
        const geo=GeoPlugin();
        if(!geo&&!navigator.geolocation)throw Error('Location unavailable');
        if(geo&&!await ensurePermission()){failure({code:1});return done}
        if(id!==generation)return done;
        const quick={enableHighAccuracy:false,timeout:6000,maximumAge:30000};
        const precise={enableHighAccuracy:true,timeout:20000,maximumAge:0};
        // Independent requests: a timeout in one does not cancel the other.
        if(geo){
          geo.getCurrentPosition(quick).then(receive).catch(failure);
          geo.getCurrentPosition(precise).then(receive).catch(failure);
          const watchId=await geo.watchPosition(precise,(p,e)=>p?receive(p):failure(e));
          if(id!==generation)geo.clearWatch({id:watchId}).catch(()=>{});else{watch=watchId;watchNative=geo}
        }else{
          const watchId=navigator.geolocation.watchPosition(receive,failure,precise);
          if(id!==generation)navigator.geolocation.clearWatch(watchId);else watch=watchId;
          navigator.geolocation.getCurrentPosition(receive,failure,quick);
          navigator.geolocation.getCurrentPosition(receive,failure,precise);
        }
      }catch(e){failure(e);complete()}
    };
    if(window.ParkyTelegram?.locationAvailable()){
      if(!explicit){complete();return done}
      ParkyTelegram.location().then(p=>{receive(p);complete()}).catch(e=>{
        if(id!==generation||!busy)return;
        // A denial is final. Only an unavailable/failed Telegram provider may
        // fall back to the device API; never IP-based or saved coordinates.
        if(e?.code===1){failure(e);return}
        clearTimeout(timer);timer=setTimeout(complete,22000);
        startDevice();
      });
    }else startDevice();
    return done;
  }
  function pick(){
    if(!ymap){toast(({ru:'Карта загружается. Повторите через несколько секунд.',en:'Map is loading. Try again shortly.',uz:'Xarita yuklanmoqda. Birozdan so‘ng qayta urining.'})[lang]);return}
    stop();choosing=true;switchTab('map');closeMiniCard();toast(copy().pick);render();
  }
  function manual(point){
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||Math.abs(point.lat)>90||Math.abs(point.lng)>180)return;
    stop();choosing=false;stopRouteGuidance(true);
    sample={lat:point.lat,lng:point.lng,acc:20,ts:Date.now(),source:'manual'};
    userPanned=false;dbReloadedForUser=false;
    // 20 m is only marker rendering size, never a claimed manual accuracy.
    applyFix(sample.lat,sample.lng,20,null,false,null,0,sample.ts);
    clearSelectedPoint();switchTab('home');render();toast(copy().manual);
  }
  const origin=()=>sample&&(sample.source==='manual'||(!stale()&&sample.acc<=500))?{lat:sample.lat,lng:sample.lng}:null;
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();render()});
  setInterval(()=>{render()},15000);
  render();
  return {request,pick,manual,label,accuracy,render,origin,picking:()=>choosing,cancelPick:()=>{choosing=false;render()},isManual:()=>sample?.source==='manual',normal};
})();
