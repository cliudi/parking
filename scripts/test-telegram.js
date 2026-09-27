const assert=require('node:assert/strict');
const {server,fakeMapRuntime}=require('./test-street-ui');
const {chromium}=require(process.env.PARKY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    for(const telegram of [false,true]){
      const page=await browser.newPage({viewport:{width:390,height:844}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,contentType:'application/json',body:'[]'}));
      await page.addInitScript(fakeMapRuntime);
      await page.addInitScript(({telegram})=>{
        localStorage.setItem('parkly-onboarding-complete','1');
        if(!telegram)return;
        window.tgEvents={};window.tgState={};
        window.Telegram={WebApp:{initData:'test-only',platform:'android',viewportHeight:760,
          safeAreaInset:{top:24,bottom:20},contentSafeAreaInset:{top:10,bottom:0},
          isVersionAtLeast:()=>true,onEvent:(n,fn)=>tgEvents[n]=fn,
          ready:()=>tgState.ready=true,expand:()=>tgState.expanded=true,
          enableClosingConfirmation:()=>tgState.confirm=true,disableClosingConfirmation:()=>tgState.confirm=false,
          BackButton:{show:()=>tgState.back=true,hide:()=>tgState.back=false,onClick:fn=>tgEvents.back=fn}}};
      },{telegram});
      await page.goto(origin+'/index.html');
      await page.waitForFunction(()=>window.ParkyDestination);
      assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('telegram-app')),telegram);
      if(telegram){
        assert.equal(await page.evaluate(()=>tgState.ready&&tgState.expanded),true);
        assert.equal(await page.evaluate(()=>tgState.back),false);
        await page.evaluate(()=>switchTab('map'));
        await page.waitForFunction(()=>tgState.back);
        await page.evaluate(()=>tgEvents.back());
        assert.equal(await page.evaluate(()=>activeTab),'home');
        await page.evaluate(()=>openSheet('<h2>Test</h2><input id="test-draft">'));
        await page.locator('#test-draft').fill('draft');
        assert.equal(await page.evaluate(()=>tgState.confirm),true);
        page.once('dialog',d=>d.dismiss());await page.evaluate(()=>tgEvents.back());
        assert.equal(await page.locator('#mask').evaluate(e=>e.classList.contains('open')),true);
        page.once('dialog',d=>d.accept());await page.evaluate(()=>tgEvents.back());
        await page.waitForFunction(()=>!tgState.confirm);
        await page.evaluate(()=>{Telegram.WebApp.viewportHeight=440;tgEvents.viewportChanged()});
        assert.equal(await page.locator('#screen-map').evaluate(e=>Math.round(e.getBoundingClientRect().height)),440);
        for(const width of [320,390,768]){
          await page.setViewportSize({width,height:844});
          assert.ok(await page.locator('#bottomnav').evaluate(e=>e.getBoundingClientRect().bottom<=441));
        }
      }
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Telegram shell: browser isolation, safe area, viewport, back and unsaved form passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
