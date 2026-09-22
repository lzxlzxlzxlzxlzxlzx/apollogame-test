import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { PullAnchor, Relation, Steering, Tag, Transform } from '@engine/protocol/components.js';
import { queryRange } from '@skills/atoms/spatial-query/index.js';

// ═══════════════════════════════════════════════════════════════
//  pull-anchor —— 区域施加器（REQ-SURVIVOR武器缺口 W9·黑洞/吸附类武器）。**重组**方案：不新写一套
//  位移数学，只批量改写"已带 Steering 的邻近实体"的 Relation(target)→锚点，让 t2-steering 既有的
//  seek 逻辑把它们"拉"过来（含 stopRange/separation 免费复用，不必重发明）。
//
//  调查结论（先试重组·未撞墙即未下沉 pull-field）：t2-steering 本就是"自身朝 Relation(target) seek"——
//  它只差一个"谁来批量给邻近实体写 Relation"的施加器。这份缺口是真的（t3-aggro 的索敌是逐实体自己
//  扫描，不支持"锚点反向广播给一群目标"），但补它不需要新的运动学——只需一个薄系统：读锚点
//  PullAnchor{radius,tagMask} + queryRange 找命中实体 → 覆盖它们的 Relation(target)。真正的运动（含
//  stopRange 停、separation 环绕）全部复用 steering，零重复的方向归一化代码。
//
//  边界（诚实局限，非隐藏 bug）：只对**已挂 Steering** 的实体生效——不能拉玩家/道具/子弹/宝石等无
//  Steering 的实体（那类"纯位移力场"需求超出本重组能力，届时才是下沉 pull-field 直接写 Velocity 的
//  时候）。game-103 的黑洞武器场景（吸附敌人聚拢）里，敌人本就挂 Steering(seek 玩家)，故此边界不构成
//  实际缺口；若后续游戏要吸玩家/掉落物，回 requests.md 报，届时按 pull-field 方案下沉。
//
//  逐锚点（挂 PullAnchor+Transform 的实体）：queryRange(锚点坐标, radius) 找命中实体（按 id 排序），
//  过滤 tagMask（Tag.flags 位）+ 必须已挂 Steering，再对 Relation 按 aggro 同款礼让口径覆盖——
//  Relation 不存在或 kind==='target' 才写/改 targetId；kind 为其它值（该实体的 Relation 另作他用）则让位。
//  下一 tick steering 读到新 Relation(target) 即转向锚点，本能力本身**不写 Velocity**。
//
//  确定性：锚点 + queryRange 命中集合均按 id 排序遍历，无随机；多黑洞重叠命中同一实体 → 按锚点 id
//  升序、后处理的覆盖前者（确定的 tie-break，非鼓励叠加）。
//  定序：与 t3-aggro 互为 Relation 的 RMW（都读+写 Relation）→ 组件拓扑判两条互为前驱的边成环，
//  runsAfter:['aggro'] 显式覆盖反方向推断边打破（R10 同法，同 path-follow/steering 先例）；
//  steering 只读不写 Relation，天然排在本系统之后（写者→读者的单向推断边，免显式声明）。
// ═══════════════════════════════════════════════════════════════

export const pullAnchorCapability = defineCapability({
  id: 't2-pull-anchor',
  version: '1.0.0',

  describe: {
    name: 'pull-anchor',
    summary: '区域施加器（重组·非下沉）：锚点每 tick 对 queryRange 半径内、匹配 tagMask 且已挂 Steering 的实体，把它们的 Relation(target) 覆盖为指向锚点自身——复用 t2-steering 现成的 seek 把它们"拉"过来。只对已带 Steering 的实体生效。',
    semantic: ['tier2', 'ai', 'area-effect', 'movement'],
    whenToUse:
      '黑洞/漩涡/吸附类武器或场景机制：一个锚点让半径内一群"本来在追别的目标"的敌人临时改追（=被拉向）锚点。锚点挂 PullAnchor{radius,tagMask}+Transform；被拉实体需已挂 Steering（通常也挂着 t3-aggro 追玩家）。锚点自身不移动、不需要 Steering。',
    examples: [
      '黑洞吸怪：PullAnchor{ radius:120, tagMask:ENEMY } → 120 半径内的敌人 Relation 改指黑洞，steering 把它们拉过去而非追玩家',
      '半径外/未挂 Steering 的实体（玩家、道具、子弹）不受影响——本能力只改 Relation，不代管它们的移动',
    ],
  },

  components: {
    provides: {
      PullAnchor: {
        category: 'config',
        describe: '区域施加器：queryRange 半径内匹配 tagMask 且已挂 Steering 的实体，Relation(target) 被覆盖为指向本锚点。',
        fields: {
          radius: { type: 'number', describe: '施加半径（queryRange 半径；>0 才生效）' },
          tagMask: { type: 'number', describe: '命中筛选：目标 Tag.flags & tagMask（0 = 不限阵营，仍需持有 Steering 才会被拉）' },
        },
      },
    },
    reads: ['PullAnchor', 'Transform', 'Tag', 'Steering', 'Relation'],
    writes: ['Relation'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'pull-anchor',
      // runsAfter aggro：打破与 aggro 互为 Relation RMW 前驱的伪环（见文件头，R10 同法）。
      // runsBefore motion-apply：本系统读 Transform（锚点/候选实体坐标）——若不显式声明，motion-apply
      // 写 Transform 会被组件拓扑推成"motion-apply 先跑"，而 steering 又显式 runsBefore motion-apply
      // （steering 先跑）、本系统又 writes Relation 被 steering reads（本系统先跑）——三者首尾相接成环
      // （同 aggro/launch 读 Transform 也都显式 runsBefore motion-apply 的既有先例，非本系统独有）。
      runsAfter: ['aggro'],
      runsBefore: ['motion-apply'],
      reads: ['PullAnchor', 'Transform', 'Tag', 'Steering', 'Relation'],
      writes: ['Relation'],
      consumes: [],
      execute(world: IWorld) {
        const anchors = sortedIds(world, 'PullAnchor', 'Transform');
        for (const aid of anchors) {
          const pa = world.getComponent<PullAnchor>(aid, 'PullAnchor')!;
          if (!(pa.radius > 0)) continue;
          const at = world.getComponent<Transform>(aid, 'Transform')!;
          const hits = queryRange(world, at.x, at.y, pa.radius).slice().sort();
          for (const id of hits) {
            if (id === aid) continue;
            if (!world.getComponent<Steering>(id, 'Steering')) continue; // 边界：只拉已挂 Steering 的实体
            if (pa.tagMask) {
              const tag = world.getComponent<Tag>(id, 'Tag');
              if (!tag || (tag.flags & pa.tagMask) === 0) continue;
            }
            const rel = world.getComponent<Relation>(id, 'Relation');
            if (rel && rel.kind !== 'target') continue; // 该实体 Relation 另作他用 → 让位（同 aggro 礼让口径）
            if (!rel) world.addComponent(id, { type: 'Relation', kind: 'target', targetId: aid } as Relation);
            else rel.targetId = aid;
          }
        }
      },
    },
  ],
});
