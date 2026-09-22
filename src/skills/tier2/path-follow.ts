import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { PathFollow, Transform, Velocity, SpawnRequest, DestroyRequest } from '@engine/protocol/components.js';
import { cmpStr } from '@engine/math/scalar.js';
import { len as vecLen } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  path-follow —— 固定航点轨道匀速跑（REQ-PATHFOLLOW）。实体沿一条摆好的航点轨道（闭环或折线）依次
//  朝下个航点走，进 arriveRadius 算「到达」→ 游标前进（loop=回到航点0，否则停在末点）→ 写 Velocity
//  （不写 Transform，交 motion-apply 积分）。区别于 t2-steering 追/逃 Relation(target)（动态目标）、
//  t2-pathfind 绕障寻路到 Relation(target)（NavGraph+A*）——本能力是**固定轨道**，不索敌、不绕障、
//  不依赖 Relation：巡逻路线/传送带/固定弹道轨迹/环形跑道通用。
//
//  定序：与 steering/launch 完全同链——读 Transform/写 Velocity 与 motion-apply 互为前驱=环，
//  runsBefore:['motion-apply'] 打破（先定速度再移动）。不读 Relation/Status/Tag，故不与 aggro（写
//  Relation）/hitbox/over-time（写 Status）产生耦合——与索敌/抛射簇同装不成拓扑环（见回归测试）。
//
//  确定性：只用 IEEE sqrt/÷（求距一律 sqrt(dx*dx+dy*dy)；**不用 Math.hypot**——ES 规范不保证其正确舍入，V8/JSC 实现
//  可差 1 ULP → 跨端 lockstep 分叉·P0 治理围栏 zerocraft/no-transcendental 硬拦）；
//  无 Math.random/Date.now/墙钟。index 游标是运行时状态、进 snapshot，回放/rollback 安全。
//
//  queueId/minGap（REQ-CONVEYOR-CAP M1：有序不重叠占位 + 队列递进——传送带/排队通用，非 game102 专属）：
//  同 queueId 成员按「path 进度」pathProgress(wps,index,remainingDist) = 沿 waypoints 到 index 的累计弧长
//  − 到当前航点的剩余直线距离，排序（降序=离终点越近排越前）。每个非排头成员的「本 tick 有效前进量」夹在
//  「前一名（进度更高者）本 tick **起点**进度 − minGap」——用起点（非本 tick 终点）进度做界，避免同 tick
//  内产生"谁先算谁吃亏"的处理序依赖（前一名自己本 tick 也只会前进不会后退，界只会更松，不会有负值间隔）。
//  超界则按比例缩短本 tick 的速度矢量模长（保方向），压到 0 即原地不动（不倒退）；排头（组内进度最高者）
//  不受限、行为与不带 queueId 完全一致。tie-break：进度相同按 id 升序（与其余能力同款确定性口径）。
//  不设 queueId=零回归（现有 pathFollowAt/PathFollow 用法字节不变）。
//
//  onEnd（REQ-PATHEND-DROP：路径终点触发——传送带/巡逻绕完一圈→落一件+自毁，=Mortal 的 path-完成版）：
//  loop!==true 且游标已到末航点（index===len-1）且本 tick 在 arriveRadius 内 → 触发一次：dropTemplate 有则
//  发 SpawnRequest{templateId,x:自身,y:自身}（挂到独立 carrier 实体，同 mortal.ts dropTemplate 先例——
//  自身可能同 tick 被 destroy:true 销毁，挂自身的组件会随之消失、赶不上 prefab 消费）；destroy 为 true 则
//  发 DestroyRequest(self)。**fire-once**：实体到末点后会停在那（velocity 归零、d 仍 <=arriveRadius），
//  若不加守卫会每 tick 重发 SpawnRequest——用组件自带的 `ended` 布尔守卫（进 snapshot，确定性），触发即置
//  true、之后跳过。loop:true 永不触发（不读 onEnd）。定序：本系统 writes 补 SpawnRequest/DestroyRequest——
//  两者消费者（prefab 展开 / destroy-apply 移除）只读/consume 这两型、不写 PathFollow/Transform/Velocity，
//  故只产生"本系统→消费者"单向边，不与现有 runsAfter/runsBefore 成环（见回归测试）。
// ═══════════════════════════════════════════════════════════════

/** authoring 助手：由航点表 + 速度 + 选项算出 PathFollow 组件数据（index 初值 0）。供蓝图烤数据。 */
export function pathFollowAt(
  waypoints: { x: number; y: number }[],
  speed: number,
  opts?: {
    loop?: boolean;
    arriveRadius?: number;
    queueId?: string;
    minGap?: number;
    onEnd?: { dropTemplate?: string; destroy?: boolean };
  },
): Omit<PathFollow, 'type'> {
  return {
    waypoints,
    speed,
    index: 0,
    ...(opts?.loop !== undefined ? { loop: opts.loop } : {}),
    ...(opts?.arriveRadius !== undefined ? { arriveRadius: opts.arriveRadius } : {}),
    ...(opts?.queueId !== undefined ? { queueId: opts.queueId } : {}),
    ...(opts?.minGap !== undefined ? { minGap: opts.minGap } : {}),
    ...(opts?.onEnd !== undefined ? { onEnd: opts.onEnd } : {}),
  };
}

