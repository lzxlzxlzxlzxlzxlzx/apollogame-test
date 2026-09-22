import { describe, it, expect } from 'vitest';
import { Engine } from '@zerocraft/engine/runtime/engine.js';
import { hashSnapshot } from '@zerocraft/engine/net/determinism.js';
import { NON_DETERMINISTIC } from '@zerocraft/engine/net/determinism.js';
import { NullNpcAgentPort } from '@zerocraft/engine/services/npc-agent/index.js';
import type { AgentContext, Intent, NpcAgentPort } from '@zerocraft/engine/engine/protocol/agent.js';
import type { Resource, State, Flag } from '@zerocraft/engine/engine/protocol/components.js';
import { recall } from '@zerocraft/engine/skills/tier2/memory.js';
import { findBarrier } from '@zerocraft/engine/skills/tier2/intent-barrier.js';
import { buildBlueprint, setupTown, REST_ENERGY, OBSERVE_CURIOSITY, TALK_SOCIAL } from './blueprint.js';
import { runTurn } from './turn-driver.js';
import { buildAgentContext } from './agent-context.js';
import {
  AGENT_NPC_IDS, NPCS, NPC_IDS, NEEDS, ZONE_IDS, TITLES, BARRIER_ID,
  needId, zoneFsm, affinityId, titleFlag, intentSignal,
} from './world-data.js';

function town(seed = 111): Engine {
  const e = new Engine();
  e.load(buildBlueprint(seed));
  setupTown(e.world, 0);
  return e;
}
function res(e: Engine, id: string): number | undefined {
  for (const [eid] of e.world.query('Resource')) {
    const r = e.world.getComponent<Resource>(eid, 'Resource');
    if (r?.id === id) return r.current;
  }
  return undefined;
}
function zoneOf(e: Engine, npc: string): string | undefined {
  for (const [eid] of e.world.query('State')) {
    const s = e.world.getComponent<State>(eid, 'State');
    if (s?.fsmId === zoneFsm(npc)) return s.current;
  }
  return undefined;
}
function flagOn(e: Engine, id: string): boolean {
  for (const [eid] of e.world.query('Flag')) {
    const f = e.world.getComponent<Flag>(eid, 'Flag');
    if (f?.id === id) return f.active;
  }
  return false;
}
/** 点名脚本端口：这个 NPC 就吐这个。 */
function scripted(script: Record<string, { verb: string; args?: (string | number)[] }[]>): NpcAgentPort {
  return new NullNpcAgentPort({ script });
}

