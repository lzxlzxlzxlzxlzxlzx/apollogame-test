import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { Steering, Transform, Velocity, Relation, Status, Tag } from '@engine/protocol/components.js';
import { queryRange } from '@atom-skills/index.js';
import { len } from '@engine/math/vec2.js';

// 群体分离（REQ-SURVIVOR群体①·seek 专属）：在 separation.radius 内被同群邻居线性衰减斥力推开，
// 叠加到基础转向后连同 clamp 回 speed。同群=给 tagMask 按 Tag.flags 位筛，否则只认带 Steering 的邻居
// （不推开玩家/子弹）。确定性：邻居 id 排序遍历 + IEEE 数学；完全重合(d=0)本 tick 跳过（近距斥力已强，
// 实际到不了精确重合）。缺 separation/radius≤0/weight≤0 → no-op（零回归）。
function applySeparation(world: IWorld, id: string, t: Transform, s: Steering, v: Velocity): void {
  const sep = s.separation;
  if (!sep || !(sep.radius > 0) || !(sep.weight > 0)) return;
  const neighbors = queryRange(world, t.x, t.y, sep.radius).slice().sort();
  let rx = 0;
  let ry = 0;
  for (const nid of neighbors) {
    if (nid === id) continue;
    if (sep.tagMask !== undefined) {
      const tag = world.getComponent<Tag>(nid, 'Tag');
      if (!tag || (tag.flags & sep.tagMask) === 0) continue;
    } else if (!world.getComponent<Steering>(nid, 'Steering')) {
      continue; // 缺省只与其它群体成员（带 Steering）互斥
    }
    const nt = world.getComponent<Transform>(nid, 'Transform');
    if (!nt) continue;
    const dx = t.x - nt.x;
    const dy = t.y - nt.y;
    const d = len(dx, dy);
    if (d === 0) continue; // 完全重合：本 tick 不加（避免除零/无定向）
    const falloff = 1 - d / sep.radius; // 线性衰减：越近越强（(0,1]）
    if (falloff <= 0) continue;
    rx += (dx / d) * falloff;
    ry += (dy / d) * falloff;
  }
  if (rx === 0 && ry === 0) return;
  v.vx += sep.weight * rx;
  v.vy += sep.weight * ry;
  // clamp 到 speed（分离不让整体超过设定速度）。
  const m = len(v.vx, v.vy);
  if (m > s.speed) {
    v.vx = (v.vx / m) * s.speed;
    v.vy = (v.vy / m) * s.speed;
  }
}

// ═══════════════════════════════════════════════════════════════
//  steering —— 数据驱动 AI 的「转向」段（D-001）。读自身 Relation{kind:'target'}（由 aggro 写）→ 朝目标
//  seek（追逐，到 stopRange 停=攻击距离）或 flee（远离）→ 写 Velocity（被 motion-apply 积分、受碰撞/摩擦介入）。
//  无目标（aggro 没锁到/被清）→ 停（idle）。这是把单体 AI 拆开后的"运动意图"原子，与 aggro(感知) 配对。
//
//  库 ai-chase = state + spatial-query(nearest) + relation(target) + transform + **velocity** 的转向段。
//  模式(seek/flee)是 config；"巡逻↔追击↔逃跑"的转移交给 state+condition 当数据，不焊进本组件（保持单一职责）。
//  CC：自身 Status 含 haltStatusMask 位（冻结/眩晕/定身）→ 速度归零（被控不动）。
//
//  确定性：方向归一化用 IEEE sqrt/÷（与 collision-resolve 同属确定性浮点类，Velocity 不被 Condition 读 → 安全）。
//  定序：读 Relation(aggro 写)→自动排在 aggro 之后；读 Transform/写 Velocity 与 motion-apply 互为前驱=环，
//  显式 runsBefore:['motion-apply'] 打破（先定速度再移动）。
// ═══════════════════════════════════════════════════════════════

