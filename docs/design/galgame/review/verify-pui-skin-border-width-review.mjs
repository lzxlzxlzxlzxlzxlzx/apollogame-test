// Independent in-memory sabotage: no production file is modified.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../../../..');
const source = resolve(root, 'src/ui/components/render.ts');
const original = readFileSync(source, 'utf8');
const anchor = 'const w = borderWidth === undefined ? s : num(borderWidth);';
const hits = original.split(anchor).length - 1;
if (hits !== 2) throw new Error(`anchor hit count ${hits}, expected 2`);

async function loadRender(sabotage) {
  const result = await build({
    stdin: {
      contents: 'export { renderNode } from "./src/ui/components/render.ts"; export { SHELL } from "./src/ui/shell-theme.ts";',
      resolveDir: root,
      sourcefile: 'skin-border-width-review-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [{
      name: 'sabotage-render-in-memory',
      setup(pluginBuild) {
        pluginBuild.onLoad({ filter: /[\\/]src[\\/]ui[\\/]components[\\/]render\.ts$/ }, () => ({
          contents: sabotage ? original.replaceAll(anchor, 'const w = s;') : original,
          loader: 'ts',
        }));
      },
    }],
  });
  const js = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

const good = await loadRender(false);
const bad = await loadRender(true);
const skin = '/art/frame.png';
const nodes = [
  { type: 'Panel', id: 'panel', props: { skin, skinSlice: 115, skinBorderWidth: 58 }, children: [] },
  { type: 'Button', id: 'button', props: { label: '确认', skin, skinSlice: 115, skinBorderWidth: 36 } },
  { type: 'Modal', id: 'modal', props: { skin, skinSlice: 115, skinBorderWidth: 36 }, children: [] },
  { type: 'dialog', id: 'dialog', props: { skin, skinSlice: 115, skinBorderWidth: 58 } },
];
let red = 0;
for (const node of nodes) {
  const width = node.props.skinBorderWidth;
  const expected = `border-image:url('/art/frame.png') 115 fill / ${width}px / 0 stretch`;
  const goodHtml = good.renderNode(node);
  const badHtml = bad.renderNode(node);
  if (!goodHtml.includes(expected)) throw new Error(`${node.type}: baseline missing expected ${width}px border`);
  if (badHtml.includes(expected) || !badHtml.includes("border-image:url('/art/frame.png') 115 fill / 115px / 0 stretch")) {
    throw new Error(`${node.type}: sabotage did not turn contract red`);
  }
  red++;
}
const theme = { ...good.SHELL, buttonSkins: { primary: { skin, skinSlice: 115, skinBorderWidth: 58 } } };
const themeNode = { type: 'Button', id: 'theme', props: { label: '主题皮', kind: 'primary' } };
if (!good.renderNode(themeNode, theme).includes('border-width:58px')) throw new Error('theme baseline failed');
if (!bad.renderNode(themeNode, theme).includes('border-width:115px')) throw new Error('theme sabotage did not turn red');
red++;
const old = { type: 'Button', id: 'old', props: { label: '旧皮', skin, skinSlice: 8 } };
if (good.renderNode(old) !== bad.renderNode(old)) throw new Error('legacy skinSlice-only output changed');
console.log(`ANCHOR_HITS=${hits} SABOTAGE_RED=${red} LEGACY_UNCHANGED=1`);
