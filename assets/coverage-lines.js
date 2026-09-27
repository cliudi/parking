/* Display-only chains. Never modify saved paths or bridge unverified gaps. */
(function(root){
  function chains(rows){
    const groups=new Map();
    for(const row of rows){
      if(!['parking_added','no_parking'].includes(row.status)||!row.checked_on||!Array.isArray(row.path)||row.path.length<2)continue;
      if(!groups.has(row.status))groups.set(row.status,[]);
      groups.get(row.status).push(row);
    }
    const result=[];
    for(const [status,items] of groups){
      const nodes=new Map(),edges=[],unique=new Map(),key=p=>JSON.stringify(p);
      for(const row of items){
        const path=row.path.map(p=>p.slice()),forward=JSON.stringify(path),reverse=JSON.stringify([...path].reverse());
        const signature=forward<reverse?forward:reverse;
        if(unique.has(signature)){unique.get(signature).ids.push(row.id);continue}
        const edge={path,ids:[row.id],a:key(path[0]),b:key(path[path.length-1]),used:false};
        unique.set(signature,edge);edges.push(edge);
        for(const end of [edge.a,edge.b]){if(!nodes.has(end))nodes.set(end,[]);nodes.get(end).push(edge)}
      }
      function walk(first,start){
        let edge=first,node=start,path=[],ids=[];
        while(edge&&!edge.used){
          edge.used=true;const next=edge.a===node?edge.path:[...edge.path].reverse();
          path.push(...(path.length?next.slice(1):next));ids.push(...edge.ids);
          node=edge.a===node?edge.b:edge.a;
          const connected=nodes.get(node);
          // Stop at intersections. No guessed connection between branches.
          edge=connected.length===2?connected.find(e=>!e.used):null;
        }
        result.push({status,path,ids});
      }
      for(const edge of edges){if(!edge.used&&(nodes.get(edge.a).length!==2||nodes.get(edge.b).length!==2))walk(edge,nodes.get(edge.a).length!==2?edge.a:edge.b)}
      for(const edge of edges)if(!edge.used)walk(edge,edge.a);
    }
    return result;
  }
  const api={chains};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ParkyCoverageLines=api;
})(typeof window==='undefined'?globalThis:window);
