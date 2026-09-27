const assert=require('node:assert/strict');
const {server,fakeMapRuntime}=require('./test-street-ui');
const {chromium}=require(process.env.PARKY_PLAYWRIGHT_MODULE||'playwright');
const id='00000000-0000-4000-8000-000000000001';
function ewkb(lat,lng,little=true){const b=Buffer.alloc(25);b[0]=little?1:0;b[little?'writeUInt32LE':'writeUInt32BE'](0x20000001,1);b[little?'writeUInt32LE':'writeUInt32BE'](4326,5);b[little?'writeDoubleLE':'writeDoubleBE'](lng,9);b[little?'writeDoubleLE':'writeDoubleBE'](lat,17);return b.toString('hex')}
const row={id,name:'Тестовая парковка <без HTML>',address:'Тестовый адрес',location:ewkb(41.3,69.2),status:'APPROVED',category:'OFFICIAL',kind:'open',price_type:'free',has_barrier:true,has_free_period:true,free_period_minutes:60};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    for(const mode of ['web','telegram','missing','draft','invalid','offline','street','cancel']){
      const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
      let unavailable=mode==='offline',waiting=null;
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async r=>{
        const url=new URL(r.request().url());
        if(url.origin===origin)return r.continue();
        if(url.pathname==='/rest/v1/parkings'&&url.searchParams.get('id')?.startsWith('eq.')){
          requests.push(url);
          assert.equal(url.searchParams.get('id'),'eq.'+id);assert.equal(url.searchParams.get('status'),'eq.APPROVED');
          assert.ok(!url.searchParams.get('select').includes('submitted_by'));
          if(mode==='cancel')await new Promise(resolve=>{waiting=resolve});
          return r.fulfill({status:unavailable?503:200,contentType:'application/json',body:JSON.stringify(mode==='missing'?[]:[{...row,status:mode==='draft'?'DRAFT':'APPROVED',category:mode==='street'?'STREET_ALLOWED':'OFFICIAL'}])}).catch(()=>{});
        }
        const lines=mode==='street'&&url.pathname.endsWith('/street_parking_segments_v2')?[{parking_id:id,path:[[41.3,69.2],[41.301,69.201]],details:{parking_side:'right',parking_orientation:'parallel'},photos:[]}]:[];
        return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(lines)});
      });
      await page.addInitScript(fakeMapRuntime);
      await page.addInitScript(({mode,id})=>{
        localStorage.setItem('parkly-onboarding-complete','1');
        window.sharedPayload=null;window.copied=null;
        navigator.share=async payload=>{sharedPayload=payload};
        navigator.clipboard.writeText=async value=>{if(window.copyFails)throw Error('Blocked');window.copied=value};
        if(mode==='telegram')window.Telegram={WebApp:{initData:'private-data',initDataUnsafe:{start_param:'parking_'+id},platform:'tdesktop',colorScheme:'light',isVersionAtLeast:()=>false,onEvent(){},ready(){},expand(){}}};
      },{mode,id});
      const query=mode==='telegram'?'?tgWebAppStartParam=parking_'+id+'&tgWebAppData=SECRET':mode==='invalid'?'?parking=%3Cscript%3E':'?parking='+id;
      await page.goto(origin+'/index.html'+query);
      await page.evaluate(()=>document.getElementById('brandSplash')?.remove());
      if(['web','telegram','street'].includes(mode)){
        await page.waitForFunction(id=>selectedId===id,id);
        const selector=mode==='street'?'#sheet':'#minicard';
        assert.match(await page.locator(selector).textContent(),/Тестовая парковка без HTML/);
        assert.equal(await page.evaluate(()=>mePos),null,'Link does not set user location');
        await page.evaluate(()=>{ymaps.templateLayoutFactory={createClass:s=>s};initMap()});
        assert.deepEqual(await page.evaluate(()=>ymap.getCenter()),[41.3,69.2],'Delayed map centers on parking');
        await page.evaluate(()=>{lastParkingLoadAt=0;return loadParkingsFromDB(41,69)});
        await page.waitForTimeout(80);
        assert.equal(await page.evaluate(id=>PARKINGS.some(p=>p.id===id),id),true,'Background map reload preserves open shared card');
        await page.evaluate(id=>shareParking(id),id);
        const payload=await page.evaluate(()=>sharedPayload);
        assert.equal(payload.url,mode==='telegram'?'https://t.me/parky_app_bot?startapp=parking_'+id:'https://cliudi.github.io/parking/?parking='+id);
        assert.ok(!JSON.stringify(payload).includes('SECRET'));
        await page.evaluate(id=>{navigator.share=undefined;return shareParking(id)},id);
        assert.equal(await page.locator('.parking-share-url').inputValue(),'https://cliudi.github.io/parking/?parking='+id);
        assert.match(await page.locator('.parking-link-actions a').getAttribute('href'),/startapp%3Dparking_/);
        await page.getByRole('button',{name:'Скопировать ссылку',exact:true}).click();
        assert.equal(await page.evaluate(()=>copied),'https://cliudi.github.io/parking/?parking='+id);
        await page.evaluate(()=>{copyFails=true});
        await page.getByRole('button',{name:'Скопировать ссылку',exact:true}).click();
        assert.match(await page.locator('.parking-link-panel p').textContent(),/Выделите ссылку/);
        if(mode==='web'){
          for(const little of [true,false])assert.deepEqual(await page.evaluate(value=>ParkyLinks.coordinates(value),ewkb(41.3,69.2,little)),{lat:41.3,lng:69.2});
          assert.equal(await page.evaluate(()=>{try{ParkyLinks.coordinates('0'.repeat(50));return false}catch{return true}}),true);
          assert.equal(await page.evaluate(()=>ParkyLinks.webUrl('<script>')),null);
          await page.screenshot({path:'release/parking-link-share.png'});
        }
      }else if(mode==='cancel'){
        await page.waitForFunction(()=>!!document.querySelector('[data-parky-link]'));
        await page.locator('[data-parky-link] button').click();
        waiting?.();await page.waitForTimeout(100);
        assert.equal(await page.locator('#mask').evaluate(e=>e.classList.contains('open')),false);
        assert.equal(await page.evaluate(()=>selectedId),null);
      }else{
        const expected=mode==='invalid'?'некорректна':mode==='offline'?'Проверьте интернет':'Парковка недоступна';
        await page.waitForFunction(expected=>document.querySelector('[data-parky-link] p')?.textContent.includes(expected),expected);
        if(mode==='invalid')assert.equal(requests.length,0,'Invalid ID makes no detail request');
        if(mode==='offline'){
          unavailable=false;
          await page.getByRole('button',{name:'Повторить',exact:true}).click();
          await page.waitForFunction(id=>selectedId===id,id);
        }
      }
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log('Parking links: browser/Telegram launch, anonymous APPROVED lookup, street cards, retries, cancel, delayed map, sharing and privacy passed');
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
