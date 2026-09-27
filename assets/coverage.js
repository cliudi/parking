/* Survey coverage is deliberately independent of public parking geometry. */
window.ParkyCoverage=(()=>{
  const statuses={parking_added:['Парковки внесены','#159b64'],no_parking:['Парковок не найдено','#159b64'],partial:['Проверено частично','#8491a3'],recheck:['Требует перепроверки','#8491a3']};
  const isDone=status=>['parking_added','no_parking'].includes(status);
  const statusLabel=status=>(isDone(status)?'Сделано':'Не сделано')+' · '+statuses[status][0];
  const lineStyle=row=>{
    const done=isDone(row.status)&&Boolean(row.checked_on);
    return {strokeColor:done?'#159b64':'#8491a3',strokeWidth:10,strokeStyle:done?'solid':'dash',strokeOpacity:done ? .5 : .85,pane:'areas',zIndex:-10,interactiveZIndex:false};
  };
  let map,rows=[],objects=[],vertices=[],draft=null,editing=false,dirty=false,busy=false,loading=false,selected=-1;
  const el=id=>document.getElementById(id),message=text=>el('coverageMessage').textContent=text;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function init(){
    if(el('coverageMap'))return;
    el('coveragePanel').innerHTML=`<div class="coverage-tools">
      <button class="btn btn-primary" id="coverageNew">＋ Отметить участок</button>
      <button class="btn btn-secondary" id="coverageRefresh">Обновить</button>
      <label><input type="checkbox" id="coverageParkings" checked>Парковки</label>
      ${Object.entries(statuses).map(([key,[name,color]])=>`<label><input type="checkbox" data-coverage-status="${key}" checked><span style="color:${color}">${isDone(key)?'━':'┄'}</span>${statusLabel(key)}</label>`).join('')}
    </div><p id="coverageMessage" role="status" aria-live="polite">Загрузка…</p>
    <div class="coverage-layout"><div id="coverageMap" aria-label="Карта покрытия улиц"></div><div class="coverage-editor">
      <p>Сплошная зелёная линия — сделано, серый пунктир — не сделано. Значки парковок остаются сверху. Выберите участок, нажмите «Изменить статус / участок» и сохраните изменения. Покрытие не означает разрешение на стоянку.</p>
      <div id="coverageList" aria-label="Сохранённые участки"></div>
      <form id="coverageForm" hidden>
        <fieldset id="coverageFields" disabled style="border:0;padding:0;display:grid;gap:10px">
          <label>Статус работы<select id="coverageCompletion"><option value="done">Сделано</option><option value="todo">Не сделано</option></select></label>
          <label>Уточнение<select id="coverageStatus">${Object.entries(statuses).map(([key,[name]])=>`<option value="${key}">${name}</option>`).join('')}</select></label>
          <label>Проверенная сторона<select id="coverageSide"><option value="unspecified">Не указана</option><option value="both">Обе стороны</option><option value="left">Левая по направлению линии</option><option value="right">Правая по направлению линии</option></select></label>
          <label>Дата фактической проверки<input type="date" id="coverageDate"></label>
          <label>Район (необязательно)<input id="coverageDistrict" maxlength="120"></label>
          <label>Комментарий<textarea id="coverageComment" maxlength="2000"></textarea></label>
        </fieldset>
        <p id="coverageGeometryHint"></p>
        <div class="coverage-tools" style="padding:8px 0">
          <button type="button" class="btn btn-secondary" id="coverageEdit">Изменить статус / участок</button>
          <button type="button" class="btn btn-secondary" id="coverageRemoveVertex">Удалить вершину</button>
          <button type="button" class="btn btn-secondary" id="coverageReverse">Развернуть</button>
          <button type="submit" class="btn btn-primary" id="coverageSave">Сохранить</button>
          <button type="button" class="btn btn-secondary" id="coverageCancel">Отмена</button>
          <button type="button" class="btn btn-secondary" id="coverageDelete">Удалить участок</button>
        </div>
      </form>
    </div></div>`;
    el('coverageNew').onclick=()=>{if(loading||!map||!leave())return;draft={path:[],status:'partial',side:'unspecified',comment:'',district:'',checked_on:''};editing=true;dirty=true;selected=-1;form();draw()};
    el('coverageRefresh').onclick=load;
    el('coverageParkings').onchange=draw;
    document.querySelectorAll('[data-coverage-status]').forEach(input=>input.onchange=draw);
    el('coverageFields').oninput=()=>{dirty=true};
    el('coverageCompletion').onchange=()=>{
      const status=el('coverageStatus');
      if(el('coverageCompletion').value==='done'&&!isDone(status.value))status.value=isDone(draft.status)?draft.status:'parking_added';
      if(el('coverageCompletion').value==='todo'&&isDone(status.value))status.value=!isDone(draft.status)?draft.status:'recheck';
      dirty=true;draw();
    };
    el('coverageStatus').onchange=()=>{el('coverageCompletion').value=isDone(el('coverageStatus').value)?'done':'todo';dirty=true;draw()};
    el('coverageDate').onchange=()=>{dirty=true;draw()};
    el('coverageForm').onsubmit=save;
    el('coverageEdit').onclick=()=>{editing=true;formState();draw()};
    el('coverageCancel').onclick=()=>{if(leave()){draft=null;editing=false;form();draw()}};
    el('coverageRemoveVertex').onclick=()=>{if(!editing||selected<0)return;draft.path.splice(selected,1);selected=draft.path.length-1;dirty=true;draw()};
    el('coverageReverse').onclick=()=>{if(!editing)return;draft.path.reverse();const side=el('coverageSide');side.value=({left:'right',right:'left'})[side.value]||side.value;selected=-1;dirty=true;draw()};
    el('coverageDelete').onclick=remove;
    window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  }
  function leave(){if(busy)return false;if(dirty){if(!confirm('Есть несохранённые изменения покрытия. Отменить их?'))return false;draft=null;editing=false;dirty=false;form();draw()}return true}
  async function open(){
    init();
    if(map){map.container.fitToViewport();return}
    if(!window.ymaps){message('Карта пока не загрузилась. Проверьте соединение и нажмите «Обновить».');return}
    ymaps.ready(()=>{
      if(map)return;
      map=new ymaps.Map('coverageMap',{center:[41.3111,69.265],zoom:12,controls:['zoomControl']});
      map.events.add('click',event=>{if(!editing||busy||!draft)return;if(draft.path.length>=200){message('Максимум 200 вершин. Создайте следующий участок.');return}draft.path.push(event.get('coords'));selected=draft.path.length-1;dirty=true;draw()});
      load();
    });
  }
  async function load(){
    init();if(loading||busy||!leave())return;
    if(!map){open();return}
    loading=true;formState();message('Загружаем сохранённые участки…');
    try{
      const result=[];
      for(let offset=0;;offset+=500){
        const {data,error}=await sb.from('street_coverage_segments').select('id,path,status,side,district,comment,checked_on,version').order('created_at').order('id').range(offset,offset+499);
        if(error)throw error;result.push(...data);if(data.length<500)break;
      }
      rows=result;draft=null;editing=false;form();draw();
      message('Загружено участков: '+rows.length+'. Режим просмотра. Для изменений выберите участок.');
      // Use existing paged admin loader; do not silently truncate parking overlay.
      await loadParkingsLegacy();draw();
    }catch(error){message('Не удалось загрузить покрытие. Проверьте соединение и применение миграции «Покрытие улиц». '+(error.message||''))}
    finally{loading=false;formState()}
  }
  function select(row){if(!leave())return;draft=JSON.parse(JSON.stringify(row));editing=false;selected=-1;form();draw();map.setBounds(vertices.length?vertices[0].geometry.getBounds():[row.path[0],row.path[row.path.length-1]],{checkZoomRange:true,maxZoom:17})}
  function form(){el('coverageForm').hidden=!draft;if(!draft)return;
    el('coverageCompletion').value=isDone(draft.status)?'done':'todo';
    el('coverageStatus').value=draft.status;el('coverageSide').value=draft.side;
    el('coverageDate').value=draft.checked_on||'';el('coverageDistrict').value=draft.district||'';el('coverageComment').value=draft.comment||'';formState();
  }
  function formState(){
    el('coverageNew').disabled=busy||loading||!map;
    el('coverageRefresh').disabled=busy||loading;
    if(!draft)return;el('coverageFields').disabled=!editing||busy;
    ['coverageSave','coverageRemoveVertex','coverageReverse'].forEach(id=>el(id).hidden=!editing);
    el('coverageEdit').hidden=editing;el('coverageDelete').hidden=!draft.id||!editing;
    el('coverageForm').querySelectorAll('button').forEach(b=>b.disabled=busy);
  }
  function draw(){
    if(!map)return;objects.forEach(o=>map.geoObjects.remove(o));objects=[];vertices=[];
    const add=o=>{map.geoObjects.add(o);objects.push(o);return o};
    const allowed=new Set([...document.querySelectorAll('[data-coverage-status]:checked')].map(i=>i.dataset.coverageStatus));
    const visible=rows.filter(r=>allowed.has(r.status));
    el('coverageList').innerHTML=visible.map(r=>`<button class="btn btn-secondary" data-id="${escape(r.id)}">${escape(statusLabel(r.status))} · ${escape(r.district||'Участок')} · ${escape(r.checked_on||'Дата не указана')}</button>`).join('');
    el('coverageList').querySelectorAll('button').forEach(b=>b.onclick=()=>select(rows.find(r=>r.id===b.dataset.id)));
    visible.filter(r=>r.id!==draft?.id).forEach(r=>{const line=add(new ymaps.Polyline(r.path,{hintContent:escape(statusLabel(r.status))},lineStyle(r)));line.events.add('click',event=>{event.stopPropagation?.();select(r)})});
    if(el('coverageParkings').checked)(records||[]).forEach(p=>{if(!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng))||p.lat==null||p.lng==null)return;add(new ymaps.Placemark([Number(p.lat),Number(p.lng)],{iconContent:'P',hintContent:escape(p.name)+' · '+escape(p.status)},{preset:p.status==='APPROVED'?'islands#blueCircleIcon':'islands#grayCircleIcon'}))});
    if(!draft)return;
    const preview=editing?{...draft,status:el('coverageStatus').value,checked_on:el('coverageDate').value}:draft;
    const line=add(new ymaps.Polyline(draft.path,{}, {...lineStyle(preview),strokeWidth:12}));vertices.push(line);
    if(editing)draft.path.forEach((point,i)=>{
      const marker=add(new ymaps.Placemark(point,{iconContent:String(i+1)+(selected===i?' •':'')},{preset:'islands#blueCircleIcon',draggable:editing&&!busy}));
      marker.events.add('click',event=>{event.stopPropagation?.();selected=i;draw()});
      marker.events.add('dragend',()=>{draft.path[i]=marker.geometry.getCoordinates();selected=i;dirty=true;draw()});
      if(editing&&i){const a=draft.path[i-1],mid=add(new ymaps.Placemark([(a[0]+point[0])/2,(a[1]+point[1])/2],{iconContent:'+'},{preset:'islands#grayCircleIcon'}));mid.events.add('click',event=>{event.stopPropagation?.();if(busy||draft.path.length>=200)return;draft.path.splice(i,0,mid.geometry.getCoordinates());selected=i;dirty=true;draw()})}
    });
    el('coverageGeometryHint').textContent=(editing?'Нажимайте по дороге для продолжения; перетаскивайте вершины. «+» добавляет изгиб. ':'Просмотр. ')+draft.path.length+' вершин. Сторона определяется от 1 к последней точке.';
  }
  async function save(event){
    event.preventDefault();if(!editing||busy||!draft)return;
    if(!ParkyStreetGeometry.valid(draft.path)){message('Нужны 2–200 разных последовательных точек; длина до 50 км.');return}
    const checked=el('coverageDate').value,status=el('coverageStatus').value;
    if(['parking_added','no_parking'].includes(status)&&!checked){message('Укажите дату фактической проверки.');return}
    const p_data={...draft,status,side:el('coverageSide').value,checked_on:checked||null,district:el('coverageDistrict').value.trim(),comment:el('coverageComment').value.trim()};
    busy=true;formState();
    try{const {error}=await sb.rpc('admin_save_street_coverage',{p_data});if(error)throw error;dirty=false;busy=false;await load();message('Участок сохранён. Парковки не изменялись.')}
    catch(error){message('Не удалось сохранить: '+error.message)}finally{busy=false;formState()}
  }
  async function remove(){
    if(busy||!editing||!draft?.id||!confirm('Удалить только отметку проверки? Сами парковки останутся.'))return;
    busy=true;formState();
    try{const {error}=await sb.rpc('admin_delete_street_coverage',{p_id:draft.id,p_version:draft.version});if(error)throw error;dirty=false;busy=false;await load()}
    catch(error){message('Не удалось удалить: '+error.message)}finally{busy=false;formState()}
  }
  return {open,load,leave};
})();
