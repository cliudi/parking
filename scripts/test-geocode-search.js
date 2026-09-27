// Execute the Edge handler with mocked providers, not production services.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/parkly-geocode/index.ts','utf8').replace(/^import .*;\s*$/gm,'').replace('export default {','globalThis.handler = {');
const calls=[],secrets={YANDEX_GEOCODER_API_KEY:'test-only'};
const context={Request,Response,URLSearchParams,TextEncoder,AbortController,DOMException,setTimeout,clearTimeout,console,withSupabase:(_,fn)=>fn,Deno:{env:{get:k=>secrets[k]}},fetch:async url=>{
  calls.push(url);
  if(url.includes('geocode-maps'))return Response.json({response:{GeoObjectCollection:{featureMember:[{GeoObject:{name:'Тестовый адрес',description:'Ташкент',Point:{pos:'69.3 41.35'},metaDataProperty:{GeocoderMetaData:{text:'Тестовый адрес, Ташкент'}}}}]}}});
  throw Error('Unexpected provider');
}};
vm.createContext(context);vm.runInContext(stripTypeScriptTypes(source),context);
const invoke=body=>context.handler.fetch(new Request('https://test.invalid',{method:'POST',headers:{Origin:'https://cliudi.github.io','Content-Type':'application/json'},body:JSON.stringify(body)}));
(async()=>{
  let response=await invoke({mode:'search-address',query:'Тестовая улица 5'});assert.equal(response.status,200);
  let data=await response.json();assert.deepEqual(data.results[0].coords,[41.35,69.3]);assert.equal(data.addressOnly,true);
  assert.equal(new URL(calls[0]).searchParams.get('results'),'8');
  secrets.YANDEX_SEARCH_API_KEY='must-not-use-for-address-mode';calls.length=0;
  response=await invoke({mode:'search-address',query:'Адрес 2'});assert.equal(response.status,200);assert(calls.every(u=>!u.includes('search-maps')));
  response=await invoke({mode:'search-address',query:'x'});assert.equal(response.status,400);
  response=await invoke({mode:'search-address',query:'x'.repeat(201)});assert.equal(response.status,400);
  response=await invoke({lat:41.35,lng:69.3});assert.equal(response.status,200);data=await response.json();assert.equal(data.provider,'yandex');
  response=await context.handler.fetch(new Request('https://test.invalid',{method:'POST',headers:{Origin:'https://untrusted.invalid'},body:'{}'}));assert.equal(response.status,403);
  delete secrets.YANDEX_GEOCODER_API_KEY;
  response=await invoke({mode:'search-address',query:'Адрес 3'});assert.equal(response.status,503);
  console.log('Geocode handler: address search, coordinate order, input bounds, origin guard, missing config, reverse compatibility OK');
})().catch(e=>{console.error(e);process.exitCode=1});
