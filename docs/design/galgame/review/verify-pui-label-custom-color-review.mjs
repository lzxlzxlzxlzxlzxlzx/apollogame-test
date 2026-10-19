// Independent in-memory sabotage. Production files remain untouched.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../../../..');
const catalogPath = resolve(root, 'src/ui/components/catalog.ts');
const validatePath = resolve(root, 'src/ui/components/validate.ts');
const catalog = readFileSync(catalogPath, 'utf8');
const validate = readFileSync(validatePath, 'utf8');
const catalogAnchor = "{ name: 'color', type: 'enum-or-custom-color', values: COLOR";
const validationAnchor = 'safeColor(raw) === raw';
for (const [name, source, anchor] of [
  ['catalog', catalog, catalogAnchor],
  ['validate', validate, validationAnchor],
]) {
  const hits = source.split(anchor).length - 1;
  if (hits !== 1) throw new Error(`${name} anchor hits=${hits}, expected 1`);
}

async function load(mode) {
  const result = await build({
    stdin: {
      contents: 'export { validateLayoutNode } from "./src/ui/components/validate.ts"; export { renderNode } from "./src/ui/components/render.ts";',
      resolveDir: root,
      sourcefile: 'label-custom-color-review-entry.ts',
      loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{
      name: 'in-memory-sabotage',
      setup(pluginBuild) {
        pluginBuild.onLoad({ filter: /[\\/]src[\\/]ui[\\/]components[\\/]catalog\.ts$/ }, () => ({
          contents: mode === 'catalog' ? catalog.replace(catalogAnchor, "{ name: 'color', type: 'enum', values: COLOR") : catalog,
          loader: 'ts',
        }));
        pluginBuild.onLoad({ filter: /[\\/]src[\\/]ui[\\/]components[\\/]validate\.ts$/ }, () => ({
          contents: mode === 'validation' ? validate.replace(validationAnchor, 'true') : validate,
          loader: 'ts',
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const good = await load('good');
const badCatalog = await load('catalog');
const badValidation = await load('validation');
const safe = { type: 'Label', id: 'safe', props: { text: '亮字', color: { custom: '#F4EEFF' } } };
const injected = { type: 'Label', id: 'injected', props: { text: 'x', color: { custom: '#fff;color:red' } } };
const token = { type: 'Label', id: 'token', props: { text: '令牌', color: 'gold' } };
const naked = { type: 'Label', id: 'naked', props: { text: '裸色', color: '#F4EEFF' } };
const has = (api, node, kind) => api.validateLayoutNode(node).some((issue) => issue.kind === kind);
if (good.validateLayoutNode(safe).length || !good.renderNode(safe).includes('color:#F4EEFF')) throw new Error('safe baseline failed');
if (!has(badCatalog, safe, 'bad-enum')) throw new Error('catalog sabotage stayed green');
if (!has(good, injected, 'bad-custom-color') || has(badValidation, injected, 'bad-custom-color')) throw new Error('validation sabotage stayed green');
if (good.validateLayoutNode(token).length || !has(good, naked, 'bad-enum')) throw new Error('token/naked boundary failed');
console.log('ANCHOR_HITS=1+1 SABOTAGE_RED=2 BASELINE_SAFE=1 TOKEN_CLOSED=1');
