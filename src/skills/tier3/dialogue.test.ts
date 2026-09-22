import { describe, it, expect } from 'vitest';
import { World } from '@engine/core/world.js';
import type { State, Text, Flag, Resource, ResourceModify, RandomSeed, InputQueue, RawInputData } from '@engine/protocol/components.js';
import {
  dialogueCapability,
  resolveCheck,
  DIALOGUE_ACTION_ADVANCE,
  DIALOGUE_ACTION_CHOOSE,
  type DialogueGraph,
  type DialogueScript,
  type DialogueAdvance,
  type DialogueChoose,
  type DialogueCheck,
} from './dialogue.js';

// 独立单测：脱离 Game B 数据，用一棵最小合成脚本验证「叙事解释器」本身（推进/渲染/选择/条件门控）。
const SCRIPT: DialogueGraph = {
  start: { kind: 'line', speaker: 'A', text: 'hi', next: 'pick' },
  pick: {
    kind: 'choice',
    prompt: 'choose',
    options: [
      { text: 'warm', effects: [{ resource: 'aff', amount: 5 }], setFlag: 'met', next: 'end' },
      { text: 'locked', requires: { kind: 'flag', id: 'gate' }, next: 'secret' },
    ],
  },
  end: { kind: 'line', speaker: 'A', text: 'bye', next: null },
  secret: { kind: 'line', speaker: 'A', text: 'secret', next: null },
};

function loadDialogue(current = 'start'): World {
  const w = new World();
  for (const s of dialogueCapability.systems) w.addSystem(s);
  w.createEntity('dlg');
  w.addComponent('dlg', { type: 'DialogueScript', fsmId: 'dialogue', nodes: SCRIPT } as DialogueScript);
  w.addComponent('dlg', { type: 'State', fsmId: 'dialogue', current, previous: '' } as State);
  w.addComponent('dlg', { type: 'Text', content: '', fontSize: 20, fontFamily: 'serif', anchor: 'left', lineSpacing: 4 } as Text);
  w.createEntity('aff');
  w.addComponent('aff', { type: 'Resource', id: 'aff', current: 0, min: 0, max: 100 } as Resource);
  w.createEntity('met');
  w.addComponent('met', { type: 'Flag', id: 'met', active: false } as Flag);
  w.createEntity('gate');
  w.addComponent('gate', { type: 'Flag', id: 'gate', active: false } as Flag);
  return w;
}
const cur = (w: World): string => w.getComponent<State>('dlg', 'State')!.current;
const txt = (w: World): string => w.getComponent<Text>('dlg', 'Text')!.content;

describe('T3 dialogue — metadata', () => {
  it('id / 系统名 / runsBefore 打破 RMW 伪环 / 脚本来自数据组件', () => {
    expect(dialogueCapability.id).toBe('t3-dialogue');
    expect(dialogueCapability.systems[0].id).toBe('dialogue');
    expect(dialogueCapability.systems[0].runsBefore).toEqual(['resource-apply', 'state-sync']);
    expect(dialogueCapability.components.reads).toContain('DialogueScript');
  });
});

describe('T3 dialogue — 推进 / 渲染', () => {
  it('每 tick 按 State.current 渲染当前节点文本', () => {
    const w = loadDialogue();
    w.tick();
    expect(txt(w)).toBe('A：hi');
  });

  it('line 节点 + DialogueAdvance → 跳到 next 并渲染新行', () => {
    const w = loadDialogue();
    w.tick();
    w.addComponent('dlg', { type: 'DialogueAdvance' } as DialogueAdvance);
    w.tick();
    expect(cur(w)).toBe('pick');
    expect(txt(w)).toBe('choose'); // choice 节点：speaker(空) + prompt
  });
});

