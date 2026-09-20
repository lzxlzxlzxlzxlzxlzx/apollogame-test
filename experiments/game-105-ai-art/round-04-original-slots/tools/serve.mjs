import {createServer} from 'vite';
import {resolve} from 'node:path';
import {engineAliases} from '../../../../scripts/engine-aliases.mjs';
const root=process.cwd(),base='experiments/game-105-ai-art/round-04-original-slots';
const server=await createServer({configFile:false,root,publicDir:resolve(root,'public'),cacheDir:resolve(root,base,'cache'),optimizeDeps:{entries:[`${base}/index.html`]},resolve:{alias:engineAliases(root)},server:{host:'127.0.0.1',port:5197,strictPort:true,watch:null}});
await server.listen();console.log(`http://127.0.0.1:5197/${base}/index.html`);
