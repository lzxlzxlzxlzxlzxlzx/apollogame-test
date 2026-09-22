import { defineCapability } from '@engine/core/define-capability.js';
import type { IWorld, Component, EntityId } from '@engine/core/types.js';
import type { SpawnRequest, PrefabLibrary, PrefabTemplate, SpawnOverrides } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  prefab —— 数据级预制模板展开（T4 授权层）。ARPG 评审里回驳了「YAML→Node 编译器」，
//  用户采纳反提案 B：宏 = 数据，引擎确定性展开，AI 产数据不产代码。
//
//  复用 spawn 原子的 SpawnRequest{templateId,x,y}（请求契约已有、展开系统此前为空，正是这块缺口）。
//  本能力读单例 PrefabLibrary（模板库数据）+ 消费 SpawnRequest：
//    查模板 → 为模板里每个 localId 建实体（id = `${templateId}#${seq}:${localId}`，确定性唯一）
//    → 深拷贝组件数据（实例隔离）→ Transform 偏移到 (x,y) → addComponent。
//  seq 进 PrefabLibrary（snapshot 可重放）；query/Object 顺序确定 → 单端录放一致。
//
//  这样「冰霜新星」= 一条 PrefabTemplate 数据 + 一个 SpawnRequest 数据；运行时释放技能 =
//  发 SpawnRequest，引擎展开出带 Hitbox/Shape/Tag/Timer 的伤害区，再走 trigger-zone→hitbox 结算。
//  从自然语言到可玩机制，全程数据，零游戏代码、零编译器。
// ═══════════════════════════════════════════════════════════════

function findLibrary(world: IWorld): PrefabLibrary | undefined {
  const e = world.singleton('PrefabLibrary'); // 黑板单例（P1b）：严格模式多份即抛·生产按创建序取首个（= 旧 for…break 语义）
  return e === undefined ? undefined : world.getComponent<PrefabLibrary>(e, 'PrefabLibrary');
}

// ── REQ-F-033：模板内部实体引用重映射（Unity/Godot nested-prefab 标配语义）──
// 模板里指「同一次展开的兄弟实体」一律写 '@local:<localId>'（口诀：指兄弟就写 @local:）。
// instantiate 深 walk 组件数据（含数组/嵌套，Zone.requiredEntities 等一体适用）：
//   值为字符串且以 '@local:' 开头、后缀是本模板 localId → 重写为该兄弟的实例 id。
// 显式标记 → 零误伤（信号名/资源 id/普通字符串绝不撞）；未知后缀保留原样（typo 在数据里显眼可 grep）。
// overrides 补丁在重映射**之前**合并 → 槽位数据同样可用 '@local:' 改指向。纯字符串改写，展开拍即定、
// 随实体进 snapshot/hash，确定性不变。
export const LOCAL_REF_PREFIX = '@local:';
function remapLocalRefs(v: unknown, templateId: string, seq: number, locals: ReadonlySet<string>): unknown {
  if (typeof v === 'string' && v.startsWith(LOCAL_REF_PREFIX)) {
    const suffix = v.slice(LOCAL_REF_PREFIX.length);
    return locals.has(suffix) ? `${templateId}#${seq}:${suffix}` : v;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = remapLocalRefs(v[i], templateId, seq, locals);
    return v;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) o[k] = remapLocalRefs(o[k], templateId, seq, locals);
    return v;
  }
  return v;
}

// ── REQ-F-049：出身格哨兵 ──
// overrides 里某 localId 写 `HexPos: '@origin-hex'`（组件级字符串哨兵）→ 以 SpawnRequest.originHex 的
// {q,r} 值代入：模板该实体有 HexPos 则整体覆写；没有则**仅此哨兵路径**补建该组件（值恒完整 {q,r}）。
// 请求无 originHex（发起者不在板上）→ 哨兵补丁整条跳过（实例不上板）。通用字段补丁仍不建缺件——
// 半截组件的 undefined 字段会污染 snapshot/hash（评审收窄，见 requests.md F-049）。
export const ORIGIN_HEX_SENTINEL = '@origin-hex';

