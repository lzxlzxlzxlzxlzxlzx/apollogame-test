import { apolloOnyx } from '@zerocraft/engine/ui/components/apollo-kit.js';
import type { LayoutConstraints, LayoutNode, UITheme } from '@zerocraft/engine/ui/components/index.js';
import { LOCKPICK_SKINS, lockpickSkinUrl, type LockpickSkinMap } from './assets.js';
import type { LockpickView } from './presentation.js';

// House theme with only accessibility-token adjustments; LayoutNode data remains theme-agnostic.
export const LOCKPICK_THEME: UITheme = Object.freeze({ ...apolloOnyx, sub: '#d8dcf4', dim: '#b8bfdf' });
export const LOCKPICK_GIVE_UP = 'lockpick.ui.give-up';
export const LOCKPICK_CANCEL = 'lockpick.ui.cancel';
export const LOCKPICK_CONFIRM = 'lockpick.ui.confirm-give-up';

type ConsoleSpec = Readonly<{
  frame: keyof typeof LOCKPICK_SKINS;
  sourceWidth: number;
  sourceHeight: number;
  railX: readonly [number, number];
  rows: readonly number[];
  /** Per-frame calibration: contracts the end-stop travel without moving the centre stop. */
  thumbInset: number;
  /** Per-frame calibration for the independent knob art only. */
  rowOffset?: number;
}>;
const CONSOLE_SPECS: Readonly<Record<3 | 4 | 5, ConsoleSpec>> = Object.freeze({
  3: { frame: 'consoleFrame3', sourceWidth: 1496, sourceHeight: 708, railX: [151, 1343], rows: [172, 353, 535], thumbInset: 32 },
  4: { frame: 'consoleFrame4', sourceWidth: 1496, sourceHeight: 830, railX: [159, 1338], rows: [181, 337, 495, 650], thumbInset: 40, rowOffset: 4 },
  5: { frame: 'consoleFrame5', sourceWidth: 1466, sourceHeight: 880, railX: [165, 1300], rows: [141, 291, 440, 592, 738], thumbInset: 36 },
});
const CONSOLE_WIDTH = 720;
const LOCK_CANVAS = 300;
// Source coordinates are provided by the paired AI asset's ledger.  Keeping
// them here makes the skin assembly data-driven and avoids visual guessing.
const RELAY_ROTOR_SIZE = 118;

/**
 * The feedback count is deliberately visual-only: it is reconstructed from
 * the public aggregate ratio, never from target/current slot data.
 */
function feedbackStage(view: LockpickView): number {
  return Math.max(0, Math.min(view.slotCount, Math.round(view.correctProgress * view.slotCount)));
}

