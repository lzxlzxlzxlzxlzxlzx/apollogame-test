import {createServer} from 'vite';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {engineAliases} from '../../../../scripts/engine-aliases.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const prefix='/experiments/game-105-ai-art/round-03-layout';
const server=await createServer({configFile:false,root,publicDir:resolve(root,'public'),cacheDir:resolve(root,'.'+prefix+'/cache').replace('/./','/'),
 optimizeDeps:{entries:['experiments/game-105-ai-art/round-03-layout/index.html']},resolve:{alias:engineAliases(root)},
 plugins:[{name:'isolated-game105-ui-adapter',enforce:'pre',transform(code,id){
  if(!id.replaceAll('\\','/').endsWith('/games/game-105/game-105.ts'))return null;
  const anchor="from '@zerocraft/engine/ui/components/index.js'";
  if(!code.includes(anchor))throw new Error('UI import anchor missing; abort');
  return {code:code.replace(anchor,`from '${prefix}/ui-adapter.ts'`),map:null};
 }}],server:{host:'127.0.0.1',port:5196,strictPort:true,watch:null}});
await server.listen();console.info(`Experimental UI adapter only, no source writes: http://127.0.0.1:5196${prefix}/index.html?layout=C&theme=plum`);
