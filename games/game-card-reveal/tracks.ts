import type { PresentationChannel, PresentationKeyframe, PresentationTarget, PresentationTrack } from '@zerocraft/engine/engine/protocol/components.js';
import { finalLayout, msToTicks, stageTicks, type MotionMode } from './timing.js';

export const ACTION = Object.freeze({ start: 'reveal.start', pause: 'reveal.pause', resume: 'reveal.resume', skip: 'reveal.skip', retry: 'reveal.retry', exit: 'reveal.exit' });
export const SIGNAL = Object.freeze({ start: 'reveal:start', pause: 'reveal:pause', resume: 'reveal:resume', skip: 'reveal:skip', skipped: 'reveal:skipped', natural: 'reveal:natural' });
export interface TrackRow { readonly owner: string; readonly track: Omit<PresentationTrack, 'type'> }
const ringPose = (index: number, degrees = 0): { x: number; y: number; scale: number; depth: number } => {
  const radians = (111 + index * 45 + degrees) * Math.PI / 180;
  const depth = Math.sin(radians);
  return { x: 720 + 330 * Math.cos(radians), y: 400 + 135 * depth, scale: 0.375 * (0.9 + 0.18 * depth), depth };
};
const ring = Array.from({ length: 8 }, (_, index) => ringPose(index));
export const RING_PACK_POSITIONS = ring;
const ch = (target: PresentationTarget, frames: PresentationKeyframe[]): PresentationChannel => ({ target, keyframes: frames });
const f = (at: number, value: number | boolean, easing?: PresentationKeyframe['easing']): PresentationKeyframe => easing ? { at, value, easing } : { at, value };
function row(owner: string, targetEntity: string, playOnSignal: string, channels: PresentationChannel[], doneSignal?: string, skipOnSignal?: string): TrackRow {
  return { owner, track: { id: owner, targetEntity, playOnSignal, pauseOnSignal: SIGNAL.pause, resumeOnSignal: SIGNAL.resume,
    ...(skipOnSignal ? { skipOnSignal } : {}), channels,
    finalPose: channels.map((channel) => ({ target: channel.target, value: channel.keyframes[channel.keyframes.length - 1].value })),
    ...(doneSignal ? { doneSignal } : {}) } };
}
function terminal(owner: string, targetEntity: string, fields: readonly [PresentationTarget, number | boolean][], doneSignal?: string): TrackRow {
  return row(owner, targetEntity, 'reveal:never', fields.map(([target, value]) => ch(target, [f(0, value)])), doneSignal, SIGNAL.skip);
}
const p4Start = (index: number): string => index === 0 ? 'reveal:p3:done' : `reveal:p4:${index - 1}:done`;
const packId = (index: number): string => `pack-${index}`;
const cardId = (index: number): string => `card-${index}`;
const queuedX = (index: number): number => 1620 + index * 20;

