// Regression for a long location label stretching the zoom controls.
const assert=require('node:assert/strict');
const {server,fakeMapRuntime}=require('./test-street-ui');
const {chromium}=require(process.env.PARKY_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage();
    await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.addInitScript(fakeMapRuntime);
    await page.goto(origin+'/index.html');
    await page.evaluate(()=>{document.getElementById('onboarding').classList.remove('on');document.getElementById('brandSplash')?.remove();switchTab('map')});
    for(const width of [320,390,768,1920]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>document.getElementById('accbadge').className='accbadge');
      const before=await page.locator('.sidefabs').boundingBox();
      await page.evaluate(()=>{const b=document.getElementById('accbadge');b.className='accbadge on bad';b.textContent='Последнее известное место · Точность неизвестна · Место по данным устройства: ±90 м'});
      const box=await page.locator('.sidefabs').boundingBox(),badge=await page.locator('#accbadge').boundingBox();
      assert.equal(box.width,before.width);assert.equal(box.height,before.height);assert.equal(box.y,before.y);
      assert.ok(badge.x>=0&&badge.x+badge.width<box.x,'Label stays left of controls and in viewport');
      for(const selector of ['#filtbtn','#compassbtn','#locbtn','.zoomcol']){
        const b=await page.locator(selector).boundingBox();
        assert.ok(Math.abs(b.width-box.width)<1&&Math.abs(b.x-box.x)<1,selector+' aligned and compact');
      }
      const zoom=await page.locator('.zoomcol').boundingBox(),plus=await page.locator('#zin').boundingBox();
      assert.ok(Math.abs(zoom.width-plus.width)<=2,'No empty horizontal zoom area');
      await page.screenshot({path:'release/map-controls-'+width+'.png'});
    }
    console.log('Map controls: fixed width/alignment, label bounds and no layout shift at 320/390/768/1920 passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
