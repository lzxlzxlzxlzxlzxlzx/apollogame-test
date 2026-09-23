import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { CanvasRenderer } from '@zerocraft/engine/renderer/index.js';
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
import { cardForView, visibleDelta, type RhetoricPresentationView } from './presentation-controller.js';

export const RHETORIC_FIELD_W = 1440;
export const RHETORIC_FIELD_H = 900;

/**
 * Render-only play-field.  It owns no rules: every pose and number below is a
 * projection of the controller's already-committed presentation view.
 */
export function rhetoricPlayFieldBlueprint(config: RhetoricGameConfig): WorldBlueprint {
  return {
    capabilities: [
      transformCapability,
      shapeCapability,
      spriteCapability,
      colorCapability,
      textCapability,
      visibilityCapability,
      tweenCapability,
    ],
    entities: {
      'field-haze': {
        Transform: { x: 850, y: 370, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 285 },
        Color: { tint: 0x6b431c, alpha: 0.18 },
      },
      'field-ground': {
        Transform: { x: 720, y: 622, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 1440, height: 5 },
        Color: { tint: 0xd6af69, alpha: 0.28 },
      },
      'opponent-shadow': {
        Transform: { x: 850, y: 592, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 330, height: 28 },
        Color: { tint: 0x020305, alpha: 0.62 },
      },
      'opponent-body': {
        Transform: { x: 850, y: 410, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'polygon', vertices: [-118, 178, -92, -98, -42, -154, 42, -154, 92, -98, 118, 178] },
        Sprite: { textureKey: config.encounter.portraitSkinKey, anchorX: 0.5, anchorY: 0.5, zOrder: 4 },
        Color: { tint: 0x362b30, alpha: 1 },
      },
      'opponent-sash': {
        Transform: { x: 850, y: 450, rotation: -0.08, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 205, height: 22 },
        Color: { tint: 0xb68a43, alpha: 0.7 },
      },
      'opponent-head': {
        Transform: { x: 850, y: 218, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 64 },
        Color: { tint: 0x5c4544, alpha: 1 },
      },
      'opponent-mark': {
        Transform: { x: 850, y: 235, rotation: 0, scaleX: 1, scaleY: 1 },
        Text: { content: config.encounter.displayName.slice(0, 1), fontSize: 52, fontFamily: 'Georgia, serif', anchor: 'center', lineSpacing: 0 },
        Color: { tint: 0xe8c77e, alpha: 0.82 },
      },
      'flight-shadow': {
        Transform: { x: 530, y: 540, rotation: -0.08, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 130, height: 190 },
        Sprite: { textureKey: 'skin.card.fallback', anchorX: 0.5, anchorY: 0.5, zOrder: 12 },
        Color: { tint: 0xead9b3, alpha: 0 },
        Visibility: { visible: false, active: false },
      },
      'flight-glyph': {
        Transform: { x: 530, y: 548, rotation: -0.08, scaleX: 1, scaleY: 1 },
        Text: { content: '言', fontSize: 62, fontFamily: 'Georgia, serif', anchor: 'center', lineSpacing: 0 },
        Sprite: { textureKey: 'render-order.text', anchorX: 0.5, anchorY: 0.5, zOrder: 13 },
        Color: { tint: 0x542f36, alpha: 0 },
        Visibility: { visible: false, active: false },
      },
      'impact-ring': {
        Transform: { x: 850, y: 360, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'circle', radius: 116 },
        Color: { tint: 0xd6af69, alpha: 0 },
        Visibility: { visible: false, active: false },
      },
      'impact-copy': {
        Transform: { x: 850, y: 116, rotation: 0, scaleX: 1, scaleY: 1 },
        Text: { content: '', fontSize: 34, fontFamily: 'Georgia, serif', anchor: 'center', lineSpacing: 0 },
        Sprite: { textureKey: 'render-order.text', anchorX: 0.5, anchorY: 0.5, zOrder: 13 },
        Color: { tint: 0xf1d49a, alpha: 0 },
        Visibility: { visible: false, active: false },
      },
    },
  };
}

function setVisible(engine: Engine, id: string, visible: boolean): void {
  const value = engine.world.getComponent<Visibility>(id, 'Visibility');
  if (value) { value.visible = visible; value.active = visible; }
}

function resetTween(engine: Engine, id: string, tween: Omit<Tween, 'type'>): void {
  if (engine.world.hasComponent(id, 'Tween')) engine.world.removeComponent(id, 'Tween');
  engine.world.addComponent(id, { type: 'Tween', ...tween });
}

export type RhetoricPlayField = Readonly<{
  update: (view: RhetoricPresentationView) => void;
  destroy: () => void;
}>;

