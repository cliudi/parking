/* Telegram is a presentation host, not an authenticated Parky identity.
   Never use initDataUnsafe for authorization or put the bot token here. */
(()=>{
  const launch=new URLSearchParams(location.hash.slice(1));
  if(!launch.has('tgWebAppVersion')&&!window.Telegram?.WebApp?.initData)return;
  function connect(){
    const app=window.Telegram?.WebApp;
    if(!app||app.platform==='unknown')return;
    const root=document.documentElement;
    root.classList.add('telegram-app');
    const supported=v=>typeof app.isVersionAtLeast==='function'&&app.isVersionAtLeast(v);
    const manager=supported('8.0')?app.LocationManager:null;
    // Share initialization: some hosts expose the API but never initialize it.
    // Initialization alone does not request the user's position.
    let initializing=null;
    const initialize=()=>{
      if(!manager)return Promise.reject({code:2});
      if(manager.isInited)return Promise.resolve();
      if(initializing)return initializing;
      initializing=new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject({code:3}),4000);
        try{manager.init(()=>{clearTimeout(timeout);resolve()})}
        catch(e){clearTimeout(timeout);reject(e)}
      }).finally(()=>{initializing=null});
      return initializing;
    };
    initialize().catch(()=>{});
    window.ParkyTelegram={
      locationAvailable:()=>!!manager&&(!manager.isInited||manager.isLocationAvailable),
      location:()=>new Promise((resolve,reject)=>{
        let settled=false;
        const timeout=setTimeout(()=>{settled=true;reject({code:3})},10000);
        const fail=e=>{if(settled)return;settled=true;clearTimeout(timeout);reject(e)};
        const finish=(p)=>{
          if(settled)return;settled=true;clearTimeout(timeout);
          if(!p){reject({code:1});return}
          resolve({timestamp:Date.now(),coords:{latitude:p.latitude,longitude:p.longitude,accuracy:p.horizontal_accuracy,heading:p.course,speed:p.speed}});
        };
        const request=()=>{
          if(settled)return;
          if(!manager.isLocationAvailable){fail({code:2});return}
          manager.getLocation(finish);
        };
        initialize().then(request).catch(fail);
      }),
      openLink:url=>{
        if(!supported('6.1'))return false;
        if(new URL(url).protocol!=='https:')return false;
        app.openLink(url);return true;
      }
    };
    function theme(){
      isDark=app.colorScheme==='dark';applyTheme(isDark,false);
      if(supported('6.1')){
        app.setHeaderColor?.(supported('6.9')?(isDark?'#0B1220':'#0B7AFB'):'bg_color');
        app.setBackgroundColor?.(isDark?'#0B1220':'#F8FAFC');
      }
      if(supported('7.10'))app.setBottomBarColor?.(isDark?'#141C2E':'#FFFFFF');
    }
    app.onEvent('themeChanged',theme);theme();
    function layout(){
      const height=document.fullscreenElement?window.innerHeight:Number(app.viewportHeight);
      if(height>0)root.style.setProperty('--parky-tg-height',height+'px');
      for(const side of ['top','bottom','left','right']){
        const device=Math.max(0,Number(app.safeAreaInset?.[side])||0);
        const content=Math.max(0,Number(app.contentSafeAreaInset?.[side])||0);
        root.style.setProperty('--parky-tg-'+side,(device+content)+'px');
      }
    }
    function desktopFullscreen(){
      const desktop=['tdesktop','macos','unigram'].includes(app.platform)||(['web','weba','webk'].includes(app.platform)&&matchMedia('(hover: hover) and (pointer: fine)').matches);
      if(!desktop)return;
      root.classList.add('telegram-desktop');
      const bar=document.createElement('div');bar.className='telegram-windowbar';
      const brand=document.createElement('span');brand.textContent='Parky';
      const button=document.createElement('button');button.type='button';button.id='telegramFullscreen';
      bar.append(brand,button);document.body.append(bar);
      let pending=false,timer=null,nativeUnsupported=false;
      const text=()=>({
        ru:{enter:'На весь экран',exit:'Выйти из полного экрана',unavailable:'Полный экран недоступен в этой версии Telegram. Разверните окно кнопкой □ в его заголовке.',fallback:'Telegram не включил полный экран. Нажмите кнопку ещё раз, чтобы попробовать режим браузера.',failed:'Не удалось переключить экран. Можно повторить или развернуть окно кнопкой □.'},
        en:{enter:'Full screen',exit:'Exit full screen',unavailable:'Full screen is unavailable in this Telegram version. Maximize the window using its title bar.',fallback:'Telegram could not enter full screen. Press again to try browser full screen.',failed:'Could not switch display mode. Try again or maximize the window.'},
        uz:{enter:'To‘liq ekran',exit:'To‘liq ekrandan chiqish',unavailable:'Bu Telegram versiyasida to‘liq ekran mavjud emas. Oynani sarlavhadagi □ tugmasi bilan kattalashtiring.',fallback:'Telegram to‘liq ekranga o‘tmadi. Brauzer rejimini sinash uchun yana bosing.',failed:'Ekran rejimi o‘zgarmadi. Qayta urinib ko‘ring yoki oynani kattalashtiring.'}
      })[lang]||{};
      const browserAvailable=()=>!!document.fullscreenEnabled&&typeof root.requestFullscreen==='function';
      function render(){
        const full=!!app.isFullscreen||!!document.fullscreenElement;
        const title=full?text().exit:text().enter;
        button.textContent=(full?'↙ ':'⛶ ')+title;button.title=title;
        button.setAttribute('aria-label',title);button.setAttribute('aria-pressed',String(full));
        button.setAttribute('aria-busy',String(pending));button.disabled=pending;
      }
      function settled(){
        clearTimeout(timer);timer=null;pending=false;render();layout();
        requestAnimationFrame(()=>{window.dispatchEvent(new Event('resize'));ymap?.container?.fitToViewport()});
      }
      function failed(event){
        if(!pending)return;
        if(event?.error==='ALREADY_FULLSCREEN'&&app.isFullscreen){settled();return}
        if(event?.error==='UNSUPPORTED')nativeUnsupported=true;
        settled();toast(nativeUnsupported?(browserAvailable()?text().fallback:text().unavailable):text().failed);
      }
      button.onclick=()=>{
        if(pending)return;
        const native=supported('8.0')&&!nativeUnsupported&&typeof app.requestFullscreen==='function'&&typeof app.exitFullscreen==='function';
        if(!document.fullscreenElement&&!app.isFullscreen&&!native&&!browserAvailable()){toast(text().unavailable);return}
        pending=true;render();timer=setTimeout(()=>failed({error:'TIMEOUT'}),5000);
        try{
          if(document.fullscreenElement)Promise.resolve(document.exitFullscreen()).then(settled).catch(()=>failed());
          else if(app.isFullscreen){if(typeof app.exitFullscreen!=='function')failed();else app.exitFullscreen()}
          else if(native)app.requestFullscreen();
          // Browser fallback must also run directly from an explicit click.
          else Promise.resolve(root.requestFullscreen()).then(settled).catch(()=>failed());
        }catch(e){failed()}
      };
      if(supported('8.0')){app.onEvent('fullscreenChanged',settled);app.onEvent('fullscreenFailed',failed)}
      document.addEventListener('fullscreenchange',settled);
      new MutationObserver(render).observe(root,{attributes:true,attributeFilter:['lang']});
      render();
      // Fullsize remains the launch default. No automatic fullscreen request.
    }
    const on=id=>document.getElementById(id)?.classList.contains('on');
    const sheetOpen=()=>document.getElementById('mask')?.classList.contains('open');
    let dirty=false,confirmation=false;
    document.getElementById('sheet')?.addEventListener('input',()=>{dirty=true;sync()});
    document.getElementById('sheet')?.addEventListener('change',()=>{dirty=true;sync()});
    function sync(){
      if(!sheetOpen())dirty=false;
      const visible=!!document.querySelector('dialog[open]')||on('duplicateMask')||sheetOpen()||on('routeBetaScreen')||on('minicard')||activeTab!=='home';
      if(supported('6.1'))visible?app.BackButton.show():app.BackButton.hide();
      if(supported('6.2')&&confirmation!==dirty){
        confirmation=dirty;
        dirty?app.enableClosingConfirmation():app.disableClosingConfirmation();
      }
    }
    function back(){
      if(window.ParkyLocation?.picking()){ParkyLocation.cancelPick();clearSelectedPoint();switchTab('home');return}
      const dialog=document.querySelector('dialog[open]');
      if(dialog){dialog.close();return}
      if(on('duplicateMask')){resolveDuplicateDialog('cancel');return}
      if(sheetOpen()){
        if(dirty&&!window.confirm('Закрыть форму? Несохранённые изменения будут потеряны.'))return;
        closeSheet();return;
      }
      if(on('routeBetaScreen')){closeRoute();return}
      if(on('minicard')){closeMiniCard();return}
      if(activeTab!=='home')switchTab('home');
    }
    app.onEvent('viewportChanged',layout);
    window.addEventListener('resize',layout);
    if(supported('8.0')){
      app.onEvent('safeAreaChanged',layout);
      app.onEvent('contentSafeAreaChanged',layout);
    }
    if(supported('6.1'))app.BackButton.onClick(back);
    // Observe only navigation/overlay state, not the frequently changing map DOM.
    const observer=new MutationObserver(sync);
    for(const id of ['mask','minicard','duplicateMask','routeBetaScreen','screen-home','screen-fav','screen-profile']){
      const node=document.getElementById(id);
      if(node)observer.observe(node,{attributes:true,attributeFilter:['class']});
    }
    observer.observe(document.getElementById('bottomnav'),{childList:true});
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
    desktopFullscreen();layout();sync();app.ready();app.expand();
    window.dispatchEvent(new Event('parky:telegram-ready'));
  }
  if(window.Telegram?.WebApp){connect();return}
  const script=document.createElement('script');
  script.src='https://telegram.org/js/telegram-web-app.js';
  script.async=true;script.onload=connect;
  // SDK/network failure leaves the normal website usable.
  document.head.append(script);
})();