/** Pure authored keyframe rows; the engine interprets every frame and transition. */
export function buildCardRevealTracks(count: number, mode: MotionMode, cardSizes: readonly Readonly<{ width: number; height: number }>[] = []): readonly TrackRow[] {
  const t = stageTicks(mode, count);
  const p2End = t.p2 - 1, p3End = t.p3 - 1, p4End = t.p4Card - 1, p5End = t.p5 - 1;
  const rows: TrackRow[] = [];
  const establish = mode === 'standard' ? msToTicks(200) : msToTicks(250);
  const spinEnd = mode === 'standard' ? msToTicks(1100) : establish + 1;
  const lockAt = mode === 'standard' ? msToTicks(1400) : msToTicks(400);
  for (let i = 0; i < 8; i++) {
    const selected = i === 3;
    const pos = ring[i];
    const locked = ringPose(i, mode === 'standard' ? 204 : 0);
    const outwardX = 720 + (locked.x - 720) * 1.8;
    const outwardY = 410 + (locked.y - 410) * 1.8;
    const motion: { at: number; pose: ReturnType<typeof ringPose> }[] = [{ at: establish, pose: pos }];
    if (mode === 'standard') {
      for (let step = 1; step <= 8; step++) motion.push({ at: establish + Math.round((spinEnd - establish) * step / 8), pose: ringPose(i, 184 * step / 8) });
      for (let step = 1; step <= 3; step++) {
        const u = step / 3;
        motion.push({ at: spinEnd + Math.round((lockAt - spinEnd) * u), pose: ringPose(i, 184 + 20 * (1 - (1 - u) ** 3)) });
      }
    } else motion.push({ at: spinEnd, pose: pos }, { at: lockAt, pose: pos });
    const path = (start: number, pick: (pose: ReturnType<typeof ringPose>) => number, end: number): PresentationKeyframe[] =>
      [f(0, start), ...motion.map(({ at, pose }) => f(at, pick(pose))), f(p2End, end, 'easeInOut')];
    rows.push(row(`p2-pack-${i}`, packId(i), SIGNAL.start, [
      ch('Transform.x', path(720, (pose) => pose.x, selected ? 720 : outwardX)),
      ch('Transform.y', path(400, (pose) => pose.y, selected ? 410 : outwardY)),
      ch('Transform.rotation', [f(0, 0), f(p2End, 0)]),
      ch('Transform.scaleX', path(0.05, (pose) => pose.scale, selected ? 1 : locked.scale * 0.75)),
      ch('Transform.scaleY', path(0.05, (pose) => pose.scale, selected ? 1 : locked.scale * 0.75)),
      ch('Color.alpha', [f(0, 0), f(establish, 1, 'easeOut'), f(lockAt, 1), f(p2End, selected ? 1 : 0, 'easeOut')]),
      ch('Sprite.zOrder', [f(0, 10 + i), ...motion.map(({ at, pose }) => f(at, 100 + Math.round(pose.depth * 50) + i)), f(p2End, selected ? 200 : 10 + i)]),
      ...selected ? [] : [ch('Visibility.visible', [f(0, true), f(p2End, false)])],
    ], selected ? 'reveal:p2:done' : undefined));
  }
  // P3: stop, stretch, one cut, top flies upper-right while body falls and cards rise.
  const cut = mode === 'standard' ? msToTicks(160) : msToTicks(70);
  const lift = mode === 'standard' ? msToTicks(320) : msToTicks(90);
  const fadeEnd = mode === 'standard' ? msToTicks(400) : msToTicks(150);
  const topEnd = mode === 'standard' ? msToTicks(480) : Math.max(cut + 1, p3End - 2);
  const bodyEnd = mode === 'standard' ? msToTicks(820) : Math.max(lift + 1, p3End - 2);
  rows.push(row('p3-pack-hide', 'pack-3', 'reveal:p2:done', [ch('Visibility.visible', [f(0, true), f(cut, false)])]));
  rows.push(row('p3-tear-top', 'tear-top', 'reveal:p2:done', [
    ch('Visibility.visible', [f(0, false), f(cut, true), f(topEnd, false)]),
    ch('Transform.x', [f(0, 720), f(cut, 720), f(topEnd, 1140, 'easeOut'), f(p3End, 1140)]),
    ch('Transform.y', [f(0, 160), f(cut, 160), f(topEnd, -130, 'easeOut'), f(p3End, -130)]),
    ch('Transform.rotation', [f(0, 0), f(cut, 0), f(topEnd, 0.78, 'easeOut'), f(p3End, 0.78)]),
  ]));
  rows.push(row('p3-tear-body', 'tear-body', 'reveal:p2:done', [
    ch('Visibility.visible', [f(0, false), f(cut, true), f(bodyEnd, false)]),
    ch('Transform.x', [f(0, 720), f(cut, 720), f(p3End, 720)]),
    ch('Transform.y', [f(0, 460), f(cut, 460), f(bodyEnd, 1000, 'easeIn'), f(p3End, 1050)]),
  ]));
  for (let i = 0; i < count; i++) rows.push(row(`p3-card-${i}`, cardId(i), 'reveal:p2:done', [
    ch('Visibility.visible', [f(0, false), f(lift, true)]),
    ch('Color.alpha', [f(0, 0), f(lift, 0), f(fadeEnd, 1, 'easeOut'), f(p3End, 1)]),
    ch('Transform.x', [f(0, 720 + i * 5), f(lift, 720 + i * 5), f(p3End, 720 + i * 5)]),
    ch('Transform.y', [f(0, 410 - i * 6), f(lift, 410 - i * 6), f(p3End, 360 - i * 6, 'easeOut')]),
    ch('Transform.rotation', [f(0, 0), f(p3End, -0.035 + i * 0.012)]),
    ch('Transform.scaleX', [f(0, 220 / (cardSizes[i]?.width ?? 260)), f(lift, 220 / (cardSizes[i]?.width ?? 260)), f(p3End, 1, 'easeOut')]),
    ch('Transform.scaleY', [f(0, 220 / (cardSizes[i]?.width ?? 260)), f(lift, 220 / (cardSizes[i]?.width ?? 260)), f(p3End, 1, 'easeOut')]),
  ], i === 0 ? 'reveal:p3:done' : undefined));
  // P4: the live top card sways, then flies right without alpha fade; hidden lower cards glide into place.
  for (let i = 0; i < count; i++) {
    const start = p4Start(i);
    const sway = mode === 'standard' ? msToTicks(180) : msToTicks(60);
    const fly = mode === 'standard' ? msToTicks(400) : msToTicks(100);
    const peak = mode === 'standard' ? msToTicks(450) : msToTicks(140);
    const x0 = 720, y0 = 360;
    rows.push(row(`p4-fly-${i}`, cardId(i), start, [
      ch('Transform.x', [f(0, x0), f(sway, x0), f(fly, x0 + 8, 'easeInOut'), f(peak, x0 - 6, 'easeInOut'), f(p4End, queuedX(i), 'easeOut')]),
      ch('Transform.y', [f(0, y0), f(sway, y0), f(fly, y0 - 4, 'easeInOut'), f(peak, y0 + 3), f(p4End, 300, 'easeOut')]),
      ch('Transform.rotation', mode === 'standard' ? [f(0, -0.035), f(sway, -0.035), f(fly, 0.028, 'easeInOut'), f(peak, -0.095, 'easeInOut'), f(p4End, 0.175, 'easeOut')] : [f(0, -0.035), f(sway, 0), f(p4End, 0)]),
      ch('Transform.scaleX', [f(0, 1), f(fly, 1), f(p4End, mode === 'standard' ? 1.07 : 1, 'easeOut')]),
      ch('Transform.scaleY', [f(0, 1), f(fly, 1), f(p4End, mode === 'standard' ? 1.07 : 1, 'easeOut')]),
    ], `reveal:p4:${i}:done`));
    for (let j = i + 1; j < count; j++) {
      const remaining = j - i;
      const shiftStart = mode === 'standard' ? msToTicks(400) : msToTicks(100);
      const shiftEnd = mode === 'standard' ? msToTicks(620) : msToTicks(210);
      rows.push(row(`p4-shift-${i}-${j}`, cardId(j), start, [
        ch('Transform.x', [f(0, 720 + remaining * 5), f(shiftStart, 720 + remaining * 5), f(shiftEnd, 720 + (remaining - 1) * 5, 'easeOut')]),
        ch('Transform.y', [f(0, 360 - remaining * 6), f(shiftStart, 360 - remaining * 6), f(shiftEnd, 360 - (remaining - 1) * 6, 'easeOut')]),
        ch('Transform.rotation', [f(0, -0.035 + remaining * 0.012), f(shiftStart, -0.035 + remaining * 0.012), f(shiftEnd, -0.035 + (remaining - 1) * 0.012, 'easeOut')]),
      ]));
    }
  }
  // P5: same instances return from queued poses; clock track adds the required stable tail.
  const layout = finalLayout(count);
  const p5Play = `reveal:p4:${count - 1}:done`;
  for (let i = 0; i < count; i++) {
    const begin = msToTicks(150 + i * (mode === 'standard' ? 120 : 70));
    const arrive = begin + msToTicks(mode === 'standard' ? 700 : 360);
    const scale = layout.width / (cardSizes[i]?.width ?? 260);
    const easeCubic = (u: number): number => 1 - (1 - u) * (1 - u) * (1 - u);
    const path = (start: number, end: number, arc = 0): PresentationKeyframe[] => {
      const points = [f(0, start), f(begin, start)];
      for (let step = 1; step <= 8; step++) {
        const u = step / 8;
        points.push(f(begin + Math.round((arrive - begin) * u), start + (end - start) * easeCubic(u) - arc * 4 * u * (1 - u)));
      }
      return points;
    };
    rows.push(row(`p5-card-${i}`, cardId(i), p5Play, [
      ch('Transform.x', path(queuedX(i), layout.x[i])),
      ch('Transform.y', path(300, 410, mode === 'standard' ? 50 : 0)),
      ch('Transform.rotation', [f(0, mode === 'standard' ? 0.175 : 0), f(begin, mode === 'standard' ? 0.175 : 0), f(arrive, 0, 'easeOut')]),
      ch('Transform.scaleX', [f(0, mode === 'standard' ? 1.07 : 1), f(begin, mode === 'standard' ? 1.07 : 1), f(Math.round((begin + arrive) / 2), mode === 'standard' ? scale * 1.04 : scale, 'easeOut'), f(arrive, scale, 'easeOut')]),
      ch('Transform.scaleY', [f(0, mode === 'standard' ? 1.07 : 1), f(begin, mode === 'standard' ? 1.07 : 1), f(Math.round((begin + arrive) / 2), mode === 'standard' ? scale * 1.04 : scale, 'easeOut'), f(arrive, scale, 'easeOut')]),
    ]));
  }
  rows.push(row('p5-clock', 'clock', p5Play, [ch('Transform.x', [f(0, 0), f(p5End, 0)])], SIGNAL.natural));
  // Lexicographically first terminal tracks win any concurrent active field claim on Skip.
  for (let i = 0; i < 8; i++) {
    const selected = i === 3, pos = ringPose(i, 204);
    rows.push(terminal(`a-final-pack-${i}`, packId(i), [
      ['Transform.x', selected ? 720 : 720 + (pos.x - 720) * 1.8],
      ['Transform.y', selected ? 410 : 410 + (pos.y - 410) * 1.8],
      ['Transform.rotation', 0], ['Transform.scaleX', selected ? 1 : pos.scale * 0.75],
      ['Transform.scaleY', selected ? 1 : pos.scale * 0.75], ['Color.alpha', selected ? 1 : 0], ['Visibility.visible', false],
      ['Sprite.zOrder', selected ? 200 : 10 + i],
    ]));
  }
  rows.push(terminal('a-final-tear-top', 'tear-top', [['Visibility.visible', false], ['Transform.x', 1140], ['Transform.y', -130], ['Transform.rotation', 0.78]]));
  rows.push(terminal('a-final-tear-body', 'tear-body', [['Visibility.visible', false], ['Transform.x', 720], ['Transform.y', 1050]]));
  for (let i = 0; i < count; i++) rows.push(terminal(`a-final-card-${i}`, cardId(i), [
    ['Visibility.visible', true], ['Transform.x', layout.x[i]], ['Transform.y', 410],
    ['Transform.rotation', 0], ['Transform.scaleX', layout.width / (cardSizes[i]?.width ?? 260)],
    ['Transform.scaleY', layout.width / (cardSizes[i]?.width ?? 260)],
    ['Color.alpha', 1], ['Sprite.zOrder', 20 + count - i],
  ]));
  rows.push(terminal('a-final-clock', 'clock', [['Transform.x', 0]], SIGNAL.skipped));
  return rows;
}
