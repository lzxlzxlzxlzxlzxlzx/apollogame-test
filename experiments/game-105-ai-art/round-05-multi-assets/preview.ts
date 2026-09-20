import {mount} from '../../../games/game-105/game-105';
const params=new URLSearchParams(location.search);
if(params.has('inspect'))await import('./inspect');
const baseline='/games/game-105/art/scene/night-room.jpeg';
mount(document.getElementById('game')!,{seed:105});
async function ready(){
 let scene:HTMLElement|null=null;
 for(let i=0;i<1800;i++){scene=[...document.querySelectorAll<HTMLElement>('#game div')].find(e=>e.style.backgroundImage.includes(baseline))||null;if(scene)break;await new Promise(requestAnimationFrame);}
 if(!scene)throw new Error('Original scene background did not load');
 const originalStyle=scene.style.cssText;let serial=0;
 const lab={selected:'baseline',ready:true,baseline,async set(name:string){
  if(!['baseline','A','B','C'].includes(name))throw new Error('Unknown background');
  const ticket=++serial;const path=name==='baseline'?baseline:`/experiments/game-105-ai-art/round-05-multi-assets/background/derived/${name}.png`;
  const img=new Image();img.src=path;await img.decode();if(ticket!==serial)return;
  scene!.style.backgroundImage=`url("${path}")`;lab.selected=name;
  console.info('[background-pilot] image-only switch',name);
 },getScene(){const r=scene!.getBoundingClientRect(),s=getComputedStyle(scene!);return{rect:{x:r.x,y:r.y,width:r.width,height:r.height},image:s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,repeat:s.backgroundRepeat,transform:s.transform,originalStyle,currentStyle:scene!.style.cssText}}};
 (window as any).__bgLab=lab;
 if(params.has('candidate'))await lab.set(params.get('candidate')!);
}
void ready();
