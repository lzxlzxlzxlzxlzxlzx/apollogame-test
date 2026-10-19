import { defineCapability } from '@engine/core/define-capability.js';
import { worldSeed } from '@engine/core/query.js';
import { SystemPhase, type IWorld } from '@engine/core/types.js';
import type { DeliverDrop, Order, PrefabOrigin, DestroyRequest, Resource, RandomSeed } from '@engine/protocol/components.js';
import { nextRandom } from '@atom-skills/index.js';
import { weightedPick } from './weighted-pick.js';

// ═══════════════════════════════════════════════════════════════
//  order-fulfill —— 玩家**拖成品去交付订单**的位置感知交付裁决（REQ-101-07·顾客点单/收集任务/合成台通用）。
//
//  区别 craft-recipe（只吞/产资源计数·不吞棋盘实体实例）：本件消耗的是**具体的成品实例**（带 PrefabOrigin）。
//  宿主层把「拖成品 item 落到顾客卡 order」合成一条 DeliverDrop{item,order}（host 解析被拖实例 + 落点订单实体）：
//    ① item 模板命中 order 某个**未满 slot** 的 needItem → 销毁 item + 该 slot 置满；
//    ② 全部 slot 集齐 → 一次性发 reward（资源增量·钳进各资源 min/max）+ 续单（见下）；
//    ③ 不命中（模板不在需求 / 对应 slot 已满）→ 什么都不做（宿主可回弹 item）。
//  订单态 Order{needItems,filled,reward} 是纯数据（顺序即 slot 序）；发奖表数据化，游戏层零交付逻辑。
//  确定性：只读/写确定状态、按落放意图逐条结算（host 合成序确定）；销毁汇入 destroy-apply、发奖写 Resource（钳限）。
//
//  订单轮换（REQ-ORDERROT·Lead 裁 2026-07-25）：集齐发奖后，若 Order.pool 非空 → 从池取**下一单**写回
//  needItems/reward + 清 filled（而非停在原单重复），支持"顾客换需求"的续单循环（可逐级升级 food_2→food_3…）：
//    · rotateMode:'sequence'（缺省）→ 按 cursor 顺序取，环回：cursor=(cursor+1)%pool.length；
//    · rotateMode:'weighted'    → 用世界单例 RandomSeed（首个 RandomSeed 实体，同 weighted-spawn/effect-apply
//      找单例的惯例）按 pool 项 weight 加权抽（weightedPick 共享核·缺 weight 视为等权 1）；无 RandomSeed →
//      fail-closed（不抽不轮·同 weighted-spawn 口径），订单停在已集齐态待下次有 RNG 再轮。
//  pool 为空/未设 = 完全退化回旧行为（resetOnComplete!==false 才清空 filled·逐字节零回归，既有测全绿）。
// ═══════════════════════════════════════════════════════════════

/** 世界随机种子（黑板单例）——统一取法 engine/core/query.worldSeed（B-3）。 */
const findWorldSeed = worldSeed;

/** REQ-ORDERROT：集齐发奖后从 order.pool 取下一单写回 needItems/reward + 清 filled（调用前已确认 pool 非空）。
 *  sequence（缺省）：按 cursor 顺序取，取后环回递进 cursor=(cursor+1)%pool.length（缺省 cursor 视为 0）。
 *  weighted：用世界单例 RandomSeed 按各 pool 项 weight 加权抽（weightedPick 共享核·缺 weight 视为等权 1）；
 *  无 RandomSeed → fail-closed 不轮（同 weighted-spawn 口径）——订单停在已集齐态，不崩、不猜数，待下次有 RNG 再轮。 */
