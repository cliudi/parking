const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const assets=fs.existsSync(path.join(__dirname,'../www/assets/coverage-lines.js'))?'../www/assets/':'../assets/';
const {chains}=require(assets+'coverage-lines');
const {server,fakeMapRuntime}=require('./test-street-ui');
const {chromium}=require(process.env.PARKY_PLAYWRIGHT_MODULE||'playwright');
const a=[41.3,69.2],b=[41.301,69.2],c=[41.302,69.2],d=[41.303,69.2];
const item=(id,path,status='parking_added')=>({id,path,status,checked_on:'2026-09-27'});
const input=[item('1',[a,b]),item('2',[c,b]),item('3',[c,d])],before=JSON.stringify(input);
assert.deepEqual(chains(input)[0].path,[a,b,c,d]);assert.equal(chains(input).length,1);assert.equal(JSON.stringify(input),before,'Stored paths must not change');
assert.equal(chains([item('1',[a,b]),item('2',[[41.30101,69.2],c])]).length,2,'Do not bridge a gap');
assert.equal(chains([item('1',[a,b]),item('2',[b,c]),item('3',[b,[41.301,69.21]])]).length,3,'Do not choose an arbitrary branch');
assert.equal(chains([item('1',[a,b]),item('2',[b,a])]).length,1,'Identical reversed paths do not darken twice');
assert.equal(chains([item('1',[a,b]),item('2',[b,c],'no_parking')]).length,2,'Keep different status colors');
assert.equal(chains([item('1',[a,b],'partial'),item('2',[b,c],'recheck'),{...item('3',[c,d]),checked_on:null}]).length,0);
assert.equal(chains([item('1',[a,b]),item('2',[b,c]),item('3',[c,a])]).length,1,'Closed chain terminates');
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.addInitScript(fakeMapRuntime);
    await page.goto(origin+'/admin.html');
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
    await page.evaluate(rows=>{
      window.coverageTestRows=rows;window.coverageError=false;window.coveragePageCalls=[];
      sb.from=table=>{if(table!=='street_coverage_segments')throw Error('Unexpected table');return {select:()=>({order:()=>({order:()=>({range:async(start,end)=>{coveragePageCalls.push(start);return {data:coverageTestRows.slice(start,end+1),error:coverageError?{message:'Test offline'}:null}}})})})}};
      document.getElementById('loginView').classList.add('hidden');document.getElementById('adminView').classList.remove('hidden');
      document.getElementById('parkingsPanel').classList.add('hidden');document.getElementById('draftMapPanel').classList.remove('hidden');currentAdminSection='draft-map';
      records=[
        {id:'draft-point',name:'Черновик',category:'OFFICIAL',status:'DRAFT',source:'ADMIN',lat:41.3,lng:69.2,price_type:'unknown'},
        {id:'ready-point',name:'Готовая парковка',category:'OFFICIAL',status:'APPROVED',source:'ADMIN',lat:41.301,lng:69.2,price_type:'free',has_barrier:true},
        {id:'ready-street',name:'Уличная парковка',category:'STREET_ALLOWED',status:'APPROVED',source:'ADMIN',lat:41.302,lng:69.2,price_type:'free',street_path:[[41.301,69.2],[41.302,69.2]]},
        {id:'archived-point',name:'Архив',category:'OFFICIAL',status:'ARCHIVED',lat:41.3,lng:69.2}
      ];
      initDraftMap();
    },[...input,item('partial',[d,[41.304,69.2]],'partial'),item('recheck',[d,[41.305,69.2]],'recheck'),item('no-parking',[[41.3,69.21],[41.303,69.21]],'no_parking')]);
    await page.waitForFunction(()=>document.getElementById('draftReadyStatus').textContent.includes('Готовых участков: 4'));
    assert.equal(await page.locator('#draftReadyRetry').isVisible(),false);
    const read=()=>page.evaluate(()=>testMaps.draftMap.objects.filter(o=>o.parklyCoverage).map(o=>({path:o.geometry.getCoordinates(),options:o.options.values})));
    let lines=await read();assert.equal(lines.length,2);
    assert.deepEqual(lines[0].path,[a,b,c,d]);
    for(const line of lines){
      assert.equal(line.options.strokeStyle,'solid');assert.equal(line.options.strokeOpacity,.5);
      assert.equal(line.options.pane,'areas');assert.equal(line.options.zIndex,-10);
      assert.equal(line.options.zIndexHover,-10);assert.equal(line.options.zIndexActive,-10);
      assert.equal(line.options.interactiveZIndex,false);assert.equal(line.options.interactivityModel,'default#transparent');
    }
    assert.equal(await page.locator('#draftMapStatus').inputValue(),'ALL','Ready parking icons are visible on opening');
    assert.equal(await page.evaluate(()=>draftMapMarkers.size),3,'Draft, published icon and parking geometry remain available');
    const icon=()=>page.evaluate(()=>draftMapMarkers.get('ready-point').options.values);
    const originalIcon=await icon();
    assert.equal(originalIcon.iconImageHref,await page.evaluate(()=>adminMapMarkerSvg(records.find(p=>p.id==='ready-point'))),'Keep the original P icon and barrier badge');
    assert.deepEqual(originalIcon.iconImageSize,[42,54]);assert.ok(originalIcon.zIndex>lines[0].options.zIndex);
    assert.equal(await page.evaluate(()=>draftMapMarkers.get('ready-street').options.values.strokeStyle),'solid','Parking geometry is not replaced by coverage');
    await page.evaluate(()=>draftMapMarkers.get('ready-point').events.fire('click',{}));
    assert.equal(await page.evaluate(()=>draftMapSelectedId),'ready-point');
    assert.ok((await page.locator('#draftMapCard').innerText()).includes('Готовая парковка'));
    await page.evaluate(()=>closeDraftMapCard());
    for(const status of ['APPROVED','ALL','DRAFT']){
      await page.locator('#draftMapStatus').selectOption(status);
      await page.evaluate(()=>renderDraftMap());assert.equal((await read()).length,2,'Parking status filters do not hide coverage');
      assert.equal(await page.evaluate(()=>draftMapMarkers.size),{APPROVED:2,ALL:3,DRAFT:1}[status]);
    }
    await page.locator('#draftMapReset').click();
    assert.equal(await page.locator('#draftMapStatus').inputValue(),'ALL','Reset restores ready icons too');
    assert.deepEqual(await icon(),originalIcon);
    await page.locator('#draftReadyCoverage').uncheck();assert.equal((await read()).length,0);
    assert.deepEqual(await icon(),originalIcon,'Hiding coverage must not change the parking icon');
    assert.equal(await page.evaluate(()=>localStorage.getItem('parkly-admin-ready-coverage')),'off');
    await page.locator('#draftReadyCoverage').check();await page.waitForFunction(()=>testMaps.draftMap.objects.filter(o=>o.parklyCoverage).length===2);
    assert.deepEqual(await icon(),originalIcon,'Restoring coverage must not change the parking icon');
    // An updated status on return/refresh must remove the no-longer-complete span.
    await page.evaluate(()=>{coverageTestRows[1].status='partial';return ParkyDraftCoverage.open(draftMap)});
    lines=await read();assert.equal(lines.length,3);assert.ok(!lines.some(l=>l.path.length===4));
    await page.evaluate(()=>{coverageError=true;return ParkyDraftCoverage.open(draftMap)});
    assert.equal((await read()).length,0);assert.equal(await page.locator('#draftReadyRetry').isVisible(),true);
    assert.equal(await page.evaluate(()=>draftMapMarkers.size),3,'Coverage error must not remove parking icons');
    assert.deepEqual(await icon(),originalIcon);
    await page.evaluate(()=>{coverageError=false});await page.locator('#draftReadyRetry').click();
    await page.waitForFunction(()=>testMaps.draftMap.objects.filter(o=>o.parklyCoverage).length===3);
    // Every page is fetched; exactly repeated paths still render once.
    await page.evaluate(()=>{coverageTestRows=Array.from({length:501},(_,i)=>({...coverageTestRows[0],id:'page-'+i}));coveragePageCalls=[];return ParkyDraftCoverage.open(draftMap)});
    assert.deepEqual(await page.evaluate(()=>coveragePageCalls),[0,500]);assert.equal((await read()).length,1);
    assert.equal(await page.evaluate(()=>testCalls.length),0,'Visual layer never writes to the database');
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>setSidebarOpen(false));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:'release/draft-ready-coverage-'+width+'.png',fullPage:true});
    }
    assert.deepEqual(errors,[]);
    console.log('Draft coverage: solid 50% layer, safe visual joins, draft filters, visibility, refresh, errors, pagination and no writes passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
