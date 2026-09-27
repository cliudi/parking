/* Fit bottom cards between the real header and navigation, including Telegram's
   changing viewport. Long cards scroll instead of disappearing behind search. */
(()=>{
  const card=document.getElementById('minicard');
  const header=document.querySelector('.topwrap');
  const nav=document.getElementById('bottomnav');
  const map=document.getElementById('screen-map');
  if(!card||!header||!nav||!map)return;
  let frame=0;
  function measure(){
    frame=0;
    if(!card.classList.contains('on'))return;
    const top=header.getBoundingClientRect().bottom+10;
    const bottom=nav.getBoundingClientRect().top-10;
    card.style.bottom=Math.max(0,window.innerHeight-bottom)+'px';
    card.style.maxHeight=Math.max(0,bottom-top)+'px';
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure)};
  const resize=new ResizeObserver(schedule);
  for(const node of [header,nav,map])resize.observe(node);
  new MutationObserver(()=>{
    document.documentElement.classList.toggle('map-card-open',card.classList.contains('on'));
    schedule();
  }).observe(card,{attributes:true,attributeFilter:['class'],childList:true});
  window.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  // Telegram can change safe-area offsets without changing element dimensions.
  new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['style']});
  schedule();
})();