describe('game111 世界装配', () => {
  it('blueprint + setupTown 起得来，五个 NPC 各在自己的家分区', () => {
    const e = town();
    for (const n of NPCS) expect(zoneOf(e, n.id)).toBe(n.homeZone);
  });

  it('每个 NPC 的四项需求都在世界里，初值 = 表里的 start', () => {
    const e = town();
    for (const n of NPCS) for (const need of NEEDS) {
      expect(res(e, needId(n.id, need.key)), `${n.id}.${need.key}`).toBe(need.start);
    }
  });

  it('调 LLM 的只有 L4+（L1/L2 不进 barrier 的待决名单）', () => {
    expect([...AGENT_NPC_IDS].sort()).toEqual(['mor', 'nao']);
    for (const id of AGENT_NPC_IDS) {
      expect(NPCS.find((n) => n.id === id)!.tier).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('game111 意图落地（闭集 → keybind → Effect·零解释器）', () => {
  it('move_to 真把 NPC 挪到那个分区', async () => {
    const e = town();
    expect(zoneOf(e, 'nao')).toBe('z-cafe');
    await runTurn(e.world, 1, scripted({ nao: [{ verb: 'move_to', args: ['z-hill'] }] }));
    expect(zoneOf(e, 'nao')).toBe('z-hill');
  });

  it('rest 真回精力（衰减也真在扣——净值可算）', async () => {
    const e = town();
    const before = res(e, needId('nao', 'energy'))!;
    await runTurn(e.world, 1, scripted({ nao: [{ verb: 'rest' }], mor: [{ verb: 'rest' }] }));
    const after = res(e, needId('nao', 'energy'))!;
    expect(after).toBeGreaterThan(before); // 可玩性粗检；回复量的精确接线由下方差分测试守
  });

  it('同条件差分：rest 只多回 REST_ENERGY 精力，observe 只多回 OBSERVE_CURIOSITY 好奇心', async () => {
    // 两盘世界只改 nao 的动词：同种子、同拍数、mor 同动作。这样衰减无需写魔法拍数，
    // 也不会把「只回了 1 点」误判成 rest/observe 已正确接线。
    const resting = town();
    const observing = town();
    await runTurn(resting.world, 1, scripted({ nao: [{ verb: 'rest' }], mor: [{ verb: 'rest' }] }));
    await runTurn(observing.world, 1, scripted({ nao: [{ verb: 'observe' }], mor: [{ verb: 'rest' }] }));
    expect(res(resting, needId('nao', 'energy'))! - res(observing, needId('nao', 'energy'))!).toBe(REST_ENERGY);
    expect(res(observing, needId('nao', 'curiosity'))! - res(resting, needId('nao', 'curiosity'))!).toBe(OBSERVE_CURIOSITY);
    expect(res(resting, needId('nao', 'mood'))).toBe(res(observing, needId('nao', 'mood')));
  });

  it('sabotage 锚点：撤掉意图的 keybind 接线 → move_to 不再落地', async () => {
    const bp = buildBlueprint();
    const key = `kb-nao-move-z-hill`;
    expect(bp.entities[key], '锚点必须命中真实存在的接线实体').toBeDefined();
    delete bp.entities[key]; // 撤掉「输入动作 → 信号」这一段
    const e = new Engine(); e.load(bp); setupTown(e.world, 0);
    await runTurn(e.world, 1, scripted({ nao: [{ verb: 'move_to', args: ['z-hill'] }] }));
    expect(zoneOf(e, 'nao')).toBe('z-cafe'); // 没挪动 = 接线确实是它在起作用
  });

  it('闭集外的动词被门拒收 → 该 NPC 走降级（filled 留痕）', async () => {
    const e = town();
    const r = await runTurn(e.world, 1, scripted({
      nao: [{ verb: 'hack_world', args: ['everything'] }],
      mor: [{ verb: 'rest' }],
    }));
    expect(r.filled).toContain('nao');
    expect(r.resolved.find((i) => i.npcId === 'nao')!.verb).toBe('rest');
    expect(zoneOf(e, 'nao')).toBe('z-cafe');
  });

  it('参数个数对不上也被拒（arity 是闭集的一部分）', async () => {
    const e = town();
    const r = await runTurn(e.world, 1, scripted({ nao: [{ verb: 'move_to' }] })); // 少一个参数
    expect(r.filled).toContain('nao');
  });
});

describe('game111 确定性', () => {
  it('同种子 + 同端口 → 三回合后 hash 逐字节相同', async () => {
    const run = async (): Promise<string> => {
      const e = town(111);
      const port = scripted({ nao: [{ verb: 'move_to', args: ['z-hill'] }], mor: [{ verb: 'rest' }] });
      for (let t = 1; t <= 3; t++) await runTurn(e.world, t, port);
      return hashSnapshot(e.world.snapshot());
    };
    expect(await run()).toBe(await run());
  });

  it('回包次序不影响世界（乱序端口 vs 顺序端口 → 同 hash）', async () => {
    // 同样的决策内容，一个立即返回、一个把 mor 拖到 nao 之后才返回。
    const content: Record<string, Intent[]> = {
      nao: [{ npcId: 'nao', verb: 'move_to', args: ['z-hill'], turn: 1 }],
      mor: [{ npcId: 'mor', verb: 'observe', turn: 1 }],
    };
    // 「迟到」用**微任务让步**制造，不等墙钟（sim 面不得等真时间·zerocraft/no-timers）。
    // 效果一样：被让步的那个 NPC 的 deliverIntents 排在另一个之后。
    const makePort = (delayFor: string): NpcAgentPort => ({
      async decide(ctx: AgentContext) {
        if (ctx.npcId === delayFor) for (let i = 0; i < 8; i++) await Promise.resolve();
        return content[ctx.npcId].map((i) => ({ ...i, turn: ctx.turn }));
      },
    });
    const run = async (delayFor: string): Promise<string> => {
      const e = town(111);
      for (let t = 1; t <= 2; t++) await runTurn(e.world, t, makePort(delayFor));
      return hashSnapshot(e.world.snapshot());
    };
    expect(await run('nao')).toBe(await run('mor'));
  });

  it('IntentInbox 不进 hash（装的是「谁先回包」这种本地事实）', () => {
    expect(NON_DETERMINISTIC.has('IntentInbox')).toBe(true);
  });

  it('游戏层零裸 Math.random / 零墙钟（红线·结构测试）', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.dirname(new URL(import.meta.url).pathname);
    // 只看**代码**：注释里写「禁裸 Math.random」是纪律说明，不是违规（首版没剥注释，自己把自己判红了）。
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const files = fs.readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'));
    expect(files.length, '锚点必须真扫到文件').toBeGreaterThan(0);
    for (const f of files) {
      const code = stripComments(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(/Math\s*\.\s*random\s*\(/.test(code), `${f} 出现裸 Math.random`).toBe(false);
      expect(/Date\s*\.\s*now\s*\(/.test(code), `${f} 出现墙钟 Date.now`).toBe(false);
    }
  });

  it('剥注释的那把尺子本身有效（防「全绿只是因为根本没扫到」）', () => {
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(/Math\s*\.\s*random\s*\(/.test(stripComments('// 禁用 Math.random()'))).toBe(false);
    expect(/Math\s*\.\s*random\s*\(/.test(stripComments('const x = Math.random();'))).toBe(true);
  });
});

describe('game111 断网降级（L4 → L2 路径）', () => {
  it('没有端口时全员降级补默认动词，世界照转不卡死', async () => {
    const e = town();
    const r = await runTurn(e.world, 1, undefined);
    expect([...r.filled].sort()).toEqual([...AGENT_NPC_IDS].sort());
    expect(r.resolved.every((i) => i.verb === 'rest')).toBe(true);
    expect(res(e, 'turn')).toBe(1);
  });

  it('端口回空 = 明确失败，也走降级并记原因', async () => {
    const e = town();
    const dead: NpcAgentPort = { async decide() { return []; } };
    const r = await runTurn(e.world, 1, dead);
    expect(r.failures.map((f) => f.npcId).sort()).toEqual([...AGENT_NPC_IDS].sort());
    expect(r.filled.length).toBe(AGENT_NPC_IDS.length);
  });

  it('barrier 结算后回 idle/settled，不会永远卡在 waiting', async () => {
    const e = town();
    await runTurn(e.world, 1, undefined);
    expect(findBarrier(e.world, BARRIER_ID)!.b.state).not.toBe('waiting');
  });
});

describe('game111 记忆与链式影响', () => {
  it('本回合的意图入账成记忆，source 可断言（降级的标 fallback）', async () => {
    const e = town();
    await runTurn(e.world, 1, scripted({ nao: [{ verb: 'move_to', args: ['z-hill'] }] }));
    const naoMem = recall(e.world, 'npc-nao', { k: 5, now: 1 });
    expect(naoMem.length).toBeGreaterThan(0);
    expect(naoMem[0].source).toBe('intent');
    // NullNpcAgentPort 对没点名的 NPC 也会照规则答（fallbackVerb），所以 mor 走的仍是正常意图路径。
    const morMem = recall(e.world, 'npc-mor', { k: 5, now: 1 });
    expect(morMem[0].source).toBe('intent');
  });

  it('真降级（无端口）入账的记忆 source = fallback', async () => {
    const e = town();
    const r = await runTurn(e.world, 1, undefined);
    expect(r.filled.length).toBe(AGENT_NPC_IDS.length);
    for (const id of AGENT_NPC_IDS) {
      expect(recall(e.world, `npc-${id}`, { k: 5, now: 1 })[0].source).toBe('fallback');
    }
  });

  it('账期（坑②）：NPC 在本回合感知时读不到自己本回合刚做的事', async () => {
    const e = town();
    const seen: AgentContext[] = [];
    const spy: NpcAgentPort = {
      async decide(ctx) { seen.push(ctx); return [{ npcId: ctx.npcId, verb: 'rest', turn: ctx.turn }]; },
    };
    await runTurn(e.world, 1, spy);
    // 第 1 回合感知时世界还没有任何记忆
    expect(seen.find((c) => c.npcId === 'nao')!.memories!.length).toBe(0);
    seen.length = 0;
    await runTurn(e.world, 2, spy);
    // 第 2 回合才读得到第 1 回合的账
    const m = seen.find((c) => c.npcId === 'nao')!.memories!;
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => x.turn < 2)).toBe(true);
  });

  it('记忆会衰减（move 标签忘得快·多跑几回合强度下降）', async () => {
    const e = town();
    await runTurn(e.world, 1, scripted({ nao: [{ verb: 'move_to', args: ['z-hill'] }] }));
    const s1 = recall(e.world, 'npc-nao', { k: 5, now: 1 })[0].strength;
    for (let t = 2; t <= 4; t++) await runTurn(e.world, t, scripted({ nao: [{ verb: 'rest' }] }));
    const old = recall(e.world, 'npc-nao', { k: 9, now: 4 }).find((x) => x.id === 't1:nao:move_to');
    expect(old === undefined || old.strength < s1).toBe(true);
  });
});

describe('game111 称号（NPC 给的·不是系统发的）', () => {
  it('每条称号在阈值前不解锁、恰好达到阈值才由对应 NPC 解锁', async () => {
    for (const t of TITLES) {
      expect(NPCS.some((n) => n.id === t.byNpc), `${t.id} 的授予者不存在`).toBe(true);
      const e = town();
      const ownerAffinity = affinityId(t.byNpc);
      for (const [eid] of e.world.query('Resource')) {
        const r = e.world.getComponent<Resource>(eid, 'Resource');
        if (r?.id === ownerAffinity) r.current = t.minAffinity - 1;
      }
      await runTurn(e.world, 1, undefined);
      expect(flagOn(e, titleFlag(t.id)), `${t.id} 提前在阈值-1 解锁`).toBe(false);
      for (const [eid] of e.world.query('Resource')) {
        const r = e.world.getComponent<Resource>(eid, 'Resource');
        if (r?.id === ownerAffinity) r.current = t.minAffinity;
      }
      await runTurn(e.world, 2, undefined);
      expect(flagOn(e, titleFlag(t.id)), `${t.id} 达到阈值仍未解锁`).toBe(true);
    }
  });
});

describe('game111 prompt 组装（形状归引擎·游戏层只填）', () => {
  it('AgentContext 带齐人设/需求/闭集/地点，且不含任何非标量结构', () => {
    const e = town();
    const ctx = buildAgentContext(e.world, 'nao', 3);
    expect(ctx.npcId).toBe('nao');
    expect(ctx.turn).toBe(3);
    expect(ctx.persona).toContain('咖啡店主');
    expect(Object.keys(ctx.needs!).sort()).toEqual(['curiosity', 'energy', 'mood', 'social']);
    expect(ctx.verbs.map((v) => v.verb)).toContain('move_to');
    expect(ctx.hints!.zone).toBe('z-cafe');
    for (const v of Object.values(ctx.hints!)) expect(['string', 'number']).toContain(typeof v);
  });

  it('同区在场者按 id 升序（确定性·不靠遍历序）', async () => {
    const e = town();
    // 把 mor 挪进咖啡馆，nao 就该看见它
    await runTurn(e.world, 1, scripted({ mor: [{ verb: 'move_to', args: ['z-cafe'] }] }));
    expect(buildAgentContext(e.world, 'nao', 2).perceived).toEqual(['mor']);
  });
});

describe('game111 意图信号命名（接缝的单一真相）', () => {
  it('全 NPC × 全合法参数：每条意图都有 KeyBinding 与目标正确的 Effect', () => {
    expect(intentSignal('nao', 'rest')).toBe('i:nao:rest');
    expect(intentSignal('nao', 'move_to', ['z-hill'])).toBe('i:nao:move_to:z-hill');
    const bp = buildBlueprint();
    const entities = Object.values(bp.entities);
    const cases: Array<{ signal: string; kind: string; targetId: string; value: string | number }> = [];
    for (const npc of NPC_IDS) {
      for (const zone of ZONE_IDS) cases.push({
        signal: intentSignal(npc, 'move_to', [zone]), kind: 'set-state', targetId: zoneFsm(npc), value: zone,
      });
      for (const other of NPC_IDS) if (other !== npc) cases.push({
        signal: intentSignal(npc, 'talk_to', [other]), kind: 'modify-resource', targetId: needId(npc, 'social'), value: TALK_SOCIAL,
      });
      cases.push({ signal: intentSignal(npc, 'rest'), kind: 'modify-resource', targetId: needId(npc, 'energy'), value: REST_ENERGY });
      cases.push({ signal: intentSignal(npc, 'observe'), kind: 'modify-resource', targetId: needId(npc, 'curiosity'), value: OBSERVE_CURIOSITY });
    }
    expect(cases.length).toBe(NPC_IDS.length * (ZONE_IDS.length + NPC_IDS.length - 1 + 2));
    for (const c of cases) {
      expect(entities.some((ent) => ent.KeyBinding?.key === c.signal && ent.KeyBinding?.signal === c.signal),
        `${c.signal} 没有 KeyBinding 接线`).toBe(true);
      expect(entities.some((ent) => ent.Effect?.onSignal === c.signal && ent.Effect.kind === c.kind
        && ent.Effect.targetId === c.targetId && ent.Effect.value === c.value),
        `${c.signal} 缺失目标正确的 Effect`).toBe(true);
    }
  });
});
