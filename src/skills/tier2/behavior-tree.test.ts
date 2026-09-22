import { describe, it, expect, afterEach } from 'vitest';
import { World } from '@engine/core/world.js';
import { nextRandom } from '@atom-skills/random/index.js';
import type { Component } from '@engine/core/types.js';
import type { Resource, Flag, StringVar, RandomSeed } from '@engine/protocol/components.js';
import {
  behaviorTreeCapability,
  registerBTLeaves,
  getBTLeaf,
  hasBTLeaf,
  registeredLeafNames,
  clearBTLeaves,
  collectBTLeafNames,
  checkBehaviorTree,
  validateBehaviorTree,
  validateBehaviorTreeForGame,
  tickBehaviorTree,
  MAX_BT_DEPTH,
  type BTNode,
  type BTLeafFn,
} from './behavior-tree.js';

// ── 测试工具 ───────────────────────────────
afterEach(() => clearBTLeaves()); // 每例后清全部叶注册·隔离

function mkWorld(comps: Component[] = []): { w: World; e: string } {
  const w = new World();
  const e = 'ai';
  w.createEntity(e);
  for (const c of comps) w.addComponent(e, c);
  return { w, e };
}
const res = (id: string, current: number, min = 0, max = 1000): Resource => ({ type: 'Resource', id, current, min, max });
const flag = (id: string, active = false): Flag => ({ type: 'Flag', id, active });
const strv = (id: string, value: string): StringVar => ({ type: 'StringVar', id, value });
const rng = (seed: number): RandomSeed => ({ type: 'RandomSeed', seed, sequence: 0 });

// 常用叶：读黑板 Resource(hp)>0
const alive: BTLeafFn = (world, entity) => (world.getComponent<Resource>(entity, 'Resource')?.current ?? 0) > 0;

describe('behavior-tree · 叶注册表（设计稿③）', () => {
  it('registerBTLeaves merge / getBTLeaf / hasBTLeaf / registeredLeafNames / clear', () => {
    registerBTLeaves('g', { a: () => true });
    registerBTLeaves('g', { b: () => false }); // merge，不覆盖 a
    expect(hasBTLeaf('g', 'a')).toBe(true);
    expect(hasBTLeaf('g', 'b')).toBe(true);
    expect(hasBTLeaf('g', 'c')).toBe(false);
    expect(hasBTLeaf('other', 'a')).toBe(false); // 分域隔离
    expect(typeof getBTLeaf('g', 'a')).toBe('function');
    expect(getBTLeaf('g', 'missing')).toBeUndefined();
    expect([...registeredLeafNames('g')].sort()).toEqual(['a', 'b']);
    clearBTLeaves('g');
    expect(hasBTLeaf('g', 'a')).toBe(false);
  });
});

