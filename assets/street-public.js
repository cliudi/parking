function streetSegment(p){return streetSegments.find(s=>String(s.parking_id)===String(p.id))}
function streetBrandArtwork(){
  const label=({ru:'Условный знак уличной парковки — не фото знака на месте',en:'Street parking illustration — not an on-site sign photo',uz:'Ko‘cha avtoturargohi tasviri — joydagi belgining fotosurati emas'})[lang];
  return '<div class="street-brand-art" aria-hidden="true"><img src="assets/street-brand/section.png" alt="" width="2172" height="724"></div><details class="street-brand-help"><summary>'+escapeHtml(label||'Street parking illustration')+'</summary><img src="assets/street-brand/sign.png" alt="'+escapeHtml(label||'Street parking illustration')+'" width="1280" height="1280" loading="lazy"></details>';
}
function streetLegacyPoint(p){return p.category==='STREET_ALLOWED'&&streetSegment(p)?.details?.legacy_point===true}
function streetVisible(p){return p.category!=='STREET_ALLOWED'||(streetSegmentIds.has(String(p.id))&&(streetLegacyPoint(p)||(!!streetSegment(p)&&['free','paid'].includes(p.price_type))))}
function streetObjectFilterHtml(){
  const labels=({ru:['Тип объекта','Все объекты','Обычные парковки','Уличные участки'],en:['Object type','All objects','Parking lots','Street sections'],uz:['Obyekt turi','Barcha obyektlar','Avtoturargohlar','Ko‘cha uchastkalari']})[lang]||['Тип объекта','Все объекты','Обычные парковки','Уличные участки'];
  return '<div class="filt-group"><h3>'+labels[0]+'</h3>'+['','point','street'].map((value,i)=>'<button class="btn-outline" style="margin-bottom:8px" aria-pressed="'+String((advFilters.objectKind||'')===value)+'" onclick="setStreetObjectFilter(\''+value+'\')">'+((advFilters.objectKind||'')===value?'✓ ':'')+labels[i+1]+'</button>').join('')+'</div>';
}
function setStreetObjectFilter(value){if(['','point','street'].includes(value)){advFilters.objectKind=value;openFilters()}}
function streetDestination(p){
  if(p.category!=='STREET_ALLOWED')return p;
  if(streetLegacyPoint(p))return p;
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
function streetIcon(name){
  const paths={side:'<path d="M8 3v18M16 3v18M12 4v3m0 4v2m0 4v3M3 9l3 3-3 3m18-6-3 3 3 3"/>',car:'<path d="m5 9 2-5h10l2 5M4 10h16v8H4zM6 18v2m12-2v2M7 13h1m8 0h1"/>',length:'<path d="M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',back:'<path d="m14 6-6 6 6 6"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',route:'<path d="m4 4 16 8-8 2-2 7z"/>',heart:'<path d="M12 20 4 12C-2 4 8 0 12 7c4-7 14-3 8 5z"/>',share:'<path d="M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8"/>'};
  return '<svg class="street-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.info)+'</svg>';
}
function streetOrientationGraphic(orientation){
  if(!['parallel','perpendicular','angled'].includes(orientation))return '';
  const angle=orientation==='parallel'?90:orientation==='angled'?-40:0;
  const car='<rect x="-9" y="-20" width="18" height="40" rx="6" fill="#fff" stroke="#184e84" stroke-width="1.5"/><path d="M-6-10h12v6H-6zM-6 9H6v5H-6z" fill="#bcdafa"/><path d="M-9-10v20m18-20v20" stroke="#1677ff" stroke-width="2"/>';
  return '<svg class="street-orientation" viewBox="0 0 112 66" role="img" aria-label="'+escapeHtml(streetCopy()[orientation])+'"><rect x="1" y="1" width="110" height="64" rx="10" fill="#eef3f8"/><path d="M5 55h102" stroke="#fff" stroke-width="3" stroke-dasharray="9 6"/><path d="M5 9h102" stroke="#c8d3df" stroke-width="4"/><g transform="translate(56 32) rotate('+angle+')">'+car+'</g></svg>';
}
function streetPointIcon(p,selected){
  const color=p.closed?'#dc3545':p.price_type==='unknown'?'#8995a6':p.category==='EV_STATION'?'#b7790b':'#2478e9';
  const badge=p.has_free_period?'<circle cx="38" cy="12" r="8" fill="#fff" stroke="#2478e9"/><path d="M38 7v5l3 2" fill="none" stroke="#123765" stroke-width="1.7"/>':p.has_barrier?'<rect x="31" y="7" width="14" height="11" rx="3" fill="#fff"/><path d="M34 7V5a4 4 0 0 1 8 0v2" fill="none" stroke="#123765" stroke-width="2"/>':p.ev?'<circle cx="38" cy="12" r="8" fill="#ffe078"/><path d="m39 6-5 7h4l-1 5 5-7h-4z" fill="#755300"/>':'';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="28" r="22" fill="#123765" opacity=".14"/><circle cx="26" cy="25" r="'+(selected?'23':'21')+'" fill="'+color+'" stroke="white" stroke-width="3"/><path d="M20 37V13h9a8 8 0 0 1 0 16h-5v8zm4-20v8h5a4 4 0 0 0 0-8z" fill="white"/>'+badge+'</svg>';
  return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
}
function streetInfoHtml(p,withPhotos=false){
  if(p.category!=='STREET_ALLOWED')return '';
  const s=streetSegment(p),c=streetCopy();if(!s)return '<p>'+escapeHtml(c.missing)+'</p>';
  if(streetLegacyPoint(p)){const notice=({ru:'Ранее опубликованная парковка. Границы участка и способ постановки ещё не уточнены. Проверьте дорожные знаки и разметку на месте.',en:'Previously published parking. Section boundaries and parking orientation have not been confirmed. Check signs and road markings on site.',uz:'Avval e’lon qilingan avtoturargoh. Uchastka chegaralari va to‘xtash usuli hali aniqlanmagan. Joydagi belgilar va chiziqlarni tekshiring.'})[lang];return '<div class="street-notice">'+streetIcon('info')+'<p>'+escapeHtml(notice||c.missing)+'</p></div>'}
  const d=s.details||{},side=({ru:{right:'Правая сторона улицы',left:'Левая сторона улицы',both:'Обе стороны улицы'}})[lang]?.[d.parking_side]||c[d.parking_side]||c.unspecified;
  const rows=[['side',side],['car',c[d.parking_orientation]||c.unspecified],['length',c.length+': ≈ '+Math.round(s.length_m||ParkyStreetGeometry.length(s.path))+' '+t('unitM')]];
  let html='<section class="street-details"><div class="street-facts">'+rows.map(([icon,text])=>'<div class="street-fact">'+streetIcon(icon)+'<span>'+escapeHtml(text)+'</span></div>').join('')+'</div>';
  if(d.street_days||(p.hours&&p.hours!=='—')||p.is247)html+='<div class="street-schedule">'+streetIcon('clock')+'<span>'+escapeHtml([d.street_days,p.is247?t('open247'):p.hours==='—'?'':p.hours].filter(Boolean).join(' · '))+'</span></div>';
  const graphic=streetOrientationGraphic(d.parking_orientation);
  if(graphic)html+='<div class="street-method">'+graphic+'<span>'+escapeHtml(c[d.parking_orientation])+'</span></div>';
  if(withPhotos){
    const photos=(s.photos||[]).map((photo,index)=>({...photo,index,url:safePhotoUrl(photo.url)})).filter(photo=>photo.url);
    const signs=photos.filter(photo=>['parking_sign','orientation'].includes(photo.type));
    const others=photos.filter(photo=>!['parking_sign','orientation'].includes(photo.type));
    const photoHtml=photo=>'<button type="button" class="street-photo" onclick="openStreetPhoto(\''+p.id+'\','+photo.index+')" aria-label="'+escapeHtml(photo.caption||c.how)+'"><img loading="lazy" src="'+escapeHtml(photo.url)+'" alt="'+escapeHtml(photo.caption||c.how)+'"></button>';
    if(signs.length)html+='<div class="street-sign-block"><h3>'+escapeHtml(c.how)+'</h3>'+signs.map(photoHtml).join('')+'</div>';
    if(others.length)html+='<div class="street-photo-grid">'+others.map(photoHtml).join('')+'</div>';
  }
  if(d.street_restrictions)html+='<div class="street-extra"><h3>'+escapeHtml(c.restrictions)+'</h3><p>'+escapeHtml(d.street_restrictions)+'</p></div>';
  if(d.street_notes)html+='<div class="street-extra"><h3>'+escapeHtml(c.notes)+'</h3><p>'+escapeHtml(d.street_notes)+'</p></div>';
  return html+'<div class="street-notice">'+streetIcon('info')+'<p>'+escapeHtml(c.notice)+'</p></div><p class="street-direction-note">'+escapeHtml(c.direction)+'</p></section>';
}
function openStreetPhoto(id,index){
  const s=streetSegments.find(s=>String(s.parking_id)===String(id)),photo=s?.photos?.[index],url=safePhotoUrl(photo?.url);if(!url)return;
  const dialog=document.createElement('dialog');dialog.className='street-photo-dialog';
  const button=document.createElement('button');button.textContent='×';button.setAttribute('aria-label',t('close'));
  const img=document.createElement('img');img.src=url;img.alt=photo.caption||streetCopy().how;
  button.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
  dialog.append(button,img);document.body.append(dialog);dialog.showModal();
}
async function toggleStreetFavorite(id,button){
  button.disabled=true;
  try{await toggleFav(id);button.setAttribute('aria-pressed',String(favorites.includes(id)))}finally{button.disabled=false}
}
function openStreetCard(p){
  openSheet('<div class="street-card"><div class="grabber"><i></i></div><div class="street-toolbar"><button class="street-round" aria-label="'+t('close')+'" onclick="closeSheet()">'+streetIcon('back')+'</button><span>Parky</span><details class="street-menu"><summary class="street-round" aria-label="'+t('showDetails')+'">'+streetIcon('more')+'</summary><div><button onclick="shareParking(\''+p.id+'\')">'+t('share')+'</button><button onclick="openReport(\''+p.id+'\')">'+t('report')+'</button></div></details></div><div class="street-card-body">'+streetBrandArtwork()+'<header><h2>'+escapeHtml(p.name)+'</h2><p class="street-subtitle">'+escapeHtml(streetCopy().title)+'</p><span class="street-price '+(p.price_type==='free'?'is-free':'is-paid')+'">'+escapeHtml(priceLabel(p))+'</span></header>'+(p.price_day&&p.price_text?'<p>'+escapeHtml(p.price_day)+'</p>':'')+(p.price_note?'<p>'+escapeHtml(p.price_note)+'</p>':'')+streetInfoHtml(p,true)+parkingTermsHtml(p)+'<div class="street-actions"><button class="street-route" onclick="closeSheet();routeTo(\''+p.id+'\')">'+streetIcon('route')+t('goRoute')+'</button><button class="street-round" aria-label="'+t('favorite')+'" aria-pressed="'+String(favorites.includes(p.id))+'" onclick="toggleStreetFavorite(\''+p.id+'\',this)">'+streetIcon('heart')+'</button></div></div></div>');
}
