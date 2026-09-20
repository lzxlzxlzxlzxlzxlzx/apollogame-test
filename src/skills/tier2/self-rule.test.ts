import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { SelfRule, Resource, Flag } from '@engine/protocol/components.js';
import { selfRuleCapability, evaluateSelfCondition } from './self-rule.js';

function mk(): World {
  const w = new World();
  for (const s of selfRuleCapability.systems) w.addSystem(s);
  return w;
}
const unit = (w: World, id: string, rule: Omit<SelfRule, 'type'>, comps: Record<string, unknown>[] = []) => {
  w.createEntity(id);
  w.addComponent(id, { type: 'SelfRule', ...rule } as SelfRule);
  for (const c of comps) w.addComponent(id, c as never);
};
const res = (id: string, current: number, min = 0, max = 1000) => ({ type: 'Resource', id, current, min, max });
const flag = (id: string, active = false) => ({ type: 'Flag', id, active });
const R = (w: World, e: string) => w.getComponent<Resource>(e, 'Resource')!;
const F = (w: World, e: string) => w.getComponent<Flag>(e, 'Flag')!;

describe('self-rule · 实体本地条件求值（读自身组件，非全局）', () => {
  it('resource/flag 读自身那一份；id 给了则校验', () => {
    const w = mk();
    w.createEntity('u'); w.addComponent('u', res('hp', 5) as never); w.addComponent('u', flag('berserk', true) as never);
    expect(evaluateSelfCondition(w, 'u', { kind: 'resource', id: 'hp', cmp: 'lte', value: 5 })).toBe(true);
    expect(evaluateSelfCondition(w, 'u', { kind: 'resource', id: 'mana', cmp: 'lte', value: 5 })).toBe(false); // id 不符
    expect(evaluateSelfCondition(w, 'u', { kind: 'flag', id: 'berserk' })).toBe(true);
    expect(evaluateSelfCondition(w, 'u', { kind: 'and', of: [{ kind: 'resource', id: 'hp', cmp: 'gt', value: 0 }, { kind: 'flag', id: 'berserk' }] })).toBe(true);
  });
});

describe('self-rule · level：通用化 mortal（自身 HP≤0 → destroy 自身）', () => {
  it('多单位各自治：HP≤0 的死、其余活（每实体只判/写自身）', () => {
    const w = mk();
    const deathRule = { when: { kind: 'resource' as const, id: 'hp', cmp: 'lte' as const, value: 0 }, do: [{ kind: 'destroy' as const }] };
    unit(w, 'A', deathRule, [res('hp', 0)]);
    unit(w, 'B', deathRule, [res('hp', 5)]);
    w.tick();
    expect(w.hasComponent('A', 'DestroyRequest')).toBe(true);  // A 死
    expect(w.hasComponent('B', 'DestroyRequest')).toBe(false); // B 活
  });
});

describe('self-rule · once：上升沿只施一次（迟滞）', () => {
  it('血<30 → 置 berserk 一次；持续<30 不重复；回血>30 复位、再掉血再触发', () => {
    const w = mk();
    unit(w, 'u', {
      when: { kind: 'resource', id: 'hp', cmp: 'lt', value: 30 },
      do: [{ kind: 'set-flag', value: true }],
      once: true,
    }, [res('hp', 20), flag('x', false)]);
    w.tick();
    expect(F(w, 'u').active).toBe(true); // 首次触发
    F(w, 'u').active = false; // 手动清，验证不重复施
    w.tick();
    expect(F(w, 'u').active).toBe(false); // 仍 <30 但 armed → 不重复
    R(w, 'u').current = 50; w.tick(); // 回血 >30 → 复位 armed
    R(w, 'u').current = 10; w.tick(); // 再掉 <30 → 再次触发
    expect(F(w, 'u').active).toBe(true);
  });
});

describe('self-rule · level modify-resource：满怒清零（每拍检）', () => {
  it('rage≥100 → set 0（对自身）', () => {
    const w = mk();
    unit(w, 'u', {
      when: { kind: 'resource', id: 'rage', cmp: 'gte', value: 100 },
      do: [{ kind: 'modify-resource', op: 'set', value: 0 }],
    }, [res('rage', 120, 0, 200)]);
    w.tick();
    expect(R(w, 'u').current).toBe(0);
  });
});

