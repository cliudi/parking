const assert=require('node:assert/strict');
const {server,fakeMapRuntime}=require('./test-street-ui');
const {chromium}=require(process.env.PARKY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    for(const mode of ['unavailable','timeout','init-timeout','denied','old-version','cancelled']){
      const page=await browser.newPage({viewport:{width:480,height:740}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install();
      await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,contentType:'application/json',body:'[]'}));
      await page.addInitScript(fakeMapRuntime);
      await page.addInitScript(({mode})=>{
        localStorage.setItem('parkly-onboarding-complete','1');
        window.tgEvents={};window.deviceCalls=0;window.tgCalls=0;
        const fix=()=>({timestamp:Date.now(),coords:{latitude:41.3,longitude:69.2,accuracy:35}});
        navigator.geolocation.getCurrentPosition=fn=>{deviceCalls++;fn(fix())};
        navigator.geolocation.watchPosition=fn=>{deviceCalls++;fn(fix());return 1};
        navigator.geolocation.clearWatch=()=>{};
        window.Telegram={WebApp:{initData:'test',platform:'tdesktop',viewportHeight:740,colorScheme:'light',
          isVersionAtLeast:v=>v!=='8.0'||mode!=='old-version',onEvent:(n,fn)=>tgEvents[n]=fn,
          ready(){},expand(){},BackButton:{show(){},hide(){},onClick(){}},
          LocationManager:{isInited:false,isLocationAvailable:mode!=='unavailable',init(fn){if(mode==='init-timeout')return;this.isInited=true;fn?.()},getLocation(fn){tgCalls++;window.lateTelegram=fn;if(mode==='denied')fn(null)}}}};
      },{mode});
      await page.goto(origin+'/index.html');
      await page.addStyleTag({content:'#minicard.on{animation:none!important}'});
      await page.evaluate(()=>{document.getElementById('brandSplash')?.remove();document.getElementById('onboarding').classList.remove('on');switchTab('map')});
      await page.clock.runFor(1000);
      assert.equal(await page.evaluate(()=>deviceCalls+tgCalls),0,'No automatic permission prompt');
      assert.match(await page.locator('#accbadge').textContent(),/Место не определено/);
      await page.locator('#accbadge button').first().click();
      if(mode==='cancelled')await page.evaluate(()=>{
        ymaps.templateLayoutFactory={createClass:s=>s};
        ymaps.Circle=class extends ymaps.Placemark{constructor(...args){super(...args);this.geometry.setRadius=()=>{}}};
        initMap();ParkyLocation.manual({lat:41.4,lng:69.3});
      });
      await page.clock.runFor(12000);
      if(mode==='denied'||mode==='cancelled'){
        assert.equal(await page.evaluate(()=>deviceCalls),0,'Denial/cancellation must not start browser fallback');
        if(mode==='denied')assert.match(await page.locator('#accbadge').textContent(),/Нет доступа/);
      }else{
        assert.ok(await page.evaluate(()=>deviceCalls)>0,mode+' falls back to device');
        assert.equal(await page.evaluate(()=>ParkyLocation.origin()?.lat),41.3);
        await page.evaluate(()=>window.lateTelegram?.({latitude:42,longitude:70,horizontal_accuracy:10}));
        assert.equal(await page.evaluate(()=>ParkyLocation.origin()?.lat),41.3,'Ignore late Telegram result after timeout');
      }
      if(mode==='unavailable'){
        await page.evaluate(()=>{
          ymaps.templateLayoutFactory={createClass:s=>s};
          ymaps.Circle=class extends ymaps.Placemark{constructor(...args){super(...args);this.geometry.setRadius=()=>{}}};
          initMap();setSelectedPoint([41.29042,69.23259],'Выбранная точка');
        });
        for(const [width,height] of [[480,740],[320,600],[390,440],[768,500]]){
          await page.setViewportSize({width,height});
          await page.evaluate(height=>{Telegram.WebApp.viewportHeight=height;tgEvents.viewportChanged();document.getElementById('minicard').scrollTop=0},height);
          await page.clock.runFor(400);
          const bounds=await page.evaluate(()=>{
            const b=s=>document.querySelector(s).getBoundingClientRect();
            return {top:b('#minicard').top,header:b('.topwrap').bottom,bottom:b('#minicard').bottom,nav:b('#bottomnav').top,scroll:document.getElementById('minicard').scrollHeight>document.getElementById('minicard').clientHeight};
          });
          assert.ok(bounds.top>=bounds.header+8,JSON.stringify(bounds));
          assert.ok(bounds.bottom<=bounds.nav-8,JSON.stringify(bounds));
          if(height<=500)assert.ok(bounds.scroll,'Tall card scrolls');
          // Scroll to the last action and verify it can actually be clicked.
          const button=page.getByRole('button',{name:'Я здесь — использовать как моё место',exact:true});
          await button.scrollIntoViewIfNeeded();
          await page.clock.runFor(50);
          await button.click({trial:true});
          await page.evaluate(()=>document.getElementById('minicard').scrollTop=0);
          await page.screenshot({path:'release/miniapp-card-'+width+'x'+height+'.png'});
        }
        await page.locator('.mc-dismiss').click();
        assert.equal(await page.locator('#minicard').isVisible(),false);
      }
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Mini App regressions: fallback, timeout, denial, cancellation, late callbacks and scrolling cards passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
