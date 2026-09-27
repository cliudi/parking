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
    await page.addInitScript(()=>localStorage.setItem('parkly-lastpos',JSON.stringify({lat:41,lng:69,acc:10,ts:Date.now()})));
    await page.goto(origin+'/index.html');
    assert.equal(await page.evaluate(()=>mePos),null,'Persisted coordinates must not be restored');
    const result=await page.evaluate(async()=>{
      const position=(age,accuracy=20)=>({timestamp:Date.now()-age,coords:{latitude:41.3,longitude:69.2,accuracy}});
      const rejected=p=>{try{freshPosition(p);return false}catch{return true}};
      const invalid=[position(600000),position(0,5000),position(0,0),position(0,NaN),{coords:{}}].every(rejected);
      navigator.geolocation.getCurrentPosition=(success,error,options)=>{window.geoOptions=options;success(position(0))};
      const f=await fastFix();
      mePos={lat:41,lng:69};meAcc=10;lastFixTs=Date.now()-60000;
      await centerOnMyLocation();
      return {invalid,f,options:geoOptions,lat:mePos.lat,lng:mePos.lng,coarse:applyFix(41,69,5000,null,false)};
    });
    assert.equal(result.invalid,true);assert.equal(result.options.maximumAge,0);assert.equal(result.options.enableHighAccuracy,true);
    assert.equal(result.lat,41.3);assert.equal(result.lng,69.2);assert.equal(result.coarse,false);
    console.log('Location: persisted/stale/invalid/coarse rejection and fresh explicit refresh passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
