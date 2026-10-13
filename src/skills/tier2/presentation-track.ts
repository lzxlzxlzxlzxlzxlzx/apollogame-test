import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import { sortedIds } from '@engine/core/query.js';
import { t } from '@engine/core/schema.js';
import { ease, EASINGS } from '@engine/math/ease.js';
import type {
  Color, PresentationChannel, PresentationPlayback, PresentationPoseValue, PresentationTarget,
  PresentationTrack, Signal, Sprite, Transform, Visibility,
} from '@engine/protocol/components.js';
import { appendTrace, findDebugTrace } from '@skills/debug-trace.js';

const CONTINUOUS = ['Transform.x', 'Transform.y', 'Transform.rotation', 'Transform.scaleX', 'Transform.scaleY', 'Color.alpha'] as const;
const DISCRETE = ['Visibility.visible', 'Visibility.active', 'Sprite.zOrder'] as const;
const TARGETS = [...CONTINUOUS, ...DISCRETE] as const;
const TARGET_SET = new Set<string>(TARGETS);
const CONTINUOUS_SET = new Set<string>(CONTINUOUS);
const EASING_SET = new Set<string>(EASINGS);

type Writable = Transform | Color | Visibility | Sprite;

function part(target: PresentationTarget): [string, string] {
  const dot = target.indexOf('.');
  return [target.slice(0, dot), target.slice(dot + 1)];
}

function component(world: IWorld, entity: string, target: PresentationTarget): Writable | undefined {
  return world.getComponent<Writable>(entity, part(target)[0]);
}

function read(world: IWorld, entity: string, target: PresentationTarget): number | boolean | undefined {
  const comp = component(world, entity, target);
  return comp ? (comp as unknown as Record<string, number | boolean>)[part(target)[1]] : undefined;
}

function write(world: IWorld, entity: string, entry: PresentationPoseValue): void {
  const comp = component(world, entity, entry.target)!;
  (comp as unknown as Record<string, number | boolean>)[part(entry.target)[1]] = entry.value;
}

function valueIsValid(target: string, value: unknown): boolean {
  if (target === 'Visibility.visible' || target === 'Visibility.active') return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value);
}

/** Exact rejection reason; no partial target writes occur until the entire track passes. */
export function checkPresentationTrack(world: IWorld, track: PresentationTrack): string | undefined {
  if (!track || typeof track.id !== 'string' || track.id.length === 0 || typeof track.targetEntity !== 'string' ||
      track.targetEntity.length === 0 || typeof track.playOnSignal !== 'string' || track.playOnSignal.length === 0) return 'identity';
  for (const name of ['pauseOnSignal', 'resumeOnSignal', 'resetOnSignal', 'skipOnSignal', 'doneSignal'] as const) {
    const value = track[name];
    if (value !== undefined && (typeof value !== 'string' || value.length === 0)) return `signal:${name}`;
  }
  if (!Array.isArray(track.channels) || track.channels.length === 0 || !Array.isArray(track.finalPose)) return 'channels/finalPose';
  if (!world.getAllEntities().includes(track.targetEntity)) return `missing-entity:${track.targetEntity}`;
  const targets = new Set<string>();
  for (const channel of track.channels) {
    if (!channel || !TARGET_SET.has(channel.target) || targets.has(channel.target)) return `target:${channel?.target}`;
    targets.add(channel.target);
    if (!component(world, track.targetEntity, channel.target)) return `missing-component:${channel.target}`;
    if (!valueIsValid(channel.target, read(world, track.targetEntity, channel.target))) return `component-value:${channel.target}`;
    if (!Array.isArray(channel.keyframes) || channel.keyframes.length === 0) return `keyframes:${channel.target}`;
    let previous = -1;
    for (const frame of channel.keyframes) {
      if (!frame || !Number.isSafeInteger(frame.at) || frame.at < 0 || frame.at <= previous) return `at:${channel.target}`;
      previous = frame.at;
      if (!valueIsValid(channel.target, frame.value)) return `value:${channel.target}`;
      if (CONTINUOUS_SET.has(channel.target)) {
        if (frame.easing !== undefined && !EASING_SET.has(frame.easing)) return `easing:${channel.target}`;
      } else if (frame.easing !== undefined) return `discrete-easing:${channel.target}`;
    }
  }
  const poseTargets = new Set<string>();
  for (const entry of track.finalPose) {
    if (!entry || !targets.has(entry.target) || poseTargets.has(entry.target) || !valueIsValid(entry.target, entry.value)) return `finalPose:${entry?.target}`;
    poseTargets.add(entry.target);
  }
  if (poseTargets.size !== targets.size) return 'finalPose:incomplete';
  return undefined;
}

function authorPose(world: IWorld, track: PresentationTrack): PresentationPoseValue[] {
  return track.channels.map((channel) => ({ target: channel.target, value: read(world, track.targetEntity, channel.target)! }));
}

function writePose(world: IWorld, track: PresentationTrack, pose: readonly PresentationPoseValue[]): void {
  for (const entry of pose) write(world, track.targetEntity, entry);
}

