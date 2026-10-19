import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFormalManifest, hostVisualInput, imageDescriptors } from '../src/scene-data.js';

const base = JSON.parse(readFileSync(new URL('../../../library/game-clue-investigation/manifest.json', import.meta.url), 'utf8'));
const image = (name) => ({ imageUrl: `https://assets.example.test/${name}.png`, alt: name, pixelWidth: 100, pixelHeight: 100 });
const mask = { encoding: 'bitset-hex-msb', width: 2, height: 2, rows: ['c', 'c'] };
const placement = { x: .1, y: .1, width: .1, height: .1, zIndex: 5, fit: 'contain', anchorX: .5, anchorY: .5, rotation: 0 };
const item = (objectId, kind = 'clue', required = true) => ({ objectId, kind, required, name: `Name ${objectId}`, description: `Description ${objectId}`,
  sceneImage: image(`${objectId}-scene`), ...(kind === 'clue' ? { evidenceImage: image(`${objectId}-evidence`) } : {}), placement, hitMask: mask });
const data = (objects) => ({ requestId: 'req_1', investigationId: 'case_1', title: 'Dynamic case', objective: 'Inspect every needed clue', background: image('background'), objects });

function build(objects) {
  const source = data(objects);
  const prepared = objects.map((object, index) => ({ id: object.objectId, textureKey: `host-visual:req_1:${object.objectId}`,
    hitMaskKey: `host-hit-mask:req_1:${object.objectId}`, pixelWidth: 100, pixelHeight: 100, placement: object.placement, renderOrder: 20 + index }));
  const projected = prepared.map((visual) => ({ id: visual.id,
    transform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
    sprite: { textureKey: visual.textureKey, anchorX: .5, anchorY: .5, zOrder: visual.renderOrder, width: 144, height: 90, fit: 'contain' },
    clickable: { action: `investigate.${visual.id}`, hitMaskKey: visual.hitMaskKey },
  }));
  return buildFormalManifest(base, source, 'req_1', prepared, projected, 'host-background:req_1');
}

test('projects arbitrary 1..12 host objects into capability data, preserving host keys and clue flags', () => {
  for (const count of [1, 7, 12]) {
    const objects = Array.from({ length: count }, (_, index) => item(`item_${index}`, 'clue', index < Math.max(1, Math.ceil(count / 2))));
    const runtime = build(objects);
    assert.equal(Object.keys(runtime.entities).filter((id) => id.startsWith('object-item_')).length, count);
    assert.equal(runtime.entities['object-item_0'].Clickable.hitMaskKey, 'host-hit-mask:req_1:item_0');
    assert.equal(runtime.entities['object-item_0'].Sprite.textureKey, 'host-visual:req_1:item_0');
    assert.equal(runtime.entities['required-total'].Resource.current, Math.max(1, Math.ceil(count / 2)));
    assert.equal(runtime.presentation.focusTargets.length, count);
    assert.equal(runtime.entities[`collected-item_0`], undefined);
    assert.equal(runtime.entities['object-item_0'].Flag.id, 'collected.item_0');
  }
});

test('generated scene uses host background, exact submitted text/images, and no URL in world entities', () => {
  const objects = [item('clue_main'), item('cup', 'flavor', false)];
  const runtime = build(objects);
  assert.equal(runtime.entities['scene-background'].Sprite.textureKey, 'host-background:req_1');
  assert.equal(runtime.presentation.ui.children.find((node) => node.id === 'case-heading').children.find((node) => node.id === 'case-title').props.text, 'Dynamic case');
  const reveal = runtime.presentation.ui.children.find((node) => node.id === 'clue-reveal-modal');
  const serializedWorld = JSON.stringify(runtime.entities);
  assert.equal(serializedWorld.includes('https://'), false);
  assert.equal(JSON.stringify(reveal).includes('clue_main-evidence.png'), true);
  assert.equal(JSON.stringify(runtime.presentation.ui).includes('Description cup'), true);
});

test('only the first collection signal can count a clue and required progress is data bounded', () => {
  const runtime = build([item('required'), item('optional', 'clue', false), item('cup', 'flavor', false)]);
  assert.deepEqual(runtime.entities['action-collect-required'].KeyBinding.when,
    { kind: 'and', of: [
      { kind: 'resource', id: 'selected-object', cmp: 'eq', value: 1 },
      { kind: 'flag', id: 'clue-reveal-open' },
      { kind: 'not', of: { kind: 'flag', id: 'collected.required' } },
    ] });
  assert.equal(runtime.entities['effect-count-required'].Effect.value, 1);
  assert.equal(runtime.entities['effect-count-optional'], undefined);
  assert.equal(runtime.entities['effect-viewed-cup'].Effect.targetId, 'viewed.cup');
  assert.equal(runtime.entities['effect-viewed-required'], undefined);
});

test('formal imagery adapter includes each host visual and keeps evidence/background outside clickable mask inputs', () => {
  const caseData = data([item('one'), item('ordinary', 'flavor', false)]);
  assert.deepEqual(hostVisualInput(caseData).map((value) => value.id), ['one', 'ordinary']);
  const descriptors = imageDescriptors(caseData, caseData.requestId);
  assert.equal(descriptors.backgroundKey, 'host-background:req_1');
  assert.deepEqual(descriptors.evidence.map((value) => value.key), ['host-evidence:req_1:one']);
});