describe('behavior-tree · 五节点语义各一（设计稿⑥）', () => {
  it('condition：读黑板返回 boolean → success/failure', () => {
    registerBTLeaves('t', { alive });
    const tree: BTNode = { type: 'condition', leaf: 'alive' };
    const live = mkWorld([res('hp', 10)]);
    expect(tickBehaviorTree(tree, 't', live.w, live.e).status).toBe('success');
    const dead = mkWorld([res('hp', 0)]);
    expect(tickBehaviorTree(tree, 't', dead.w, dead.e).status).toBe('failure');
  });

  it('action：写黑板（Flag）+ 返回 true → success；返回对象 → success 且 surface 决策', () => {
    registerBTLeaves('t', {
      raise: (world, entity) => {
        const f = world.getComponent<Flag>(entity, 'Flag');
        if (f) f.active = true;
        return true;
      },
      decide: () => ({ move: 'bomb', card: 42 }),
    });
    const { w, e } = mkWorld([flag('berserk', false)]);
    expect(tickBehaviorTree({ type: 'action', leaf: 'raise' }, 't', w, e).status).toBe('success');
    expect(w.getComponent<Flag>(e, 'Flag')!.active).toBe(true); // 黑板被写
    const r = tickBehaviorTree({ type: 'action', leaf: 'decide' }, 't', w, e);
    expect(r.status).toBe('success');
    expect(r.action).toEqual({ move: 'bomb', card: 42 }); // 决策载荷 surface
  });

  it('action：返回 false → failure', () => {
    registerBTLeaves('t', { nope: () => false });
    const { w, e } = mkWorld();
    expect(tickBehaviorTree({ type: 'action', leaf: 'nope' }, 't', w, e).status).toBe('failure');
  });

  it('selector：优先级——首个成功支即止（其后不跑）；全败 → failure', () => {
    const ran: string[] = [];
    registerBTLeaves('t', {
      condFalse: () => false,
      condTrue: () => true,
      actA: () => { ran.push('A'); return { pick: 'A' }; },
      actB: () => { ran.push('B'); return { pick: 'B' }; },
    });
    // 首支（seq: condFalse→actA）失败 → 落到 actB
    const tree1: BTNode = {
      type: 'selector',
      children: [
        { type: 'sequence', children: [{ type: 'condition', leaf: 'condFalse' }, { type: 'action', leaf: 'actA' }] },
        { type: 'action', leaf: 'actB' },
      ],
    };
    const { w, e } = mkWorld();
    const r1 = tickBehaviorTree(tree1, 't', w, e);
    expect(r1.action).toEqual({ pick: 'B' });
    expect(ran).toEqual(['B']); // actA 未跑（其上 condFalse 短路）

    // 首支（seq: condTrue→actA）成功 → 停在 A，actB 不跑
    ran.length = 0;
    const tree2: BTNode = {
      type: 'selector',
      children: [
        { type: 'sequence', children: [{ type: 'condition', leaf: 'condTrue' }, { type: 'action', leaf: 'actA' }] },
        { type: 'action', leaf: 'actB' },
      ],
    };
    const r2 = tickBehaviorTree(tree2, 't', w, e);
    expect(r2.action).toEqual({ pick: 'A' });
    expect(ran).toEqual(['A']); // 优先级止：actB 未跑

    // 全败 → failure
    registerBTLeaves('t', { actFail: () => false });
    const treeFail: BTNode = { type: 'selector', children: [{ type: 'condition', leaf: 'condFalse' }, { type: 'action', leaf: 'actFail' }] };
    expect(tickBehaviorTree(treeFail, 't', w, e).status).toBe('failure');
  });

  it('sequence：按序全过 → success（surface 最后决策）；任一失败即止（后续不跑）', () => {
    const ran: string[] = [];
    registerBTLeaves('t', {
      alive,
      act1: () => { ran.push('1'); return { step: 1 }; },
      act2: () => { ran.push('2'); return { step: 2 }; },
      gateFalse: () => false,
    });
    const ok = mkWorld([res('hp', 5)]);
    const rOk = tickBehaviorTree(
      { type: 'sequence', children: [{ type: 'condition', leaf: 'alive' }, { type: 'action', leaf: 'act1' }, { type: 'action', leaf: 'act2' }] },
      't', ok.w, ok.e,
    );
    expect(rOk.status).toBe('success');
    expect(rOk.action).toEqual({ step: 2 }); // 序内最后决策
    expect(ran).toEqual(['1', '2']);

    ran.length = 0;
    const { w, e } = mkWorld();
    const rFail = tickBehaviorTree(
      { type: 'sequence', children: [{ type: 'action', leaf: 'act1' }, { type: 'condition', leaf: 'gateFalse' }, { type: 'action', leaf: 'act2' }] },
      't', w, e,
    );
    expect(rFail.status).toBe('failure');
    expect(ran).toEqual(['1']); // 门失败后 act2 不跑
  });

  it('invert：翻转子结果（不 surface 决策）', () => {
    registerBTLeaves('t', { alive, act: () => ({ x: 1 }) });
    const live = mkWorld([res('hp', 5)]);
    expect(tickBehaviorTree({ type: 'invert', children: [{ type: 'condition', leaf: 'alive' }] }, 't', live.w, live.e).status).toBe('failure');
    const dead = mkWorld([res('hp', 0)]);
    expect(tickBehaviorTree({ type: 'invert', children: [{ type: 'condition', leaf: 'alive' }] }, 't', dead.w, dead.e).status).toBe('success');
    // 反相成功不携决策
    const rInvAct = tickBehaviorTree({ type: 'invert', children: [{ type: 'action', leaf: 'act' }] }, 't', dead.w, dead.e);
    expect(rInvAct.status).toBe('failure'); // act 成功 → 反相失败
    expect(rInvAct.action).toBeUndefined();
  });
});

