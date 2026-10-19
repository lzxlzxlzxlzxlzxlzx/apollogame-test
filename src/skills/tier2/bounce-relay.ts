import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { Bounce, Hitbox, Tag, Transform, Trigger, Velocity } from '@engine/protocol/components.js';
import { nearestByTag } from '@skills/atoms/spatial-query/index.js';
import { len } from '@engine/math/vec2.js';

// ═══════════════════════════════════════════════════════════════
//  bounce-relay —— 跳弹的命中重定向段（REQ-SURVIVOR武器缺口 W7）。配对 t2-launch 的 Launch.bounce：
//  launch 只管"发射瞬间定向"，是 fire-and-forget 的一次性组件（自删）；跳弹需要的是"存活 + 命中后
//  转向"，这份运行时状态（剩余次数/目标阵营/保持速度）装不进会自删的 Launch，故落成独立持久组件
//  Bounce（launch.ts 在自删 Launch 前一次性落地），本能力专职消费它。
//
//  逐 Trigger（trigger-zone 每帧产出的 zone↔other 命中事件）：若 zone 挂着 Bounce 且 remaining>0——
//    ① 命中判定复用 hitbox① 的阵营过滤口径（zone 自身 Hitbox.targetMask 与 other 的 Tag 位与）：
//       只窄限于"是否算一次有效命中"这一层，不复算状态门/血量门/AOE fan-out 结算（那些是 hitbox 的活，
//       跳弹只需知道"命中了没"，故意不重做全套过滤——弹跳弹是简单直飞弹，不叠状态/血量条件技）。
//    ② 找下一个目标：nearestByTag(zone 坐标, bounce.targetTag, exclude=刚命中的 other)。
//    ③ 有新目标 → 重定向 Velocity（方向×bounce.speed，保持发射时的速度模长）→ remaining-1。
//       无新目标 → 不改 Velocity、不消耗 remaining（照常按 Timer(life) 飞下去，靠 lifetime 回收）。
//  一 zone 一 tick 最多消耗一次弹射（同 tick 命中多个目标时，只处理 id 最小的 Trigger，其余忽略——
//  弹跳弹形状通常很小，同 tick 命中 >1 目标是罕见边界，确定性优先于"哪个方向更合理"的取舍）。
//
//  确定性：nearestByTag 自带 id tie-break、无随机；Trigger/命中集合按 id 排序遍历。
//
//  定序（真撞环过，非假设）：本能力读 Trigger，天然只能排在"motion-apply(积分位移)→overlap-detect
//  (查重叠)→trigger-zone(产 Trigger)"这条链之后——同 hitbox（hitbox 也只 runsAfter trigger-zone，
//  从不 runsBefore motion-apply）。本能力重定向出的 Velocity 因此要等**下一 tick** 的 motion-apply 才
//  真正积分生效（1-tick 延迟，与 steering 读"上一拍 Status"、stat-bind 投影下一 tick 生效同一纪律，
//  非 bug）。最初误仿 launch/steering/aggro 加了 runsBefore:['motion-apply']（那三者是"意图"系统，
//  产出要同帧生效，故必须排在 motion-apply 之前）——但本能力是"反应"系统（同 hitbox，消费 Trigger），
//  硬要同时"排在 trigger-zone 之后"又"排在 motion-apply 之前"，而 trigger-zone 本身又排在 motion-apply
//  之后 → 直接首尾相接成环（motion-apply→overlap-detect→trigger-zone→bounce-relay→motion-apply）。
//  改成 runsAfter:['motion-apply']（撤掉误加的 runsBefore）即解：与 Transform 的组件推断边同向，零冲突。
//  第二条环：本能力写 Velocity，steering 声明 reads 'Velocity'（供其 separation 特性做 RMW）→ 组件图推出
//  "写者在前" 的 bounce-relay→steering 边；但 steering 又自带 runsBefore:['motion-apply'] → 与上面的
//  motion-apply→…→bounce-relay 链首尾相接成第二个环（这条环与两系统实际作用的实体毫不相干——弹跳弹
//  与被 steering 驱动的 AI 实体通常是不同实体，纯粹是"同写/读 Velocity"这一组件级判定过粗的假阳性，
//  同文件头②"跳过状态/血量门"取舍同类：接受假阳性、用显式定序打掉，不为此改 steering.ts 的通用声明）。
//  runsAfter:['steering'] 同法打破。
//  确定性不受定序影响：以上都是"谁先跑"的调度顺序，不引入随机/墙钟。
// ═══════════════════════════════════════════════════════════════

