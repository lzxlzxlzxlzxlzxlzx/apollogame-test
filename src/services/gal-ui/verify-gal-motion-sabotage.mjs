import { readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { join } from 'node:path';
const root=process.cwd(), dir=join(root,'src/services/gal-ui'), tmp=join(dir,`gal-ui-slice-host.motion-sabotage-${randomUUID()}.ts`);
try { const source=await readFile(join(dir,'gal-ui-slice-host.ts'),'utf8'); const bad=source.replaceAll('{ reducedMotion: this.profile.preferences.reducedMotion }','{}'); if(bad===source) throw Error('anchor missing'); await writeFile(tmp,bad); await build({entryPoints:[tmp],bundle:true,platform:'node',outfile:`${tmp}.js`,tsconfig:join(root,'tsconfig.json')}); console.log('sabotage fixture compiled'); } finally { await rm(tmp,{force:true}); await rm(`${tmp}.js`,{force:true}); }