describe('self-rule · spawn 动作（self 轴的 caster 对偶，REQ-021 扩展）', () => {
  const xf = (x: number, y: number) => ({ type: 'Transform', x, y, rotation: 0, scaleX: 1, scaleY: 1 });
  const target = (id: string) => ({ type: 'Relation', kind: 'target', targetId: id });
  const spawnReq = (w: World, e: string) =>
    w.getComponent(`self-spawn:${e}`, 'SpawnRequest') as unknown as { templateId: string; x: number; y: number } | undefined;

  it('at:self → 在自身位置发 SpawnRequest', () => {
    const w = mk();
    unit(w, 'u', { when: { kind: 'always' }, do: [{ kind: 'spawn', template: 'bolt', at: 'self' }] }, [xf(10, 20)]);
    w.tick();
    expect(spawnReq(w, 'u')).toMatchObject({ templateId: 'bolt', x: 10, y: 20 });
  });

  it('at:target → 在自身 Relation(target) 的位置发 SpawnRequest', () => {
    const w = mk();
    w.createEntity('enemy'); w.addComponent('enemy', xf(99, 77) as never);
    unit(w, 'u', { when: { kind: 'always' }, do: [{ kind: 'spawn', template: 'strike', at: 'target' }] }, [xf(0, 0), target('enemy')]);
    w.tick();
    expect(spawnReq(w, 'u')).toMatchObject({ templateId: 'strike', x: 99, y: 77 });
  });

  it('at:target 无目标 → 不生成（目标存在性即战斗门，免全局 in_combat 旗标）', () => {
    const w = mk();
    unit(w, 'u', { when: { kind: 'always' }, do: [{ kind: 'spawn', template: 'strike', at: 'target' }] }, [xf(0, 0)]); // 无 Relation
    w.tick();
    expect(spawnReq(w, 'u')).toBeUndefined();
  });

  it('★ 同模板多实例各自按自身节拍生成（三星合体命门：唯一 id 脚手架表达不了，self-rule 可）', () => {
    const w = mk();
    w.createEntity('foe'); w.addComponent('foe', xf(100, 100) as never);
    // 三个"同一份数据"的单位（模拟 prefab 同模板展开）：完全相同的 SelfRule + 相同 template，区别只在位置/计时。
    const sameRule: Omit<SelfRule, 'type'> = { when: { kind: 'timer', id: 'atk', cmp: 'gte', value: 30 }, do: [{ kind: 'spawn', template: 'strike', at: 'target' }] };
    unit(w, 'guan#1', sameRule, [xf(0, 0), target('foe'), { type: 'Timer', id: 'atk', elapsed: 30, duration: 30, loop: true }]);
    unit(w, 'guan#2', sameRule, [xf(10, 0), target('foe'), { type: 'Timer', id: 'atk', elapsed: 5, duration: 30, loop: true }]); // 未到点
    unit(w, 'guan#3', sameRule, [xf(20, 0), target('foe'), { type: 'Timer', id: 'atk', elapsed: 30, duration: 30, loop: true }]);
    w.tick();
    // #1/#3 各自到点发了一发（不串台、不齐射）；#2 未到点不发。全局 caster+signal 做不到这种"各自节拍"。
    expect(spawnReq(w, 'guan#1')).toMatchObject({ templateId: 'strike' });
    expect(spawnReq(w, 'guan#2')).toBeUndefined();
    expect(spawnReq(w, 'guan#3')).toMatchObject({ templateId: 'strike' });
  });
});

describe('self-rule · 确定性（跨实体无干扰）', () => {
  it('两单位同规则同输入 → 同结果，与创建/遍历序无关', () => {
    const build = (order: string[]) => {
      const w = mk();
      const rule = { when: { kind: 'resource' as const, id: 'hp', cmp: 'lte' as const, value: 0 }, do: [{ kind: 'destroy' as const }] };
      for (const id of order) unit(w, id, rule, [res('hp', id === 'dead' ? 0 : 9)]);
      w.tick();
      return w;
    };
    const a = build(['dead', 'alive']);
    const b = build(['alive', 'dead']); // 反序创建
    expect(a.hasComponent('dead', 'DestroyRequest')).toBe(b.hasComponent('dead', 'DestroyRequest'));
    expect(a.hasComponent('alive', 'DestroyRequest')).toBe(false);
    expect(b.hasComponent('alive', 'DestroyRequest')).toBe(false);
  });
});

