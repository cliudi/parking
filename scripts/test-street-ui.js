// Isolated browser regression: no production requests or real parking writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PARKY_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('.');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}
  let data=fs.readFileSync(file);
  if(file.endsWith('index.html'))data=data.toString().replace('initOnboarding();loadYandex();','initOnboarding();');
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);
});
function fakeMapRuntime(){
  class Events{constructor(){this.listeners={}}add(name,fn){(this.listeners[name]??=[]).push(fn);return this}fire(name,data){for(const f of this.listeners[name]||[])f({get:k=>data[k]})}}
  class Options{constructor(v={}){this.values=v}set(k,v){typeof k==='string'?this.values[k]=v:Object.assign(this.values,k)}get(k){return this.values[k]}}
  class Shape{constructor(coords,props={},opts={}){this.coords=coords;this.events=new Events();this.options=new Options(opts);this.properties=new Options(props);this.geometry={getCoordinates:()=>this.coords,setCoordinates:c=>this.coords=c,getBounds:()=>[[41,69],[41.01,69.01]]}}}
  class Map{constructor(id,{center,zoom}){this.center=center;this.zoom=zoom;this.events=new Events();this.objects=[];this.geoObjects={add:o=>this.objects.push(o),remove:o=>this.objects=this.objects.filter(x=>x!==o)};this.container={fitToViewport(){}}}getCenter(){return this.center}getZoom(){return this.zoom}getBounds(){return [[40,68],[42,70]]}setCenter(c,z){this.center=c;if(z)this.zoom=z}setBounds(){return Promise.resolve()}panTo(c){this.center=c}}
  class ObjectManager{constructor(){this.items=[];this.objects={events:new Events(),each:fn=>this.items.forEach(fn),getById:id=>this.items.find(x=>x.id===id),setObjectOptions(){}}}add(collection){this.items.push(...collection.features)}remove(ids){this.items=this.items.filter(x=>!ids.includes(x.id))}removeAll(){this.items=[]}}
  window.ymaps={ready:fn=>fn(),Map,Placemark:Shape,Polyline:Shape,ObjectManager};
  window.testCalls=[];
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async(name,payload)=>{window.testCalls.push({name,payload});return {data:name==='admin_save_street_parking'?'00000000-0000-4000-8000-000000000001':null,error:null}}})};
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.PARKY_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.request().url()==='https://street-fixture.invalid/sign.svg'?route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect width="300" height="150" fill="#1677ff"/><text x="35" y="82" fill="white" font-size="30">TEST PHOTO</text></svg>'}):route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.addInitScript(fakeMapRuntime);
    await page.goto(origin+'/admin.html');
    await page.evaluate(()=>{document.getElementById('loginView').classList.add('hidden');document.getElementById('adminView').classList.remove('hidden')});
    await page.locator('#addStreetBtn').click();
    await page.waitForFunction(()=>typeof coordMap!=='undefined'&&coordMap);
    await page.evaluate(()=>{coordMap.events.fire('click',{coords:[41,69]});coordMap.events.fire('click',{coords:[41,69.01]});coordMap.events.fire('click',{coords:[41.01,69.01]})});
    assert.equal(await page.evaluate(()=>parseStreetPath().length),3);
    await page.locator('#parking_side').selectOption('right');
    await page.locator('#parking_orientation').selectOption('parallel');
    await page.locator('#streetReverse').click();
    assert.equal(await page.locator('#parking_side').inputValue(),'left');
    await page.evaluate(()=>{const vertex=streetEditorObjects.find(o=>o.options.values.draggable);vertex.geometry.setCoordinates([41.011,69.011]);vertex.events.fire('dragend',{})});
    assert.equal(await page.evaluate(()=>parseStreetPath()[0][0]),41.011);
    await page.locator('#streetRemove').click();
    assert.equal(await page.evaluate(()=>parseStreetPath().length),2);
    await page.evaluate(()=>{const mid=streetEditorObjects.find(o=>o.properties.values.iconContent==='+');mid.events.fire('click',{})});
    assert.equal(await page.evaluate(()=>parseStreetPath().length),3);
    await page.locator('#status').selectOption('APPROVED');
    await page.locator('#parkingForm').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await page.waitForFunction(()=>!adminActionLocks.has('parking-form'));
    assert.equal(await page.evaluate(()=>testCalls.length),0,'Unknown price must not reach save RPC');
    await page.locator('#status').selectOption('DRAFT');
    await page.locator('#name').fill('ТЕСТ — не настоящая парковка');
    await page.locator('#address').fill('Тестовая улица');
    await page.locator('#has_barrier').check();
    await page.locator('#barrier_at_entry').check();
    await page.locator('#has_barrier').uncheck();
    assert(await page.locator('#barrier_at_entry').isDisabled());
    await page.locator('#has_free_period').check();
    await page.locator('#free_period_minutes').fill('60');
    await page.locator('#requires_purchase').check();
    await page.locator('#has_free_period').uncheck();
    assert(await page.locator('#free_period_minutes').isDisabled());
    await page.locator('#parkingForm').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await page.waitForFunction(()=>testCalls.some(c=>c.name==='admin_save_street_parking'));
    const call=await page.evaluate(()=>testCalls.find(c=>c.name==='admin_save_street_parking'));
    assert.equal(call.payload.p_path.length,3);assert.equal(call.payload.p_details.parking_orientation,'parallel');
    assert.equal(call.payload.p_data.status,'DRAFT');
    assert.equal(call.payload.p_access.barrier_at_entry,false);
    assert.equal(call.payload.p_access.free_period_minutes,null);
    assert.equal(call.payload.p_access.requires_purchase,false);
    await page.goto(origin+'/index.html');
    await page.waitForFunction(()=>typeof openStreetCard==='function');
    await page.evaluate(()=>{
      streetSegments=[{parking_id:'00000000-0000-4000-8000-000000000001',path:[[41,69],[41,69.01]],details:{parking_side:'right',parking_orientation:'parallel',street_days:'Пн–Пт'},photos:[{url:'https://street-fixture.invalid/sign.svg',type:'parking_sign',caption:'Тестовая фотография — не реальный знак'}]}];streetSegmentIds=new Set(streetSegments.map(s=>s.parking_id));
      PARKINGS=[{id:streetSegments[0].parking_id,category:'STREET_ALLOWED',ptype:'street',name:'Тестовый уличный участок',addr:'Тестовые данные',price_type:'free',hours:'08:00–20:00',lat:41,lng:69}];
      document.getElementById('onboarding')?.remove();openStreetCard(PARKINGS[0]);
    });
    assert(await page.locator('#sheet').innerText().then(t=>t.includes('Наличие свободного места не гарантируется.')));
    assert.equal(await page.evaluate(()=>document.getElementById('sheet').scrollWidth>document.getElementById('sheet').clientWidth),false);
    await page.evaluate(()=>{
      ymap=new ymaps.Map('map',{center:[41,69],zoom:16});drawStreetSegments();
      if(streetLines.size!==1)throw Error('Expected one line');
      quickFilter='paid';drawStreetSegments();if(streetLines.size!==0)throw Error('Filter must hide free line');
      quickFilter='all';ymap.zoom=12;drawStreetSegments();if(streetLines.size!==0)throw Error('Far zoom must hide line');
      ymap.zoom=16;drawStreetSegments();if(streetLines.size!==1)throw Error('Near zoom must restore line');
      drawMarkers(true);if(objectManager.items.length)throw Error('Street segment must not create P markers');
      const segmentId=PARKINGS[0].id;streetSegmentIds=new Set();drawMarkers(true);
      if(streetLines.size||objectManager.items.length)throw Error('Unavailable segment must not turn into P');
      streetSegmentIds=new Set([segmentId]);drawMarkers(true);
      const oldParking=PARKINGS[0],oldSegment=streetSegments[0];
      PARKINGS.push({...oldParking,id:'legacy-point',price_type:'unknown'});
      streetSegments.push({parking_id:'legacy-point',path:null,details:{legacy_point:true}});
      streetSegmentIds.add('legacy-point');drawMarkers(true);
      if(objectManager.items.length!==1||streetLines.size!==1)throw Error('Legacy point must coexist with the new line');
      const destination=streetDestination(PARKINGS[1]);
      if(destination.lat!==oldParking.lat||destination.lng!==oldParking.lng)throw Error('Legacy route must use its original coordinates');
      PARKINGS.pop();streetSegments.pop();streetSegmentIds.delete('legacy-point');drawMarkers(true);
    });
    fs.mkdirSync('release/street-parking-checks',{recursive:true});
    await page.locator('#brandSplash').waitFor({state:'hidden'});
    await page.locator('#sheet').waitFor({state:'visible'});
    await page.locator('.street-photo').click();
    assert(await page.locator('.street-photo-dialog').isVisible());
    await page.keyboard.press('Escape');
    await page.locator('.street-photo-dialog').waitFor({state:'detached'});
    assert(await page.locator('#sheet').isVisible(),'Closing the photo must keep its card open');
    await page.locator('#sheet').evaluate(el=>el.scrollTop=0);
    await page.evaluate(()=>document.activeElement?.blur());
    await page.screenshot({path:'release/street-parking-checks/mobile-card.png',animations:'disabled'});
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      for(const theme of ['light','dark']){
        await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
        assert.equal(await page.locator('#sheet').evaluate(el=>el.scrollWidth>el.clientWidth),false,`${width}px ${theme}: card overflow`);
        assert.equal(await page.locator('.street-orientation').count(),1);
        await page.screenshot({path:`release/street-parking-checks/card-${width}-${theme}.png`,animations:'disabled'});
      }
    }
    assert.deepEqual(errors,[]);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#sheet').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    assert.equal(await page.locator('#sheet').getAttribute('role'),'dialog');
    await page.locator('#sheet').focus();
    await page.keyboard.press('Tab');
    assert(await page.locator('#sheet').evaluate(el=>el.contains(document.activeElement)&&el!==document.activeElement));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{selectedDestination={isMapPoint:true,lat:41,lng:69};openAdd()});
    await page.locator('#a_barrier').locator('..').click();
    assert(await page.locator('#a_barrier').isChecked());
    assert(await page.locator('#a_free_fields').isHidden());
    const checkSize=await page.locator('#a_barrier').boundingBox();assert.equal(checkSize.width,22);assert.equal(checkSize.height,22);
    await page.locator('#a_free_period').check();
    await page.locator('#a_free_minutes').fill('60');
    await page.locator('#a_purchase').check();
    await page.locator('#a_free_period').uncheck();
    assert(await page.locator('#a_free_fields').isHidden());
    assert(await page.locator('#a_purchase').isDisabled());
    await page.locator('#a_barrier').focus();await page.keyboard.press('Space');
    assert(!(await page.locator('#a_barrier').isChecked()));
    await page.screenshot({path:'release/street-parking-checks/access-checkboxes.png',animations:'disabled'});
    await page.evaluate(()=>{const p=PARKINGS[0];p.has_free_period=true;p.free_period_minutes=60;p.requires_purchase=true;openAccessReport(p.id)});
    await page.locator('#r_free_period').uncheck();
    assert(await page.locator('#r_free_fields').isHidden());
    const report=await page.evaluate(()=>{let captured;sendReport=(id,reason,comment)=>captured=comment;sendAccessReport(PARKINGS[0].id);return captured});
    assert(report.includes('Требуется покупка: нет'));assert(report.includes('Цена после периода: не применяется'));
    await page.evaluate(()=>{closeSheet();switchTab('home')});
    for(const width of [320,390,1024]){
      await page.setViewportSize({width,height:844});
      await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
      assert.equal(await page.locator('#screen-home').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Home must not overflow');
      await page.screenshot({path:`release/street-parking-checks/home-polish-${width}.png`,animations:'disabled'});
    }
    console.log('Mobile editor, vertices, reversal, unknown-price guard, atomic save payload, card and map filters: OK (isolated map/API doubles)');
    if(process.env.PARKY_REAL_MAP==='1'){
      const real=await browser.newPage({viewport:{width:390,height:844}});
      await real.route('**/*',route=>{
        const url=route.request().url();
        if(url.includes('cdn.jsdelivr.net/npm/@supabase/'))return route.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})},rpc:async()=>{throw Error("Live writes disabled in smoke test")}})}'});
        if(url.includes('supabase.co'))return route.abort();
        return route.continue();
      });
      await real.goto(origin+'/admin.html');
      await real.waitForFunction(()=>window.ymaps&&typeof ymaps.ready==='function',{},{timeout:30000});
      await real.evaluate(()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Yandex map modules timed out')),25000);ymaps.ready(()=>{clearTimeout(timer);resolve()})}));
      await real.evaluate(()=>{$('loginView').classList.add('hidden');$('adminView').classList.remove('hidden')});
      await real.locator('#addStreetBtn').click();
      await real.waitForFunction(()=>coordMap&&coordMap.geoObjects);
      await real.locator('#coordMap').click({position:{x:65,y:85}});
      await real.locator('#coordMap').click({position:{x:230,y:145}});
      await real.locator('#coordMap').click({position:{x:245,y:195}});
      assert.equal(await real.evaluate(()=>parseStreetPath().length),3);
      await real.locator('#parking_side').selectOption('right');
      await real.locator('#coordMap').scrollIntoViewIfNeeded();
      await real.screenshot({path:'release/street-parking-checks/real-map-editor.png',animations:'disabled'});
      console.log('Real Yandex mobile map: three pointer clicks create a valid three-vertex line; no live backend writes');
      await real.close();
    }
  }finally{await browser?.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
