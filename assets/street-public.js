function streetSegment(p){return streetSegments.find(s=>String(s.parking_id)===String(p.id))}
function streetObjectFilterHtml(){
  const labels=({ru:['Тип объекта','Все объекты','Обычные парковки','Уличные участки'],en:['Object type','All objects','Parking lots','Street sections'],uz:['Obyekt turi','Barcha obyektlar','Avtoturargohlar','Ko‘cha uchastkalari']})[lang]||['Тип объекта','Все объекты','Обычные парковки','Уличные участки'];
  return '<div class="filt-group"><h3>'+labels[0]+'</h3>'+['','point','street'].map((value,i)=>'<button class="btn-outline" style="margin-bottom:8px" aria-pressed="'+String((advFilters.objectKind||'')===value)+'" onclick="setStreetObjectFilter(\''+value+'\')">'+((advFilters.objectKind||'')===value?'✓ ':'')+labels[i+1]+'</button>').join('')+'</div>';
}
function setStreetObjectFilter(value){if(['','point','street'].includes(value)){advFilters.objectKind=value;openFilters()}}
function streetDestination(p){
  if(p.category!=='STREET_ALLOWED')return p;
  const s=streetSegment(p),nearest=s&&ParkyStreetGeometry.nearest(s.path,mePos?[mePos.lat,mePos.lng]:null);
  return nearest?{...p,...nearest}:null;
}
function streetCopy(){
  const translations={
    ru:{title:'Разрешённая уличная парковка',length:'Протяжённость',side:'Сторона от начала к концу линии',how:'Как разрешено парковаться',days:'Дни',restrictions:'Ограничения',notes:'Примечание',notice:'Парковка разрешена на указанном участке. Наличие свободного места не гарантируется.',direction:'Стороны указаны по направлению от начала к концу линии, а не по направлению вашего движения.',missing:'Данные участка недоступны. Обновите карту.',right:'Правая',left:'Левая',both:'Обе стороны',parallel:'Параллельно дороге',perpendicular:'Перпендикулярно дороге',angled:'Под углом',partly_sidewalk:'Частично на тротуаре',fully_sidewalk:'Полностью на тротуаре — по разрешающему знаку',according_to_sign:'Согласно знаку',other:'Другое',unspecified:'Не указано',start:'Начало участка',end:'Конец участка'},
    en:{title:'Permitted street parking',length:'Length',side:'Side from line start to end',how:'How to park',days:'Days',restrictions:'Restrictions',notes:'Note',notice:'Parking is permitted along this section. An available space is not guaranteed.',direction:'Sides refer to the line’s start-to-end direction, not your driving direction.',missing:'Section data unavailable. Refresh the map.',right:'Right',left:'Left',both:'Both sides',parallel:'Parallel',perpendicular:'Perpendicular',angled:'Angled',partly_sidewalk:'Partly on the sidewalk',fully_sidewalk:'On the sidewalk — expressly permitted by a sign',according_to_sign:'According to the sign',other:'Other',unspecified:'Unspecified',start:'Section start',end:'Section end'},
    uz:{title:'Ruxsat etilgan ko‘cha avtoturargohi',length:'Uzunligi',side:'Chiziq boshidan oxiriga qarab tomon',how:'Qanday to‘xtash mumkin',days:'Kunlar',restrictions:'Cheklovlar',notes:'Izoh',notice:'Ushbu qismda to‘xtashga ruxsat berilgan. Bo‘sh joy borligi kafolatlanmaydi.',direction:'Tomonlar harakat yo‘nalishingizga emas, chiziqning boshidan oxiriga qarab ko‘rsatilgan.',missing:'Uchastka ma’lumotlari mavjud emas. Xaritani yangilang.',right:'O‘ng',left:'Chap',both:'Ikkala tomon',parallel:'Yo‘lga parallel',perpendicular:'Yo‘lga perpendikulyar',angled:'Burchak ostida',partly_sidewalk:'Qisman yo‘lakda',fully_sidewalk:'Yo‘lakda — belgi ruxsat bergan bo‘lsa',according_to_sign:'Belgiga muvofiq',other:'Boshqa',unspecified:'Ko‘rsatilmagan',start:'Uchastka boshi',end:'Uchastka oxiri'}
  };return translations[lang]||translations.ru;
}
function streetInfoHtml(p,withPhotos=false){
  if(p.category!=='STREET_ALLOWED')return '';
  const s=streetSegment(p),c=streetCopy();if(!s)return '<p>'+escapeHtml(c.missing)+'</p>';
  const d=s.details||{},rows=[[c.side,c[d.parking_side]||c.unspecified],[c.how,c[d.parking_orientation]||c.unspecified],[c.length,'≈ '+Math.round(s.length_m||ParkyStreetGeometry.length(s.path))+' '+t('unitM')]];
  if(d.street_days)rows.push([c.days,d.street_days]);
  if(d.street_restrictions)rows.push([c.restrictions,d.street_restrictions]);
  if(d.street_notes)rows.push([c.notes,d.street_notes]);
  let html='<section class="parking-terms"><h3>'+escapeHtml(c.title)+'</h3>'+rows.map(r=>'<div class="parking-term-row"><span>'+escapeHtml(r[0])+'</span><b>'+escapeHtml(r[1])+'</b></div>').join('')+'<p class="parking-term-note">'+escapeHtml(c.direction)+'</p>';
  if(withPhotos){
    const photos=(s.photos||[]).map((photo,index)=>({...photo,index,url:safePhotoUrl(photo.url)})).filter(photo=>photo.url);
    const signs=photos.filter(photo=>['parking_sign','orientation'].includes(photo.type));
    const others=photos.filter(photo=>!['parking_sign','orientation'].includes(photo.type));
    const photoHtml=photo=>'<button type="button" class="street-photo" onclick="openStreetPhoto(\''+p.id+'\','+photo.index+')" aria-label="'+escapeHtml(photo.caption||c.how)+'"><img loading="lazy" src="'+escapeHtml(photo.url)+'" alt="'+escapeHtml(photo.caption||c.how)+'"></button>';
    if(signs.length)html+='<h3>'+escapeHtml(c.how)+'</h3>'+signs.map(photoHtml).join('');
    if(others.length)html+='<div class="street-photo-grid">'+others.map(photoHtml).join('')+'</div>';
  }
  return html+'<p class="mc-place-note">'+escapeHtml(c.notice)+'</p></section>';
}
function openStreetPhoto(id,index){
  const s=streetSegments.find(s=>String(s.parking_id)===String(id)),photo=s?.photos?.[index],url=safePhotoUrl(photo?.url);if(!url)return;
  const dialog=document.createElement('dialog');dialog.className='street-photo-dialog';
  const button=document.createElement('button');button.textContent='×';button.setAttribute('aria-label',t('close'));
  const img=document.createElement('img');img.src=url;img.alt=photo.caption||streetCopy().how;
  button.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
  dialog.append(button,img);document.body.append(dialog);dialog.showModal();
}
function openStreetCard(p){
  openSheet('<div class="grabber"><i></i></div><button class="sheet-close" aria-label="'+t('close')+'" onclick="closeSheet()">×</button><div class="fc-body street-card"><h2>'+escapeHtml(p.name)+'</h2><p>'+escapeHtml(p.addr)+'</p><h3>'+escapeHtml(priceLabel(p))+'</h3>'+(p.price_day&&p.price_text?'<p>'+escapeHtml(p.price_day)+'</p>':'')+(p.price_note?'<p>'+escapeHtml(p.price_note)+'</p>':'')+'<p>'+escapeHtml(p.is247?t('open247'):p.hours)+'</p>'+streetInfoHtml(p,true)+parkingTermsHtml(p)+'<div class="fc-actions"><button class="btn-primary" onclick="closeSheet();routeTo(\''+p.id+'\')">➤ '+t('goRoute')+'</button><button class="btn-outline" onclick="toggleFav(\''+p.id+'\',this)">'+t('favorite')+'</button><button class="btn-outline" onclick="shareParking(\''+p.id+'\')">'+t('share')+'</button><button class="btn-report" onclick="openReport(\''+p.id+'\')">'+t('report')+'</button></div></div>');
}
