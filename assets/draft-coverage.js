/* Private administrative context layer, independent of draft parking filters. */
window.ParkyDraftCoverage=(()=>{
  let map=null,lines=[],rows=[],controller=0,initialized=false;
  const el=id=>document.getElementById(id);
  const colors={parking_added:'#159b64',no_parking:'#2673df'};
  function clear(){if(map)lines.forEach(line=>map.geoObjects.remove(line));lines=[]}
  function draw(){
    clear();if(!map||!el('draftReadyCoverage').checked)return;
    const joined=ParkyCoverageLines.chains(rows);
    for(const chain of joined){
      const label=chain.status==='parking_added'?'Готовое покрытие: парковки внесены':'Готовое покрытие: парковок не найдено';
      // Background only: keep the existing parking icons and street geometry above it.
      const line=new ymaps.Polyline(chain.path,{hintContent:label+' · Это отметка проверки, не разрешение на стоянку.'},{strokeColor:colors[chain.status],strokeWidth:10,strokeOpacity:.5,strokeStyle:'solid',pane:'areas',zIndex:-10,zIndexHover:-10,zIndexActive:-10,interactiveZIndex:false,interactivityModel:'default#transparent',openBalloonOnClick:false});
      line.parklyCoverage=true;map.geoObjects.add(line);lines.push(line);
    }
  }
  function init(){
    if(initialized)return;initialized=true;
    try{el('draftReadyCoverage').checked=localStorage.getItem('parkly-admin-ready-coverage')!=='off'}catch{}
    el('draftReadyCoverage').onchange=()=>{
      try{localStorage.setItem('parkly-admin-ready-coverage',el('draftReadyCoverage').checked?'on':'off')}catch{}
      if(el('draftReadyCoverage').checked)load();else{controller++;rows=[];clear();el('draftReadyStatus').textContent='Слой готовых участков скрыт.';el('draftReadyRetry').hidden=true}
    };
    el('draftReadyRetry').onclick=load;
  }
  async function load(){
    if(!map||!el('draftReadyCoverage').checked)return;
    const version=++controller;el('draftReadyStatus').textContent='Загружаем готовое покрытие…';el('draftReadyRetry').hidden=true;
    try{
      const loaded=[];
      for(let offset=0;;offset+=500){
        const {data,error}=await sb.from('street_coverage_segments').select('id,path,status,checked_on').order('created_at').order('id').range(offset,offset+499);
        if(version!==controller)return;
        if(error||!Array.isArray(data))throw error||Error('Invalid coverage response');
        loaded.push(...data);if(data.length<500)break;
      }
      rows=loaded.filter(row=>['parking_added','no_parking'].includes(row.status)&&row.checked_on&&ParkyStreetGeometry.valid(row.path));
      draw();el('draftReadyStatus').textContent=rows.length?'Готовых участков: '+rows.length+'. Сплошная линия · прозрачность 50%.':'Готовых участков пока нет. Отметьте их в «Покрытие улиц».';
    }catch(error){
      if(version!==controller)return;
      rows=[];clear();el('draftReadyStatus').textContent='Не удалось загрузить готовое покрытие. Черновики доступны отдельно.';el('draftReadyRetry').hidden=false;
    }
  }
  function open(target){if(map!==target){clear();map=target}init();return load()}
  return {open};
})();
