import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import type { IWorld } from '@engine/core/types.js';
import type { Caster, Signal, InputQueue, Transform, SpawnRequest, Relation, HexPos } from '@engine/protocol/components.js';
import { nearestByTag } from '@skills/atoms/spatial-query/index.js';

// ═══════════════════════════════════════════════════════════════
//  caster —— 信号→生成桥（D-002）。把"按键/点地/条件成立"产出的 Signal 变成一条**算好坐标**的
//  SpawnRequest，交给 prefab 能力展开成技能/陷阱/召唤/掉落。补上 prefab 缺的"运行时按数据释放"入口
//  （REQ-008 评审时显式延后的那块：「spawn 需模板展开（assembly 层），单提」）。
//
//  现状：prefab 只消费现成的 SpawnRequest{templateId,x,y}（game-d 测试里靠手注一条）。没有任何东西把
//  "信号 + 一个位置策略"接成 SpawnRequest。caster 正是这一环：声明 Caster{onSignal,template,at,targetTag?}：
//    at:'self'   → 施法者自身 Transform（自爆/buff 光环）
//    at:'pointer'→ 光标**世界坐标**（输入采集层已逆投影；暗黑的"点地放冰环/陨石"）
//    at:'target' → 最近的 targetTag 阵营实体坐标（自动索敌技能）
//  收到名为 onSignal 的 Signal 即在施法者实体上产出 SpawnRequest{template, x, y}，prefab 当帧/次帧展开。
//
//  从自然语言到可玩技能全程数据：技能=PrefabTemplate，按键绑定=Signal，释放策略=Caster——零游戏代码。
//  定序：runsAfter event-when/clickable（信号已就绪）；写 SpawnRequest → prefab-spawn 消费（拓扑自动在其后）。
//  确定性（Gemini 致命级修正）：sim 内**绝不读相机/视口**——at:'pointer' 盲信 InputQueue 自带的世界坐标
//  （逆投影由 PointerInputSource 在本地、入网前完成）。否则多端分辨率/相机不同 → 同令异坐标 → 弹道雪崩 desync。
//
//  v1 = 位置策略（点地/自身/索敌）。弹道朝向注入（朝光标/目标给生成体初速度）列 v1.1（见 SESSION-HANDOFF）。
// ═══════════════════════════════════════════════════════════════

// 取本 tick 光标的**世界坐标**（InputQueue 里最后一条带 x/y 的指针事件）。无则 undefined。
// x/y 已是世界坐标——逆投影由输入采集层 PointerInputSource 在本地、入网前完成；sim 内绝不读相机/视口。
function pointerWorldPos(world: IWorld): { x: number; y: number } | undefined {
  let queue: InputQueue | undefined;
  for (const [e] of world.query('InputQueue')) {
    queue = world.getComponent<InputQueue>(e, 'InputQueue');
    break;
  }
  if (!queue || queue.actions.length === 0) return undefined;
  // 最后一条带坐标的指针事件 = 本 tick 光标落点（世界坐标，盲信）。
  for (let i = queue.actions.length - 1; i >= 0; i--) {
    const ev = queue.actions[i];
    if (ev.x !== undefined && ev.y !== undefined) return { x: ev.x, y: ev.y };
  }
  return undefined;
}