// 沿 waypoints 到 index 的累计弧长 − 到当前航点的剩余直线距离（见文件头 queueId/minGap 注释）。
// O(index) per call：waypoints 表通常几十项、成员数十——按 tick×成员重算足够快，避免额外缓存状态（简单优先）。
function pathProgress(wps: { x: number; y: number }[], index: number, remaining: number): number {
  let cum = 0;
  for (let k = 1; k <= index; k++) { const ex = wps[k].x - wps[k - 1].x, ey = wps[k].y - wps[k - 1].y; cum += vecLen(ex, ey); }
  return cum - remaining;
}

export const pathFollowCapability = defineCapability({
  id: 't2-path-follow',
  version: '1.0.0',

  describe: {
    name: 'path-follow',
    summary: '固定航点轨道匀速跑：沿 waypoints 依次朝下个航点走，进 arriveRadius 算到达→游标前进（loop=回到航点0，否则停在末点）→写 Velocity。不索敌/不绕障，巡逻路线/传送带/固定弹道通用。',
    semantic: ['tier2', 'movement', 'patrol', 'waypoint'],
    whenToUse:
      '让实体沿一条摆死的航点轨道匀速跑而不写巡逻代码。挂 PathFollow{waypoints,speed,loop?,arriveRadius?}（用 pathFollowAt(waypoints,speed,opts) 生成）。动态追/逃目标用 steering，绕障寻路到目标用 pathfind。',
    examples: [
      '巡逻折线：pathFollowAt([{x:0,y:0},{x:100,y:0},{x:100,y:100}], 2) → 跑完停在末点',
      '环形跑道：pathFollowAt([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}], 2, { loop: true }) → 跑完回到航点0循环',
      '精细到达判定：pathFollowAt(wps, 3, { arriveRadius: 1 }) → 更贴近航点才算到达（缺省 4）',
    ],
  },

  components: {
    provides: {
      PathFollow: {
        category: 'config',
        describe: '声明「沿 waypoints 固定轨道匀速跑 → 写 Velocity」。航点/速度/闭环/到达半径/当前游标全是数据。',
        fields: {
          waypoints: { type: 'string', describe: '轨道航点表 [{x,y}]（≥1）；按下标依次前往' },
          loop: { type: 'boolean', describe: '闭环：跑完末航点回到航点0；缺省 false=停在末点' },
          speed: { type: 'number', describe: '移动速度（写入 Velocity 模长，单位/tick）' },
          arriveRadius: { type: 'number', describe: '进入该半径算「到达」当前航点、游标前进；缺省 4' },
          index: { type: 'number', describe: '当前目标航点游标（运行时状态·缺省 0·随 snapshot 存读）' },
          queueId: { type: 'string', describe: '队列分组键：同 queueId 成员按 path 进度排序、互不超车（缺省不分组=不受限）' },
          minGap: { type: 'number', describe: '与「前一名」的最小 path 进度间距（仅 queueId 设了才生效）；缺省 0' },
          onEnd: { type: 'string', describe: '{dropTemplate?,destroy?}：非 loop 到末点时触发一次——落 dropTemplate 模板（自身位）/自毁；缺省不触发' },
          ended: { type: 'boolean', describe: 'onEnd 是否已触发（运行时状态·缺省 false·随 snapshot 存读，fire-once 守卫）' },
        },
      },
    },
    reads: ['PathFollow', 'Transform', 'Velocity'],
    writes: ['Velocity', 'DestroyRequest', 'SpawnRequest', 'PathFollow'], // PathFollow：航点游标 index 是自身运行态（P1a 严格模式补齐·此前漏报）
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'path-follow',
      // runsBefore motion-apply：先定速度再移动（破 读Transform/写Velocity 与 motion 的 RMW 环，同 steering/launch）。
      // runsAfter steering：两者都读+写 Velocity（本能力声明 reads Velocity 与 steering 同款，为对齐 launch 也
      // 摸 Velocity 但不声明读的先例——这里选择"声明读"以保留"存在性检查"语义），组件图会给出互为前驱的两条边→
      // 判成 RMW 伪环（与 steering.ts 注释所述同一类问题）。两者作用于不同实体集（PathFollow vs Steering），
      // 顺序对结果无影响，只需显式定一个方向打破伪环——钉 runsAfter:['steering']（steering 未装时此 id 被忽略，安全）。
      runsAfter: ['steering'],
      runsBefore: ['motion-apply'],
      reads: ['PathFollow', 'Transform', 'Velocity'],
      writes: ['Velocity', 'DestroyRequest', 'SpawnRequest', 'PathFollow'], // PathFollow：航点游标 index 是自身运行态（P1a 严格模式补齐·此前漏报）
      consumes: [],
      execute(world: IWorld) {
        const ids = sortedIds(world, 'PathFollow', 'Transform');
        // REQ-CONVEYOR-CAP M1：queueId 成员本 tick 的「起点 path 进度」（clamp 用，见文件头注释）——
        // 用本 tick **移动前**的 index/剩余距离算，故所有成员的界都基于同一时间切片，无处理序依赖。
        const queued: { id: string; queueId: string; minGap: number; progress: number }[] = [];
        for (const id of ids) {
          const pf = world.getComponent<PathFollow>(id, 'PathFollow')!;
          const t = world.getComponent<Transform>(id, 'Transform')!;

          let v = world.getComponent<Velocity>(id, 'Velocity');
          if (!v) {
            world.addComponent(id, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
            v = world.getComponent<Velocity>(id, 'Velocity')!;
          }

          const wps = pf.waypoints;
          if (wps.length === 0) {
            v.vx = 0;
            v.vy = 0;
            continue;
          }
          const len = wps.length;
          let i = pf.index ?? 0;
          if (i < 0) i = 0;
          else if (i > len - 1) i = len - 1;

          let wp = wps[i];
          let dx = wp.x - t.x;
          let dy = wp.y - t.y;
          let d = vecLen(dx, dy);

          const arrive = pf.arriveRadius ?? 4;
          if (d <= arrive) {
            // 到达当前航点：游标前进（loop 回到 0 / 非 loop 钉死在末点），本 tick 就朝新航点走（不空转一拍）。
            i = pf.loop ? (i + 1) % len : Math.min(i + 1, len - 1);
            pf.index = i;
            wp = wps[i];
            dx = wp.x - t.x;
            dy = wp.y - t.y;
            d = vecLen(dx, dy);
          }

          // onEnd（REQ-PATHEND-DROP）：非 loop 且游标已在末航点、本 tick 在 arriveRadius 内 → 触发一次
          // （到达当帧与此后每帧原地停靠都满足此条件，靠 `ended` 守卫保证只触发一次——见文件头「第一坑」注释）。
          if (pf.onEnd && !pf.loop && !pf.ended && i === len - 1 && d <= arrive) {
            pf.ended = true;
            if (pf.onEnd.dropTemplate) {
              // 落件挂到独立 carrier 实体、不挂自身——自身可能同 tick 还会收到 DestroyRequest 被销毁，
              // 挂自身的组件会随之消失、赶不上 prefab 消费（同 mortal.ts dropTemplate 先例）。
              const carrier = `pathend:${id}`;
              world.createEntity(carrier);
              world.addComponent(carrier, {
                type: 'SpawnRequest',
                templateId: pf.onEnd.dropTemplate,
                x: t.x,
                y: t.y,
              } as SpawnRequest);
            }
            if (pf.onEnd.destroy) {
              world.addComponent(id, { type: 'DestroyRequest', entityId: id } as DestroyRequest);
            }
          }

          if (d > 0) {
            v.vx = (dx / d) * pf.speed;
            v.vy = (dy / d) * pf.speed;
          } else {
            // d===0：正好压在航点且（非 loop 末点）无处可去 → 停。
            v.vx = 0;
            v.vy = 0;
          }

          if (pf.queueId !== undefined) {
            queued.push({ id, queueId: pf.queueId, minGap: pf.minGap ?? 0, progress: pathProgress(wps, i, d) });
          }
        }

        if (queued.length > 0) {
          // 按 queueId 分组，组内按进度降序（排头=进度最高）排序，tie-break 按 id 升序（确定性）。
          const groups = new Map<string, typeof queued>();
          for (const q of queued) {
            const g = groups.get(q.queueId);
            if (g) g.push(q); else groups.set(q.queueId, [q]);
          }
          for (const g of groups.values()) {
            g.sort((a, b) => b.progress - a.progress || cmpStr(a.id, b.id));
            for (let k = 1; k < g.length; k++) {
              const leader = g[k - 1];
              const follower = g[k];
              const allowed = leader.progress - follower.minGap; // 前一名起点进度 − minGap（排头不设界）
              const maxAdvance = Math.max(0, allowed - follower.progress);
              const v = world.getComponent<Velocity>(follower.id, 'Velocity')!;
              const step = vecLen(v.vx, v.vy);
              if (step > maxAdvance) {
                const scale = maxAdvance > 0 ? maxAdvance / step : 0;
                v.vx *= scale;
                v.vy *= scale;
              }
            }
          }
        }
      },
    },
  ],
});
