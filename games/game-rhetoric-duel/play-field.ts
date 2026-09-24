import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
import type { AssetManager } from '@zerocraft/engine/assets/index.js';
import type { WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import {
  colorCapability,
  shapeCapability,
  spriteCapability,
  textCapability,
  transformCapability,
  visibilityCapability,
} from '@zerocraft/engine/atom-skills/index.js';
import { tweenCapability } from '@zerocraft/engine/skills/tier1/index.js';
import type { Color, Text, Transform, Tween, Visibility } from '@zerocraft/engine/engine/protocol/components.js';
import type { RhetoricGameConfig } from './config.js';
import { visibleDelta, type RhetoricPresentationView } from './presentation-controller.js';

export const RHETORIC_FIELD_W = 1440;
export const RHETORIC_FIELD_H = 900;

const visible = (isVisible = true): Record<string, unknown> => ({ type: 'Visibility', visible: isVisible, active: isVisible });

export function rhetoricOpponentVisibility(portraitReady: boolean): Readonly<{ art: boolean; fallback: boolean }> {
  return { art: portraitReady, fallback: !portraitReady };
}

/** Render-only projection. Asset readiness never enters World state or the session hash. */
export function rhetoricPlayFieldBlueprint(config: RhetoricGameConfig): WorldBlueprint {
  return {
    capabilities: [transformCapability, shapeCapability, spriteCapability, colorCapability, textCapability, visibilityCapability, tweenCapability],
    entities: {
      'field-ground': {
        Transform: { x: 720, y: 620, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 1440, height: 3 }, Color: { tint: 0xc69a58, alpha: 0.18 },
      },
      'opponent-shadow': {
        Transform: { x: 824, y: 822, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 360, height: 22 }, Color: { tint: 0x020305, alpha: 0.48 }, Visibility: visible(),
      },
      'opponent-art': {
        Transform: { x: 824, y: 462, rotation: 0, scaleX: 0.5, scaleY: 0.5 },
        Sprite: { textureKey: config.encounter.portraitSkinKey, anchorX: 0.5, anchorY: 0.5, zOrder: 4 },
        Color: { tint: 0xffffff, alpha: 1 }, Visibility: visible(false),
      },
      'opponent-body': {
        Transform: { x: 824, y: 514, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'polygon', vertices: [-126, 286, -104, -164, -48, -236, 48, -236, 104, -164, 126, 286] },
        Color: { tint: 0x2d2929, alpha: 1 }, Visibility: visible(),
      },
      'opponent-sash': {
        Transform: { x: 824, y: 560, rotation: -0.08, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 218, height: 20 }, Color: { tint: 0xa47b3e, alpha: 0.68 }, Visibility: visible(),
      },
      'opponent-head': {
        Transform: { x: 824, y: 230, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 66 }, Color: { tint: 0x554540, alpha: 1 }, Visibility: visible(),
      },
      'opponent-mark': {
        Transform: { x: 824, y: 244, rotation: 0, scaleX: 1, scaleY: 1 },
        Text: { content: config.encounter.displayName.slice(0, 1), fontSize: 52, fontFamily: 'Georgia, serif', anchor: 'center', lineSpacing: 0 },
        Color: { tint: 0xe0bd76, alpha: 0.82 }, Visibility: visible(),
      },
      'impact-ring': {
        Transform: { x: 824, y: 356, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 94 }, Color: { tint: 0xd6af69, alpha: 0 }, Visibility: visible(false),
      },
      'impact-copy': {
        Transform: { x: 824, y: 116, rotation: 0, scaleX: 1, scaleY: 1 },
        Text: { content: '', fontSize: 34, fontFamily: 'Georgia, serif', anchor: 'center', lineSpacing: 0 },
        Sprite: { textureKey: 'render-order.text', anchorX: 0.5, anchorY: 0.5, zOrder: 15 },
        Color: { tint: 0xf1d49a, alpha: 0 }, Visibility: visible(false),
      },
    },
  };
}

function setVisible(engine: Engine, id: string, isVisible: boolean): void {
  const value = engine.world.getComponent<Visibility>(id, 'Visibility');
  if (value) { value.visible = isVisible; value.active = isVisible; }
}

function resetTween(engine: Engine, id: string, tween: Omit<Tween, 'type'>): void {
  if (engine.world.hasComponent(id, 'Tween')) engine.world.removeComponent(id, 'Tween');
  engine.world.addComponent(id, { type: 'Tween', ...tween });
}

export type RhetoricPlayField = Readonly<{ update: (view: RhetoricPresentationView) => void; destroy: () => void }>;

export function mountRhetoricPlayField(container: HTMLElement, config: RhetoricGameConfig, assets?: AssetManager): RhetoricPlayField {
  const engine = new Engine({ tickRate: 60 });
  engine.load(rhetoricPlayFieldBlueprint(config));
  const renderer = new CanvasRenderer({ width: RHETORIC_FIELD_W, height: RHETORIC_FIELD_H, background: 'transparent', ...(assets ? { assets } : {}) });
  engine.attachRenderer(renderer, container);
  const canvas = container.querySelector('canvas');
  if (canvas) {
    canvas.dataset.playField = 'rhetoric-duel';
    canvas.dataset.portraitSkin = config.encounter.portraitSkinKey;
    canvas.style.position = 'absolute'; canvas.style.inset = '0'; canvas.style.pointerEvents = 'none';
  }
  let signature = '';
  engine.start();

  const update = (view: RhetoricPresentationView): void => {
    const portraitReady = assets?.isLoaded(config.encounter.portraitSkinKey) === true;
    const nextSignature = `${view.phase}|${portraitReady}`;
    if (nextSignature === signature) return;
    signature = nextSignature;

    const opponentVisible = view.phase !== 'camera';
    const visibility = rhetoricOpponentVisibility(portraitReady);
    setVisible(engine, 'opponent-art', opponentVisible && visibility.art);
    for (const id of ['opponent-shadow', 'opponent-body', 'opponent-sash', 'opponent-head', 'opponent-mark']) {
      setVisible(engine, id, opponentVisible && visibility.fallback);
    }

    const pressurePose = view.phase === 'enemy-intent' || view.phase === 'enemy-impact' || view.phase === 'portrait-dominates';
    const responsePose = view.phase === 'opponent-response' || view.phase === 'portrait-resolve';
    const x = pressurePose ? 808 : responsePose ? 833 : 824;
    const yShift = responsePose ? -3 : 0;
    for (const id of ['opponent-art', 'opponent-shadow', 'opponent-body', 'opponent-sash', 'opponent-head', 'opponent-mark']) {
      const transform = engine.world.getComponent<Transform>(id, 'Transform');
      if (transform) transform.x = x;
    }
    const art = engine.world.getComponent<Transform>('opponent-art', 'Transform')!;
    art.y = 462 + yShift; art.rotation = responsePose ? 0.018 : pressurePose ? -0.012 : 0;

    const impact = ['impact', 'enemy-impact', 'victory-impact', 'failure-impact'].includes(view.phase);
    setVisible(engine, 'impact-ring', impact); setVisible(engine, 'impact-copy', impact);
    const ring = engine.world.getComponent<Color>('impact-ring', 'Color')!;
    const copy = engine.world.getComponent<Color>('impact-copy', 'Color')!;
    const text = engine.world.getComponent<Text>('impact-copy', 'Text')!;
    const delta = visibleDelta(view);
    const danger = delta.includes('压力+') || view.phase === 'failure-impact';
    ring.tint = danger ? 0xc86a5a : 0xd6af69; copy.tint = danger ? 0xec9d87 : 0xf1d49a;
    ring.alpha = impact ? 0.18 : 0; copy.alpha = impact ? 1 : 0;
    text.content = delta || (view.phase === 'failure-impact' ? '交锋失势' : view.phase === 'victory-impact' ? '论证成立' : '');
    if (impact && !view.reducedMotion) {
      resetTween(engine, 'impact-ring', { target: 'Transform.scaleX', from: 0.55, to: 1.18, elapsed: 0, duration: 20, easing: 'easeOut', done: false });
      resetTween(engine, 'impact-copy', { target: 'Transform.y', from: 148, to: 116, elapsed: 0, duration: 22, easing: 'easeOut', done: false });
    }
  };

  return { update, destroy: () => { engine.stop(); renderer.destroy(); } };
}