export const steeringCapability = defineCapability({
  id: 't2-steering',
  version: '1.0.0',

  describe: {
    name: 'steering',
    summary: '转向：读自身 Relation(target) → 朝它 seek(到 stopRange 停)或 flee(远离) → 写 Velocity；无目标/被 CC 则停。与 aggro 配对成追逐/逃跑 AI。',
    semantic: ['tier2', 'ai', 'steering', 'movement'],
    whenToUse:
      '让实体朝/背 Relation(target) 移动而不写 AI 代码。配 aggro(写 target)+motion-apply(移动)。挂 Steering{mode,speed,stopRange,haltStatusMask?}。',
    examples: [
      '追逐：Steering{ mode:"seek", speed:1.5, stopRange:20 } + aggro → 追到攻击距离停',
      '放风筝：Steering{ mode:"flee", speed:2, stopRange:0 } → 远离目标',
      'CC 定身：haltStatusMask:FROZEN → 被冻结时速度归零',
    ],
  },

  components: {
    provides: {
      Steering: {
        category: 'config',
        describe: '声明「朝自身 Relation(target) seek/flee → 写 Velocity」。模式/速度/停止距离/CC 掩码全是数。',
        fields: {
          mode: { type: 'string', describe: "'seek'(朝目标,到 stopRange 停) | 'flee'(远离目标)" },
          speed: { type: 'number', describe: '移动速度（写入 Velocity 模长，单位/tick）' },
          stopRange: { type: 'number', describe: 'seek 到此距离内即停（攻击/保持距离）；flee 忽略' },
          haltStatusMask: { type: 'number', describe: '自身 Status 含这些位时停止行动（冻结/眩晕/定身 CC）' },
          separation: { type: 'string', describe: '群体分离 {radius,weight,tagMask?}：seek 时被半径内同群邻居线性衰减斥开→防敌群挤成一点、环绕目标（幸存者/RTS/塔防）。缺省无=纯 seek/flee 零回归' },
        },
      },
    },
    reads: ['Steering', 'Transform', 'Relation', 'Velocity', 'Status', 'Tag'],
    writes: ['Velocity'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'steering',
      // runsBefore motion-apply：先定速度再移动（破 读Transform/写Velocity 与 motion 的 RMW 环）。
      // runsBefore hitbox/over-time：steering 读 Status 做 CC（定身），而 Status 由 hitbox/over-time 在
      // motion→overlap→trigger→hitbox 链末尾写 → 否则 steering→…→hitbox→steering 成一拍反馈环。
      // 声明 steering 跑在状态施加者之前 = 读"上一拍"的 Status（冻结延迟一帧生效，与 Condition→Effect 同纪律）。
      // 这两个 id 在无 hitbox/over-time 的世界里被忽略（steering 仍可独立用）。
      runsBefore: ['motion-apply', 'hitbox', 'over-time'],
      reads: ['Steering', 'Transform', 'Relation', 'Velocity', 'Status', 'Tag'],
      writes: ['Velocity'],
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'Steering', 'Transform');
        for (const id of ids) {
          const s = world.getComponent<Steering>(id, 'Steering')!;
          const t = world.getComponent<Transform>(id, 'Transform')!;

          let v = world.getComponent<Velocity>(id, 'Velocity');
          if (!v) {
            world.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
            v = world.getComponent<Velocity>(id, 'Velocity')!;
          }

          // 被控（冻结/眩晕/定身）→ 停。
          if (s.haltStatusMask) {
            const st = world.getComponent<Status>(id, 'Status');
            if (st && (st.flags & s.haltStatusMask) !== 0) {
              v.vx = 0;
              v.vy = 0;
              continue;
            }
          }

          // 读自身锁定的目标（aggro 写的 Relation(target)）。
          const rel = world.getComponent<Relation>(id, 'Relation');
          const tt = rel && rel.kind === 'target' ? world.getComponent<Transform>(rel.targetId, 'Transform') : undefined;
          if (!tt) {
            v.vx = 0;
            v.vy = 0;
            continue; // 无目标 → idle。
          }

          const dx = tt.x - t.x;
          const dy = tt.y - t.y;
          const dist = len(dx, dy);
          if (dist === 0) {
            v.vx = 0;
            v.vy = 0;
            continue;
          }
          const ux = dx / dist;
          const uy = dy / dist;
          if (s.mode === 'flee') {
            v.vx = -ux * s.speed;
            v.vy = -uy * s.speed;
          } else {
            if (dist <= s.stopRange) {
              v.vx = 0;
              v.vy = 0;
            } else {
              v.vx = ux * s.speed;
              v.vy = uy * s.speed;
            }
            // 群体分离（seek 专属·含 stopRange 环绕）：斥力叠加到基础转向、clamp 回 speed。
            applySeparation(world, id, t, s, v);
          }
        }
      },
    },
  ],
});
