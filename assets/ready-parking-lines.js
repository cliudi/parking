/* Admin-only visual inference, not surveyed road geometry or permission to park. */
(function(root){
  const geo=typeof module==='object'&&module.exports?require('./street-geometry'):root.ParkyStreetGeometry;
  const MAX_GAP=250,DUPLICATE_DISTANCE=12;
  function streetKey(address){
    const text=String(address||'').normalize('NFKC').toLowerCase().replace(/[’‘ʻʼ`]/g,"'").replace(/ё/g,'е');
    const type=/(?:улица|(?:^|\s)ул\.?\s|проспект|просп\.|шоссе|проезд|переулок|бульвар|набережная|дорога|ko'chasi|kocha|кўчаси|кучаси|street|avenue)/;
    const parts=text.split(/[,;\n]/).filter(p=>type.test(p));
    if(parts.length!==1)return '';
    const key=parts[0].replace(/(?:^|\s)ул\.?\s/g,' улица ').replace(/просп\./g,'проспект')
      .replace(/\s+(?:дом\s*|д\.\s*)?\d+[а-яa-z]?(?:[\/-]\d+[а-яa-z]?)?\s*$/,'')
      .replace(/[.]/g,'').replace(/\s+/g,' ').trim();
    return key.replace(type,'').trim()?key:'';
  }
  function chains(records,coverage=[]){
    const groups=new Map(),unlocatedDrafts=[];
    for(const p of records){
      if(!['APPROVED','DRAFT','PENDING'].includes(p.status)||p.category==='STREET_ALLOWED'||p.lat==null||p.lng==null||p.lat===''||p.lng==='')continue;
      const point=[Number(p.lat),Number(p.lng)],street=streetKey(p.address);
      if(!geo.point(point))continue;
      if(!street){if(p.status!=='APPROVED')unlocatedDrafts.push(point);continue}
      if(!groups.has(street))groups.set(street,[]);
      groups.get(street).push({point,id:String(p.id),done:p.status==='APPROVED'});
    }
    // Explicit coverage, including "not done", always takes priority over inference.
    const manual=coverage.filter(r=>geo.valid(r.path));
    const covered=(a,b)=>{
      const steps=Math.ceil(geo.distance(a,b)/25);
      for(let i=0;i<=steps;i++){
        const t=steps?i/steps:0,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
        if(manual.some(r=>{const n=geo.nearest(r.path,p);return n&&geo.distance(p,[n.lat,n.lng])<=25}))return true;
      }
      return false;
    };
    const result=[];
    for(const [street,items] of groups){
      items.sort((a,b)=>a.point[0]-b.point[0]||a.point[1]-b.point[1]||a.id.localeCompare(b.id));
      const nodes=[];
      for(const item of items){
        const duplicate=nodes.find(n=>geo.distance(n.point,item.point)<DUPLICATE_DISTANCE);
        if(duplicate){duplicate.ids.push(item.id);duplicate.done=duplicate.done&&item.done}
        else nodes.push({...item,ids:[item.id],edges:[]});
      }
      if(nodes.filter(n=>n.done).length<3)continue;
      const edges=[];
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
        const distance=geo.distance(nodes[i].point,nodes[j].point);
        if(distance<=MAX_GAP)edges.push({a:i,b:j,distance});
      }
      edges.sort((a,b)=>a.distance-b.distance||a.a-b.a||a.b-b.b);
      const parent=nodes.map((_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i};
      // Minimum local tree includes unfinished points, so they break ready sequences.
      for(const edge of edges){const a=find(edge.a),b=find(edge.b);if(a===b)continue;parent[a]=b;nodes[edge.a].edges.push(edge);nodes[edge.b].edges.push(edge)}
      const other=(e,i)=>e.a===i?e.b:e.a;
      const pass=i=>{
        const n=nodes[i];if(!n.done||n.edges.length!==2)return false;
        const [a,b]=n.edges.map(e=>nodes[other(e,i)].point),scale=Math.cos(n.point[0]*Math.PI/180);
        const u=[(a[0]-n.point[0]),(a[1]-n.point[1])*scale],v=[(b[0]-n.point[0]),(b[1]-n.point[1])*scale];
        return (u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v))<=-.5;
      };
      for(const edge of edges){
        const a=nodes[edge.a].point,b=nodes[edge.b].point;
        if(!nodes[edge.a].edges.includes(edge)||!nodes[edge.a].done||!nodes[edge.b].done||covered(a,b)||unlocatedDrafts.some(p=>{const n=geo.nearest([a,b],p);return n&&geo.distance(p,[n.lat,n.lng])<=20}))edge.blocked=true;
      }
      const used=new Set();
      function walk(start,edge){
        const indices=[start];let i=start;
        while(edge&&!edge.blocked&&!used.has(edge)){
          used.add(edge);i=other(edge,i);indices.push(i);
          if(!pass(i))break;
          edge=nodes[i].edges.find(e=>!used.has(e));
        }
        if(indices.length>=3)result.push({street,path:indices.map(i=>nodes[i].point),ids:indices.flatMap(i=>nodes[i].ids),pointCount:indices.length});
      }
      for(let i=0;i<nodes.length;i++)if(!pass(i)||nodes[i].edges.some(e=>e.blocked))for(const edge of nodes[i].edges)if(!used.has(edge)&&!edge.blocked)walk(i,edge);
    }
    return result;
  }
  const api={chains,streetKey,MAX_GAP};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ParkyReadyParkingLines=api;
})(typeof window==='undefined'?globalThis:window);
