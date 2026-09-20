// Opt-in read-only render observation. No world, geometry, camera, material or layout writes.
import {ThreeRenderer} from '@zerocraft/engine/renderer/three-renderer.js';
import {Box3,Vector3,Matrix4} from 'three';
const original=ThreeRenderer.prototype.sync;
ThreeRenderer.prototype.sync=function(world){original.call(this,world);(window as any).__observedRenderer=this;};
(window as any).__measureMaterials=()=>{
 const r=(window as any).__observedRenderer,canvas=document.querySelector('canvas')!,cr=canvas.getBoundingClientRect(),rows:any[]=[];
 r.scene.traverse((mesh:any)=>{
  if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
  const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];const mat=mats.find(m=>m.normalMap||m.map);if(!mat)return;
  const kind=mat.normalMap?'game-105/block/wood-grain':'game-105/table/oak';
  const bounds=new Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){
   const m=new Matrix4();if(mesh.isInstancedMesh){mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld);}else m.copy(mesh.matrixWorld);
   const points=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new Vector3(x,y,z).applyMatrix4(m).project(r.cameras.current);points.push([cr.x+(p.x+1)*cr.width/2,cr.y+(1-p.y)*cr.height/2]);}
   const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1])),right=Math.max(...points.map(p=>p[0])),bottom=Math.max(...points.map(p=>p[1]));
   rows.push({skinKey:kind,rect:{x,y,width:right-x,height:bottom-y},clipToCanvas:{x:Math.max(x,cr.x),y:Math.max(y,cr.y),right:Math.min(right,cr.right),bottom:Math.min(bottom,cr.bottom)},textureColorSpace:(mat.normalMap||mat.map).colorSpace,repeat:(mat.normalMap||mat.map).repeat.toArray(),method:'current render mesh/instance eight-corner projected bounding box; includes occluded faces, not visible-pixel segmentation'});
  }
 });return rows;
};
