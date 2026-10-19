// Independent in-memory sabotage. This script never edits the shared PUI tree.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../../../..');
const renderPath = resolve(root, 'src/ui/components/render.ts');
const original = readFileSync(renderPath, 'utf8');
const anchor = "const labelColorStyle = p.labelColor === undefined ? '' : `;color:${resolveLabelColor(p.labelColor, t, t.sub)}`;";
const hits = original.split(anchor).length - 1;
if (hits !== 1) throw new Error(`Expected one labelColorStyle anchor, found ${hits}`);

async function load(sabotage) {
  const output = await build({
    stdin: {
      contents: 'export { renderNode } from "./src/ui/components/render.ts"; export { validateLayoutNode } from "./src/ui/components/validate.ts";',
      resolveDir: root, sourcefile: 'pui-s4-lead-review-entry.ts', loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{
      name: 's4-sabotage-in-memory',
      setup(pluginBuild) {
        pluginBuild.onLoad({ filter: /[\\/]src[\\/]ui[\\/]components[\\/]render\.ts$/ }, () => ({
          contents: sabotage ? original.replace(anchor, "const labelColorStyle = ''; // sabotage") : original,
          loader: 'ts',
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}

const good = await load(false);
const bad = await load(true);
const custom = { type: 'Button', id: 'ghost', props: { label: '自动', kind: 'ghost', skin: '', labelColor: { custom: '#E8E8F4' }, action: 'story.auto' } };
const token = { type: 'Button', id: 'token', props: { label: '返回', kind: 'quiet', labelColor: 'gold', action: 'back' } };
for (const node of [custom, token]) {
  if (good.validateLayoutNode(node).length) throw new Error(`${node.id}: valid data rejected`);
  if (good.renderNode(node) === bad.renderNode(node)) throw new Error(`${node.id}: sabotage stayed green`);
}
const ghostHtml = good.renderNode(custom);
if (!ghostHtml.includes('color:#E8E8F4') || !ghostHtml.includes('data-action="story.auto"') || !ghostHtml.includes('data-apollo-btn') || ghostHtml.includes('data-apollo-skin')) throw new Error('Ghost color/native action/skin-off contract failed');
if (!good.renderNode(token).includes('color:#d4bd8a')) throw new Error('Token color missing');

const legacy = [
  { type: 'Button', id: 'plain', props: { label: '普通', kind: 'ghost' } },
  { type: 'Button', id: 'skinned', props: { label: '皮图', skin: '/art/button.png' } },
  { type: 'Button', id: 'hero', props: { label: '开始', kind: 'hero' } },
  { type: 'Button', id: 'disabled', props: { label: '禁用', disabled: true, skin: '' } },
];
for (const node of legacy) {
  if (good.renderNode(node) !== bad.renderNode(node)) throw new Error(`${node.id}: default HTML drift`);
}
if (!good.renderNode(legacy[3]).includes(' disabled')) throw new Error('Native disabled missing');

const invalid = ['#E8E8F4', { custom: '' }, { custom: '#fff;color:red' }, { custom: '#fff', extra: true }];
for (const labelColor of invalid) {
  const node = { type: 'Button', id: 'invalid', props: { label: 'x', labelColor } };
  if (!good.validateLayoutNode(node).some((issue) => issue.kind === 'bad-enum' || issue.kind === 'bad-custom-color')) throw new Error(`Invalid value accepted: ${JSON.stringify(labelColor)}`);
}
console.log('ANCHOR_HITS=1 SABOTAGE_RED=2 LEGACY_IDENTICAL=4 INVALID_REJECTED=4');
