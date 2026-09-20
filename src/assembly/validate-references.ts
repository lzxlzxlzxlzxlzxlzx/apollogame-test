import type { EntityBlueprint } from './demo.assembly.js';
import type { SchemaIssue } from './validate-manifest.js';

// ═══════════════════════════════════════════════════════════════
//  引用链接器（Reference Linker）—— manifest 的 id 交叉引用体检（P0）。
//
//  动机：R12 查"字段类型"，但查不了"id 引用是否断链"。引擎运行期对断链全部**静默**
//  （条件缺叶=false、effect 缺目标=吞、信号无人产=死逻辑）——对"最弱 LLM 产数据"，
//  拼错 id 恰是最高频错误类别。本链接器把它们提前到加载期点名。
//
//  严格度：**全部 warning、绝不 error**——id 可以在运行时合法出现（prefab 展开的实体携带
//  Resource/Flag；混合形态游戏可从代码侧注入信号）。链接器是体检报告，不是闸门。
//
//  作用域纪律（防误报）：
//   - "存在宇宙" = 顶层实体 + 所有 PrefabLibrary 模板内实体（它们 spawn 后即存在）。
//   - SelfRule.when / Mortal.resource / Hitbox.resource / AnimState.fsmId 是 **self/目标局部**
//     寻址（读自身或被命中者的组件，非全局 id 路由）——刻意不查，查了全是误报。
//   - targetEntity 类引用按"顶层实体 id ∪ 本模板内兄弟 localId"查（spawn 后 localId 会被改写
//     成动态唯一 id，静态数据本就引用不到，故只有这两类合法目标）。
//   - 空串 = "未配置"语义（如 coinResource:''），一律跳过。
//
//  覆盖的引用关系：
//   ① 信号链：Effect/CraftRecipe/Caster.onSignal、MatchBoard.selectAction（消费者）
//      ↔ EventWhen.signal、KeyBinding.signal、Clickable.action（生产者）。
//   ② 全局 id：ConditionExpr 叶子（EventWhen.when / GameFlow transitions / Dialogue requires）、
//      Effect.targetId(按 kind)/valueFrom、FlowAction.targetId、CraftRecipe costs/gains/grants、
//      Zone.outFlag、GroupCount.countResource、PokerHand/PerCardScore/PerCardRule 的资源/旗标/字符串。
//   ③ 模板引用：Caster.template / Mortal.dropTemplate / SpawnRequest.templateId ∈ PrefabLibrary。
//   ④ 图内引用：GameFlow.current/transitions[].to ∈ states[].id；Dialogue next/successNext/failNext
//      /options[].next ∈ nodes 键。
// ═══════════════════════════════════════════════════════════════

type CompData = Record<string, unknown>;

interface Unit {
  entity: string; // 顶层实体 id 或 `模板"tid"/localId`
  comps: Record<string, CompData>;
  localIds?: ReadonlySet<string>; // 模板内兄弟 localId（targetEntity 的合法目标之一）
}

interface Universe {
  resources: Set<string>;
  flags: Set<string>;
  states: Set<string>;
  timers: Set<string>;
  strings: Set<string>;
  entityIds: Set<string>; // 顶层实体 id
  templates: Set<string>; // 预制模板 id
  signals: Set<string>; // 有生产者的信号名
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const obj = (v: unknown): CompData | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as CompData) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// 顶层实体 + 模板内实体统一展开成 Unit 列表（模板内实体既贡献"存在宇宙"也被体检）。
function collectUnits(entities: Record<string, EntityBlueprint>): Unit[] {
  const units: Unit[] = [];
  for (const [eid, comps] of Object.entries(entities)) {
    units.push({ entity: eid, comps: comps as Record<string, CompData> });
    const templates = obj(obj((comps as Record<string, unknown>).PrefabLibrary)?.templates);
    if (!templates) continue;
    for (const [tid, tpl] of Object.entries(templates)) {
      const tplEntities = obj(obj(tpl)?.entities);
      if (!tplEntities) continue;
      const localIds = new Set(Object.keys(tplEntities));
      for (const [lid, lcomps] of Object.entries(tplEntities)) {
        const c = obj(lcomps);
        if (c) units.push({ entity: `模板"${tid}"/${lid}`, comps: c as Record<string, CompData>, localIds });
      }
    }
  }
  return units;
}

