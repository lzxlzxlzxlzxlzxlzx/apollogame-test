// Presentation contract only. No animation frame may write combat state.
export type Point = { x: number; y: number };
export interface ActionBinding {
  unit: string;
  template: 'shared-melee' | 'dive';
  root: 'feet-center' | 'body-center';
  canvas: { width: number; height: number } | null;
  anchors: Record<string, Point | null>;
  clips: Record<string, { source: string | null; frames: number; referenceFps: number | null }>;
  facing: 'right';
  background: 'transparent';
  uniformScale: readonly [number, number];
  playbackRate: readonly [number, number];
  anchorTolerancePx: number;
  debugRangeTolerance: number;
  slashBoundaryTolerance: number;
  feedbackDelayTicks: number;
}
function binding(unit: string, template: ActionBinding['template'], names: string[]): ActionBinding {
  return {
    unit, template, root: template === 'dive' ? 'body-center' : 'feet-center',
    canvas: null,
    anchors: template === 'dive' ? { root: null, body: null, contact: null } : { root: null, body: null, grip: null, effectOrigin: null },
    clips: Object.fromEntries(names.map(name => [name, { source: null, frames: 0, referenceFps: null }])),
    facing: 'right', background: 'transparent', uniformScale: [.8, 1.2], playbackRate: [.75, 1.5],
    anchorTolerancePx: 1, debugRangeTolerance: 0, slashBoundaryTolerance: .05, feedbackDelayTicks: 0,
  };
}
export const actionBindings = [
  binding('vindicator', 'shared-melee', ['idle', 'axe-windup', 'axe-release', 'axe-recovery']),
  binding('zombie', 'shared-melee', ['idle', 'arm-windup', 'sweep-release', 'arm-recovery']),
  binding('vex', 'dive', ['hover', 'prepare', 'dive', 'contact', 'rise', 'hover-recovery']),
];
export const presentationContract = {
  melee: { Ready: 'idle', Windup: 'windup', Active: 'release', Recovery: 'recovery' },
  contact: 'actual-damage-event',
  window: 'committed-status',
  cancel: 'exit-action-and-clear-pending-presentation-on-first-render',
  facing: 'capture-at-windup-and-retain',
  distantHit: 'attacker-finishes-in-place; feedback-at-target',
  height: 'presentation-only; never-change-world-transform-or-anchor',
} as const;
export function missingActionAssets(b: ActionBinding): string[] {
  return [
    ...(!b.canvas ? ['统一画布尺寸'] : []),
    ...Object.entries(b.anchors).filter(([,p]) => !p).map(([name]) => `挂点 ${name}`),
    ...Object.entries(b.clips).filter(([,c]) => !c.source || c.frames < 1 || !c.referenceFps).map(([name]) => `动作 ${name}`),
  ];
}
// Source-pixel coordinates relative to a fixed root. Mirroring affects every
// attachment through the same transform; it never stretches a weapon to a target.
export function anchorOffset(anchor: Point, root: Point, scale: number, facing: 1 | -1): Point {
  if (scale < .8 || scale > 1.2) throw new RangeError('需要更换适配素材：缩放超出 0.8–1.2');
  return { x: (anchor.x - root.x) * scale * facing, y: (anchor.y - root.y) * scale };
}