export const casterCapability = defineCapability({
  id: 't3-caster',
  version: '1.0.0',

  describe: {
    name: 'caster',
    summary: '信号→生成桥：收到名为 onSignal 的 Signal 时，按 at(self/pointer/target) 算坐标产出 SpawnRequest{template}，由 prefab 展开技能/陷阱/掉落。',
    semantic: ['tier3', 'spawn', 'skill', 'authoring'],
    whenToUse:
      '运行时按数据释放技能/召唤/掉落。技能=PrefabTemplate(数据)，按键/点击→Signal(数据)，释放策略=Caster(数据)。配 prefab，从 NL 到可玩技能零游戏代码。',
    examples: [
      '点地放冰环：Caster{ onSignal:"cast_nova", template:"frost_nova", at:"pointer" }',
      '自动索敌火球：Caster{ onSignal:"cast_bolt", template:"fire_bolt", at:"target", targetTag:ENEMY }',
      '死亡掉落：怪死前发 Signal"drop" → Caster{ onSignal:"drop", template:"loot", at:"self" }',
    ],
  },

  components: {
    provides: {
      Caster: {
        category: 'config',
        describe: '声明「onSignal 信号到达时，按 at 算坐标产出 SpawnRequest{template}」。at=self/pointer/target；target 用 targetTag 索敌。',
        fields: {
          onSignal: { type: 'string', describe: '触发释放的信号名（clickable/event-when/输入绑定产出）' },
          template: { type: 'string', describe: 'PrefabLibrary 里的模板 id' },
          at: { type: 'string', describe: "生成位置：'self'|'pointer'|'target'" },
          targetTag: { type: 'number', describe: "at:'target' 时索敌的阵营位（Tag.flags & targetTag；缺省找最近任意）" },
          overrides: { type: 'string', describe: '实例参数覆盖(REQ-F-032)：{localId:{组件:{字段:值}}}，透传进 SpawnRequest 由 prefab 合并（槽位实体各自声明棋子 HexPos/Tag/数值）' },
          requireHexPos: { type: 'boolean', describe: '部署门(REQ-F-049)：true=锚点实体无 HexPos 则收信号不展开（在板=部署源、离板=静默；拖上板/回席即天然开关）' },
        },
      },
    },
    reads: ['Caster', 'Signal', 'InputQueue', 'Transform', 'Tag', 'Relation', 'HexPos'],
    writes: ['SpawnRequest'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 'caster',
      runsAfter: ['event-when', 'clickable'],
      reads: ['Caster', 'Signal', 'InputQueue', 'Transform', 'Tag', 'HexPos', 'Relation'], // Relation=发起者链判定（申报对账·根因①·系统级此前漏）
      writes: ['SpawnRequest'],
      consumes: [],
      execute(world: IWorld) {
        // 本 tick 在场的信号名。
        const signals = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) signals.add(s.name);
        }
        if (signals.size === 0) return;

        let pointer: { x: number; y: number } | undefined;
        let pointerResolved = false;

        const casterIds = sortedIds(world, 'Caster');
        for (const id of casterIds) {
          const c = world.getComponent<Caster>(id, 'Caster');
          if (!c || !signals.has(c.onSignal)) continue;

          // 锚点实体：缺省=施法者自身；技能绑定实体可委托给英雄（originEntity）。
          const originId = c.originEntity ?? id;
          // 部署门 + 出身格（REQ-F-049）：锚点的 HexPos = 板上身份。requireHexPos 且不在板 → 静默；
          // 在板则把格值（POD 整数快照）盖进请求，供 overrides 的 '@origin-hex' 哨兵代入。
          const originHex = world.getComponent<HexPos>(originId, 'HexPos');
          if (c.requireHexPos && !originHex) continue;
          let x: number;
          let y: number;
          if (c.at === 'self') {
            const t = world.getComponent<Transform>(originId, 'Transform');
            if (!t) continue;
            x = t.x;
            y = t.y;
          } else if (c.at === 'pointer') {
            if (!pointerResolved) {
              pointer = pointerWorldPos(world);
              pointerResolved = true;
            }
            if (!pointer) continue;
            x = pointer.x;
            y = pointer.y;
          } else {
            // 'target'：以锚点实体为原点，优先复用其 aggro 写的 Relation(target)（DRY，与 AI 共用锁定目标）；
            // 没有则即时索敌。让英雄的多把技能（各自独立 Caster 实体）都从英雄位置自动索敌。
            const t = world.getComponent<Transform>(originId, 'Transform');
            if (!t) continue;
            const rel = world.getComponent<Relation>(originId, 'Relation');
            let tid = rel && rel.kind === 'target' ? rel.targetId : undefined;
            if (!tid) tid = nearestByTag(world, t.x, t.y, c.targetTag ?? 0, { excludeId: originId });
            if (!tid) continue;
            const tt = world.getComponent<Transform>(tid, 'Transform');
            if (!tt) continue;
            x = tt.x;
            y = tt.y;
          }

          // overrides 原样透传（REQ-F-032）：槽位实体声明自己棋子的 HexPos/Tag/数值补丁，prefab 合并。
          world.addComponent(id, { type: 'SpawnRequest', templateId: c.template, x, y, source: originId, ...(originHex ? { originHex: { q: originHex.q, r: originHex.r } } : {}), ...(c.overrides ? { overrides: c.overrides } : {}) } as SpawnRequest); // source(REQ-F-065)=施法锚点(originEntity ?? 自身)
        }
      },
    },
  ],
});
