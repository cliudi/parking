/* Loaded after the admin application. Uses its map, dirty tracking and form. */
let streetEditorObjects=[],streetEditorSelected=-1,streetDrawing=false;
function streetEditorPath(){
  const text=val('street_path');
  if(!text)return [];
  return text.split(/\n+/).filter(s=>s.trim()).map(s=>s.split(',').map(x=>x.trim()===''?NaN:Number(x)));
}
function streetEditorWrite(path){
  $('street_path').value=path.map(p=>p.map(x=>Number(x.toFixed(7))).join(', ')).join('\n');
  if(path.length&&ParkyStreetGeometry.point(path[0]))writeCoordinates(path[0]);
  markParkingFormDirty();renderStreetEditor();
}
function streetEditorAppend(coords){
  const path=streetEditorPath();
  if(path.length>=200){toast('Максимум 200 вершин участка','error');return}
  if(path.length&&ParkyStreetGeometry.point(path[path.length-1])&&ParkyStreetGeometry.distance(path[path.length-1],coords)<=.1)return;
  streetEditorSelected=path.length;streetEditorWrite([...path,coords]);
}
function resetStreetEditor(){streetDrawing=false;streetEditorSelected=-1;renderStreetEditor()}
function renderStreetEditor(){
  const enabled=val('category')==='STREET_ALLOWED';
  $('streetMapTools').classList.toggle('hidden',!enabled);
  if(!coordMap)return;
  streetEditorObjects.forEach(o=>coordMap.geoObjects.remove(o));streetEditorObjects=[];
  coordPlacemark?.options.set('visible',!enabled);
  if(!enabled)return;
  const path=streetEditorPath(),valid=path.length<=200&&path.every(ParkyStreetGeometry.point);
  $('streetLength').textContent=valid&&path.length>1?'Протяжённость: ≈ '+Math.round(ParkyStreetGeometry.length(path))+' м':'Поставьте начало и конец участка';
  $('streetDraw').textContent=streetDrawing?'Завершить линию':'Добавлять точки на карте';
  $('streetDraw').setAttribute('aria-pressed',String(streetDrawing));
  $('streetRemove').disabled=streetEditorSelected<0||streetEditorSelected>=path.length;
  if(!valid)return;
  const add=o=>{coordMap.geoObjects.add(o);streetEditorObjects.push(o)};
  if(path.length>1){
    const draft=val('status')!=='APPROVED',color=draft?'#8491a3':val('price_type')==='free'?'#16a34a':val('price_type')==='paid'?'#1677ff':'#8491a3';
    add(new ymaps.Polyline(path,{}, {strokeColor:['#ffffff',color],strokeWidth:[10,6],strokeStyle:draft?'dash':'solid'}));
  }
  path.forEach((p,i)=>{
    const label=(i===0?'Начало → ':i===path.length-1?'Конец ':'')+(i+1);
    const marker=new ymaps.Placemark(p,{iconContent:String(i+1),hintContent:label},{preset:'islands#'+(i===streetEditorSelected?'red':'blue')+'CircleIcon',draggable:true});
    marker.events.add('click',()=>{streetEditorSelected=i;renderStreetEditor()});
    marker.events.add('dragend',()=>{const next=streetEditorPath();next[i]=marker.geometry.getCoordinates();streetEditorSelected=i;streetEditorWrite(next)});
    add(marker);
    if(i&&path.length<200){
      const prev=path[i-1],mid=[(prev[0]+p[0])/2,(prev[1]+p[1])/2];
      const handle=new ymaps.Placemark(mid,{iconContent:'+',hintContent:'Добавить вершину изгиба'},{preset:'islands#grayCircleIcon'});
      handle.events.add('click',()=>{const next=streetEditorPath();next.splice(i,0,mid);streetEditorSelected=i;streetEditorWrite(next)});add(handle);
    }
  });
  // An explicit start→end arrow, with side labels, follows the first edge.
  const side=val('parking_side');
  $('streetDirection').textContent='Смотрите от вершины 1 к 2: '+({right:'парковка справа →',left:'← парковка слева',both:'← парковка с обеих сторон →'}[side]||'выберите сторону улицы')+'. Линию рисуйте по фактическому краю парковки. Если правила отличаются — создайте отдельный участок.';
}
function streetDetailsFromForm(){
  return Object.fromEntries(['parking_side','parking_orientation','street_days','street_restrictions','street_notes'].map(k=>[k,val(k)]));
}
$('addStreetBtn').onclick=()=>{openForm({category:'STREET_ALLOWED',kind:'street',status:'DRAFT',price_type:'unknown'});$('formTitle').textContent='Новый уличный участок';streetDrawing=true;setTimeout(()=>{$('coordMap').scrollIntoView({block:'center',behavior:'smooth'});renderStreetEditor()},100)};
$('streetDraw').onclick=()=>{streetDrawing=!streetDrawing;renderStreetEditor();if(streetDrawing)$('coordMap').scrollIntoView({block:'center',behavior:'smooth'})};
$('streetRemove').onclick=()=>{const path=streetEditorPath();if(streetEditorSelected>=0){path.splice(streetEditorSelected,1);streetEditorSelected=-1;streetEditorWrite(path)}};
$('streetReverse').onclick=()=>{const side=val('parking_side');$('parking_side').value=side==='right'?'left':side==='left'?'right':side;streetEditorSelected=-1;streetEditorWrite(streetEditorPath().reverse())};
$('street_path').addEventListener('input',renderStreetEditor);
['category','status','price_type','parking_side'].forEach(id=>$(id).addEventListener('change',renderStreetEditor));
$('category').addEventListener('change',renderPhotoManager);
$('coordMap').insertAdjacentElement('afterend',$('streetMapTools'));
$('streetMapTools').classList.toggle('hidden',val('category')!=='STREET_ALLOWED');
