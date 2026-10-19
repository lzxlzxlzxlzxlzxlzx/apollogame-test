import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'gal-03e-structure-'));
try {
  const output = join(temporary, 'check.mjs');
  await build({ entryPoints: [join(root, 'src/services/gal-ui/gal-ui-03e-check.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'es2022',
    tsconfig: join(root, 'tsconfig.json'), outfile: output, logLevel: 'error' });
  await import(pathToFileURL(output).href);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
