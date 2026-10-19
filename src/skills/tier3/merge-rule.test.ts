import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { MergeRule, PrefabLibrary, PrefabTemplate, SpawnRequest, SpawnOverrides, Transform, Resource, HexPos, PrefabOrigin } from '@engine/protocol/components.js';
import { mergeRuleCapability } from './merge-rule.js';
import { prefabCapability } from './prefab.js';
import { destroyCapability } from '@atom-skills/destroy/index.js';

// merge-rule 系统级测试：经真 World.tick 走完整管线（prefab 展开盖 PrefabOrigin → merge-rule 判
// ≥need → DestroyRequest/SpawnRequest → 同拍 destroy-apply 清场 + prefab 展开产物）。
// 消费方形态对齐 game101（theme.mergeRules：每链每级一条 need:2 into 次级·最高级不写=封顶）。
const xf = (x: number, y: number): Record<string, unknown> => ({ x, y, rotation: 0, scaleX: 1, scaleY: 1 });

const TEMPLATES: Record<string, PrefabTemplate> = {
  a: { entities: { body: { Transform: xf(0, 0), HexPos: { q: 0, r: 0 } } } },
  b: { entities: { main: { Transform: xf(0, 0), HexPos: { q: 0, r: 0 }, Resource: { id: 'hp', current: 100, min: 0, max: 100 } } } },
  c: { entities: { core: { Transform: xf(0, 0) } } },
  // 多实体模板：验证一次展开的全部实体共享一个 seq、合成时全体清场。
  twin: { entities: { z: { Transform: xf(5, 5) }, a: { Transform: xf(1, 1) } } },
  twin2: { entities: { core: { Transform: xf(0, 0) } } },
};

function mergeWorld(rules: Array<Partial<MergeRule> & { template: string; into: string }>): World {
  const w = new World();
  for (const cap of [mergeRuleCapability, prefabCapability, destroyCapability]) {
    for (const s of cap.systems) w.addSystem(s);
  }
  w.createEntity('lib');
  w.addComponent('lib', { type: 'PrefabLibrary', templates: TEMPLATES, seq: 0 } as PrefabLibrary);
  rules.forEach((r, i) => {
    const id = `rule:${i}`;
    w.createEntity(id);
    w.addComponent(id, { type: 'MergeRule', need: 2, ...r } as MergeRule);
  });
  return w;
}
let reqN = 0;
function request(w: World, templateId: string, x: number, y: number, overrides?: SpawnOverrides): void {
  const id = `req:${reqN++}`;
  w.createEntity(id);
  w.addComponent(id, { type: 'SpawnRequest', templateId, x, y, ...(overrides ? { overrides } : {}) } as SpawnRequest);
}
/** 板上某模板存活实例数（distinct seq·同 merge-rule 口径）。 */
function countInstances(w: World, template: string): number {
  const seqs = new Set<number>();
  for (const [eid] of w.query('PrefabOrigin')) {
    const po = w.getComponent<PrefabOrigin>(eid, 'PrefabOrigin')!;
    if (po.templateId === template) seqs.add(po.seq);
  }
  return seqs.size;
}

describe('t3-merge-rule — metadata 契约', () => {
  it('id / reads / writes / consumes 与申报一致', () => {
    expect(mergeRuleCapability.id).toBe('t3-merge-rule');
    expect(mergeRuleCapability.components.reads).toEqual(['MergeRule', 'PrefabOrigin', 'Transform', 'HexPos']);
    expect(mergeRuleCapability.components.writes).toEqual(['DestroyRequest', 'SpawnRequest']);
    expect(mergeRuleCapability.components.consumes).toEqual([]);
    expect(mergeRuleCapability.components.provides.MergeRule).toBeTruthy();
  });
});

