import { describe, it, expect } from 'vitest';
import { parseManifest, parseManifestDetailed, MANIFEST_SCHEMA } from './manifest.js';
import { exportManifest } from '../studio/inspect.js';
import { Engine } from '../runtime/engine.js';
import { benchBlueprint } from '../bench/zerocraft-bench.js';
import type { WorldBlueprint } from './demo.assembly.js';
import { demoBlueprint } from './demo.assembly.js';

const games: Array<[string, () => WorldBlueprint]> = [
  ['demo', () => demoBlueprint],
];

function hashAfter(bp: WorldBlueprint, n = 60): string {
  const e = new Engine({ tickRate: 60 });
  e.load(bp);
  for (let i = 0; i < n; i++) e.world.tick();
  return e.hash();
}

describe('manifest 桥接：导出↔导入对称、可加载、可玩', () => {
  for (const [name, build] of games) {
    it(`${name}: export → parseManifest 重建后 hash 与原始一致（忠实可加载）`, () => {
      const orig = build();
      const rebuilt = parseManifest(JSON.parse(exportManifest(orig)));
      expect(hashAfter(rebuilt)).toBe(hashAfter(orig));
    });

    it(`${name}: 重建蓝图能过 ZeroCraftBench`, () => {
      const rebuilt = () => parseManifest(JSON.parse(exportManifest(build())));
      expect(benchBlueprint(name, rebuilt).passed).toBe(true);
    });
  }

  it('schema 版本位（P1c）：缺省=1 通过；等于当前版本通过；比引擎新 → 拒收；非数字 → 拒收', () => {
    const base = { capabilities: ['a1-transform'], entities: { e: { Transform: { x: 0, y: 0 } } } };
    expect(() => parseManifest(base)).not.toThrow();
    expect(() => parseManifest({ ...base, schema: MANIFEST_SCHEMA })).not.toThrow();
    expect(() => parseManifest({ ...base, schema: MANIFEST_SCHEMA + 1 })).toThrow(/比本引擎支持的/);
    expect(() => parseManifest({ ...base, schema: '1' })).toThrow(/schema 必须是数字/);
  });

  it('嵌套校验（P1c）：EventWhen.when 里错 kind → 装载期拒收并点名路径（此前 when 被声明成 string·静默通过）', () => {
    const bad = {
      capabilities: ['t2-event-when', 'f1-resource'],
      entities: { r: { Resource: { id: 'hp', current: 1, min: 0, max: 9 } }, ew: { EventWhen: { signal: 's', mode: 'edge', armed: false, when: { kind: 'and', of: [{ kind: 'resorce', id: 'hp', cmp: 'lte', value: 0 }] } } } },
    };
    expect(() => parseManifest(bad)).toThrow(/EventWhen\.when\.of\[0\].*"kind" 应为/);
    const ok = JSON.parse(JSON.stringify(bad));
    ok.entities.ew.EventWhen.when.of[0].kind = 'resource';
    expect(() => parseManifest(ok)).not.toThrow();
  });

  it('模板 + $repeat（P2b）：buildBlueprint 的 for 循环/工厂函数有了 JSON 等价物；无这些键时逐字原样', () => {
    const raw = {
      capabilities: ['a1-transform', 'f1-resource'],
      templates: { slot: { Transform: { x: '{{x}}', y: 0 }, Resource: { id: 'slot-{{i}}-hp', current: '{{hp}}', min: 0, max: 100 } } },
      entities: {
        hero: { Transform: { x: 1, y: 2 } },
        'slot-{{i}}': { $repeat: { count: 3 }, $template: 'slot', $params: { x: 10, hp: 50 } },
        'unit-{{item.name}}': { $repeat: { items: [{ name: 'a', p: 5 }, { name: 'b', p: 7 }] }, $template: 'slot', $params: { x: '{{item.p}}', hp: 1 }, Transform: { x: 99, y: '{{i}}' } },
      },
    };
    const bp = parseManifest(raw);
    expect(Object.keys(bp.entities).sort()).toEqual(['hero', 'slot-0', 'slot-1', 'slot-2', 'unit-a', 'unit-b']);
    expect(bp.entities['slot-1']).toEqual({ Transform: { x: 10, y: 0 }, Resource: { id: 'slot-1-hp', current: 50, min: 0, max: 100 } }); // 整串占位 → 数值原类型
    expect(bp.entities['unit-b']).toEqual({ Transform: { x: 99, y: 1 }, Resource: { id: 'slot-1-hp', current: 1, min: 0, max: 100 } }); // 组件级覆盖整体替换 Transform
    expect(() => parseManifest({ ...raw, entities: { z: { $template: 'nope' } } })).toThrow(/不存在的模板 "nope"/);
    expect(() => parseManifest({ ...raw, entities: { same: { $repeat: { count: 2 }, $template: 'slot' } } })).toThrow(/重复实体 id "same"/);
    expect(() => parseManifest({ ...raw, templates: [] })).toThrow(/templates 必须是/);
  });

  it('meta.tickRate（P2d）：进蓝图 meta；非正数拒收；时长单位糖 "2s"/"500ms"/"1.5min" 按 tickRate 换算成整数 tick', () => {
    const raw = {
      capabilities: ['e1-timer', 'f1-resource'],
      meta: { tickRate: 30 },
      entities: {
        t: { Timer: { id: 'door', elapsed: 0, duration: '2s', loop: false } },
        r: { Resource: { id: 'hp', current: '500ms', min: 0, max: '1.5min' } },
      },
    };
    const { blueprint, warnings } = parseManifestDetailed(raw);
    expect(blueprint.meta).toEqual({ tickRate: 30 });
    expect((blueprint.entities.t as { Timer: { duration: number } }).Timer.duration).toBe(60); // 2s @30Hz
    expect((blueprint.entities.r as { Resource: { current: number; max: number } }).Resource.current).toBe(15); // 500ms
    expect((blueprint.entities.r as { Resource: { max: number } }).Resource.max).toBe(2700); // 1.5min
    expect(warnings.some((w) => w.includes('时长单位糖') && w.includes('30Hz'))).toBe(true);
    // 缺 meta → 60Hz 换算；字符串字段（Timer.id）不动
    const bp2 = parseManifest({ ...raw, meta: undefined, entities: { t: { Timer: { id: '2s', elapsed: 0, duration: '2s', loop: false } } } });
    expect((bp2.entities.t as { Timer: { id: string; duration: number } }).Timer).toMatchObject({ id: '2s', duration: 120 });
    expect(() => parseManifest({ ...raw, meta: { tickRate: 0 } })).toThrow(/meta.tickRate 必须是正数/);
    expect(() => parseManifest({ ...raw, meta: [] })).toThrow(/meta 必须是对象/);
  });

  it('tags 名字表（B-8）：数字字段写 "enemy|boss" 装载折成位或；未知名字硬错；tags 非法拒收；无 tags 表时字符串照旧走类型错', () => {
    const raw = {
      capabilities: ['g1-tag', 't2-group-count', 'f1-resource'],
      tags: { enemy: 1, boss: 2, player: 4 },
      entities: {
        e: { Tag: { flags: 'enemy|boss' } },
        p: { Tag: { flags: 'player' } },
        c: { GroupCount: { countResource: 'n', requiredTag: ' enemy | boss ' }, Resource: { id: 'n', current: 0, min: 0, max: 99 } },
      },
    };
    const { blueprint, warnings } = parseManifestDetailed(raw);
    expect((blueprint.entities.e as { Tag: { flags: number } }).Tag.flags).toBe(3);
    expect((blueprint.entities.p as { Tag: { flags: number } }).Tag.flags).toBe(4);
    expect((blueprint.entities.c as { GroupCount: { requiredTag: number } }).GroupCount.requiredTag).toBe(3);
    expect(warnings.some((w) => w.includes('Tag 名字已折成位掩码'))).toBe(true);
    expect(() => parseManifest({ ...raw, entities: { e: { Tag: { flags: 'enemy|bozz' } } } })).toThrow(/未声明的 tag 名 "bozz"/);
    expect(() => parseManifest({ ...raw, tags: { enemy: -1 } })).toThrow(/tags.enemy 必须是/);
    expect(() => parseManifest({ ...raw, tags: [] })).toThrow(/tags 必须是/);
    // 无 tags 表：字符串留给 schema 校验按类型错拒收（旧行为不变）
    expect(() => parseManifest({ capabilities: ['g1-tag'], entities: { e: { Tag: { flags: 'enemy' } } } })).toThrow();
    // 纯数字照旧
    expect((parseManifest({ ...raw, entities: { e: { Tag: { flags: 5 } } } }).entities.e as { Tag: { flags: number } }).Tag.flags).toBe(5);
  });

  it('未知 capability id → 明确报错', () => {
    expect(() => parseManifest({ capabilities: ['nope.nope'], entities: {} })).toThrow(/未知 capability/);
  });

  it('数组 entities（旧生成格式）→ 报错并指引', () => {
    expect(() => parseManifest({ capabilities: [], entities: [] })).toThrow(/旧生成格式|entities/);
  });

  it('组件数据里多带的 type 字段会被剥掉（键才是权威）', () => {
    const bp = parseManifest({
      capabilities: ['a1-transform'],
      entities: { e: { Transform: { type: 'Transform', x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 } } },
    });
    expect((bp.entities.e.Transform as Record<string, unknown>).type).toBeUndefined();
    expect((bp.entities.e.Transform as Record<string, unknown>).x).toBe(1);
  });

  it('canonical 预设形态(平台跳跃, 相机居中)→ parseManifest→load→过 ZeroCraftBench', () => {
    // 镜像 zerocraft.py 的 platformer 预设结构：证明「在透视器里打开」的预设路径可加载可玩。
    const manifest = {
      name: 'preset-platformer',
      capabilities: ['a1-transform', 'b1-velocity', 'b2-acceleration', 'c1-shape', 'l2-color',
        'd1-overlap-detect', 't1-accel-apply', 't1-motion-apply', 't2-collision-resolve', 't2-bounds-clamp'],
      entities: {
        camera: { Camera: { zoom: 1, offsetX: 320, offsetY: 200, rotation: 0, viewportW: 640, viewportH: 400 } },
        player: {
          Transform: { x: 120, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
          Velocity: { vx: 0, vy: 0, angular: 0 }, Acceleration: { ax: 0, ay: 0.5 },
          Shape: { kind: 'box', width: 20, height: 20 }, Mass: { value: 1 },
          Color: { tint: 0x38bdf8, alpha: 1 }, Bounds: { minX: 0, minY: 0, maxX: 640, maxY: 400 },
        },
        ground: {
          Transform: { x: 320, y: 385, rotation: 0, scaleX: 1, scaleY: 1 },
          Shape: { kind: 'box', width: 640, height: 30 }, Mass: { value: 0 }, Color: { tint: 0x334155, alpha: 1 },
        },
      },
    };
    const r = benchBlueprint('preset', () => parseManifest(manifest));
    expect(r.spatial).toBe(true);
    expect(r.passed, JSON.stringify(r.axes)).toBe(true);
  });

  it('entities-only（无 capabilities）→ 据组件推断，可加载运行', () => {
    const entitiesOnly = { entities: JSON.parse(exportManifest(demoBlueprint)).entities };
    const r = parseManifestDetailed(entitiesOnly);
    expect(r.inferredCapabilities).toBe(true);
    expect(r.blueprint.capabilities.length).toBeGreaterThan(0);
    const e = new Engine({ tickRate: 60 });
    e.load(r.blueprint);
    for (let i = 0; i < 10; i++) e.world.tick();
    expect(e.world.getAllEntities().length).toBeGreaterThan(0);
  });

  // ── 回归（engine-review-2026-08-04 §3.3 · P2）─────────────────────────────
  // 原型链保留名做 key：`entities['__proto__'] = …` 在普通对象上不产生自有属性、而是改写原型
  // → 条目**静默蒸发**（游戏少一个实体、零报错）。必须 fail-closed 大声拒绝，
  // 而不是 fail-open 吞掉；同时堵住原型污染（卡带可来自工坊/用户库，非可信输入）。
  it('实体 id 为原型链保留名 → 报错拒绝（不得静默蒸发）', () => {
    // 用 JSON.parse 构造真正的 own property "__proto__"（字面量写法会被引擎当原型赋值）
    const raw = JSON.parse('{"entities":{"__proto__":{"Transform":{"x":1,"y":2}}}}');
    expect(() => parseManifest(raw)).toThrow(/原型链保留名/);
    for (const bad of ['constructor', 'prototype']) {
      expect(() => parseManifest(JSON.parse(`{"entities":{"${bad}":{"Transform":{"x":0,"y":0}}}}`)))
        .toThrow(/原型链保留名/);
    }
  });

  it('组件名为原型链保留名 → 报错拒绝', () => {
    const raw = JSON.parse('{"entities":{"hero":{"__proto__":{"x":1}}}}');
    expect(() => parseManifest(raw)).toThrow(/原型链保留名/);
  });

  it('正常实体/组件名不受影响（fail-closed 不误伤）', () => {
    const raw = JSON.parse('{"entities":{"hero":{"Transform":{"x":1,"y":2}}}}');
    expect(() => parseManifest(raw)).not.toThrow();
  });
});

// ── 回归（engine-review-2026-08-04 §3.3 · owner 2026-08-05 拍板「不许静默猜」）──────────
// BoardCell 被 match3-board / block-grid 共用（同一视图格接口·字段完全相同）。
// 旧行为：COMPONENT_PROVIDERS「先登记者胜」把它静默判给注册序靠前的 match3-board
// （实测 166 行 vs 176 行）→ 一个方块放置游戏只要没写 capabilities 就被装上**三消解释器**，
// 且零报错；同时 validate-manifest 用的是「后登记者胜」，两处规则相反。
// 新行为：共用组件不参与推断（不猜），改为点名告警要求显式声明。
describe('共用组件的推断：不猜 + 点名告警', () => {
  it('只给 BoardCell → 不再静默把 match3-board 塞进来，并给出点名告警', () => {
    const raw = JSON.parse('{"entities":{"c0":{"BoardCell":{"boardId":"b","index":0}}}}');
    const r = parseManifestDetailed(raw);
    expect(r.inferredCapabilities).toBe(true);
    // 关键：不再猜——两个提供者一个都没被自动装上
    expect(r.blueprint.capabilities.map((c) => c.id)).not.toContain('t3-match3-board');
    expect(r.blueprint.capabilities.map((c) => c.id)).not.toContain('t3-block-grid');
    // 且必须明确告诉作者为什么、怎么办（fail-loud 取代 fail-silent）
    const hit = r.warnings.filter((w) => w.includes('BoardCell') && w.includes('多个能力共同提供'));
    expect(hit.length).toBe(1);
    expect(hit[0]).toMatch(/显式声明/);
  });

  it('显式声明 capabilities → 照你说的装，不受影响', () => {
    const raw = JSON.parse('{"capabilities":["t3-block-grid"],"entities":{"c0":{"BoardCell":{"boardId":"b","index":0}}}}');
    const r = parseManifestDetailed(raw);
    expect(r.inferredCapabilities).toBe(false);
    expect(r.blueprint.capabilities.map((c) => c.id)).toContain('t3-block-grid');
    expect(r.blueprint.capabilities.map((c) => c.id)).not.toContain('t3-match3-board');
  });

  it('单一提供者组件的推断行为完全不变（不误伤绝大多数组件）', () => {
    const raw = JSON.parse('{"entities":{"hero":{"Controllable":{"playerId":"p1","speed":3}}}}');
    const r = parseManifestDetailed(raw);
    expect(r.blueprint.capabilities.length).toBeGreaterThan(0);
  });
});

