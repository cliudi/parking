const assert=require('node:assert/strict');
const {server,fakeMapRuntime}=require('./test-street-ui');
const {chromium}=require(process.env.PARKY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    for(const mode of ['native','unsupported','timeout','throw','old-browser','unavailable','android','browser']){
      const page=await browser.newPage({viewport:{width:480,height:740}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install();
      await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,contentType:'application/json',body:'[]'}));
      await page.addInitScript(fakeMapRuntime);
      await page.addInitScript(({mode})=>{
        localStorage.setItem('parkly-onboarding-complete','1');
        window.tgEvents={};window.fullState={enter:0,exit:0,browserEnter:0,browserExit:0,expanded:0};
        Object.defineProperty(document,'fullscreenEnabled',{get:()=>mode!=='unavailable'});
        Object.defineProperty(document,'fullscreenElement',{get:()=>fullState.browserFull?document.documentElement:null});
        HTMLElement.prototype.requestFullscreen=async()=>{fullState.browserEnter++;fullState.browserFull=true;document.dispatchEvent(new Event('fullscreenchange'))};
        document.exitFullscreen=async()=>{fullState.browserExit++;fullState.browserFull=false;document.dispatchEvent(new Event('fullscreenchange'))};
        if(mode==='browser')return;
        window.Telegram={WebApp:{initData:'test-only',platform:mode==='android'?'android':'tdesktop',viewportHeight:740,colorScheme:'light',isFullscreen:false,
          isVersionAtLeast:v=>!['old-browser','unavailable'].includes(mode)||v!=='8.0',onEvent:(n,fn)=>tgEvents[n]=fn,
          ready(){},expand(){fullState.expanded++},BackButton:{show(){},hide(){},onClick(){}},
          requestFullscreen(){fullState.enter++;if(mode==='throw')throw Error('Unsupported');if(mode==='timeout')return;if(mode==='unsupported'){tgEvents.fullscreenFailed({error:'UNSUPPORTED'});return}this.isFullscreen=true;tgEvents.fullscreenChanged()},
          exitFullscreen(){fullState.exit++;this.isFullscreen=false;tgEvents.fullscreenChanged()}
        }};
      },{mode});
      await page.goto(origin+'/index.html');
      await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
      await page.evaluate(()=>document.getElementById('brandSplash')?.remove());
      const button=page.locator('#telegramFullscreen');
      assert.equal(await page.evaluate(()=>fullState.enter+fullState.browserEnter),0,'Fullsize launch must not request fullscreen');
      if(['android','browser'].includes(mode)){assert.equal(await button.count(),0)}
      else{
        assert.equal(await page.evaluate(()=>fullState.expanded),1,mode+': '+JSON.stringify(errors));
        await button.click();
        if(mode==='timeout'){
          assert.equal(await button.isDisabled(),true);
          await page.clock.runFor(5100);
        }
        if(['native','old-browser'].includes(mode)){
          assert.equal(await button.getAttribute('aria-pressed'),'true');
          assert.match(await button.textContent(),/Выйти/);
          await button.click();
          assert.equal(await button.getAttribute('aria-pressed'),'false');
          assert.equal(await page.evaluate(()=>fullState.exit+fullState.browserExit),1);
          if(mode==='native'){
            await page.evaluate(()=>{Telegram.WebApp.isFullscreen=true;tgEvents.fullscreenChanged()});
            assert.equal(await button.getAttribute('aria-pressed'),'true');
            await page.evaluate(()=>{Telegram.WebApp.isFullscreen=false;tgEvents.fullscreenChanged()});
            assert.equal(await button.getAttribute('aria-pressed'),'false','Host/Escape changes reflected');
          }
        }else{
          assert.equal(await button.isDisabled(),false);
          assert.equal(await button.getAttribute('aria-pressed'),'false');
          if(mode==='unsupported'){
            assert.equal(await page.evaluate(()=>fullState.browserEnter),0,'No automatic fallback without a new click');
            await button.click();
            assert.equal(await page.evaluate(()=>fullState.browserEnter),1);
            await button.click();
          }
        }
        if(mode==='native')for(const [width,height] of [[480,740],[1440,900],[320,600]]){
          await page.setViewportSize({width,height});
          await page.evaluate(height=>{Telegram.WebApp.viewportHeight=height;Telegram.WebApp.safeAreaInset={top:20};Telegram.WebApp.contentSafeAreaInset={top:18};tgEvents.viewportChanged();switchTab('map')},height);
          await page.clock.runFor(100);
          const boxes=await page.evaluate(()=>{const bar=document.querySelector('.telegram-windowbar').getBoundingClientRect(),search=document.querySelector('.topwrap').getBoundingClientRect(),b=document.getElementById('telegramFullscreen').getBoundingClientRect();return {barBottom:bar.bottom,searchTop:search.top,buttonRight:b.right,buttonLeft:b.left,scroll:document.documentElement.scrollWidth}});
          assert.ok(boxes.searchTop>=boxes.barBottom+8);
          assert.ok(boxes.buttonLeft>=0&&boxes.buttonRight<=width&&boxes.scroll<=width);
          await page.evaluate(()=>switchTab('home'));
          await page.screenshot({path:'release/telegram-fullsize-'+width+'.png'});
        }
      }
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log('Desktop fullscreen: explicit entry/exit, host changes, version fallback, failure/timeout, safe layout and mobile/browser isolation passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