// 实例化一个模板到 (x,y)，返回新建实体 id 列表（便于测试/调试）。
// overrides（REQ-F-032）：localId→组件→字段补丁，深拷贝+Transform 偏移之后逐字段合并——
// 同一模板展开异构实例（各自 HexPos/Tag/数值）。补丁亦深拷贝（请求方数据与实例隔离）。
export function instantiate(world: IWorld, tmpl: PrefabTemplate, templateId: string, seq: number, x: number, y: number, overrides?: SpawnOverrides, originHex?: { q: number; r: number }, source?: EntityId): string[] {
  const created: string[] = [];
  const locals = new Set(Object.keys(tmpl.entities)); // REQ-F-033：本模板兄弟 localId 集
  for (const [localId, comps] of Object.entries(tmpl.entities)) {
    const eid = `${templateId}#${seq}:${localId}`;
    world.createEntity(eid);
    const patches = overrides?.[localId];
    for (const [ctype, data] of Object.entries(comps)) {
      const copy = JSON.parse(JSON.stringify(data)) as Record<string, unknown>; // 深拷贝隔离实例
      if (ctype === 'Transform') {
        copy.x = ((copy.x as number) ?? 0) + x;
        copy.y = ((copy.y as number) ?? 0) + y;
      }
      let patch = patches?.[ctype];
      if (ctype === 'HexPos' && patch === ORIGIN_HEX_SENTINEL) {
        patch = originHex ? { q: originHex.q, r: originHex.r } : undefined; // 哨兵：有出身格代入，无则跳过
      }
      // 字段补丁须是对象（组件级字符串只有 '@origin-hex' 一个合法哨兵；其余字符串=typo，不展开不污染）。
      if (patch && typeof patch === 'object') Object.assign(copy, JSON.parse(JSON.stringify(patch)) as Record<string, unknown>);
      remapLocalRefs(copy, templateId, seq, locals); // REQ-F-033：'@local:x' → 兄弟实例 id（补丁后，补丁同享）
      world.addComponent(eid, { type: ctype, ...copy } as unknown as Component);
    }
    // 哨兵补建（仅当模板该实体**没有** HexPos 组件且出身格在手）：上面的循环只走模板已有组件。
    if (!('HexPos' in comps) && (patches?.HexPos as unknown) === ORIGIN_HEX_SENTINEL && originHex) {
      world.addComponent(eid, { type: 'HexPos', q: originHex.q, r: originHex.r } as unknown as Component);
    }
    // REQ-F-046/048①：出身戳（同模板计数/入场顺序的数据钥匙；POD 进 snapshot，确定可重放）。
    world.addComponent(eid, { type: 'PrefabOrigin', templateId, seq, localId, ...(source ? { source } : {}) } as unknown as Component); // source(REQ-F-065)：转记发起者 → hitbox per-caster 缩放据此寻施法者本地资源
    created.push(eid);
  }
  return created;
}

