// Independent in-memory sabotage: never edits the PUI implementation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '../../../..');
const renderPath = resolve(root, 'src/ui/components/render.ts');
const original = readFileSync(renderPath, 'utf8');
const anchors = {
  s2: 'inset:-${y}px -${x}px',
  s3: 'resolveLabelColor(p.titleColor, t, t.text)',
};
for (const [name, anchor] of Object.entries(anchors)) {
  const hits = original.split(anchor).length - 1;
  if (hits !== 1) throw new Error(`${name}: expected one anchor, found ${hits}`);
}

async function load(mode) {
  const result = await build({
    stdin: {
      contents: 'export { renderNode } from "./src/ui/components/render.ts"; export { validateLayoutNode } from "./src/ui/components/validate.ts";',
      resolveDir: root, sourcefile: 'pui-s2-s3-review-entry.ts', loader: 'ts',
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{
      name: 'sabotage-render-in-memory',
      setup(pluginBuild) {
        pluginBuild.onLoad({ filter: /[\\/]src[\\/]ui[\\/]components[\\/]render\.ts$/ }, () => ({
          contents: mode === 's2' ? original.replace(anchors.s2, 'inset:0')
            : mode === 's3' ? original.replace(anchors.s3, 't.text') : original,
          loader: 'ts',
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const good = await load('good');
const badS2 = await load('s2');
const badS3 = await load('s3');
const skin = '/art/skin.png';
const panel = { type: 'Panel', id: 'dialogue', props: { skin, skinSize: { x: 100, y: 160 }, skinPosition: 'center' }, children: [] };
const button = { type: 'Button', id: 'choice', props: { label: '选项', skin, skinSize: { x: 100, y: 220 }, skinPosition: 'center', skinOutset: { x: 8, y: 5 } } };
const oldCover = { type: 'Button', id: 'old-cover', props: { label: '旧', skin } };
const oldSliced = { type: 'Button', id: 'old-sliced', props: { label: '旧', skin, skinSlice: 8 } };
if (good.validateLayoutNode(panel).length || good.validateLayoutNode(button).length) throw new Error('S2 legal data invalid');
if (!good.renderNode(panel).includes("center/100% 160% no-repeat")) throw new Error('S2 Panel scale missing');
if (!good.renderNode(button).includes('inset:-5px -8px')) throw new Error('S2 Button outset missing');
if (badS2.renderNode(button).includes('inset:-5px -8px') || !badS2.renderNode(button).includes('inset:0')) throw new Error('S2 sabotage stayed green');
if (good.renderNode(oldCover) !== badS2.renderNode(oldCover) || good.renderNode(oldSliced) !== badS2.renderNode(oldSliced)) throw new Error('S2 legacy output drift');
if (!good.renderNode(oldCover).includes('center/cover no-repeat') || !good.renderNode(oldSliced).includes('border-image:')) throw new Error('S2 legacy path missing');
const badLayer = { type: 'Button', id: 'invalid', props: { label: 'x', skin, skinSlice: 8, skinSize: { x: 100, y: 160 } } };
if (!good.validateLayoutNode(badLayer).some((i) => i.kind === 'bad-skin-layer')) throw new Error('S2 invalid combination accepted');

const modal = { type: 'Modal', id: 'm', props: { title: '标题', titleColor: { custom: '#F4EEFF' }, closeAction: 'close' }, children: [] };
const oldModal = { type: 'Modal', id: 'old-m', props: { title: '标题', closeAction: 'close' }, children: [] };
if (good.validateLayoutNode(modal).length) throw new Error('S3 legal data invalid');
const html = good.renderNode(modal);
if (!html.includes('aria-labelledby="m-title"') || !html.includes('color:#F4EEFF')) throw new Error('S3 title color or ARIA missing');
if (badS3.renderNode(modal).includes('color:#F4EEFF')) throw new Error('S3 sabotage stayed green');
if (good.renderNode(oldModal) !== badS3.renderNode(oldModal)) throw new Error('S3 default output drift');
const injected = { type: 'Modal', id: 'bad-m', props: { title: 'x', titleColor: { custom: '#fff;color:red' } }, children: [] };
if (!good.validateLayoutNode(injected).some((i) => i.kind === 'bad-custom-color')) throw new Error('S3 injection accepted');
console.log('ANCHOR_HITS=1+1 SABOTAGE_RED=2 LEGACY_UNCHANGED=3 VALIDATION_REJECTS=2');