describe('t3-merge-rule — 「N 换 1」happy path（真管线：展开→检测→原子替换）', () => {
  it('2 个 a（need=2）→ 次拍原子换成 1 个 b，锚在最老实例位置，a 全清场', () => {
    const w = mergeWorld([{ template: 'a', into: 'b' }]);
    request(w, 'a', 10, 0);
    request(w, 'a', 50, 0);
    w.tick(); // 拍1：prefab 展开 a#0 / a#1（merge 读上一拍实例=空，不动）
    expect(countInstances(w, 'a')).toBe(2);
    w.tick(); // 拍2：merge 判 2≥2 → destroy a×2 + spawn b；同拍 prefab 展开 b、destroy-apply 清 a
    expect(countInstances(w, 'a')).toBe(0);
    expect(countInstances(w, 'b')).toBe(1);
    expect(w.getAllEntities()).not.toContain('a#0:body');
    expect(w.getAllEntities()).not.toContain('a#1:body');
    const t = w.getComponent<Transform>('b#2:main', 'Transform')!;
    expect(t.x).toBe(10); // 最老实例（seq0·x=10）的锚点，非 x=50
    expect(t.y).toBe(0);
    // 载体实体（merge:b:0·单组件）展开后被 prefab 回收，不残留
    expect(w.getAllEntities()).not.toContain('merge:b:0');
  });

  it('同拍 while 连锁 + 跨级次拍接力：4 个 a → 拍2 出 2 个 b → 拍3 出 1 个 c', () => {
    const w = mergeWorld([{ template: 'a', into: 'b' }, { template: 'b', into: 'c' }]);
    for (const x of [10, 20, 30, 40]) request(w, 'a', x, 0);
    w.tick(); // 展开 a seq0..3
    w.tick(); // merge a：while 连锁两轮（[0,1]→b、[2,3]→b）
    expect(countInstances(w, 'a')).toBe(0);
    expect(countInstances(w, 'b')).toBe(2);
    expect(w.getComponent<Transform>('b#4:main', 'Transform')!.x).toBe(10); // 第一轮锚 seq0
    expect(w.getComponent<Transform>('b#5:main', 'Transform')!.x).toBe(30); // 第二轮锚 seq2
    w.tick(); // 跨级：b 的规则次拍接力
    expect(countInstances(w, 'b')).toBe(0);
    expect(countInstances(w, 'c')).toBe(1);
    expect(w.getComponent<Transform>('c#6:core', 'Transform')!.x).toBe(10); // 锚最老 b（seq4）
  });

  it('多实体模板 = 1 个实例（distinct seq 计数）；合成时同实例全部实体清场', () => {
    const w = mergeWorld([{ template: 'twin', into: 'twin2' }]);
    request(w, 'twin', 100, 100);
    request(w, 'twin', 200, 200);
    w.tick();
    expect(countInstances(w, 'twin')).toBe(2); // 4 实体=2 实例，不是 4
    w.tick();
    expect(countInstances(w, 'twin')).toBe(0);
    expect(countInstances(w, 'twin2')).toBe(1);
    for (const id of ['twin#0:z', 'twin#0:a', 'twin#1:z', 'twin#1:a']) {
      expect(w.getAllEntities()).not.toContain(id);
    }
    // 锚点=最老实例中 localId 字典序最小且带 Transform 的实体（'a' 先于 'z'）：100+1=101
    expect(w.getComponent<Transform>('twin2#2:core', 'Transform')!.x).toBe(101);
    expect(w.getComponent<Transform>('twin2#2:core', 'Transform')!.y).toBe(101);
  });

  it('intoOverrides 随产物落地（F-032 管道）：升星补丁改产物 Resource', () => {
    const w = mergeWorld([
      { template: 'a', into: 'b', intoOverrides: { main: { Resource: { current: 480, max: 480 } } } },
    ]);
    request(w, 'a', 0, 0);
    request(w, 'a', 1, 0);
    w.tick();
    w.tick();
    const r = w.getComponent<Resource>('b#2:main', 'Resource')!;
    expect(r.current).toBe(480);
    expect(r.max).toBe(480);
    expect(r.id).toBe('hp'); // 未补丁字段保模板原值
  });

  it('出身格继承（REQ-F-049）：最老实例的 HexPos 经 @origin-hex 哨兵进产物', () => {
    const w = mergeWorld([
      { template: 'a', into: 'b', intoOverrides: { main: { HexPos: '@origin-hex' } } },
    ]);
    request(w, 'a', 0, 0, { body: { HexPos: { q: 3, r: 4 } } }); // 最老（seq0）在格 (3,4)
    request(w, 'a', 1, 0, { body: { HexPos: { q: 9, r: 9 } } });
    w.tick();
    w.tick();
    const hp = w.getComponent<HexPos>('b#2:main', 'HexPos')!;
    expect(hp.q).toBe(3); // 继承最老实例的格，非 (9,9) 也非模板默认 (0,0)
    expect(hp.r).toBe(4);
  });
});