function sample(channel: PresentationChannel, at: number, author: number | boolean): number | boolean {
  const frames = channel.keyframes;
  if (at < frames[0].at) return author;
  let left = frames[0];
  for (let i = 1; i < frames.length; i++) {
    const right = frames[i];
    if (at < right.at) {
      if (!CONTINUOUS_SET.has(channel.target)) return left.value;
      const progress = (at - left.at) / (right.at - left.at);
      return (left.value as number) + ((right.value as number) - (left.value as number)) * ease(right.easing ?? 'linear', progress);
    }
    left = right;
  }
  return left.value;
}

function duration(track: PresentationTrack): number {
  let end = 0;
  for (const channel of track.channels) end = Math.max(end, channel.keyframes[channel.keyframes.length - 1].at);
  return end;
}

function markDone(track: PresentationTrack, playback: PresentationPlayback): void {
  playback.status = 'done';
  playback.done = true;
  playback.pendingDone = !!track.doneSignal;
}

const KeyframeSchema = t.obj({ at: t.num(), value: t.any(), easing: t.opt(t.enum(EASINGS)) });
const ChannelSchema = t.obj({ target: t.enum(TARGETS), keyframes: t.arr(KeyframeSchema) });
const PoseSchema = t.obj({ target: t.enum(TARGETS), value: t.any() });