/** The lock body, movable shackle and aggregate-only relay remain separate. */
function lockAssembly(view: LockpickView, skins: LockpickSkinMap): LayoutNode {
  const unlocked = view.status === 'success';
  const stage = feedbackStage(view);
  // This is deliberately derived from the aggregate stage rather than a
  // slider value.  Each step is one shared ratchet detent, so it confirms
  // progress without telling the player which tumbler caused it.
  const relayRotation = -34 + (112 * stage) / Math.max(1, view.slotCount);
  const shackleLayout: LayoutConstraints = unlocked
    // A same-canvas closed pose travels to this lifted/rotated end pose. The
    // PUI transformFrom capability animates transform only—never opacity.
    ? { x: 20, y: -35, width: LOCK_CANVAS, height: LOCK_CANVAS, rotate: 24, transformFrom: { x: 0, y: 0, rotate: 0 }, transformMotionMs: 820, transformMotionEasing: 'ease-in-out' }
    : { x: 0, y: 0, width: LOCK_CANVAS, height: LOCK_CANVAS };
  return {
    type: 'Panel', id: 'lockpick-lock-assembly', props: { bare: true },
    layout: { width: LOCK_CANVAS, height: LOCK_CANVAS },
    children: [
      // Behind the body in both states; the success transform lifts its left
      // leg out while rotating around the right-side joint.
      { type: 'Image', id: 'lockpick-lock-shackle', props: { src: lockpickSkinUrl(skins, LOCKPICK_SKINS.lockShackle), alt: unlocked ? '已抬起的锁梁' : '闭合的锁梁', fit: 'contain' }, layout: shackleLayout },
      { type: 'Image', id: 'lockpick-lock-body', props: { src: lockpickSkinUrl(skins, LOCKPICK_SKINS.lockBody), alt: '机关锁锁体', fit: 'contain' }, layout: { x: 0, y: 0, width: LOCK_CANVAS, height: LOCK_CANVAS } },
      // A discrete relay ratchet makes an aggregate state change read as a
      // physical transmission.  The generic PUI transition preserves this
      // node and moves only its transform; the lens and markers then update
      // above it as the electrical confirmation.
      { type: 'Image', id: 'lockpick-relay-rotor', props: { src: lockpickSkinUrl(skins, LOCKPICK_SKINS.relayRotor), alt: '整体正确度继电棘轮', fit: 'contain' }, layout: {
        // The transparent rotor's visual centre is mounted on the lock body's
        // upper round socket (directly below the shackle), not its lower boss.
        x: (LOCK_CANVAS - RELAY_ROTOR_SIZE) / 2, y: 57,
        width: RELAY_ROTOR_SIZE, height: RELAY_ROTOR_SIZE, rotate: relayRotation,
        transformTransition: { ms: 280, easing: 'ease-out' }, allowOverlap: true,
      } },
    ],
  };
}

function tumbler(slot: number, value: number, skins: LockpickSkinMap, spec: ConsoleSpec, interactive: boolean): LayoutNode {
  const scale = CONSOLE_WIDTH / spec.sourceWidth;
  const thumbSize = 64;
  const left = spec.railX[0] * scale;
  const right = spec.railX[1] * scale;
  const row = spec.rows[slot]! * scale + (spec.rowOffset ?? 0);
  return {
    type: 'Panel', id: `lockpick-tumbler-${slot}`, props: { bare: true },
    layout: { x: left - thumbSize / 2, y: row - thumbSize / 2, width: right - left + thumbSize, height: thumbSize, direction: 'column', align: 'stretch' },
    children: [
      { type: 'Slider', id: `lockpick-slider-${slot}`, props: { min: 0, max: 2, step: 1, value, ...(interactive ? { action: `lockpick.ui.set.${slot}` } : { disabled: true }), thumbSkin: lockpickSkinUrl(skins, LOCKPICK_SKINS.tumblerKnob), thumbSize, trackHeight: thumbSize, thumbInset: spec.thumbInset, releaseSnap: true, motionMs: 150 } },
    ],
  };
}

function mechanismBoard(view: LockpickView, skins: LockpickSkinMap): LayoutNode {
  const spec = CONSOLE_SPECS[view.slotCount as 3 | 4 | 5] ?? CONSOLE_SPECS[3];
  const height = Math.round(spec.sourceHeight * CONSOLE_WIDTH / spec.sourceWidth);
  return {
    type: 'Panel', id: 'lockpick-tumblers', props: { bare: true }, layout: { width: CONSOLE_WIDTH, height, direction: 'column' }, children: [
      { type: 'Image', id: 'lockpick-console-frame-art', props: { src: lockpickSkinUrl(skins, LOCKPICK_SKINS[spec.frame]), alt: '机关锁固定轨道底板', fit: 'fill' }, layout: { x: 0, y: 0, width: CONSOLE_WIDTH, height } },
      ...view.values.map((value, slot) => tumbler(slot, value, skins, spec, view.status === 'playing')),
    ],
  };
}

