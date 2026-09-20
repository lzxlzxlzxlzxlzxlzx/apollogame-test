import {mount} from '../../../games/game-105/game-105';
if(new URLSearchParams(location.search).has('inspect'))await import('./inspect');
const candidate=new URLSearchParams(location.search).get('candidate');
if(candidate && /^[ABCD]$/.test(candidate)){
 const original=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
  const response=await original(input,init);
  if(new URL(input instanceof Request?input.url:String(input),location.href).pathname!='/games/game-105/art/index.json')return response;
  const copy=await response.clone().json();
  copy.assets.find(a=>a.id==='game-105/ui/card-frame').path=`/experiments/game-105-ai-art/round-04-original-slots/derived/${candidate}.png`;
  return new Response(JSON.stringify(copy),{status:response.status,headers:{'Content-Type':'application/json'}});
 };
}
mount(document.getElementById('game')!,{seed:105});