describe('T3 dialogue — 选择结算 / 条件门控', () => {
  it('选可用选项 → 发 ResourceModify(按 id) + 置 Flag + 跳转', () => {
    const w = loadDialogue('pick');
    w.addComponent('dlg', { type: 'DialogueChoose', index: 0 } as DialogueChoose);
    w.tick();
    expect(cur(w)).toBe('end');
    expect(w.getComponent<Flag>('met', 'Flag')!.active).toBe(true);
    const mod = w.getComponent<ResourceModify>('aff', 'ResourceModify');
    expect(mod).toBeTruthy();
    expect(mod!.amount).toBe(5);
  });

  it('选不满足 requires 的选项 → 拒绝（不跳转）', () => {
    const w = loadDialogue('pick'); // gate=false → 选项1 不可用
    w.addComponent('dlg', { type: 'DialogueChoose', index: 1 } as DialogueChoose);
    w.tick();
    expect(cur(w)).toBe('pick'); // 仍停在 pick
  });

  it('门开后同一选项可选 → 跳到 secret', () => {
    const w = loadDialogue('pick');
    w.getComponent<Flag>('gate', 'Flag')!.active = true;
    w.addComponent('dlg', { type: 'DialogueChoose', index: 1 } as DialogueChoose);
    w.tick();
    expect(cur(w)).toBe('secret');
  });
});

// ── R17 check 节点：确定性骰子检定 ──────────────────────────────────────────
// 起点直接停在 check 节点 'gate'，DialogueAdvance 即结算到 win/lose。
// dice:1 → randomInt(seed,1,2) 恒为 1，钉死「base+bonus+1」公式，与种子无关，可断言精确分支。
function loadCheck(node: DialogueCheck, opts: { attr?: number; bonus?: number; seed?: number } = {}): World {
  const w = new World();
  for (const s of dialogueCapability.systems) w.addSystem(s);
  const graph: DialogueGraph = {
    gate: node,
    win: { kind: 'line', speaker: 'A', text: 'win', next: null },
    lose: { kind: 'line', speaker: 'A', text: 'lose', next: null },
  };
  w.createEntity('dlg');
  w.addComponent('dlg', { type: 'DialogueScript', fsmId: 'dialogue', nodes: graph } as DialogueScript);
  w.addComponent('dlg', { type: 'State', fsmId: 'dialogue', current: 'gate', previous: '' } as State);
  w.addComponent('dlg', { type: 'Text', content: '', fontSize: 20, fontFamily: 'serif', anchor: 'left', lineSpacing: 4 } as Text);
  w.createEntity('cha');
  w.addComponent('cha', { type: 'Resource', id: 'cha', current: opts.attr ?? 0, min: 0, max: 999 } as Resource);
  w.createEntity('aff');
  w.addComponent('aff', { type: 'Resource', id: 'aff', current: opts.bonus ?? 0, min: 0, max: 999 } as Resource);
  if (opts.seed !== undefined) {
    w.createEntity('rng');
    w.addComponent('rng', { type: 'RandomSeed', seed: opts.seed, sequence: 0 } as RandomSeed);
  }
  return w;
}
const advance = (w: World): void => {
  w.addComponent('dlg', { type: 'DialogueAdvance' } as DialogueAdvance);
  w.tick();
};
const baseCheck: DialogueCheck = {
  kind: 'check',
  prompt: '检定',
  attribute: 'cha',
  difficulty: 10,
  successNext: 'win',
  failNext: 'lose',
};

describe('T3 dialogue — check 节点（元数据）', () => {
  it('reads/writes 声明了 RandomSeed（骰子来源），脚本可含 check 节点', () => {
    expect(dialogueCapability.components.reads).toContain('RandomSeed');
    expect(dialogueCapability.components.writes).toContain('RandomSeed');
    expect(dialogueCapability.systems[0].reads).toContain('RandomSeed');
  });
});