describe('behavior-tree · 装载校验：结构 / 深度有界 / 未注册叶（设计稿①⑥）', () => {
  it('结构错：空 selector / invert 双子 / 缺 leaf / 未知类型 / 复合带 leaf', () => {
    expect(checkBehaviorTree({ type: 'selector', children: [] }).length).toBeGreaterThan(0);
    expect(checkBehaviorTree({ type: 'invert', children: [{ type: 'condition', leaf: 'a' }, { type: 'condition', leaf: 'b' }] }).length).toBeGreaterThan(0);
    expect(checkBehaviorTree({ type: 'condition' }).length).toBeGreaterThan(0); // 缺 leaf
    expect(checkBehaviorTree({ type: 'action', leaf: 'a', children: [] }).length).toBeGreaterThan(0); // 叶带 children
    expect(checkBehaviorTree({ type: 'selector', leaf: 'x', children: [{ type: 'condition', leaf: 'a' }] }).length).toBeGreaterThan(0); // 复合带 leaf
    expect(checkBehaviorTree({ type: 'parallel' as never, children: [] }).some((s) => s.includes('未知节点类型'))).toBe(true);
    // 合法树 → 无 issue
    expect(checkBehaviorTree({ type: 'selector', children: [{ type: 'condition', leaf: 'a' }, { type: 'action', leaf: 'b' }] })).toEqual([]);
  });

  it('深度有界：超 maxDepth 报错；validateBehaviorTree 抛；有界深树 tick 正常终止', () => {
    // 造一棵 depth 7 的 invert 链，maxDepth=5 → 报超深度
    let deep: BTNode = { type: 'condition', leaf: 'alive' };
    for (let i = 0; i < 7; i++) deep = { type: 'invert', children: [deep] };
    expect(checkBehaviorTree(deep, { maxDepth: 5, knownLeaves: new Set(['alive']) }).some((s) => s.includes('超深度上限'))).toBe(true);
    expect(() => validateBehaviorTree(deep, { maxDepth: 5, knownLeaves: new Set(['alive']) })).toThrow(/装载校验失败/);
    // 默认上限=契约值（behavior-tree.ts:125·钉死：静默改上限=装载语义变更，须过此断言显式表态）
    expect(MAX_BT_DEPTH).toBe(64);
    // 有界深树（7 层 invert）能 tick 且终止（7 次取反 = 反相奇数次）
    registerBTLeaves('t', { alive });
    const live = mkWorld([res('hp', 5)]);
    const r = tickBehaviorTree(deep, 't', live.w, live.e);
    expect(r.status).toBe('failure'); // alive=success，7 次 invert（奇）→ failure
  });

  it('未注册叶装载即错：validateBehaviorTree(未在册) 抛；validateBehaviorTreeForGame 按注册表校验', () => {
    const tree: BTNode = { type: 'sequence', children: [{ type: 'condition', leaf: 'known' }, { type: 'action', leaf: 'missing' }] };
    // 显式 knownLeaves 不含 missing → 抛
    expect(() => validateBehaviorTree(tree, { knownLeaves: new Set(['known']) })).toThrow(/未注册/);
    // 按游戏域校验：只注册了 known → 抛（missing 未注册）
    registerBTLeaves('t', { known: () => true });
    expect(() => validateBehaviorTreeForGame(tree, 't')).toThrow(/未注册/);
    // 补齐 missing → 通过
    registerBTLeaves('t', { missing: () => true });
    expect(() => validateBehaviorTreeForGame(tree, 't')).not.toThrow();
  });

  it('运行时 fail-closed：未注册叶 tick 返回 failure（不抛）', () => {
    const { w, e } = mkWorld();
    expect(tickBehaviorTree({ type: 'condition', leaf: 'nope' }, 't', w, e).status).toBe('failure');
    expect(tickBehaviorTree({ type: 'action', leaf: 'nope' }, 't', w, e).status).toBe('failure');
  });

  it('collectBTLeafNames：从树抽全部叶名', () => {
    const tree: BTNode = {
      type: 'selector',
      children: [
        { type: 'sequence', children: [{ type: 'condition', leaf: 'c1' }, { type: 'action', leaf: 'a1' }] },
        { type: 'invert', children: [{ type: 'condition', leaf: 'c2' }] },
      ],
    };
    expect([...collectBTLeafNames(tree)].sort()).toEqual(['a1', 'c1', 'c2']);
  });
});

