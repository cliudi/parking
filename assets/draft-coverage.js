/* Private administrative context layer, independent of draft parking filters. */
window.ParkyDraftCoverage=(()=>{
  let map=null,lines=[],rows=[],controller=0,initialized=false,loaded=false,signature='';
  const el=id=>document.getElementById(id);
  const colors={parking_added:'#159b64',no_parking:'#159b64'};
  function clear(){if(map)lines.forEach(line=>map.geoObjects.remove(line));lines=[];signature=''}
  function draw(){
    if(!map||!el('draftReadyCoverage').checked||!loaded)return;
    const next=JSON.stringify([rows,records.map(p=>[p.id,p.status,p.category,p.lat,p.lng,p.address])]);
    if(next===signature)return;
    clear();signature=next;
    const joined=ParkyCoverageLines.chains(rows);
    const automatic=ParkyReadyParkingLines.chains(records,rows);
    for(const chain of joined){
      const label=chain.status==='parking_added'?'Сделано: парковки внесены':'Сделано: парковок не найдено';
      // Background only: keep the existing parking icons and street geometry above it.
      const line=new ymaps.Polyline(chain.path,{hintContent:label+' · Это отметка проверки, не разрешение на стоянку.'},{strokeColor:colors[chain.status],strokeWidth:10,strokeOpacity:.5,strokeStyle:'solid',pane:'areas',zIndex:-10,zIndexHover:-10,zIndexActive:-10,interactiveZIndex:false,interactivityModel:'default#transparent',openBalloonOnClick:false});
      line.parklyCoverage=true;map.geoObjects.add(line);lines.push(line);
    }
    for(const chain of automatic){
      const line=new ymaps.Polyline(chain.path,{hintContent:'Готовые парковки подряд: '+chain.pointCount+'. Автоматическая линия по адресам и точкам, не граница проверенного покрытия.'},{strokeColor:'#159b64',strokeWidth:10,strokeOpacity:.5,strokeStyle:'solid',pane:'areas',zIndex:-10,zIndexHover:-10,zIndexActive:-10,interactiveZIndex:false,interactivityModel:'default#transparent',openBalloonOnClick:false});
      line.parklyCoverage=true;line.parklyAutomaticCoverage=true;map.geoObjects.add(line);lines.push(line);
    }
    const completed=rows.filter(r=>['parking_added','no_parking'].includes(r.status)&&r.checked_on).length;
    el('draftReadyStatus').textContent=completed||automatic.length?'Готовых участков: '+completed+'. Автолиний по 3+ меткам: '+automatic.length+'. Прозрачность 50%.':'Нет цепочек из 3 готовых меток на одной улице. Проверьте адреса или отметьте покрытие вручную.';
  }
  function init(){
    if(initialized)return;initialized=true;
    try{el('draftReadyCoverage').checked=localStorage.getItem('parkly-admin-ready-coverage')!=='off'}catch{}
    el('draftReadyCoverage').onchange=()=>{
      try{localStorage.setItem('parkly-admin-ready-coverage',el('draftReadyCoverage').checked?'on':'off')}catch{}
      if(el('draftReadyCoverage').checked)load();else{controller++;rows=[];loaded=false;clear();el('draftReadyStatus').textContent='Слой готовых участков скрыт.';el('draftReadyRetry').hidden=true}
    };
    el('draftReadyRetry').onclick=load;
  }
  async function load(){
    if(!map||!el('draftReadyCoverage').checked)return;
    const version=++controller;el('draftReadyStatus').textContent='Загружаем готовое покрытие…';el('draftReadyRetry').hidden=true;
    try{
      const fetched=[];
      for(let offset=0;;offset+=500){
        const {data,error}=await sb.from('street_coverage_segments').select('id,path,status,checked_on').order('created_at').order('id').range(offset,offset+499);
        if(version!==controller)return;
        if(error||!Array.isArray(data))throw error||Error('Invalid coverage response');
        fetched.push(...data);if(data.length<500)break;
      }
      rows=fetched.filter(row=>ParkyStreetGeometry.valid(row.path));
      loaded=true;signature='';draw();
    }catch(error){
      if(version!==controller)return;
      rows=[];loaded=false;clear();el('draftReadyStatus').textContent='Не удалось загрузить готовое покрытие. Черновики доступны отдельно.';el('draftReadyRetry').hidden=false;
    }
  }
  function open(target){if(map!==target){clear();map=target}init();return load()}
  return {open,refresh:draw};
})();