export const presentationTrackCapability = defineCapability({
  id: 't2-presentation-track',
  version: '1.0.0',
  describe: {
    name: 'presentation-track',
    summary: '信号触发的二维多段 keyframe 表现轨道；多实体/多字段并行，固定 tick 暂停、恢复、重播、跳过到统一终态。',
    semantic: ['tier2', 'presentation', 'keyframe', 'animation'],
    whenToUse: '抽牌、开箱、发牌、结算飞入等需要多实体多段演出和一拍跳过的场景；Timeline 管阶段 cue，本能力管实体位姿。',
    examples: ["PresentationTrack{type:'PresentationTrack',id:'intro',targetEntity:'pack',playOnSignal:'intro:start',skipOnSignal:'intro:skip',channels:[{target:'Transform.x',keyframes:[{at:0,value:0},{at:30,value:100,easing:'easeOut'}]}],finalPose:[{target:'Transform.x',value:100}],doneSignal:'intro:done'}"],
  },
  components: {
    provides: {
      PresentationTrack: {
        category: 'config', describe: '轨道配置：单目标实体、多并行 channel、逐字段 finalPose 与信号控制。',
        fields: {
          id: { type: 'string', describe: '轨道 id' }, targetEntity: { type: 'EntityId', describe: '目标实体' },
          playOnSignal: { type: 'string', describe: '起播信号' }, channels: { type: 'string', describe: 'keyframe channel 数组' },
          finalPose: { type: 'string', describe: '与 channel 字段集相同的终态' },
        },
        schema: t.obj({ id: t.str(), targetEntity: t.entity(), playOnSignal: t.str(),
          pauseOnSignal: t.opt(t.str()), resumeOnSignal: t.opt(t.str()), resetOnSignal: t.opt(t.str()),
          skipOnSignal: t.opt(t.str()), channels: t.arr(ChannelSchema), finalPose: t.arr(PoseSchema), doneSignal: t.opt(t.str()) }),
      },
      PresentationPlayback: {
        category: 'config', describe: '确定性播放游标与作者态；随快照保存，不由游戏作者填写。',
        fields: { cursor: { type: 'number', describe: '当前整数 tick' }, status: { type: 'string', describe: 'idle|playing|paused|done' },
          done: { type: 'boolean', describe: '终态已落定' }, pendingDone: { type: 'boolean', describe: '待下拍发完成信号' },
          authorPose: { type: 'string', describe: '原始字段值' },
          seq: { type: 'number', describe: '完成信号实体序号' }, emitted: { type: 'string[]', describe: '待回收瞬时信号实体' } },
      },
    },
    reads: ['PresentationTrack', 'PresentationPlayback', 'Signal', 'Transform', 'Color', 'Visibility', 'Sprite', 'DebugTrace'],
    writes: ['PresentationPlayback', 'Signal', 'Transform', 'Color', 'Visibility', 'Sprite', 'DebugTrace'],
    consumes: [],
  },
  config: {},
  systems: [{
    id: 'presentation-track-done', phase: SystemPhase.Resolve,
    reads: ['PresentationTrack', 'PresentationPlayback'],
    writes: ['PresentationPlayback', 'Signal'], consumes: [],
    execute(world) {
      for (const owner of sortedIds(world, 'PresentationTrack', 'PresentationPlayback')) {
        const track = world.getComponent<PresentationTrack>(owner, 'PresentationTrack')!;
        const playback = world.getComponent<PresentationPlayback>(owner, 'PresentationPlayback')!;
        for (const entity of playback.emitted) world.destroyEntity(entity);
        playback.emitted = [];
        if (!playback.pendingDone || !track.doneSignal) continue;
        playback.pendingDone = false;
        const entity = `pt:${owner}#${playback.seq++}`;
        world.createEntity(entity);
        world.addComponent<Signal>(entity, { type: 'Signal', name: track.doneSignal, source: owner });
        playback.emitted.push(entity);
      }
    },
  }, {
    id: 'presentation-track', phase: SystemPhase.Commit,
    // Final presentation projection in Commit: these peers also RMW Signal/Transform/Color/
    // Visibility/Sprite. Explicit order overrides reverse inferred edges instead of relying
    // on the topological sorter's deterministic-but-semantic-agnostic cycle fallback.
    runsAfter: ['anim-state', 'bounds-clamp', 'cooldown', 'craft-recipe', 'discrete-combination-session',
      'effect-apply', 'facing', 'life-npc-schedule-position', 'match-view-sync'],
    reads: ['PresentationTrack', 'PresentationPlayback', 'Signal', 'Transform', 'Color', 'Visibility', 'Sprite', 'DebugTrace'],
    writes: ['PresentationPlayback', 'Signal', 'Transform', 'Color', 'Visibility', 'Sprite', 'DebugTrace'],
    consumes: [],
    execute(world) {
      const owners = sortedIds(world, 'PresentationTrack');
      if (owners.length === 0) return;
      const signals = new Set<string>();
      for (const entity of sortedIds(world, 'Signal')) {
        const signal = world.getComponent<Signal>(entity, 'Signal');
        if (signal) signals.add(signal.name);
      }
      const trace = findDebugTrace(world);
      const claims = new Map<string, string>();
      for (const owner of owners) {
        const track = world.getComponent<PresentationTrack>(owner, 'PresentationTrack')!;
        let pb = world.getComponent<PresentationPlayback>(owner, 'PresentationPlayback');
        if (!pb) {
          pb = { type: 'PresentationPlayback', cursor: 0, status: 'idle', done: false, pendingDone: false, authorPose: [], seq: 0, emitted: [] };
          world.addComponent(owner, pb);
        }
        const reset = !!track.resetOnSignal && signals.has(track.resetOnSignal);
        const play = signals.has(track.playOnSignal);
        const skip = !!track.skipOnSignal && signals.has(track.skipOnSignal) && pb.status !== 'done';
        const active = pb.status === 'playing' || pb.status === 'paused';
        if (!reset && !play && !skip && !active) continue;
        const invalid = checkPresentationTrack(world, track);
        if (invalid) {
          pb.status = 'idle';
          if (trace) appendTrace(trace, trace.tick ?? 0, 'presentation-track', 'reject', `${owner}:${invalid}`);
          continue;
        }
        const fields = track.channels.map((channel) => `${track.targetEntity}/${channel.target}`);
        const conflict = fields.find((field) => claims.has(field));
        if (conflict) {
          pb.status = 'idle';
          if (trace) appendTrace(trace, trace.tick ?? 0, 'presentation-track', 'reject', `${owner}:field-conflict:${conflict}`, `winner=${claims.get(conflict)}`);
          continue;
        }
        for (const field of fields) claims.set(field, owner);
        if (reset) {
          if (pb.authorPose.length > 0) writePose(world, track, pb.authorPose);
          pb.cursor = 0; pb.status = 'idle'; pb.done = false; pb.pendingDone = false;
          if (trace) appendTrace(trace, trace.tick ?? 0, 'presentation-track', 'transition', `${owner}:reset`);
          continue;
        }
        if (play) {
          if (pb.authorPose.length === 0) pb.authorPose = authorPose(world, track);
          else writePose(world, track, pb.authorPose);
          pb.cursor = 0; pb.status = 'playing'; pb.done = false; pb.pendingDone = false;
          if (trace) appendTrace(trace, trace.tick ?? 0, 'presentation-track', 'transition', `${owner}:play`);
        }
        if (skip) {
          if (pb.authorPose.length === 0) pb.authorPose = authorPose(world, track);
          writePose(world, track, track.finalPose);
          markDone(track, pb);
          if (trace) appendTrace(trace, trace.tick ?? 0, 'presentation-track', 'commit', `${owner}:skip-final`);
          continue;
        }
        if (track.pauseOnSignal && signals.has(track.pauseOnSignal)) pb.status = 'paused';
        else if (track.resumeOnSignal && signals.has(track.resumeOnSignal) && pb.status === 'paused') pb.status = 'playing';
        if (pb.status !== 'playing') continue;
        const end = duration(track);
        if (pb.cursor >= end) {
          writePose(world, track, track.finalPose);
          markDone(track, pb);
          if (trace) appendTrace(trace, trace.tick ?? 0, 'presentation-track', 'commit', `${owner}:natural-final`);
          continue;
        }
        for (let i = 0; i < track.channels.length; i++) {
          const channel = track.channels[i];
          write(world, track.targetEntity, { target: channel.target, value: sample(channel, pb.cursor, pb.authorPose[i].value) });
        }
        pb.cursor += 1;
      }
    },
  }],
});