describe('behavior-tree · seed 复现（设计稿④·确定性关键）', () => {
  // 叶：掷传入 seed 的 nextRandom → 按阈值选激进/保守·写 StringVar 决策·返回决策载荷
  const playByChance: BTLeafFn = (world, entity, _args, seed) => {
    const roll = seed ? nextRandom(seed) : 0;
    const pick = roll < 0.5 ? 'aggressive' : 'safe';
    const sv = world.getComponent<StringVar>(entity, 'StringVar');
    if (sv) sv.value = pick;
    return { pick, roll };
  };

  it('同 seed 同黑板 → 同决策轨；序列推进；不同 seed 可不同', () => {
    registerBTLeaves('t', { playByChance });
    const tree: BTNode = { type: 'action', leaf: 'playByChance' };

    const run = (seedVal: number) => {
      const { w, e } = mkWorld([strv('decision', '')]);
      const s = rng(seedVal);
      const r = tickBehaviorTree(tree, 't', w, e, s);
      return { pick: (r.action as { pick: string }).pick, sv: w.getComponent<StringVar>(e, 'StringVar')!.value, seqAfter: s.sequence };
    };

    const a = run(12345);
    const b = run(12345);
    expect(a.pick).toBe(b.pick); // 同 seed 同决策
    expect(a.sv).toBe(b.sv); // 黑板终态一致
    expect(a.sv).toBe(a.pick);
    expect(a.seqAfter).toBe(1); // nextRandom 推进 1 次

    // 扫多个 seed，确认至少出现两种分支（证明真在用随机·非常量）
    const picks = new Set<string>();
    for (let s = 1; s <= 40; s++) picks.add(run(s).pick);
    expect(picks.size).toBe(2);
  });

  it('多 tick 同一 seed 顺推 → 决策轨可复现', () => {
    registerBTLeaves('t', { playByChance });
    const tree: BTNode = { type: 'action', leaf: 'playByChance' };
    const trace = (seedVal: number): string[] => {
      const { w, e } = mkWorld([strv('decision', '')]);
      const s = rng(seedVal);
      const out: string[] = [];
      for (let i = 0; i < 8; i++) out.push((tickBehaviorTree(tree, 't', w, e, s).action as { pick: string }).pick);
      return out;
    };
    expect(trace(777)).toEqual(trace(777)); // 同 seed 同 8 拍决策轨
  });
});

