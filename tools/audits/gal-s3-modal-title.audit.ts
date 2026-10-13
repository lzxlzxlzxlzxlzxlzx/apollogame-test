import { mountUI } from '../../src/ui/components/index.js';
import { daylight } from '../../games/game-i/themes.js';
const skin = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMjY0MDcwIi8+PC9zdmc+';
mountUI(document.getElementById('root')!, { type:'Modal', id:'s3-dark-art', props:{title:'深皮标题',titleColor:{custom:'#F4EEFF'},skin,closable:false}, children:[{type:'Label',id:'s3-dark-copy',props:{text:'深皮正文。',color:{custom:'#F4EEFF'}}}] }, {}, daylight);
