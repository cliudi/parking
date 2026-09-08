/* Coordinates throughout Parky are [latitude, longitude], not GeoJSON order. */
(function(root){
  'use strict';
  const R=6371008.8,rad=Math.PI/180;
  function point(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180}
  function distance(a,b){const x=Math.sin((b[0]-a[0])*rad/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin((b[1]-a[1])*rad/2)**2;return 2*R*Math.asin(Math.sqrt(Math.min(1,x)))}
  function length(path){return path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0)}
  function valid(path){return Array.isArray(path)&&path.length>=2&&path.length<=200&&path.every(point)&&path.slice(1).every((p,i)=>distance(path[i],p)>.1&&Math.abs(p[1]-path[i][1])<180)&&length(path)<=50000}
  function nearest(path,origin){
    if(!valid(path))return null;
    if(!point(origin))return {lat:path[0][0],lng:path[0][1]};
    let best=null,bestDistance=Infinity;
    path.slice(1).forEach((b,i)=>{
      const a=path[i],scale=Math.max(.000001,Math.cos((a[0]+b[0])/2*rad));
      const dx=(b[1]-a[1])*scale,dy=b[0]-a[0];
      const t=Math.max(0,Math.min(1,((origin[1]-a[1])*scale*dx+(origin[0]-a[0])*dy)/(dx*dx+dy*dy)));
      const p=[a[0]+dy*t,a[1]+(b[1]-a[1])*t],d=distance(origin,p);
      if(d<bestDistance){bestDistance=d;best={lat:p[0],lng:p[1]}}
    });
    return best;
  }
  function intersects(path,bounds){
    if(!Array.isArray(path)||!path.length||!path.every(point))return false;
    const lat=path.map(p=>p[0]),lng=path.map(p=>p[1]);
    return Math.max(...lat)>=bounds[0][0]&&Math.min(...lat)<=bounds[1][0]&&Math.max(...lng)>=bounds[0][1]&&Math.min(...lng)<=bounds[1][1];
  }
  const api={point,distance,length,valid,nearest,intersects};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ParkyStreetGeometry=api;
})(typeof window==='undefined'?globalThis:window);