// ── REQ-F-035：whenGlobal 全局阶段门（实体自治 ∧ 全局相位约束） ──
import type { GameFlow, Tag } from '@engine/protocol/components.js';
import { flowCapability } from '../tier3/flow.js';
import { zoneOccupancyCapability } from './zone-occupancy.js';
import { groupCountCapability } from './group-count.js';
import { resourceCapability } from '@atom-skills/resource/index.js';
describe('self-rule · REQ-F-035 whenGlobal 全局阶段门', () => {
  it('门=false 整条跳过（自身条件成立也不施）；门=true 恢复；缺省不设=零迁移', () => {
    const w = mk();
    // 全局相位 flag（住独立实体，按 id 全局路由）
    w.createEntity('phase'); w.addComponent('phase', flag('in_combat', false) as never);
    const atk = {
      when: { kind: 'resource' as const, id: 'mp', cmp: 'gte' as const, value: 10 },
      whenGlobal: { kind: 'flag' as const, id: 'in_combat' },
      do: [{ kind: 'modify-resource' as const, op: 'set' as const, value: 0 }],
    };
    unit(w, 'gated', atk, [res('mp', 50)]);
    unit(w, 'free', { when: { kind: 'resource', id: 'mp', cmp: 'gte', value: 10 }, do: [{ kind: 'modify-resource', op: 'set', value: 0 }] }, [res('mp', 50)]); // 无门
    w.tick();
    expect(R(w, 'gated').current).toBe(50); // 备战：门关，未施
    expect(R(w, 'free').current).toBe(0); // 零迁移：无门规则照常
    F(w, 'phase').active = true; // 开战
    w.tick();
    expect(R(w, 'gated').current).toBe(0); // 门开，施了
  });

  it('once + 门：备战期 armed 不动，开战后首个上升沿才触发一次', () => {
    const w = mk();
    w.createEntity('phase'); w.addComponent('phase', flag('in_combat', false) as never);
    unit(w, 'u', {
      when: { kind: 'resource', id: 'mp', cmp: 'gte', value: 10 },
      whenGlobal: { kind: 'flag', id: 'in_combat' },
      once: true,
      do: [{ kind: 'set-flag', value: true }],
    }, [res('mp', 99), flag('ulted', false)]);
    w.tick(); w.tick(); // 备战两拍：门关
    expect(F(w, 'u').active).toBe(false);
    F(w, 'phase').active = true;
    w.tick(); // 开战：上升沿触发一次
    expect(F(w, 'u').active).toBe(true);
  });

  it('定序守护：flow+zone-occupancy+group-count+resource-apply+self-rule 同场不抛（互 RMW 潜伏环已排）+ flow 相位同帧生效', () => {
    const w = new World();
    for (const cap of [flowCapability, zoneOccupancyCapability, groupCountCapability, resourceCapability, selfRuleCapability]) {
      for (const s of cap.systems) w.addSystem(s as never);
    }
    // flow：combat 态 onEnter 置 in_combat=true；enemies_alive≤0 → resolution 态 onEnter 置 false
    w.createEntity('phase'); w.addComponent('phase', flag('in_combat', false) as never);
    const ENEMY = 1 << 2;
    w.createEntity('gc'); w.addComponent('gc', { type: 'GroupCount', countResource: 'enemies_alive', requiredTag: ENEMY } as never);
    w.createEntity('cnt'); w.addComponent('cnt', res('enemies_alive', 0) as never);
    w.createEntity('e1'); w.addComponent('e1', { type: 'Tag', flags: ENEMY } as Tag);
    w.createEntity('flow'); w.addComponent('flow', { type: 'GameFlow', id: 'g', current: 'combat', entered: false, states: [
      { id: 'combat', onEnter: [{ kind: 'set-flag', targetId: 'in_combat', value: true }], transitions: [{ when: { kind: 'resource', id: 'enemies_alive', cmp: 'lte', value: 0 }, to: 'resolution' }] },
      { id: 'resolution', onEnter: [{ kind: 'set-flag', targetId: 'in_combat', value: false }] },
    ] } as GameFlow);
    unit(w, 'hero', {
      when: { kind: 'resource', id: 'mp', cmp: 'gte', value: 0 }, // 自身恒真
      whenGlobal: { kind: 'flag', id: 'in_combat' },
      do: [{ kind: 'modify-resource', op: 'add', value: 1 }], // 每个战斗拍 mp+1（可数的"行动"）
    }, [res('mp', 0)]);
    expect(() => { for (let i = 0; i < 3; i++) w.tick(); }).not.toThrow(); // 修复前互 RMW 抛环
    expect(R(w, 'hero').current).toBe(3); // flow 先行：combat 拍门同帧开，行动累计
    w.destroyEntity('e1'); // 清场 → group-count 写 0 → flow 转 resolution → 门同帧关
    const before = R(w, 'hero').current;
    w.tick(); w.tick(); // 转移拍 + 结算拍
    w.tick();
    expect(R(w, 'hero').current - before).toBeLessThanOrEqual(1); // 至多转移那一拍仍行动，此后停手
    const last = R(w, 'hero').current;
    w.tick();
    expect(R(w, 'hero').current).toBe(last); // resolution 期不再行动
  });
});

