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
import { RHETORIC_VIEWPORT_SPEC } from './card-presentation.js';

export const RHETORIC_FIELD_W = RHETORIC_VIEWPORT_SPEC.width;
export const RHETORIC_FIELD_H = RHETORIC_VIEWPORT_SPEC.height;

const visible = (isVisible = true): Record<string, unknown> => ({ type: 'Visibility', visible: isVisible, active: isVisible });

export function rhetoricOpponentVisibility(portraitReady: boolean): Readonly<{ art: boolean; fallback: boolean }> {
  return { art: portraitReady, fallback: !portraitReady };
}

export type RhetoricOpponentPose = Readonly<{
  x: number;
  yShift: number;
  rotation: number;
  scale: number;
  durationTicks: number;
}>;

const NEUTRAL_POSE: RhetoricOpponentPose = Object.freeze({ x: 885, yShift: 0, rotation: 0, scale: 1, durationTicks: 24 });

/** Demo-derived render-only poses, amplified for the 1440×900 logical stage. */
export function rhetoricOpponentPose(phase: string): RhetoricOpponentPose {
  if (phase === 'enemy-intent') {
    return { x: 835, yShift: 0, rotation: -0.025, scale: 1, durationTicks: 8 };
  }
  if (phase === 'failure-impact' || phase === 'portrait-dominates') {
    return { x: 825, yShift: 0, rotation: -0.032, scale: 1, durationTicks: 20 };
  }
  if (phase === 'card-flight' || phase === 'victory-impact') {
    return { x: 920, yShift: 0, rotation: 0.028, scale: 1, durationTicks: 8 };
  }
  if (phase === 'impact' || phase === 'enemy-impact' || phase === 'opponent-response' || phase === 'portrait-resolve') {
    return { ...NEUTRAL_POSE, durationTicks: 8 };
  }
  return NEUTRAL_POSE;
}

const OPPONENT_PARTS = Object.freeze({
  'opponent-art': { y: 465, scaleX: 0.51, scaleY: 0.51, rotation: 0 },
  'opponent-shadow': { y: 822, scaleX: 1, scaleY: 1, rotation: 0 },
  'opponent-body': { y: 514.5, scaleX: 1.08, scaleY: 1.08, rotation: 0 },
  'opponent-sash': { y: 561, scaleX: 1.08, scaleY: 1.08, rotation: -0.08 },
  'opponent-head': { y: 231, scaleX: 1.08, scaleY: 1.08, rotation: 0 },
  'opponent-mark': { y: 246, scaleX: 1, scaleY: 1, rotation: 0 },
});