describe('T3 dialogue — check 结算 / 分支 / effects', () => {
  it('check 节点在 DialogueAdvance 前不结算，渲染 prompt', () => {
    const w = loadCheck(baseCheck, { attr: 20, seed: 1 });
    w.tick(); // 无 advance
    expect(cur(w)).toBe('gate'); // 停在 check
    expect(txt(w)).toBe('检定'); // speaker(空)+prompt
  });

  it('稳过（base 远超难度，dice:1）→ successNext + 施 successEffects', () => {
    const node: DialogueCheck = { ...baseCheck, dice: 1, successEffects: [{ resource: 'aff', amount: 5 }], failEffects: [{ resource: 'aff', amount: -5 }] };
    const w = loadCheck(node, { attr: 20, seed: 1 }); // 20+1=21 ≥ 10
    advance(w);
    expect(cur(w)).toBe('win');
    expect(w.getComponent<ResourceModify>('aff', 'ResourceModify')!.amount).toBe(5); // 走成功 effects
  });

  it('稳败（base 远低难度，dice:1）→ failNext + 施 failEffects（失败非 Game Over，走另一条故事）', () => {
    const node: DialogueCheck = { ...baseCheck, difficulty: 100, dice: 1, successEffects: [{ resource: 'aff', amount: 5 }], failEffects: [{ resource: 'aff', amount: -5 }] };
    const w = loadCheck(node, { attr: 0, seed: 1 }); // 0+1=1 < 100
    advance(w);
    expect(cur(w)).toBe('lose');
    expect(w.getComponent<ResourceModify>('aff', 'ResourceModify')!.amount).toBe(-5); // 走失败 effects
  });

  it('bonusFrom/bonusDiv 计入分数（差一格靠 bonus 翻盘）', () => {
    const node: DialogueCheck = { ...baseCheck, difficulty: 11, dice: 1, bonusFrom: 'aff', bonusDiv: 2 };
    // base5 + floor(10/2)=5 + roll1 = 11 ≥ 11 → 过
    expect(cur(advanceReturn(loadCheck(node, { attr: 5, bonus: 10, seed: 1 })))).toBe('win');
    // 同检定但无 bonus（aff=0）：5 + 0 + 1 = 6 < 11 → 败
    expect(cur(advanceReturn(loadCheck(node, { attr: 5, bonus: 0, seed: 1 })))).toBe('lose');
  });
});

describe('T3 dialogue — check 确定性 / RandomSeed', () => {
  it('真骰子（dice:20）同 seed → 同结果（snapshot 重放一致）；钉 golden + 存在翻转 seed', () => {
    const node: DialogueCheck = { ...baseCheck, difficulty: 11, dice: 20 }; // 结果取决于 roll
    const runOnce = (seed: number): string => cur(advanceReturn(loadCheck(node, { attr: 0, seed })));
    expect(runOnce(12345)).toBe(runOnce(12345)); // 确定性
    expect(runOnce(12345)).toBe('win'); // golden（实跑取值）：seed 12345 掷出 ≥11
    expect(runOnce(7)).toBe('lose');    // 分支可翻转（实跑取值）：seed 7 掷出 <11——恒 win/恒 lose 的假骰子在此转红
  });

  it('掷骰推进 RandomSeed.sequence（取数留痕）', () => {
    const node: DialogueCheck = { ...baseCheck, dice: 20 };
    const w = loadCheck(node, { attr: 0, seed: 7 });
    advance(w);
    expect(w.getComponent<RandomSeed>('rng', 'RandomSeed')!.sequence).toBe(1);
  });

  it('世界无 RandomSeed → roll 退化为 0（纯阈值，仍确定）', () => {
    const passNode: DialogueCheck = { ...baseCheck, difficulty: 3 };
    expect(cur(advanceReturn(loadCheck(passNode, { attr: 5 })))).toBe('win'); // 5+0 ≥ 3
    const failNode: DialogueCheck = { ...baseCheck, difficulty: 10 };
    expect(cur(advanceReturn(loadCheck(failNode, { attr: 5 })))).toBe('lose'); // 5+0 < 10
  });

  it('resolveCheck 纯逻辑：base+bonus+roll vs difficulty', () => {
    const node: DialogueCheck = { ...baseCheck, difficulty: 11, bonusFrom: 'aff', bonusDiv: 2 };
    const w = loadCheck(node, { attr: 5, bonus: 10 }); // base5 + bonus5 = 10
    expect(resolveCheck(w, node, 1)).toEqual({ pass: true, score: 11 });
    expect(resolveCheck(w, node, 0)).toEqual({ pass: false, score: 10 });
  });
});

