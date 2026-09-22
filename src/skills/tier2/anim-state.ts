import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { AnimState, AnimClip, Frame, Velocity, State, Sprite, Relation } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  anim-state —— 动作动画状态机（周期表 anim-state-machine = state + transition-rules + animation）。
//  数据=clip 表(状态名→{sheet?,from,count,fps,loop})；引擎=按"当前状态"选 clip、在 clip 帧区间内推 Frame.index。
//  复用现成 sprite-sheet 资产 + 渲染器(resolve(textureKey,frame.index) 画帧)，不重造帧/图。
//
//  当前状态两种来源：
//    · 显式 fsmId：读 State{fsmId}.current 当 clip 名（游戏数据/逻辑设 attack/die/hurt…）。
//    · 自动(无 fsmId)：按 Velocity 自动 move/idle（移动播 moveClip、静止播 idleClip）——简单实体零额外数据就会走/站。
//  切 clip → 复位到 clip.from；每 fps tick 推一帧；loop 则回到 from、否则停在末帧。clip.sheet 设了则切 Sprite.textureKey。
//
//  铁律(animation.md)：**动画只表现、绝不驱动伤害/逻辑**——伤害靠 Timer/逻辑，本系统只读 Velocity/State、只写 Frame/Sprite。
//  定序：Commit 相位（读已结算的最终 Velocity 决定 move/idle）；只写表现组件、无 sim 系统读其输出 → 无环。
//  确定性：整数 tick 计数 + 由 Velocity(sim) 派生 → 录放一致（Frame/Sprite 进 hash 但确定）。
// ═══════════════════════════════════════════════════════════════

const MOVING_EPS = 1e-6;

export const animStateCapability = defineCapability({
  id: 't2-anim-state',
  version: '1.0.0',

  describe: {
    name: 'anim-state',
    summary: '动作动画状态机：clip 表(状态→帧区间)，按 State{fsmId} 或 Velocity 选 clip、在区间内推 Frame.index 驱动 sprite-sheet。动画只表现、不驱动逻辑。',
    semantic: ['tier2', 'animation', 'render'],
    whenToUse:
      '让实体按状态播不同动作动画(走/站/打/死)而不写动画代码。挂 AnimState{clips,moveClip,idleClip,fsmId?} + Frame + Sprite(sprite-sheet key)。简单实体自动 走/站；复杂实体用 State{fsmId} 驱动 attack/die。',
    examples: [
      '怪自动走/站：AnimState{ clips:{walk:{from:0,count:4,fps:6,loop:true}, idle:{from:0,count:1,fps:1,loop:false}}, moveClip:"walk", idleClip:"idle" }',
      '英雄攻击：fsmId:"anim" + 逻辑 set-state("anim","attack") → 播 attack clip',
      '多张图：clip.sheet 指定该动作的 sprite-sheet → 切 Sprite.textureKey',
    ],
  },

  components: {
    provides: {
      AnimState: {
        category: 'config',
        describe: '动作动画状态机：clips(状态→{sheet?,from,count,fps,loop})；fsmId 设则读 State 否则按 Velocity 自动 move/idle。',
        fields: {
          clips: { type: 'string', describe: 'Record<状态名, {sheet?,from,count,fps,loop}>（复杂对象）' },
          fsmId: { type: 'string', describe: '读 State{fsmId}.current 当 clip 名；缺省=按 Velocity 自动' },
          moveClip: { type: 'string', describe: '自动模式：移动时的 clip 名' },
          idleClip: { type: 'string', describe: '自动模式：静止时的 clip 名' },
          attackClip: { type: 'string', describe: '自动模式：站定且有 Relation(target) 时的 clip 名（攻击）；缺省站立' },
          current: { type: 'string', describe: '内部：当前 clip 名' },
          elapsed: { type: 'number', describe: '内部：当前帧已播 tick' },
        },
      },
    },
    reads: ['AnimState', 'Frame', 'Velocity', 'State', 'Sprite', 'Relation'],
    writes: ['AnimState', 'Frame', 'Sprite'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'anim-state',
      phase: SystemPhase.Commit, // 读已结算的最终 Velocity 决定 move/idle
      reads: ['AnimState', 'Frame', 'Velocity', 'State', 'Sprite', 'Relation'], // Relation=宿主链上溯（申报对账·根因①·系统级此前漏）
      writes: ['AnimState', 'Frame', 'Sprite'],
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'AnimState', 'Frame');
        for (const id of ids) {
          const as = world.getComponent<AnimState>(id, 'AnimState')!;
          const frame = world.getComponent<Frame>(id, 'Frame')!;

          // ① 决定目标 clip。
          let want: string | undefined;
          if (as.fsmId) {
            const st = world.getComponent<State>(id, 'State');
            if (st && st.fsmId === as.fsmId) want = st.current;
          }
          if (want === undefined || as.clips[want] === undefined) {
            const v = world.getComponent<Velocity>(id, 'Velocity');
            const moving = v !== undefined && v.vx * v.vx + v.vy * v.vy > MOVING_EPS;
            if (moving) {
              want = as.moveClip; // 移动 → 走
            } else if (as.attackClip) {
              // 站定且有锁定目标（追到目标身边）→ 攻击；否则站立。
              const rel = world.getComponent<Relation>(id, 'Relation');
              want = rel !== undefined && rel.kind === 'target' ? as.attackClip : as.idleClip;
            } else {
              want = as.idleClip;
            }
          }
          let clip: AnimClip | undefined = as.clips[want];
          if (clip === undefined) {
            want = as.current;
            clip = as.clips[want];
          }
          if (clip === undefined) continue;

          // ② 切 clip → 复位；clip.sheet 切贴图。
          if (want !== as.current) {
            as.current = want;
            as.elapsed = 0;
            frame.index = clip.from;
            frame.total = clip.from + clip.count;
            if (clip.sheet) {
              const spr = world.getComponent<Sprite>(id, 'Sprite');
              if (spr) spr.textureKey = clip.sheet;
            }
          } else if (clip.count > 1) {
            // ③ 推帧（每 fps tick 一帧；loop 回 from，否则停末帧）。
            as.elapsed += 1;
            const fps = clip.fps >= 1 ? clip.fps : 1;
            if (as.elapsed >= fps) {
              as.elapsed = 0;
              let next = frame.index + 1;
              const end = clip.from + clip.count;
              if (next >= end) next = clip.loop ? clip.from : end - 1;
              frame.index = next;
            }
          }
        }
      },
    },
  ],
});