export const prefabCapability = defineCapability({
  id: 't3-prefab',
  version: '1.0.0',

  describe: {
    name: 'prefab',
    summary: '数据级预制模板展开：消费 SpawnRequest{templateId,x,y}，从 PrefabLibrary 查模板 → 确定性实例化为实体+组件（唯一 id、Transform 偏移、深拷贝）。',
    semantic: ['tier3', 'lifecycle', 'authoring', 'interpreter'],
    whenToUse:
      '运行时按数据生成多实体机制（技能/陷阱/刷怪/特效）。模板写进 PrefabLibrary（数据），释放即发 SpawnRequest（数据）。AI 产高层数据，引擎确定性展开，无 YAML 编译器、无游戏代码。',
    examples: [
      '冰霜新星：SpawnRequest{templateId:"frost_nova", x, y} → 展开伤害区（Shape+Sensor+Tag(ZONE)+Hitbox+Timer）',
      '刷怪：SpawnRequest{templateId:"slime", x, y} → 展开敌人（Transform+Shape+Tag(ENEMY)+Resource(hp)）',
      '组合机制：一个模板可含多实体（弹幕母体 + 多发子弹）',
    ],
  },

  components: {
    provides: {
      // C 治理：PrefabOrigin 由本能力展开时写入（templateId/seq/localId/source），此前无 provider。
      PrefabOrigin: {
        category: 'marker',
        describe: '展开出身标记：出自哪个模板/第几次展开/模板内 localId/发起者。resource-apply scope:source 与 hitbox per-caster 缩放据此寻址。',
        fields: {
          templateId: { type: 'string', describe: '出自哪个模板' },
          seq: { type: 'number', describe: '第几次展开（全局单调=入场顺序）' },
          localId: { type: 'string', describe: '模板内 localId' },
          source: { type: 'EntityId', describe: '生成它的施法者/源实体（可选）' },
        },
      },
      PrefabLibrary: {
        category: 'config',
        describe: '预制模板库（数据，单例）。templates: id→模板（实体/组件蓝图）。seq: 实例计数器（确定性唯一 id）。',
        fields: {
          templates: { type: 'string', describe: '模板库 Record<id, {entities:{localId:{Comp:data}}}>（复杂对象，按数据填）' },
          seq: { type: 'number', describe: '实例计数器（每次展开 +1，进 snapshot 可重放）' },
        },
      },
    },
    reads: ['SpawnRequest', 'PrefabLibrary'],
    writes: ['PrefabLibrary', 'PrefabOrigin', 'HexPos'], // 展开盖章（申报对账·根因①·模板变量组件仍在守卫局限内）
    consumes: ['SpawnRequest'],
  },

  config: {},

  systems: [
    {
      id: 'prefab-spawn',
      reads: ['SpawnRequest', 'PrefabLibrary'],
      writes: ['PrefabLibrary', 'PrefabOrigin', 'HexPos'], // 展开盖章（申报对账·根因①·模板变量组件仍在守卫局限内）
      consumes: ['SpawnRequest'],
      // 展开殿后（根因①·2026-08-16）：诚实申报 PrefabOrigin/HexPos 写面后，与「SpawnRequest 写者 ∩
      // PrefabOrigin/HexPos 读者」闭真环、与其余读者单向重排——平局裁决落序曾翻转 game101/102 实测
      // 行为。显式钉死旧有效语义（= 各环裁决序里 prefab-spawn 本就实际落后的现状）：产请求者先行、
      // 消费者先读旧世界，展开殿后（同拍消费本拍 SpawnRequest），新实体的组件/事件**下一拍**才进
      // 各消费者（标准离散反馈）。名单 = 全部 p0 的 PrefabOrigin/HexPos 读者 + SpawnRequest 主要写者
      // （effect-apply 在 Commit 跨桶无边不钉；缺席系统的显式边被 topological-sort 静默跳过，不悬空——
      // 全局存在性由 system-graph 悬空边守卫背书）。显式边压掉同名反向软边（规则③·同 matrix-duel 先例），
      // 修后全库门禁环告警 63→0 的收割由 declaration-audit 的 SCC 棘轮接管看守。
      runsAfter: ['hitbox', 'caster', 'merge-rule', 'merge-on-place', 'merge-proximity-clear', 'resource-apply', 'order-fulfill', 'group-count', 'tray', 'drag-place', 'grid-move'],
      execute(world: IWorld) {
        const lib = findLibrary(world);
        if (!lib) return;
        for (const [rid, comps] of world.query('SpawnRequest')) {
          const req = world.getComponent<SpawnRequest>(rid, 'SpawnRequest');
          if (req) {
            const tmpl = lib.templates[req.templateId];
            if (tmpl) {
              instantiate(world, tmpl, req.templateId, lib.seq, req.x, req.y, req.overrides, req.originHex, req.source);
              lib.seq += 1;
            }
          }
          // BUG-004：专用请求载体（仅 SpawnRequest 一个组件，如 mortal 的 drop:<id>）展开后销毁回收，
          // 否则空实体永久残留（长局/刷怪无界增长，进 snapshot 拖慢，id 复用还会抛错）。
          // caster 等把 SpawnRequest 挂在持久实体上（组件数 >1）→ 不销毁，仅其 SpawnRequest 被 consume。
          if (comps.size === 1) world.destroyEntity(rid);
        }
      },
    },
  ],
});
