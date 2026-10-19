import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAssetIndex } from '@zerocraft/engine/assets/asset-index.js';
import { decodePng } from '@zerocraft/engine/assets/import/png-decode.js';
import { parseManifestDetailed } from '@zerocraft/engine/assembly/manifest.js';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { collectClickableTargets, hitClickableTarget } from '@zerocraft/engine/engine/protocol/clickable-hit-test.js';

// Exercise the production cartridge, not a detached candidate.
const candidate = JSON.parse(readFileSync(new URL('../../library/game-clue-investigation/manifest.json', import.meta.url), 'utf8'));
const artRoot = new URL('../../library/game-clue-investigation/art/', import.meta.url);
const index = parseAssetIndex(JSON.parse(readFileSync(new URL('index.json', artRoot), 'utf8')));
function targets() {
  const parsed = parseManifestDetailed(candidate, { assetIndex: index });
  expect(parsed.warnings).toEqual([]);
  const engine = new Engine({ tickRate: 60 });
  engine.load(parsed.blueprint);
  engine.world.tick();
  return collectClickableTargets(engine.world);
}

describe('S6 real PNG candidate: independent pixel mapping oracle', () => {
  it('freezes UI03/04 data without changing world, rules or input contracts', () => {
    const before = JSON.parse(readFileSync(new URL('../../docs/design/game-clue-investigation/self-check/S6-ui034-before.json', import.meta.url), 'utf8'));
    const strip = (value: typeof candidate) => {
      const copy = structuredClone(value);
      for (const key of ['ui', 'font', 'focusTargets', 'pointerFeedback']) delete copy.presentation[key];
      return copy;
    };
    expect(strip(candidate)).toEqual(strip(before));
    expect(candidate.entities).toEqual(before.entities);
    expect(candidate.presentation.font).toBe('system-yahei');
    for (const target of candidate.presentation.focusTargets) {
      const entity = candidate.entities[target.entity];
      const mask = index.assets.find(a => a.id === entity.Clickable.hitMaskKey)!.spec as { width: number; height: number };
      const height = mask.height * Math.min(entity.Sprite.width / mask.width, entity.Sprite.height / mask.height);
      expect(entity.Transform.y - height / 2 - target.labelGap).toBeCloseTo(entity.Transform.y - entity.Shape.height / 2 - 8, 8);
      expect([target.labelPlacement, target.labelSize]).toEqual(['above', 14]);
      expect(target.tone).toBe(['object-lock', 'object-prints', 'object-letter'].includes(target.entity) ? 'gold' : 'cyan');
    }
  });
  it('freezes authored fit, anchors, geometry and opaque color against approved prototype', () => {
    const frozen: Record<string, number[]> = { 'scene-background': [720, 450, 1440, 900], 'object-lock': [246, 433, 104, 126], 'object-shelf': [585, 366, 362, 486], 'object-clock': [1204.5, 184, 185, 184], 'object-cup': [933, 557, 102, 90], 'object-rug': [489, 774, 780, 214], 'object-prints': [978, 638, 250, 132], 'object-letter': [1167, 552.5, 190, 145] };
    for (const [id, geometry] of Object.entries(frozen)) {
      const { Transform: t, Sprite: s, Shape: shape, Color: color } = candidate.entities[id];
      expect([t.x, t.y, s.width, s.height], id).toEqual(geometry);
      expect([shape.width, shape.height], id).toEqual(geometry.slice(2));
      expect([s.anchorX, s.anchorY, s.fit], id).toEqual([0.5, 0.5, id === 'scene-background' ? 'cover' : 'contain']);
      expect(color, id).toEqual({ tint: 16777215, alpha: 1 });
    }
  });

  it('uses the same filled texture for scene, evidence and collection images', () => {
    const nodes: { id: string; props?: { src?: string; fit?: string; position?: string }; children?: unknown[] }[] = [];
    const visit = (n: typeof nodes[number]): void => { nodes.push(n); n.children?.forEach(c => visit(c as typeof n)); };
    visit(candidate.presentation.ui);
    for (const id of ['lock', 'prints', 'letter']) for (const prefix of ['evidence', 'collection']) {
      const node = nodes.find(n => n.id === `${prefix}-${id}-image`)!;
      expect(node.props?.src).toBe(`asset:${candidate.entities[`object-${id}`].Sprite.textureKey}`);
      expect(node.props?.fit).toBe('cover');
      expect(node.props?.position).toBe('top');
      const entry = index.assets.find(a => a.id === node.props!.src!.slice(6));
      expect([entry?.type, entry?.status]).toEqual(['texture', 'filled']);
    }
  });

  it('uses measured prototype buttons while preserving collect actions', () => {
    type Node = { id: string; props: Record<string, unknown>; layout: Record<string, unknown>; children?: Node[] };
    const nodes: Node[] = [];
    const visit = (node: Node): void => { nodes.push(node); node.children?.forEach(visit); };
    visit(candidate.presentation.ui);
    for (const id of ['lock', 'prints', 'letter']) {
      const button = nodes.find(node => node.id === `${id}-collect`)!;
      expect(button.props.kind).toBe('ghost');
      expect(button.props.skin).toBe('');
      expect(button.props.action).toBe('clue.collect');
      expect((button.props.stateColors as { default: { background: unknown } }).default.background).toEqual({ custom: '#E3B765' });
      expect([button.layout.width, button.layout.height, button.layout.radius]).toEqual([108, 47, 0]);
      expect([button.props.labelSize, button.props.labelWeight]).toEqual([16, 700]);
    }
  });

  it('binds seven masks to the actual eight production textures', () => {
    expect(index.assets.filter(a => a.type === 'texture')).toHaveLength(8);
    expect(index.assets.filter(a => a.type === 'hit-mask')).toHaveLength(7);
    expect(targets()).toHaveLength(7);
  });

  it.each(['lock', 'shelf', 'clock', 'cup', 'rug', 'prints', 'letter'])('%s: contain/cover, scale and mirror agree with decoded PNG alpha', id => {
    const original = targets().find(t => t.eid === `object-${id}`)!;
    expect(original.mask).not.toBeNull();
    const entry = index.assets.find(a => a.id === original.sprite!.textureKey)!;
    const prefix = '/games/game-clue-investigation/art/';
    expect(entry.path!.startsWith(prefix)).toBe(true);
    const png = decodePng(readFileSync(new URL(entry.path!.slice(prefix.length), artRoot)));
    expect([png.w, png.h]).toEqual([original.mask!.width, original.mask!.height]);
    for (const fit of ['contain', 'cover'] as const) {
      for (const scale of [0.5, 1, 1.75, -1]) {
        const target = { ...original, sprite: { ...original.sprite!, fit }, t: { ...original.t, scaleX: scale, scaleY: scale } };
        const bw = target.sprite.width!;
        const bh = target.sprite.height!;
        // Independent textbook centered image-fit calculation, not planSpriteDraw.
        const k = (fit === 'contain' ? Math.min : Math.max)(bw / png.w, bh / png.h);
        let hits = 0;
        let misses = 0;
        for (let iy = 0; iy < 31; iy++) for (let ix = 0; ix < 31; ix++) {
          const lx = ((ix + 0.37) / 31 - 0.5) * bw;
          const ly = ((iy + 0.61) / 31 - 0.5) * bh;
          const px = Math.floor(lx / k + png.w / 2);
          const py = Math.floor(ly / k + png.h / 2);
          const expected = px >= 0 && px < png.w && py >= 0 && py < png.h
            && png.px[(py * png.w + px) * 4 + 3] >= 150;
          const actual = hitClickableTarget(target.t.x + lx * scale, target.t.y + ly * scale, target) === 'hit';
          expect(actual, `${id}/${fit}/${scale}/${ix},${iy}`).toBe(expected);
          if (expected) hits++; else misses++;
        }
        expect(hits).toBeGreaterThan(0);
        if (fit === 'contain') expect(misses).toBeGreaterThan(0);
      }
    }
  });

  it('does not fall back to the rectangle for missing masks or nonzero rotation', () => {
    for (const target of targets()) {
      expect(hitClickableTarget(target.t.x, target.t.y, { ...target, mask: null })).toBe('invalid-mask');
      expect(hitClickableTarget(target.t.x, target.t.y, { ...target, t: { ...target.t, rotation: 0.1 } })).toBe('invalid-mask');
    }
  });
});