describe('t3-merge-rule — 拒绝/边界（「什么都没发生」分支）', () => {
  it('存量 < need → 不销毁不合成，实例原样存活（多拍稳定）', () => {
    const w = mergeWorld([{ template: 'a', into: 'b', need: 3 }]);
    request(w, 'a', 10, 0);
    request(w, 'a', 20, 0);
    for (let i = 0; i < 4; i++) w.tick();
    expect(countInstances(w, 'a')).toBe(2);
    expect(countInstances(w, 'b')).toBe(0);
    expect(w.query('DestroyRequest').length).toBe(0);
    expect(w.getAllEntities()).toContain('a#0:body');
  });

  it('need<2 的规则整条拒收（防 1 换 1 死循环）', () => {
    const w = mergeWorld([{ template: 'a', into: 'b', need: 1 }]);
    request(w, 'a', 10, 0);
    request(w, 'a', 20, 0);
    for (let i = 0; i < 3; i++) w.tick();
    expect(countInstances(w, 'a')).toBe(2); // 规则被过滤，什么都没发生
    expect(countInstances(w, 'b')).toBe(0);
  });

  it('封顶：产物模板无规则 → 合成一次后稳定，不再连锁', () => {
    const w = mergeWorld([{ template: 'a', into: 'b' }]); // b 无规则=封顶
    for (const x of [10, 20, 30, 40]) request(w, 'a', x, 0);
    for (let i = 0; i < 5; i++) w.tick();
    expect(countInstances(w, 'a')).toBe(0);
    expect(countInstances(w, 'b')).toBe(2); // 2 个 b 停在封顶，不互合
  });

  it('装配期烘死实体（无 PrefabOrigin 戳）不参与合成', () => {
    const w = mergeWorld([{ template: 'a', into: 'b' }]);
    for (const id of ['baked1', 'baked2']) {
      w.createEntity(id);
      w.addComponent(id, { type: 'Transform', ...xf(0, 0) } as unknown as Transform);
    }
    for (let i = 0; i < 3; i++) w.tick();
    expect(countInstances(w, 'b')).toBe(0);
    expect(w.getAllEntities()).toContain('baked1'); // 不被误灭
    expect(w.getAllEntities()).toContain('baked2');
  });
});

describe('t3-merge-rule — 确定性', () => {
  it('同布置双世界跑 4 拍 → 实体集与产物组件逐位一致', () => {
    const run = (): { entities: string[]; origins: Array<[string, string, number]>; xs: Array<[string, number]> } => {
      const w = mergeWorld([{ template: 'a', into: 'b' }, { template: 'b', into: 'c' }]);
      reqN = 0; // 请求载体命名归零，保证两轮布置逐字相同
      for (const x of [10, 20, 30, 40]) request(w, 'a', x, 0);
      for (let i = 0; i < 4; i++) w.tick();
      const entities = [...w.getAllEntities()].sort();
      const origins: Array<[string, string, number]> = [];
      const xs: Array<[string, number]> = [];
      for (const id of entities) {
        const po = w.getComponent<PrefabOrigin>(id, 'PrefabOrigin');
        if (po) origins.push([id, po.templateId, po.seq]);
        const t = w.getComponent<Transform>(id, 'Transform');
        if (t) xs.push([id, t.x]);
      }
      return { entities, origins, xs };
    };
    const first = run();
    expect(first.origins.some(([, tpl]) => tpl === 'c')).toBe(true); // 真跑到了终态（非空对空）
    expect(run()).toEqual(first);
  });
});
