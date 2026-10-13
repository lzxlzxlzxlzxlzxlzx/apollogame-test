import { mountUI } from '../../src/ui/components/index.js';
import { daylight } from '../../games/game-i/themes.js';
mountUI(document.getElementById('root')!, { type:'Modal', id:'s3-light-default', props:{title:'浅底标题',closable:false}, children:[{type:'Label',id:'s3-light-copy',props:{text:'浅底正文。',color:'text'}}] }, {}, daylight);