// ── REQ-F-036：完整战斗图守护（F-035 五系统守护没带 hitbox 链 → 残三元环漏网，此为补刀） ──
import { hitboxCapability } from './hitbox.js';
import { overTimeCapability } from './over-time.js';
import { triggerZoneCapability } from './trigger-zone.js';
import { mortalCapability } from './mortal.js';
import { eventWhenCapability } from './event-when.js';
import { overlapDetectCapability } from '@atom-skills/overlap-detect/index.js';
import { destroyCapability } from '@atom-skills/destroy/index.js';
import { hierarchyCascadeCapability } from '../tier1/hierarchy-cascade.js';
import { casterCapability } from '../tier3/caster.js';
import { prefabCapability } from '../tier3/prefab.js';
describe('self-rule · REQ-F-036 完整战斗图同场不抛（残环二刷）', () => {
  it('15 能力全家桶 + self-rule：拓扑不抛（修复前 self-rule→hitbox→resource-apply→self-rule 三元环）且 whenGlobal 门仍同帧', () => {
    const w = new World();
    const caps = [
      flowCapability, zoneOccupancyCapability, groupCountCapability, resourceCapability,
      overlapDetectCapability, triggerZoneCapability, hitboxCapability, overTimeCapability,
      mortalCapability, eventWhenCapability, casterCapability, prefabCapability,
      destroyCapability, hierarchyCascadeCapability, selfRuleCapability,
    ];
    for (const cap of caps) for (const s of cap.systems) w.addSystem(s as never);
    w.createEntity('phase'); w.addComponent('phase', flag('in_combat', true) as never);
    unit(w, 'hero', {
      when: { kind: 'resource', id: 'mp', cmp: 'gte', value: 0 },
      whenGlobal: { kind: 'flag', id: 'in_combat' },
      do: [{ kind: 'modify-resource', op: 'add', value: 1 }],
    }, [res('mp', 0)]);
    expect(() => { for (let i = 0; i < 3; i++) w.tick(); }).not.toThrow(); // 修复前抛 10 系统 SCC
    expect(R(w, 'hero').current).toBe(3); // 门开正常行动
    F(w, 'phase').active = false;
    w.tick();
    expect(R(w, 'hero').current).toBe(3); // 门关同帧停手
  });
});