// 跑一次 advance 并返回 world（便于在 expect 里链式断言 cur）。
function advanceReturn(w: World): World {
  advance(w);
  return w;
}

// ── R16/R3 输入接缝：UI 经 InputQueue 注入对话动作（确定性，等价于显式组件）──────────
function withQueue(w: World, actions: RawInputData[]): void {
  w.createEntity('global-input');
  w.addComponent('global-input', { type: 'InputQueue', actions } as InputQueue);
}

describe('T3 dialogue — R3 InputQueue 输入接缝', () => {
  it('advance 动作 = DialogueAdvance（line 推进）', () => {
    const w = loadDialogue('start');
    withQueue(w, [{ source: 'p1', key: DIALOGUE_ACTION_ADVANCE, phase: 'action' }]);
    w.tick();
    expect(cur(w)).toBe('pick');
  });

  it('choose 动作(x=index) = DialogueChoose（选择结算 + effects + flag）', () => {
    const w = loadDialogue('pick');
    withQueue(w, [{ source: 'p1', key: DIALOGUE_ACTION_CHOOSE, x: 0, phase: 'action' }]);
    w.tick();
    expect(cur(w)).toBe('end');
    expect(w.getComponent<Flag>('met', 'Flag')!.active).toBe(true);
    expect(w.getComponent<ResourceModify>('aff', 'ResourceModify')!.amount).toBe(5);
  });

  it('choose 动作(arg=index 字符串) = DialogueChoose（mountUI ActionSink 经 arg 传下标，开箱即用）', () => {
    const w = loadDialogue('pick');
    withQueue(w, [{ source: 'p1', key: DIALOGUE_ACTION_CHOOSE, arg: '0', phase: 'action' }]);
    w.tick();
    expect(cur(w)).toBe('end');
    expect(w.getComponent<Flag>('met', 'Flag')!.active).toBe(true);
    expect(w.getComponent<ResourceModify>('aff', 'ResourceModify')!.amount).toBe(5);
  });

  it('choose 动作 x 优先于 arg（两者都在时取 x）', () => {
    const w = loadDialogue('pick');
    withQueue(w, [{ source: 'p1', key: DIALOGUE_ACTION_CHOOSE, x: 0, arg: '1', phase: 'action' }]);
    w.tick();
    expect(cur(w)).toBe('end'); // x=0（warm）胜出，非 arg=1（locked·且无门票本就走不了）
  });

  it('非 action phase（指针 down 等）被忽略，不误触发推进', () => {
    const w = loadDialogue('start');
    withQueue(w, [{ source: 'p1', key: DIALOGUE_ACTION_ADVANCE, phase: 'down' }]);
    w.tick();
    expect(cur(w)).toBe('start');
  });

  it('显式组件路径不受影响（无 InputQueue 时照常工作）', () => {
    const w = loadDialogue('start');
    w.addComponent('dlg', { type: 'DialogueAdvance' } as DialogueAdvance);
    w.tick();
    expect(cur(w)).toBe('pick');
  });
});

describe('dialogue — 拒收路径（2026-08-22 测试大扫除补钉·「什么都没发生」的分支必须测）', () => {
  it('choice 节点收越界 index → 停原地·请求被消费不残留·后续好请求照常', () => {
    const w = loadDialogue('pick');
    w.addComponent('dlg', { type: 'DialogueChoose', index: 99 } as DialogueChoose);
    w.tick();
    expect(cur(w)).toBe('pick'); // 不崩·不乱跳
    expect(w.hasComponent('dlg', 'DialogueChoose')).toBe(false); // 坏请求也消费（不无限重试）
    w.addComponent('dlg', { type: 'DialogueChoose', index: 0 } as DialogueChoose);
    w.tick();
    expect(cur(w)).toBe('end'); // 拒收不留伤
  });

  it('line 节点收 Choose → no-op 停原地（错类型请求不误推进）', () => {
    const w = loadDialogue('start');
    w.addComponent('dlg', { type: 'DialogueChoose', index: 0 } as DialogueChoose);
    w.tick();
    expect(cur(w)).toBe('start');
  });
});
