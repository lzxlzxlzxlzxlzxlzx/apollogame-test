// Development-only, page-scoped override. No writes to the formal index or game.
import { mount } from '../../../games/game-105/game-105';
const query = new URLSearchParams(location.search);
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
 const response = await nativeFetch(input, init);
 const url = new URL(input instanceof Request ? input.url : String(input), location.href);
 if (url.pathname !== '/games/game-105/art/index.json' || query.has('baseline')) return response;
 const index = await response.clone().json();
 const slot = index.assets.find((a: {id:string}) => a.id === 'game-105/ui/card-frame');
 if (!slot) throw new Error('Expected card-frame slot missing');
 slot.path = '/experiments/game-105-ai-art/normalized/card-frame/round-02/candidate-01-resized.png';
 console.info('[pilot] decision: page-local card-frame override');
 return new Response(JSON.stringify(index), {status:200,headers:{'Content-Type':'application/json'}});
};
// Optional, explicitly separate preview-only ink proposal for the cream background.
if (query.has('ink')) await import('./ink-proposal.css');
mount(document.getElementById('game')!, {seed:105});
