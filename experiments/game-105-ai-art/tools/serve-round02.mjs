import {createServer} from 'vite';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {engineAliases} from '../../../scripts/engine-aliases.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const server=await createServer({configFile:false,root,publicDir:resolve(root,'public'),cacheDir:resolve(root,'experiments/game-105-ai-art/runtime-preview/.vite'),optimizeDeps:{entries:['experiments/game-105-ai-art/runtime-preview/index.html']},resolve:{alias:engineAliases(root)},server:{host:'127.0.0.1',port:5195,strictPort:true,watch:null}});
await server.listen();console.info('Isolated preview: http://127.0.0.1:5195/experiments/game-105-ai-art/runtime-preview/index.html');