describe('behavior-tree · 三游戏形状 fixture（只作数据形状用例·不实装游戏逻辑·设计稿⑥）', () => {
  // 说明：以下叶均为形状 stub（返回决策载荷/布尔·不含真实游戏规则）；断言的是树数据形状合法、叶名单可导出、
  // 装载校验通过、tick 出确定决策。真实记牌/人设/性格逻辑由各游戏在自己域内注册（TS 例外口径）。

  it('game-a 记牌四档权重：性格标签→行为权重（selector 优先级）', () => {
    // 数据：记牌保真度分档 + 性格权重 = 游戏数据（估值表/黑板初值）·不进引擎节点集
    const tree: BTNode = {
      type: 'selector',
      name: 'guandan-outer',
      children: [
        { type: 'sequence', children: [{ type: 'condition', leaf: 'peekedTribute', args: { tier: 'master' } }, { type: 'action', leaf: 'exploitTribute' }] },
        { type: 'sequence', children: [{ type: 'condition', leaf: 'recallTrusted', args: { fidelity: 'high' } }, { type: 'action', leaf: 'playByMemory' }] },
        { type: 'action', leaf: 'playByHeuristic', args: { persona: 'steady' } },
      ],
    };
    expect([...collectBTLeafNames(tree)].sort()).toEqual(['exploitTribute', 'peekedTribute', 'playByHeuristic', 'playByMemory', 'recallTrusted']);
    registerBTLeaves('game-a', {
      peekedTribute: () => false,
      exploitTribute: () => ({ move: 'exploit' }),
      recallTrusted: () => false,
      playByMemory: () => ({ move: 'memory' }),
      playByHeuristic: (_w, _e, args) => ({ move: 'heuristic', persona: args.persona }),
    });
    expect(() => validateBehaviorTreeForGame(tree, 'game-a')).not.toThrow();
    const { w, e } = mkWorld();
    const r = tickBehaviorTree(tree, 'game-a', w, e);
    expect(r.action).toEqual({ move: 'heuristic', persona: 'steady' }); // 前两支 stub 失败 → 落到启发式
  });

  it('game-b 三姨太人设 + 难度三档：persona/difficulty 走 args（数据参数化）', () => {
    const persona = (name: string, difficulty: string): BTNode => ({
      type: 'selector',
      name: `concubine-${name}`,
      children: [
        { type: 'sequence', children: [{ type: 'condition', leaf: 'wantRiichi', args: { persona: name, difficulty } }, { type: 'action', leaf: 'declareRiichi' }] },
        { type: 'action', leaf: 'discardSafe', args: { persona: name } },
      ],
    });
    const wives = ['aggressive', 'steady', 'fickle'].map((p) => persona(p, 'hard'));
    registerBTLeaves('game-b', {
      wantRiichi: (_w, _e, args) => args.persona === 'aggressive', // 形状 stub：激进者立直
      declareRiichi: () => ({ move: 'riichi' }),
      discardSafe: (_w, _e, args) => ({ move: 'discard', persona: args.persona }),
    });
    const { w, e } = mkWorld();
    for (const t of wives) expect(() => validateBehaviorTreeForGame(t, 'game-b')).not.toThrow();
    expect(tickBehaviorTree(wives[0], 'game-b', w, e).action).toEqual({ move: 'riichi' }); // aggressive
    expect(tickBehaviorTree(wives[1], 'game-b', w, e).action).toEqual({ move: 'discard', persona: 'steady' });
  });

  it('game-c 五性格模板：五份数据 config 同一叶集（模板即数据·零代码增删）', () => {
    const template = (personality: string): BTNode => ({
      type: 'selector',
      name: `holdem-${personality}`,
      children: [
        { type: 'sequence', children: [{ type: 'condition', leaf: 'shouldBluff', args: { personality } }, { type: 'action', leaf: 'raise' }] },
        { type: 'sequence', children: [{ type: 'condition', leaf: 'handStrong', args: { personality } }, { type: 'action', leaf: 'call' }] },
        { type: 'action', leaf: 'fold' },
      ],
    });
    const five = ['rock', 'maniac', 'calling-station', 'tag', 'lag'].map(template);
    registerBTLeaves('game-c', {
      shouldBluff: (_w, _e, args) => args.personality === 'maniac' || args.personality === 'lag',
      handStrong: () => false,
      raise: () => ({ move: 'raise' }),
      call: () => ({ move: 'call' }),
      fold: () => ({ move: 'fold' }),
    });
    for (const t of five) expect(() => validateBehaviorTreeForGame(t, 'game-c')).not.toThrow();
    const { w, e } = mkWorld();
    expect(tickBehaviorTree(five[1], 'game-c', w, e).action).toEqual({ move: 'raise' }); // maniac 诈唬
    expect(tickBehaviorTree(five[0], 'game-c', w, e).action).toEqual({ move: 'fold' }); // rock 弃牌（两 gate 失败）
  });
});

describe('behavior-tree · capability 注册形状', () => {
  it('id/version/空 provides/空 systems（不新立组件·无引擎每帧驱动）', () => {
    expect(behaviorTreeCapability.id).toBe('t2-behavior-tree');
    expect(behaviorTreeCapability.systems).toEqual([]);
    expect(Object.keys(behaviorTreeCapability.components.provides)).toEqual([]);
    expect(behaviorTreeCapability.describe.examples.length).toBeGreaterThan(0);
  });
});