function giveUpModal(): LayoutNode {
  return {
    type: 'Modal', id: 'lockpick-give-up-modal', props: { title: '确认放弃？', size: 'sm', closeAction: LOCKPICK_CANCEL },
    children: [{ type: 'Panel', id: 'lockpick-give-up-copy', props: { bg: 'sunken', edge: 'warn' }, layout: { direction: 'column', gap: 14, padding: 18, radius: 14 }, children: [
      { type: 'Label', id: 'lockpick-give-up-warning', props: { text: '放弃会结束本局；关闭或离开不会记为失败。', color: 'text', size: 'md' } },
      { type: 'Panel', id: 'lockpick-give-up-actions', props: { bare: true }, layout: { direction: 'row', gap: 12, justify: 'end' }, children: [
        { type: 'Button', id: 'lockpick-cancel', props: { label: '继续尝试', kind: 'ghost', action: LOCKPICK_CANCEL } },
        { type: 'Button', id: 'lockpick-confirm', props: { label: '确认放弃', kind: 'primary', action: LOCKPICK_CONFIRM }, layout: { fx: [{ kind: 'sheen-hover', color: 'warn', ms: 700 }] } },
      ] },
    ] }],
  };
}

export function buildLockpickScreen(view: LockpickView, confirmGiveUp = false, preview = false, skins: LockpickSkinMap = {}): LayoutNode {
  const terminal = view.status === 'success' || view.status === 'failure';
  // Retained argument compatibility: previews share the same stripped-back
  // lock-only composition and no longer place explanatory text above it.
  void preview;
  const consoleContent: LayoutNode[] = [
    mechanismBoard(view, skins),
    ...(terminal ? [{ type: 'Particles', id: 'lockpick-terminal-particles', props: { kind: 'sparkle', count: view.status === 'success' ? 20 : 8, loop: view.status === 'success', color: '#d4bd8a' }, layout: { width: 1, height: 1 } } as LayoutNode] : []),
  ];
  const screenChildren: LayoutNode[] = [
    { type: 'Panel', id: 'lockpick-console', props: { bare: true }, layout: { maxWidth: CONSOLE_WIDTH, direction: 'column', gap: 0, padding: 0, align: 'center' }, children: [
      lockAssembly(view, skins),
      ...consoleContent,
    ] },
  ];
  if (!terminal) screenChildren.push({ type: 'Button', id: 'lockpick-give-up', props: { label: '放弃本局', kind: 'primary', action: LOCKPICK_GIVE_UP, shape: 'cut' }, layout: { width: 190, fx: [{ kind: 'sheen-hover', color: 'warn', ms: 700 }] } });
  if (view.status === 'success') screenChildren.push({ type: 'Label', id: 'lockpick-success-title', props: { text: '成功', size: 'xxl', color: 'gold', bold: true, font: 'serif', stroke: true }, layout: { anim: 'pop', animMs: 520 } });
  if (confirmGiveUp && !terminal) screenChildren.push(giveUpModal());
  return {
    type: 'Screen', id: 'lockpick-root', props: { center: true, fill: true, bg: 'transparent' },
    layout: { direction: 'column', gap: 18, padding: 22, align: 'center', justify: 'center' },
    children: screenChildren,
  };
}

export function buildLockpickErrorScreen(message: string): LayoutNode {
  return { type: 'Screen', id: 'lockpick-error-root', props: { center: true, fill: true, bg: { custom: 'transparent' } }, layout: { padding: 24, align: 'center', justify: 'center' }, children: [{
    type: 'Panel', id: 'lockpick-error-card', props: { bg: 'blood', edge: 'danger', shadow: { y: 7, color: 'ink' } }, layout: { width: 560, maxWidth: 560, direction: 'column', gap: 12, padding: 28, radius: 22 }, children: [
      { type: 'Label', id: 'lockpick-error-title', props: { text: '无法启动机关锁', size: 'xl', color: 'text', bold: true } },
      { type: 'Label', id: 'lockpick-error-copy', props: { text: '本次配置无效，未创建游戏会话，也不会产生结果。', size: 'md', color: 'sub' } },
      { type: 'Label', id: 'lockpick-error-detail', props: { text: message, size: 'sm', color: 'warn', mono: true } },
    ],
  }] };
}
