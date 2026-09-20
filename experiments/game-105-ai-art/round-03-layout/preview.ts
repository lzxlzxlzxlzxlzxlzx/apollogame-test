import {mount} from '../../../games/game-105/game-105';
import config from './theme-round-03.json';
const baseFetch=fetch.bind(window);
window.fetch=async(input,init)=>{
 const response=await baseFetch(input,init);
 if(new URL(input instanceof Request?input.url:String(input),location.href).pathname!='/games/game-105/art/index.json')return response;
 const copy=await response.clone().json();
 copy.assets.find(a=>a.id==='game-105/ui/card-frame').path=config.asset.path;
 return new Response(JSON.stringify(copy),{status:response.status,headers:{'Content-Type':'application/json'}});
};
mount(document.getElementById('game')!,{seed:105});
