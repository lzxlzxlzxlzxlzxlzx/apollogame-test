import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolve, trace, files } from './export-game.mjs';

const names = ['life-game-host', 'life-save', 'life-presenter', 'life-interaction', 'life-hud', 'life-hud-overlay'];
const prefixes = ['@engine/host/', '@zerocraft/engine/engine/host/'];

test('legacy Life Host aliases resolve into exported assembly closure and scaffolding', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'zc-life-export-'));
  try {
    const entry = path.join(scratch, 'compat-entry.ts');
    const specs = prefixes.flatMap((prefix) => names.map((name) => `${prefix}${name}.js`));
    await fs.writeFile(entry, specs.map((spec) => `import '${spec}';`).join('\n'));
    for (const spec of specs) {
      assert.equal(await resolve(spec, entry), path.join(process.cwd(), 'src', 'assembly', 'life-host', `${spec.split('/').at(-1).slice(0, -3)}.ts`));
    }
    const { closure } = await trace(entry);
    for (const name of names) {
      assert.ok(closure.has(path.join(process.cwd(), 'src', 'assembly', 'life-host', `${name}.ts`)), `${name} missing from export closure`);
    }
    const paths = JSON.parse(files['tsconfig.json']()).compilerOptions.paths;
    const vite = files['vite.config.ts']();
    for (const spec of specs) {
      const name = spec.split('/').at(-1).slice(0, -3);
      assert.deepEqual(paths[spec], [`./src/game/assembly/life-host/${name}.ts`]);
      assert.match(vite, new RegExp(`'${spec.replaceAll('.', '\\.')}'\\s*:\\s*resolve\\(__dirname, 'src/game/assembly/life-host/${name}\\.ts'\\)`));
    }
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
});