/** Render-only projection. Asset readiness never enters World state or the session hash. */
export function rhetoricPlayFieldBlueprint(config: RhetoricGameConfig): WorldBlueprint {
  return {
    capabilities: [transformCapability, shapeCapability, spriteCapability, colorCapability, textCapability, visibilityCapability, tweenCapability],
    entities: {
      'field-ground': {
        Transform: { x: 720, y: 621, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 1440, height: 4.5 }, Color: { tint: 0xc69a58, alpha: 0.18 },
      },
      'opponent-shadow': {
        Transform: { x: 885, y: 822, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 390, height: 27 }, Color: { tint: 0x020305, alpha: 0.48 }, Visibility: visible(),
      },
      'opponent-art': {
        Transform: { x: 885, y: 465, rotation: 0, scaleX: 0.51, scaleY: 0.51 },
        Sprite: { textureKey: config.encounter.portraitSkinKey, anchorX: 0.5, anchorY: 0.5, zOrder: 4 },
        Color: { tint: 0xffffff, alpha: 1 }, Visibility: visible(false),
      },
      'opponent-body': {
        Transform: { x: 885, y: 514.5, rotation: 0, scaleX: 1.08, scaleY: 1.08 },
        Shape: { kind: 'polygon', vertices: [-126, 286, -104, -164, -48, -236, 48, -236, 104, -164, 126, 286] },
        Color: { tint: 0x2d2929, alpha: 1 }, Visibility: visible(),
      },
      'opponent-sash': {
        Transform: { x: 885, y: 561, rotation: -0.08, scaleX: 1.08, scaleY: 1.08 },
        Shape: { kind: 'box', width: 218, height: 20 }, Color: { tint: 0xa47b3e, alpha: 0.68 }, Visibility: visible(),
      },
      'opponent-head': {
        Transform: { x: 885, y: 231, rotation: 0, scaleX: 1.08, scaleY: 1.08 },
        Shape: { kind: 'circle', radius: 66 }, Color: { tint: 0x554540, alpha: 1 }, Visibility: visible(),
      },
      'opponent-mark': {
        Transform: { x: 885, y: 246, rotation: 0, scaleX: 1, scaleY: 1 },
        Text: { content: config.encounter.displayName.slice(0, 1), fontSize: 38, fontFamily: 'Georgia, serif', anchor: 'center', lineSpacing: 0 },
        Color: { tint: 0xe0bd76, alpha: 0.82 }, Visibility: visible(),
      },
      'impact-ring': {
        Transform: { x: 885, y: 357, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 105 }, Color: { tint: 0xd6af69, alpha: 0 }, Visibility: visible(false),
      },
      'impact-copy': {
        Transform: { x: 326, y: 352, rotation: 0, scaleX: 1, scaleY: 1 },
        Text: { content: '', fontSize: 28, fontFamily: 'Georgia, serif', anchor: 'center', lineSpacing: 0 },
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

    const pose = rhetoricOpponentPose(view.phase);
    for (const [id, base] of Object.entries(OPPONENT_PARTS)) {
      const transform = engine.world.getComponent<Transform>(id, 'Transform');
      if (!transform) continue;
      const fromX = transform.x;
      transform.y = base.y + pose.yShift;
      transform.rotation = base.rotation + pose.rotation;
      transform.scaleX = base.scaleX * pose.scale;
      transform.scaleY = base.scaleY * pose.scale;
      if (Math.abs(fromX - pose.x) < 0.5 || view.reducedMotion) {
        transform.x = pose.x;
        if (engine.world.hasComponent(id, 'Tween')) engine.world.removeComponent(id, 'Tween');
      } else {
        resetTween(engine, id, { target: 'Transform.x', from: fromX, to: pose.x, elapsed: 0, duration: pose.durationTicks, easing: 'easeOut', done: false });
      }
    }

    const impact = ['card-flight', 'impact', 'enemy-impact', 'victory-impact', 'failure-impact'].includes(view.phase);
    setVisible(engine, 'impact-ring', impact); setVisible(engine, 'impact-copy', impact);
    const ring = engine.world.getComponent<Color>('impact-ring', 'Color')!;
    const copy = engine.world.getComponent<Color>('impact-copy', 'Color')!;
    const text = engine.world.getComponent<Text>('impact-copy', 'Text')!;
    const delta = visibleDelta(view);
    const danger = delta.includes('压力+') || view.phase === 'failure-impact';
    ring.tint = danger ? 0xc86a5a : 0xd6af69; copy.tint = danger ? 0xec9d87 : 0xf1d49a;
    ring.alpha = impact ? 0.18 : 0; copy.alpha = impact ? 1 : 0;
    text.content = delta || (view.phase === 'failure-impact' ? '交锋失势' : view.phase === 'victory-impact' ? '论证成立' : '');
    const beginsImpact = view.phase !== 'impact';
    if (impact && beginsImpact && !view.reducedMotion) {
      resetTween(engine, 'impact-ring', { target: 'Transform.scaleX', from: 0.55, to: 1.18, elapsed: 0, duration: 50, easing: 'easeOut', done: false });
      resetTween(engine, 'impact-copy', { target: 'Transform.y', from: 382, to: 352, elapsed: 0, duration: 36, easing: 'easeOut', done: false });
    }
  };

  return { update, destroy: () => { engine.stop(); renderer.destroy(); } };
}