function collectUniverse(entities: Record<string, EntityBlueprint>, units: Unit[]): Universe {
  const u: Universe = {
    resources: new Set(),
    flags: new Set(),
    states: new Set(),
    timers: new Set(),
    strings: new Set(),
    entityIds: new Set(Object.keys(entities)),
    templates: new Set(),
    signals: new Set(),
  };
  for (const { comps } of units) {
    const id = (t: string, f: string): string | undefined => str(obj(comps[t])?.[f]);
    const rid = id('Resource', 'id');
    if (rid) u.resources.add(rid);
    const fid = id('Flag', 'id');
    if (fid) u.flags.add(fid);
    const sid = id('State', 'fsmId');
    if (sid) u.states.add(sid);
    const tid = id('Timer', 'id');
    if (tid) u.timers.add(tid);
    const vid = id('StringVar', 'id');
    if (vid) u.strings.add(vid);
    // 信号生产者三件套
    const ew = id('EventWhen', 'signal');
    if (ew) u.signals.add(ew);
    const kb = id('KeyBinding', 'signal');
    if (kb) u.signals.add(kb);
    const ck = id('Clickable', 'action');
    if (ck) u.signals.add(ck);
    // 预制模板库
    const templates = obj(obj(comps.PrefabLibrary)?.templates);
    if (templates) for (const t of Object.keys(templates)) u.templates.add(t);
  }
  return u;
}