function rotateOrder(order: Order, resolveRng: () => RandomSeed | undefined): void {
  const pool = order.pool!;
  let idx: number;
  if (order.rotateMode === 'weighted') {
    const rng = resolveRng();
    if (!rng) return; // fail-closed：无世界 RNG，本次不轮（reward 已发·下次集齐再试）
    const entries = pool.map((p, i) => ({ i, weight: p.weight ?? 1 }));
    const picked = weightedPick(entries, () => nextRandom(rng));
    if (!picked) return; // 权重全零兜底（调用前 pool.length>0 已保证非空表）
    idx = picked.i;
  } else {
    // sequence：cursor 指下一次要取的下标；负数/越界一律先规约到 [0,len) 再取，取后递进环回。
    const cur = order.cursor ?? 0;
    idx = ((cur % pool.length) + pool.length) % pool.length;
    order.cursor = (idx + 1) % pool.length;
  }
  const next = pool[idx];
  order.needItems = next.needItems.slice();
  order.reward = next.reward.slice();
  order.filled = next.needItems.map(() => false);
}

export const orderFulfillCapability = defineCapability({
  id: 't2-order-fulfill',
  version: '1.0.0',

  describe: {
    name: 'order-fulfill',
    summary: '拖成品交付订单：item 模板命中订单某未满 slot→销毁该实例+置满该 slot；全 slot 集齐→发奖(资源增量·钳限)+续单（重置原单或从 pool 轮换下一单）。消耗棋盘实体实例的多槽交付（区别 craft-recipe 只吞资源计数）。',
    semantic: ['tier2', 'order', 'deliver', 'interpreter'],
    whenToUse:
      '合并/收集游戏的订单交付（Gossip Harbor 顾客点单/收集任务/合成台：拖成品给顾客→消耗该成品实例+集齐发奖）。宿主拖拽手势合成 DeliverDrop{item,order}；Order{needItems,filled,reward} 提供订单态数据（本件读写之）。想让顾客集齐后换下一样需求（而非无限重复同单）→ 挂 Order.pool（REQ-ORDERROT）。',
    examples: [
      '交付命中：DeliverDrop{ item:"dish_7", order:"ord_zhou" }（dish_7 模板==needItems 某未满 slot）→ 销毁 dish_7 + 该 slot 置满',
      '集齐发奖：最后一 slot 满 → reward 逐条 modify Resource（+金币/星星）+ 清空 filled 重新接单（无 pool 时）',
      '不命中：item 模板不在 needItems / 对应 slot 已满 → 无改动（宿主回弹）',
      '续单-顺序环回：Order{ needItems:["food_2"], reward:[...], pool:[{needItems:["food_3"],reward:[...]},{needItems:["food_2"],reward:[...]}], rotateMode:"sequence" } → 集齐 food_2 后换 food_3，再集齐后环回 food_2',
      '续单-加权抽：Order{ ..., pool:[{needItems:["a"],reward:[...],weight:1},{needItems:["b"],reward:[...],weight:3}], rotateMode:"weighted" } → 集齐后用世界 RandomSeed 按 1:3 抽下一单（b 更常出）',
    ],
  },

  components: {
    provides: {
      Order: {
        category: 'config',
        describe: '多槽交付订单：needItems 各 slot 要的模板 id、filled 各 slot 已交付否（等长）、reward 集齐发的资源增量表；可选 pool 做集齐后续单轮换（REQ-ORDERROT）。',
        fields: {
          orderId: { type: 'string', describe: '订单标识（宿主投影/发信号用）' },
          needItems: { type: 'string', describe: '各 slot 需要的模板 id 数组（顺序即 slot 序·最多 N）' },
          filled: { type: 'string', describe: '各 slot 是否已交付的布尔数组（与 needItems 等长·初始全 false）' },
          reward: { type: 'string', describe: '全 slot 集齐后发的 {resourceId,amount}[]（钳进各资源 min/max）' },
          resetOnComplete: { type: 'boolean', describe: '集齐发奖后是否清空 filled 重新接单（缺省 true）；pool 非空时此字段被轮换逻辑接管' },
          pool: { type: 'string', describe: 'REQ-ORDERROT 续单池：{needItems,reward,weight?}[]。非空时集齐发奖后从中取下一单写回 needItems/reward+清 filled；空/未设=退化回 resetOnComplete 旧行为' },
          rotateMode: { type: 'string', describe: "REQ-ORDERROT：'sequence'(缺省·按 cursor 顺序环回)|'weighted'(按 pool 项 weight 用世界 RandomSeed 加权抽·缺 weight 视为等权)" },
          cursor: { type: 'number', describe: 'REQ-ORDERROT sequence 模式下一次取 pool 的下标（缺省 0）；每次轮换后 (cursor+1)%pool.length 环回' },
        },
      },
      DeliverDrop: {
        category: 'intent',
        describe: '交付意图（宿主合成·消费即清）。item=被拖成品实例(带 PrefabOrigin)·order=目标订单实体。',
        fields: {
          item: { type: 'EntityId', describe: '被拖去交付的成品实例' },
          order: { type: 'EntityId', describe: '目标订单实体（带 Order）' },
        },
      },
    },
    reads: ['DeliverDrop', 'Order', 'PrefabOrigin', 'RandomSeed'],
    writes: ['DestroyRequest', 'Order', 'Resource', 'RandomSeed'],
    consumes: ['DeliverDrop'],
  },

  config: {},

  systems: [
    {
      id: 'order-fulfill',
      phase: SystemPhase.Update,
      reads: ['DeliverDrop', 'Order', 'PrefabOrigin', 'RandomSeed'],
      writes: ['DestroyRequest', 'Order', 'Resource', 'RandomSeed'],
      consumes: ['DeliverDrop'],
      execute(world: IWorld) {
        // 世界单例 RNG：懒解析、本 tick 只查一次（同 weighted-spawn 惯例）——多数订单走 sequence/无 pool，
        // 不该为它们白白扫一遍 RandomSeed。
        let rng: RandomSeed | undefined;
        let rngResolved = false;
        const resolveRng = (): RandomSeed | undefined => {
          if (!rngResolved) { rng = findWorldSeed(world); rngResolved = true; }
          return rng;
        };

        const drops = world.query('DeliverDrop').map(([id, comps]) => ({ id, size: comps.size }));
        for (const { id: did, size } of drops) {
          const d = world.getComponent<DeliverDrop>(did, 'DeliverDrop');
          if (d) {
            const itemPO = world.getComponent<PrefabOrigin>(d.item, 'PrefabOrigin');
            const order = world.getComponent<Order>(d.order, 'Order');
            if (itemPO && order && Array.isArray(order.needItems) && Array.isArray(order.filled)) {
              // 找第一个「未满 && 需要该模板」的 slot。
              let slot = -1;
              for (let j = 0; j < order.needItems.length; j++) {
                if (!order.filled[j] && order.needItems[j] === itemPO.templateId) { slot = j; break; }
              }
              if (slot >= 0) {
                // ① 命中：销毁该成品实例 + 置满该 slot。
                if (!world.hasComponent(d.item, 'DestroyRequest')) world.addComponent(d.item, { type: 'DestroyRequest', entityId: d.item } as DestroyRequest);
                order.filled[slot] = true;
                // ② 全满 → 发奖（钳限）+ 续单（REQ-ORDERROT：pool 非空则轮换下一单；否则退化回旧 resetOnComplete）。
                if (order.filled.every((f) => f)) {
                  for (const rw of order.reward ?? []) {
                    const r = world.getComponent<Resource>(rw.resourceId, 'Resource');
                    if (r) r.current = Math.max(r.min, Math.min(r.max, r.current + rw.amount));
                  }
                  if (Array.isArray(order.pool) && order.pool.length > 0) {
                    rotateOrder(order, resolveRng);
                  } else if (order.resetOnComplete !== false) {
                    order.filled = order.needItems.map(() => false);
                  }
                }
              }
            }
          }
          // 消费：专用载体（仅 DeliverDrop）回收；挂在持久实体上则仅去组件。
          if (size === 1) world.destroyEntity(did);
          else world.removeComponent(did, 'DeliverDrop');
        }
      },
    },
  ],
});
