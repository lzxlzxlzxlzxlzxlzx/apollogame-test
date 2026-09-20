import { defineCapability } from '@engine/core/define-capability.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Caster, Signal, InputQueue, Transform, SpawnRequest, Relation, HexPos, GameFlow, DestroyRequest, VolleyPlan } from '@engine/protocol/components.js';
import { nearestByTag } from '@skills/atoms/spatial-query/index.js';
import { checkEntity } from '@skills/tier2/entity-check.js';
import { findDebugTrace, appendTrace } from '@skills/debug-trace.js';

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
          releasePhase: { type: 'string', describe: 'resolve：来源独立技能也在本拍伤害/死亡结算后检查释放' },
          alignToTarget: { type: 'boolean', describe: '承诺目标首次接触前对齐；false=固定落点' },
          onlyHitTarget: { type: 'boolean', describe: '生成区域仅能作用捕获目标；self无目标则仅自身' },
          useCapturedAim: { type: 'boolean', describe: '将Flow启动方向传给Launch及capsule' },
          followSource: { type: 'boolean', describe: '区域在每次碰撞前跟随来源位置' },
          targetFlow: { type: 'string', describe: '可选：只消费该GameFlow已捕获的targetSnapshot，缺失或失效时拒绝，绝不回退最近目标；位置由at独立选择' },
          targetCheck: { type: 'string', describe: '对捕获目标的执行期EntityCheck；未设仅要求实体仍存在' },
          sourceCheck: { type: 'string', describe: '对捕获时sourceId的执行期EntityCheck；未设仅要求实体仍存在' },
        },
      },
    },
    reads: ['Caster', 'Signal', 'InputQueue', 'Transform', 'FrameStartTransform', 'Tag', 'Relation', 'HexPos', 'GameFlow', 'Resource', 'Status', 'DestroyRequest'],
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

        const casterIds = world.query('Caster').map(([id]) => id).sort();
        for (const id of casterIds) {
          const c = world.getComponent<Caster>(id, 'Caster');
          if (!c || c.targetFlow || c.releasePhase === 'resolve' || !signals.has(c.onSignal)) continue;

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
          if (c.volleyCount && c.volleyCount > 0) {
            const sourceT = world.getComponent<Transform>(originId, 'Transform');
            const snap = c.targetFlow ? world.getComponent<GameFlow>(c.targetFlow,'GameFlow')?.targetSnapshot : undefined;
            const targetId = snap?.targetId ?? world.getComponent<Relation>(originId,'Relation')?.targetId;
            if(c.targetFlow && !snap?.targetId) continue;
            const dx = snap?.aim?.x ?? (x - (sourceT?.x ?? x)), dy = snap?.aim?.y ?? (y - (sourceT?.y ?? y)); const len = Math.sqrt(dx*dx+dy*dy) || 1;
            const castId = `${originId}:cast:${world.getVersion()}:${id}`; const planId = `${castId}:volley`;
            world.createEntity(planId); world.addComponent(planId, { type:'VolleyPlan', castId, templateId:c.template, source:originId, sourceTagSnapshot:world.getComponent<any>(originId,'Tag')?.flags ?? 0, targetId:targetId ?? '', aimX:dx/len, aimY:dy/len, count:c.volleyCount, nextShotIndex:0, intervalTicks:c.volleyIntervalTicks ?? 0, nextEmitTick:world.getVersion() + 1, spread:c.volleySpread ?? {kind:'none'}, seed:world.getVersion() ^ originId.length, shotMaxDistance:c.volleyMaxDistance ?? 12, speed:c.volleySpeed ?? 0.6 } as VolleyPlan);
          } else world.addComponent(id, { type: 'SpawnRequest', templateId: c.template, x, y, source: originId, ...(originHex ? { originHex: { q: originHex.q, r: originHex.r } } : {}), ...(c.overrides ? { overrides: c.overrides } : {}) } as SpawnRequest); // source(REQ-F-065)=施法锚点(originEntity ??自身)
        }
      },
    },
    {
      id: 'targeted-caster',
      // Targeted releases must observe this frame's resource/mortal/destroy
      // resolution.  A phase-0 declaration cannot outrun Resolve systems.
      phase: SystemPhase.Resolve,
      // Late eligibility prevents a same-tick death from creating a new effect.  The
      // legacy caster keeps its existing schedule because it ignores targetFlow.
      runsAfter: ['event-when', 'resource-apply', 'mortal', 'destroy-apply', 'caster'],
      reads: ['Caster', 'Signal', 'GameFlow', 'Transform', 'FrameStartTransform', 'Resource', 'Tag', 'Status', 'DestroyRequest'],
      writes: ['SpawnRequest'],
      consumes: [],
      execute(world: IWorld) {
        const signals = new Set<string>();
        for (const [signalId] of world.query('Signal')) {
          const signal = world.getComponent<Signal>(signalId, 'Signal');
          if (signal) signals.add(signal.name);
        }
        if (signals.size === 0) return;
        const doomed = new Set<string>();
        for (const [holderId] of world.query('DestroyRequest')) {
          const request = world.getComponent<DestroyRequest>(holderId, 'DestroyRequest');
          if (request) doomed.add(request.entityId);
        }
        const trace = findDebugTrace(world);
        const committed: string[] = [], rejected: string[] = [];
        const casterIds = world.query('Caster').map(([id]) => id).sort();
        for (const id of casterIds) {
          const caster = world.getComponent<Caster>(id, 'Caster');
          if (!caster || (!caster.targetFlow && caster.releasePhase !== 'resolve') || !signals.has(caster.onSignal)) continue;
          const flow = caster.targetFlow ? world.getComponent<GameFlow>(caster.targetFlow, 'GameFlow') : undefined;
          const snapshot = flow?.targetSnapshot;
          const sourceId = snapshot?.sourceId ?? caster.originEntity ?? id;
          const targetId = snapshot?.targetId;
          if ((caster.targetFlow && !snapshot) || doomed.has(sourceId)
            || !checkEntity(world, sourceId, caster.sourceCheck ?? {})
            || (targetId && (doomed.has(targetId) || !checkEntity(world, targetId, caster.targetCheck ?? {})))) {
            if (trace) rejected.push(id);
            continue;
          }
          // Placement, identity filtering, aim and contact alignment are independent.
          // Source-only late releases never borrow an unrelated enemy Relation.
          const positionId = caster.at === 'self' ? sourceId : caster.at === 'target' ? targetId : undefined;
          const position = positionId ? world.getComponent<Transform>(positionId, 'Transform') : undefined;
          const aim = caster.useCapturedAim ? snapshot?.aim : undefined;
          if (!position || (caster.useCapturedAim && !aim) || (caster.onlyHitTarget && !targetId && caster.at !== 'self')) {
            if (trace) rejected.push(id);
            continue;
          }
          if (caster.volleyCount && caster.volleyCount > 0) {
            // A committed volley captures the Flow snapshot once.  It must never
            // fall back to a later Relation selection in this Resolve phase.
            const volleyAim = aim ?? snapshot?.aim;
            if (!volleyAim) { if (trace) rejected.push(id); continue; }
            const len = Math.hypot(volleyAim.x, volleyAim.y) || 1;
            const castId = `${sourceId}:cast:${world.getVersion()}:${id}`;
            const planId = `${castId}:volley`;
            world.createEntity(planId);
            world.addComponent(planId, {
              type: 'VolleyPlan', castId, templateId: caster.template, source: sourceId,
              sourceTagSnapshot: world.getComponent<any>(sourceId, 'Tag')?.flags ?? 0,
              targetId: targetId ?? '', aimX: volleyAim.x / len, aimY: volleyAim.y / len,
              count: caster.volleyCount, nextShotIndex: 0,
              intervalTicks: caster.volleyIntervalTicks ?? 0, nextEmitTick: world.getVersion() + 1,
              spread: caster.volleySpread ?? { kind: 'none' },
              // A cast-specific integer seed preserves repeatability without
              // sharing a mutable sequence between different casters.
              seed: (world.getVersion() * 1103515245 + id.length * 12345) >>> 0,
              shotMaxDistance: caster.volleyMaxDistance ?? 12, speed: caster.volleySpeed ?? 0.6,
            } as VolleyPlan);
            if (trace) committed.push(`${id}:volley:${planId}`);
            continue;
          }
          world.addComponent(id, {
            type: 'SpawnRequest', spawnPhase: 'resolve', templateId: caster.template,
            x: position.x, y: position.y, source: sourceId,
            ...(caster.at === 'target' && caster.alignToTarget !== false && targetId ? { targetEntity: targetId } : {}),
            ...(caster.onlyHitTarget ? { onlyHitTarget: targetId ?? sourceId } : {}),
            ...(aim ? { aim: { ...aim } } : {}),
            ...(caster.projectile && snapshot?.projectile ? { projectileShot: { ...snapshot.projectile } } : {}),
            ...(caster.followSource ? { followSource: true } : {}),
            ...(caster.overrides ? { overrides: caster.overrides } : {}),
          } as SpawnRequest);
          if (trace) committed.push(`${id}:${positionId}`);
        }
        if (trace) {
          if (committed.length) appendTrace(trace, world.getVersion() + 1, 'targeted-caster', 'commit', committed.join(','), 'committed target');
          if (rejected.length) appendTrace(trace, world.getVersion() + 1, 'targeted-caster', 'reject', rejected.join(','), 'missing, destroyed, or ineligible target');
        }
      },
    },
  ],
});