export const bounceRelayCapability = defineCapability({
  id: 't2-bounce-relay',
  version: '1.0.0',

  describe: {
    name: 'bounce-relay',
    summary: '跳弹命中重定向：消费 Launch.bounce 落地的持久 Bounce 状态——命中目标后(复用 Hitbox.targetMask 阵营过滤)找下一个最近同阵营目标(排除刚命中的)→ 重定向 Velocity(保持速度模长) → 剩余次数-1；无新目标/次数耗尽则不再弹，照常按 Timer(life) 回收。',
    semantic: ['tier2', 'projectile', 'combat', 'movement'],
    whenToUse:
      '弹跳箭/连锁球等"命中一个目标后自动飞向下一个"的抛射武器。飞弹 prefab 的 Launch 声明 bounce:{times,targetTag}（launch 落地 Bounce），配 Hitbox(targetMask 通常与 targetTag 一致，且不设 consumeOnHit——跳弹要存活)+Timer(life)。',
    examples: [
      '跳弹三次：Launch{ bounce:{ times:3, targetTag:ENEMY } } → 命中后自动弹向下一个最近敌人，最多 3 次',
      '弹射落空：范围内已无其它敌人 → nearestByTag 找不到目标，不再弹，抛射体照常沿当前方向飞、按 Timer(life) 到期回收',
    ],
  },

  components: {
    provides: {
      Bounce: {
        category: 'config',
        describe: '持久跳弹状态（由 Launch.bounce 声明、launch 自删前落地）：剩余弹射次数 + 弹射目标阵营 + 保持的速度模长。',
        fields: {
          remaining: { type: 'number', describe: '剩余可弹射次数（成功弹射一次 -1；未命中/无新目标不消耗）' },
          targetTag: { type: 'number', describe: '弹射目标阵营（Tag.flags & targetTag，同 nearestByTag 的 tagMask 语义）' },
          speed: { type: 'number', describe: '弹射后保持的速度模长（发射时的 Launch.speed，一次性抄录）' },
        },
      },
    },
    reads: ['Trigger', 'Hitbox', 'Bounce', 'Tag', 'Transform'],
    writes: ['Velocity', 'Bounce'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'bounce-relay',
      // 见文件头"定序"：runsAfter 而非 runsBefore motion-apply（本能力是反应系统，同 hitbox）；
      // 显式覆盖两条组件推断的反向假阳性边（Transform 读侧本就同向，这里主要打掉 Velocity 写侧）。
      runsAfter: ['trigger-zone', 'motion-apply', 'steering'],
      reads: ['Trigger', 'Hitbox', 'Bounce', 'Tag', 'Transform'],
      writes: ['Velocity', 'Bounce'],
      consumes: [],
      execute(world: IWorld) {
        const triggerIds = sortedIds(world, 'Trigger');
        const bounced = new Set<string>(); // 一 zone 一 tick 最多消耗一次弹射（确定性：只认 id 最小的 Trigger）
        for (const tid of triggerIds) {
          const trig = world.getComponent<Trigger>(tid, 'Trigger')!;
          if (bounced.has(trig.zone)) continue;
          const bc = world.getComponent<Bounce>(trig.zone, 'Bounce');
          if (!bc || bc.remaining <= 0) continue;
          const hb = world.getComponent<Hitbox>(trig.zone, 'Hitbox');
          if (!hb) continue;

          // 命中判定：与 hitbox①阵营过滤同口径（仅 targetMask 位，不叠状态/血量门——见文件头）。
          if (hb.targetMask) {
            const tag = world.getComponent<Tag>(trig.other, 'Tag');
            if (!tag || (tag.flags & hb.targetMask) === 0) continue;
          }

          const t = world.getComponent<Transform>(trig.zone, 'Transform');
          if (!t) continue;
          const nextId = nearestByTag(world, t.x, t.y, bc.targetTag, { excludeId: trig.other });
          const nt = nextId ? world.getComponent<Transform>(nextId, 'Transform') : undefined;
          if (!nt) continue; // 无新目标 → 不再弹，照常按 lifetime 回收（不消耗 remaining）

          const dx = nt.x - t.x;
          const dy = nt.y - t.y;
          const dist = len(dx, dy);
          if (dist === 0) continue; // 与新目标完全重合：本 tick 不改向（防除零），下 tick 再判

          let v = world.getComponent<Velocity>(trig.zone, 'Velocity');
          if (!v) {
            world.addComponent(trig.zone, { type: 'Velocity', vx: 0, vy: 0, angular: 0 } as Velocity);
            v = world.getComponent<Velocity>(trig.zone, 'Velocity')!;
          }
          v.vx = (dx / dist) * bc.speed;
          v.vy = (dy / dist) * bc.speed;
          bc.remaining -= 1;
          bounced.add(trig.zone);
        }
      },
    },
  ],
});