export function mountRhetoricPlayField(container: HTMLElement, config: RhetoricGameConfig): RhetoricPlayField {
  const engine = new Engine({ tickRate: 60 });
  engine.load(rhetoricPlayFieldBlueprint(config));
  const renderer = new CanvasRenderer({ width: RHETORIC_FIELD_W, height: RHETORIC_FIELD_H, background: 'transparent' });
  engine.attachRenderer(renderer, container);
  const canvas = container.querySelector('canvas');
  if (canvas) {
    canvas.dataset.playField = 'rhetoric-duel';
    canvas.dataset.portraitSkin = config.encounter.portraitSkinKey;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
  }
  let phase = '';
  engine.start();

  const update = (view: RhetoricPresentationView): void => {
    if (phase === view.phase) return;
    phase = view.phase;
    const flight = view.phase === 'card-lift' || view.phase === 'card-flight';
    const impact = ['impact', 'enemy-impact', 'victory-impact', 'failure-impact'].includes(view.phase);
    const body = engine.world.getComponent<Transform>('opponent-body', 'Transform')!;
    const head = engine.world.getComponent<Transform>('opponent-head', 'Transform')!;
    const sash = engine.world.getComponent<Transform>('opponent-sash', 'Transform')!;
    const mark = engine.world.getComponent<Transform>('opponent-mark', 'Transform')!;
    const pressure = view.phase === 'enemy-intent' || view.phase === 'enemy-impact' || view.phase === 'portrait-dominates';
    const yieldPose = view.phase === 'opponent-response' || view.phase === 'portrait-resolve';
    const x = pressure ? 824 : yieldPose ? 878 : 850;
    const scale = pressure ? 1.04 : yieldPose ? 0.96 : 1;
    for (const target of [body, head, sash, mark]) { target.x = x; target.scaleX = scale; target.scaleY = scale; }
    body.rotation = pressure ? -0.02 : yieldPose ? 0.025 : 0;
    const opponentVisible = view.phase !== 'camera';
    for (const id of ['opponent-shadow', 'opponent-body', 'opponent-sash', 'opponent-head', 'opponent-mark']) {
      const visibility = engine.world.getComponent<Visibility>(id, 'Visibility');
      if (visibility) { visibility.visible = opponentVisible; visibility.active = opponentVisible; }
      else if (!opponentVisible) engine.world.addComponent(id, { type: 'Visibility', visible: false, active: false });
      else if (engine.world.hasComponent(id, 'Visibility')) engine.world.removeComponent(id, 'Visibility');
    }

    setVisible(engine, 'flight-shadow', flight);
    setVisible(engine, 'flight-glyph', flight);
    const flightColor = engine.world.getComponent<Color>('flight-shadow', 'Color')!;
    const glyphColor = engine.world.getComponent<Color>('flight-glyph', 'Color')!;
    flightColor.alpha = flight ? 0.96 : 0;
    glyphColor.alpha = flight ? 1 : 0;
    if (flight) {
      const cardId = view.transition?.cardId;
      const card = cardId ? cardForView(cardId) : undefined;
      const glyph = engine.world.getComponent<Text>('flight-glyph', 'Text')!;
      glyph.content = card?.displayName.slice(0, 1) ?? '言';
      const sprite = engine.world.getComponent<{ type: 'Sprite'; textureKey: string }>('flight-shadow', 'Sprite');
      if (sprite) sprite.textureKey = card?.skinKey ?? 'skin.card.fallback';
      const from = view.phase === 'card-lift' ? 560 : 600;
      const to = view.phase === 'card-lift' ? 600 : 760;
      for (const id of ['flight-shadow', 'flight-glyph']) {
        const transform = engine.world.getComponent<Transform>(id, 'Transform')!;
        transform.x = from;
        transform.y = view.phase === 'card-lift' ? 612 : 475;
        resetTween(engine, id, { target: 'Transform.x', from, to, elapsed: 0, duration: view.reducedMotion ? 1 : 24, easing: 'easeOut', done: false });
      }
    }

    setVisible(engine, 'impact-ring', impact);
    setVisible(engine, 'impact-copy', impact);
    const ring = engine.world.getComponent<Color>('impact-ring', 'Color')!;
    const copy = engine.world.getComponent<Color>('impact-copy', 'Color')!;
    const text = engine.world.getComponent<Text>('impact-copy', 'Text')!;
    const delta = visibleDelta(view);
    const danger = delta.includes('压力+') || view.phase === 'failure-impact';
    ring.tint = danger ? 0xc86a5a : 0xd6af69;
    copy.tint = danger ? 0xec9d87 : 0xf1d49a;
    ring.alpha = impact ? 0.22 : 0;
    copy.alpha = impact ? 1 : 0;
    text.content = delta || (view.phase === 'failure-impact' ? '交锋失势' : view.phase === 'victory-impact' ? '论证成立' : '');
    if (impact && !view.reducedMotion) {
      resetTween(engine, 'impact-ring', { target: 'Transform.scaleX', from: 0.45, to: 1.35, elapsed: 0, duration: 22, easing: 'easeOut', done: false });
      resetTween(engine, 'impact-copy', { target: 'Transform.y', from: 160, to: 112, elapsed: 0, duration: 24, easing: 'easeOut', done: false });
    }
  };

  return { update, destroy: () => { engine.stop(); renderer.destroy(); } };
}