// ── 回驳证明测试（主程 2026-08-07·game108【R-108-04】罚血「欠债 → 真扣血」）────────────
// 提需方举证：「全局条件成立时扣**指定一侧**的 hp，现有能力表达不了——能读全局的写不到指定侧，
// 能写指定侧的读不到全局」。**实查证伪**：`SelfRule` 两头都有——`whenGlobal` 按全局 id 求值
// （REQ-F-035「实体自治但受全局相位约束」），`do` 施于**自身**（一实体一组件 ⇒ 打到的就是该侧那份 hp）。
// 故此需求 **wontfix·不开引擎单**，本组用例就是等价数据写法的可执行证明。
describe('self-rule · 全局条件 → 只扣指定一侧（罚血形态·回驳证明）', () => {
  /** 两侧各一份 hp；欠债计数住独立实体（一实体一组件），id 全局唯一。 */
  const arena = (p1Debt: number): World => {
    const w = mk();
    for (const p of ['p1', 'p2']) { w.createEntity(p); w.addComponent(p, res('hp', 100) as never); }
    w.createEntity('debt:p1');
    w.addComponent('debt:p1', res('p1.debt', p1Debt) as never);
    return w;
  };

  it('whenGlobal 读全局欠债 + do 施于自身 → p1 掉血、p2 纹丝不动', () => {
    const w = arena(3);
    w.addComponent('p1', {
      type: 'SelfRule',
      whenGlobal: { kind: 'resource', id: 'p1.debt', cmp: 'gte', value: 1 }, // 全局 id 路由
      when: { kind: 'resource', id: 'hp', cmp: 'gt', value: 0 },             // 自身：还活着才罚
      do: [{ kind: 'modify-resource', value: -5 }],                          // 施于自身 = 该侧的 hp
    } as unknown as SelfRule);
    w.tick();
    expect(R(w, 'p1').current).toBe(95);
    expect(R(w, 'p2').current).toBe(100); // 关键：另一侧不受影响（举证说做不到的正是这一条）
  });

  it('欠债清零 → 罚血自动停（whenGlobal 转假，整条跳过）', () => {
    const w = arena(0);
    w.addComponent('p1', {
      type: 'SelfRule',
      whenGlobal: { kind: 'resource', id: 'p1.debt', cmp: 'gte', value: 1 },
      when: { kind: 'resource', id: 'hp', cmp: 'gt', value: 0 },
      do: [{ kind: 'modify-resource', value: -5 }],
    } as unknown as SelfRule);
    w.tick(); w.tick();
    expect(R(w, 'p1').current).toBe(100);
  });

  // ⚠ 写数据的人必须知道的一条：`once` 的 armed 复位**只看 `when`（自身），不看 `whenGlobal`**
  // ——实现里 whenGlobal 为假是 `continue` 整条跳过，注释明写「armed 不动：once 规则跨相位保持待发」。
  // ⇒ **周期节拍要放 `when` 里**（读自身那份 Flag），放 whenGlobal 里只会罚第一次就再也不复位。
  it('周期性：节拍旗放 `when`（自身）+ once → 每个上升沿罚一次，不是每拍刷血', () => {
    const w = arena(3);
    w.addComponent('p1', flag('p1.penalty.tick', false) as never); // 节拍旗挂**自己身上**（id 全局唯一 → Effect 仍可按 id 置位）
    w.addComponent('p1', {
      type: 'SelfRule',
      whenGlobal: { kind: 'resource', id: 'p1.debt', cmp: 'gte', value: 1 }, // 全局门只管「该不该罚」
      when: { kind: 'flag', id: 'p1.penalty.tick', equals: true },           // 周期在自身侧 → armed 才复位得了
      do: [{ kind: 'modify-resource', value: -5 }],
      once: true,
    } as unknown as SelfRule);
    w.tick(); w.tick();
    expect(R(w, 'p1').current).toBe(100);   // 旗没抬 → 一点没罚
    F(w, 'p1').active = true; w.tick(); w.tick(); w.tick();
    expect(R(w, 'p1').current).toBe(95);    // 抬起来只罚 1 次（不是 3 次）
    F(w, 'p1').active = false; w.tick();
    F(w, 'p1').active = true;  w.tick();
    expect(R(w, 'p1').current).toBe(90);    // 回落复位 → 下一个上升沿再罚 1 次
    expect(R(w, 'p2').current).toBe(100);   // 全程另一侧不受影响
  });
});