/** manifest 引用完整性体检：返回 warning 级 issue 列表（绝不阻断加载）。 */
export function validateReferences(entities: Record<string, EntityBlueprint>): SchemaIssue[] {
  const units = collectUnits(entities);
  const uni = collectUniverse(entities, units);
  const issues: SchemaIssue[] = [];

  for (const unit of units) {
    const push = (component: string, field: string, message: string): void => {
      issues.push({ entity: unit.entity, component, field, message });
    };
    const checkIn = (set: ReadonlySet<string>, v: unknown, comp: string, field: string, label: string): void => {
      const s = str(v);
      if (s && !set.has(s)) push(comp, field, `引用了不存在的${label} "${s}"`);
    };
    const checkSignal = (v: unknown, comp: string, field: string): void => {
      const s = str(v);
      if (s && !uni.signals.has(s)) push(comp, field, `信号 "${s}" 无任何声明的生产者（EventWhen/KeyBinding/Clickable）——该逻辑永不触发`);
    };
    const checkEntity = (v: unknown, comp: string, field: string): void => {
      const s = str(v);
      if (s && !uni.entityIds.has(s) && !unit.localIds?.has(s)) push(comp, field, `引用了不存在的实体 "${s}"`);
    };
    // 条件树叶子按全局 id 宇宙查（缺叶=运行期恒 false 的隐性死逻辑）。
    const walkCondition = (expr: unknown, comp: string, field: string): void => {
      const e = obj(expr);
      if (!e) return;
      switch (e.kind) {
        case 'and':
        case 'or':
          for (const sub of arr(e.of)) walkCondition(sub, comp, field);
          return;
        case 'not':
          walkCondition(e.of, comp, field);
          return;
        case 'resource':
          checkIn(uni.resources, e.id, comp, field, '资源 Resource.id');
          checkIn(uni.resources, e.vsResource, comp, field, '资源 Resource.id');
          return;
        case 'flag':
          checkIn(uni.flags, e.id, comp, field, '旗标 Flag.id');
          return;
        case 'state':
          checkIn(uni.states, e.fsmId, comp, field, '状态机 State.fsmId');
          return;
        case 'timer':
          checkIn(uni.timers, e.id, comp, field, '计时器 Timer.id');
          return;
        case 'string':
          checkIn(uni.strings, e.id, comp, field, '字符串变量 StringVar.id');
          return;
      }
    };
    const walkDialogueEffects = (effects: unknown, comp: string, field: string): void => {
      for (const ef of arr(effects)) checkIn(uni.resources, obj(ef)?.resource, comp, field, '资源 Resource.id');
    };

    for (const [ctype, data] of Object.entries(unit.comps)) {
      const c = obj(data);
      if (!c) continue;
      switch (ctype) {
        case 'Effect': {
          checkSignal(c.onSignal, ctype, 'onSignal');
          const kind = str(c.kind);
          if (kind === 'set-flag') checkIn(uni.flags, c.targetId, ctype, 'targetId', '旗标 Flag.id');
          else if (kind === 'modify-resource') checkIn(uni.resources, c.targetId, ctype, 'targetId', '资源 Resource.id');
          else if (kind === 'set-state') checkIn(uni.states, c.targetId, ctype, 'targetId', '状态机 State.fsmId');
          else if (kind === 'set-sensor' || kind === 'set-visible' || kind === 'destroy' || kind === 'reset-timer')
            checkEntity(c.targetEntity, ctype, 'targetEntity');
          const vf = obj(c.valueFrom);
          if (vf) {
            checkIn(uni.resources, vf.resourceId, ctype, 'valueFrom.resourceId', '资源 Resource.id');
            checkIn(uni.resources, vf.timesResourceId, ctype, 'valueFrom.timesResourceId', '资源 Resource.id');
          }
          break;
        }
        case 'CraftRecipe': {
          checkSignal(c.onSignal, ctype, 'onSignal');
          for (const cost of arr(c.costs)) checkIn(uni.resources, obj(cost)?.id, ctype, 'costs[].id', '资源 Resource.id');
          for (const gain of arr(c.gains)) checkIn(uni.resources, obj(gain)?.id, ctype, 'gains[].id', '资源 Resource.id');
          checkIn(uni.flags, c.grantsFlag, ctype, 'grantsFlag', '旗标 Flag.id');
          checkIn(uni.states, obj(c.grantsState)?.fsmId, ctype, 'grantsState.fsmId', '状态机 State.fsmId');
          break;
        }
        case 'Caster': {
          checkSignal(c.onSignal, ctype, 'onSignal');
          checkIn(uni.templates, c.template, ctype, 'template', '预制模板');
          checkEntity(c.targetFlow, ctype, 'targetFlow');
          break;
        }
        case 'MatchBoard':
          checkSignal(c.selectAction, ctype, 'selectAction');
          break;
        case 'Mortal':
          checkIn(uni.templates, c.dropTemplate, ctype, 'dropTemplate', '预制模板');
          break;
        case 'SpawnRequest':
          checkIn(uni.templates, c.templateId, ctype, 'templateId', '预制模板');
          break;
        case 'EventWhen':
          walkCondition(c.when, ctype, 'when');
          break;
        case 'Zone':
          checkIn(uni.flags, c.outFlag, ctype, 'outFlag', '旗标 Flag.id');
          break;
        case 'GroupCount':
          checkIn(uni.resources, c.countResource, ctype, 'countResource', '资源 Resource.id');
          break;
        case 'PokerHand': {
          for (const f of ['chipsResource', 'multResource', 'rankMaxCountResource', 'pairCountResource', 'handSizeResource'])
            checkIn(uni.resources, c[f], ctype, f, '资源 Resource.id');
          checkIn(uni.strings, c.handTypeVar, ctype, 'handTypeVar', '字符串变量 StringVar.id');
          checkIn(uni.flags, c.isStraightFlag, ctype, 'isStraightFlag', '旗标 Flag.id');
          checkIn(uni.flags, c.isFlushFlag, ctype, 'isFlushFlag', '旗标 Flag.id');
          break;
        }
        case 'PerCardScore':
          checkIn(uni.resources, c.chipsResource, ctype, 'chipsResource', '资源 Resource.id');
          break;
        case 'PerCardRule':
          checkIn(uni.resources, c.targetResource, ctype, 'targetResource', '资源 Resource.id');
          break;
        case 'GameFlow': {
          // 图内引用：current / transitions[].to ∈ states[].id。
          const states = arr(c.states);
          const stateIds = new Set<string>();
          for (const s of states) {
            const sid = str(obj(s)?.id);
            if (sid) stateIds.add(sid);
          }
          checkIn(stateIds, c.current, ctype, 'current', '流程状态');
          const checkActions = (actions: unknown, field: string): void => {
            for (const a of arr(actions)) {
              const ao = obj(a);
              if (!ao) continue;
              const kind = str(ao.kind);
              if (kind === 'set-flag') checkIn(uni.flags, ao.targetId, ctype, field, '旗标 Flag.id');
              else if (kind === 'set-state') checkIn(uni.states, ao.targetId, ctype, field, '状态机 State.fsmId');
              else if (kind === 'modify-resource') checkIn(uni.resources, ao.targetId, ctype, field, '资源 Resource.id');
              else if (kind === 'set-status') checkEntity(ao.targetEntity, ctype, `${field}.targetEntity`);
            }
          };
          for (const s of states) {
            const so = obj(s);
            if (!so) continue;
            checkActions(so.onEnter, 'states[].onEnter');
            for (const t of arr(so.transitions)) {
              const to = obj(t);
              if (!to) continue;
              checkIn(stateIds, to.to, ctype, 'states[].transitions[].to', '流程状态');
              walkCondition(to.when, ctype, 'states[].transitions[].when');
              const capture = obj(to.captureTarget);
              if (capture) checkEntity(capture.sourceEntity, ctype, 'states[].transitions[].captureTarget.sourceEntity');
              for (const entityWhen of arr(to.whenEntities)) {
                const entityWhenObject = obj(entityWhen);
                if (!entityWhenObject) continue;
                checkEntity(entityWhenObject.entityId, ctype, 'states[].transitions[].whenEntities[].entityId');
                checkEntity(entityWhenObject.targetFlow, ctype, 'states[].transitions[].whenEntities[].targetFlow');
              }
              checkActions(to.do, 'states[].transitions[].do');
            }
          }
          break;
        }
        case 'DialogueScript': {
          // 图内引用：next/successNext/failNext/options[].next ∈ nodes 键（null=终点，合法）。
          const nodes = obj(c.nodes);
          if (!nodes) break;
          const nodeIds = new Set(Object.keys(nodes));
          const checkNext = (v: unknown, field: string): void => {
            const s = str(v);
            if (s && !nodeIds.has(s)) push(ctype, field, `跳转到不存在的对话节点 "${s}"`);
          };
          for (const [nid, node] of Object.entries(nodes)) {
            const n = obj(node);
            if (!n) continue;
            const kind = str(n.kind);
            if (kind === 'line') checkNext(n.next, `nodes.${nid}.next`);
            else if (kind === 'choice') {
              for (const op of arr(n.options)) {
                const o = obj(op);
                if (!o) continue;
                checkNext(o.next, `nodes.${nid}.options[].next`);
                walkCondition(o.requires, ctype, `nodes.${nid}.options[].requires`);
                walkDialogueEffects(o.effects, ctype, `nodes.${nid}.options[].effects`);
                checkIn(uni.flags, o.setFlag, ctype, `nodes.${nid}.options[].setFlag`, '旗标 Flag.id');
              }
            } else if (kind === 'check') {
              checkIn(uni.resources, n.attribute, ctype, `nodes.${nid}.attribute`, '资源 Resource.id');
              checkIn(uni.resources, n.bonusFrom, ctype, `nodes.${nid}.bonusFrom`, '资源 Resource.id');
              checkNext(n.successNext, `nodes.${nid}.successNext`);
              checkNext(n.failNext, `nodes.${nid}.failNext`);
              walkDialogueEffects(n.successEffects, ctype, `nodes.${nid}.successEffects`);
              walkDialogueEffects(n.failEffects, ctype, `nodes.${nid}.failEffects`);
            }
          }
          break;
        }
      }
    }
  }
  return issues;
}
