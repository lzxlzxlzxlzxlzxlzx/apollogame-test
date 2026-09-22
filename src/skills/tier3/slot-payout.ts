import { defineCapability } from '@engine/core/define-capability.js';
import { sortedIds } from '@engine/core/query.js';
import { SystemPhase } from '@engine/core/types.js';
import type { IWorld } from '@engine/core/types.js';
import type { Resource, Signal, RolledDice, SlotMachine, LineWins, LineWin } from '@engine/protocol/components.js';

// ═══════════════════════════════════════════════════════════════
//  t3-slot-payout —— 网格连线赔付 + 老虎机经济（确定性解释器·REQ-K 下沉）。
//
//  真缺口：dice-roll 只把符号网格掷进 RolledDice、random 原子只给 [0,1)——没有「按赔付线左起连消
//  （百搭代入）+ 分散计数 → 查赔付表 → 记账下注/赢分/免费旋转」的能力。line-eval 是带**有序线扫描 +
//  前缀连数 + 百搭代入**的算法，Condition→Event→Effect / group-count 聚合都表达不了（周期表缺的「Line-Eval」格）。
//
//  分工（严守 manifesto，只补真缺口）：
//    - 掷轮（哪些符号）= dice-roll（RolledDice，消费世界 RandomSeed 整数 PRNG）。
//    - 触发（哪拍结算）= Signal（clickable/keybind 重组，惯例同 caster.onSignal）。
//    - 下注/余额/赢分/免费旋转态 = Resource（现成）。
//    - 赔付线/赔付表/轮权重 = 纯数据表（SlotMachine，最弱 LLM 可产）。
//  通用性：任何老虎机 / 连线消除 / 连珠计分都消费它（非某游戏专属）。
//  确定性：纯整数线扫描，**不掷任何随机**（随机全在 dice-roll）→ lockstep/录放安全。
//  相位：Update；reads RolledDice（dice-roll 写）→ 组件拓扑自动排在 dice-roll 之后（同拍先掷后判）。
// ═══════════════════════════════════════════════════════════════

export interface SlotEvalResult {
  lineWins: LineWin[];
  lineTotalBase: number; // Σ 线赢（已乘线注·未乘特色倍率）
  scatterCount: number;
  scatterWin: number;    // 分散赢（已乘总注）
}

/** 纯函数：对一个 grid[reel][row] 判所有赔付线 + 分散。左起连消、百搭(wild)代入、分散(scatter)任意位置计数。 */
export function evaluateSlot(
  grid: number[][],
  lines: number[][],
  pay: Record<number, Record<number, number>>,
  wild: number,
  scatter: number,
  scatterMin: number,
  scatterPay: Record<number, number>,
  lineBet: number,
  totalBet: number,
): SlotEvalResult {
  const lineWins: LineWin[] = [];
  let lineTotalBase = 0;

  lines.forEach((line, li) => {
    const seq = line.map((row, reel) => grid[reel]?.[row]);
    // 前缀纯百搭连数。
    let w = 0;
    while (w < seq.length && seq[w] === wild) w++;
    // 基础符号 = 首个非百搭非分散。
    let base = -1;
    for (const s of seq) {
      if (s === scatter) break;
      if (s !== wild) { base = s; break; }
    }
    let best: LineWin | null = null;
    if (base >= 0) {
      let c = 0;
      for (const s of seq) { if (s === base || s === wild) c++; else break; }
      const mult = pay[base]?.[c] ?? 0;
      if (c >= 3 && mult > 0) best = { line: li, symbol: base, count: c, pay: mult * lineBet };
    }
    // 纯百搭连（≥3）按百搭赔付，取与基础的较高者。
    if (w >= 3) {
      const wm = pay[wild]?.[w] ?? 0;
      if (wm > 0) {
        const wpay = wm * lineBet;
        if (!best || wpay > best.pay) best = { line: li, symbol: wild, count: w, pay: wpay };
      }
    }
    if (best) { lineWins.push(best); lineTotalBase += best.pay; }
  });

  let scatterCount = 0;
  for (const col of grid) for (const s of col) if (s === scatter) scatterCount++;
  const scatterWin = scatterCount >= scatterMin ? (scatterPay[scatterCount] ?? 0) * totalBet : 0;

  return { lineWins, lineTotalBase, scatterCount, scatterWin };
}

function findResource(world: IWorld, id: string): Resource | undefined {
  const eid = world.byId('Resource', 'id', id); // B-3：索引取创建序首个（= 旧线性扫）
  return eid === undefined ? undefined : world.getComponent<Resource>(eid, 'Resource');
}
function credit(r: Resource, delta: number): void {
  r.current = Math.max(r.min, Math.min(r.max, r.current + delta));
}

export const slotPayoutCapability = defineCapability({
  id: 't3-slot-payout',
  version: '1.0.0',

  describe: {
    name: 'slot-payout',
    summary:
      '网格连线赔付 + 老虎机经济：收到 spinSignal 当拍读 source 的 RolledDice 网格，按 lines 左起连消（wild 代入）+ scatter 计数 → 查 pay/scatterPay → 扣注、记赢入余额、写 LineWins；含免费旋转经济（freeResource>0 不扣注·线赢×freeMultiplier·≥scatterMin 分散 +freeAward）与下注升降。',
    semantic: ['tier3', 'mechanic', 'slot', 'line-eval', 'determinism', 'economy'],
    whenToUse:
      '任何"掷出符号网格→按赔付线左起连消+百搭+分散→查表赔付+下注经济"的玩法（老虎机/连线消除/连珠计分）。挂 SlotMachine 于机器实体，source 指向 dice-roll 的 RolledDice 持有者；SPIN 按钮 action→keybind→Signal(spinSignal) 触发。掷轮=dice-roll，随机全在那；本能力零随机、纯整数扫描、确定可回放。',
    examples: [
      '5×3 僵尸机：SlotMachine{ source:"reels", reels:5, rows:3, lines:[[1,1,1,1,1],...], pay:{"5":{"3":20,...}}, wild:8, scatter:9, scatterMin:3, scatterPay:{"3":2,...}, spinSignal:"spin", betResource:"bet", balanceResource:"balance", winResource:"win", freeResource:"freespins", freeAward:10, freeMultiplier:2 } + reels 挂 DicePool(15颗) + 世界 RandomSeed → 每按 SPIN 掷轮判线记账',
      '下注升降：betUpSignal:"betup"/betDownSignal:"betdown"/betStep:20/betMin:20/betMax:500 → 收到信号钳制调 betResource',
    ],
  },

  components: {
    provides: {
      SlotMachine: {
        category: 'config',
        describe: '声明一台老虎机：轮网格来源 + 赔付线/表 + 百搭/分散 + 下注经济 + 免费旋转。挂机器实体，配 dice-roll 的 RolledDice 与世界 RandomSeed。',
        fields: {
          source: { type: 'EntityId', describe: '持 RolledDice 的实体 id（dice-roll 掷出的符号网格来源）' },
          reels: { type: 'number', describe: '列数（轮数）' },
          rows: { type: 'number', describe: '行数（每轮可见格）。cell(reel,row) 在 RolledDice.results 的下标 = reel*rows+row（列优先）' },
          lines: { type: 'string', describe: '赔付线 number[][]：每条=每轮行号(0..rows-1)，长度=reels，左→右' },
          pay: { type: 'string', describe: '赔付表 Record<symbolId, Record<count, 线注倍率>>（count=3/4/5 字符串键）' },
          wild: { type: 'number', describe: '百搭符号 value（代入除分散外任意符号）' },
          scatter: { type: 'number', describe: '分散符号 value（任意位置计数）' },
          scatterMin: { type: 'number', describe: '触发分散赔付/免费旋转的最少命中数（通常 3）' },
          scatterPay: { type: 'string', describe: '分散赔付 Record<count, 总注倍率>' },
          spinSignal: { type: 'string', describe: '收到此信号当拍解算一次旋转' },
          betResource: { type: 'string', describe: '总注资源 id' },
          balanceResource: { type: 'string', describe: '余额资源 id（扣注/记赢）' },
          winResource: { type: 'string', describe: '可选：写入本旋总赢的资源 id（HUD 上次赢）' },
          freeResource: { type: 'string', describe: '可选：免费旋转剩余数资源 id。>0 时本旋不扣注、线赢×freeMultiplier' },
          freeAward: { type: 'number', describe: '可选：≥scatterMin 分散时赠送的免费旋转数' },
          freeMultiplier: { type: 'number', describe: '可选：免费旋转期间线赢倍率（默认 1）' },
          betUpSignal: { type: 'string', describe: '可选：加注信号名' },
          betDownSignal: { type: 'string', describe: '可选：减注信号名' },
          betStep: { type: 'number', describe: '可选：每次加减注步长' },
          betMin: { type: 'number', describe: '可选：注额下限' },
          betMax: { type: 'number', describe: '可选：注额上限' },
        },
      },
      LineWins: {
        category: 'event',
        describe: '一次旋转的结算结果（outcome-first 投影给 HUD/演出层）。由 slot-payout 写在机器实体上，spin 每解算 +1。',
        fields: {
          spin: { type: 'number', describe: '结算序号（每解算一次 +1）' },
          total: { type: 'number', describe: '本旋总赢（线赢×倍率 + 分散赢）' },
          scatterCount: { type: 'number', describe: '分散命中数' },
          triggeredFree: { type: 'number', describe: '本旋触发/再触发赠送的免费旋转数（0=未触发）' },
          wins: { type: 'string', describe: 'LineWin[]：各中奖线 {line,symbol,count,pay}' },
        },
      },
    },
    reads: ['SlotMachine', 'RolledDice', 'Signal', 'Resource'],
    writes: ['Resource', 'LineWins'],
    consumes: [],
  },

  config: {},

  systems: [
    {
      id: 't3-slot-payout',
      phase: SystemPhase.Update,
      // 与 resource-apply 都「读改写 Resource」→ 组件图判成环；显式排在其后打破（本能力直接改 Resource.current，
      // 不经 ResourceModify，二者无真数据依赖，定序仅为确定性）。
      runsAfter: ['resource-apply'],
      reads: ['SlotMachine', 'RolledDice', 'Signal', 'Resource'],
      writes: ['Resource', 'LineWins'],
      consumes: [],
      execute(world: IWorld) {
        const signals = new Set<string>();
        for (const [sid] of world.query('Signal')) {
          const s = world.getComponent<Signal>(sid, 'Signal');
          if (s) signals.add(s.name);
        }
        if (signals.size === 0) return;

        const machineIds = sortedIds(world, 'SlotMachine');
        for (const mid of machineIds) {
          const m = world.getComponent<SlotMachine>(mid, 'SlotMachine');
          if (!m) continue;
          const betRes = findResource(world, m.betResource);

          // ── 下注升降（钳制）──
          if (betRes) {
            const step = m.betStep ?? 0, lo = m.betMin ?? betRes.min, hi = m.betMax ?? betRes.max;
            if (m.betUpSignal && signals.has(m.betUpSignal)) betRes.current = Math.min(hi, betRes.current + step);
            if (m.betDownSignal && signals.has(m.betDownSignal)) betRes.current = Math.max(lo, betRes.current - step);
          }

          // ── 旋转解算 ──
          if (!signals.has(m.spinSignal)) continue;
          const rolled = world.getComponent<RolledDice>(m.source, 'RolledDice');
          if (!rolled || rolled.results.length < m.reels * m.rows) continue; // 本拍未掷/结果不足 → 不解算

          const balanceRes = findResource(world, m.balanceResource);
          if (!betRes || !balanceRes) continue;
          const bet = betRes.current;

          const freeRes = m.freeResource ? findResource(world, m.freeResource) : undefined;
          const free = !!freeRes && freeRes.current > 0;
          if (free) freeRes.current = Math.max(freeRes.min, freeRes.current - 1);
          else {
            if (balanceRes.current < bet) continue; // 余额不足且非免费 → 不旋（HUD 亦禁 SPIN）
            credit(balanceRes, -bet);
          }
          const mult = free ? (m.freeMultiplier ?? 1) : 1;

          // 组网格 grid[reel][row]（列优先下标）。
          const grid: number[][] = [];
          for (let r = 0; r < m.reels; r++) {
            const col: number[] = [];
            for (let y = 0; y < m.rows; y++) col.push(rolled.results[r * m.rows + y]?.value ?? -1);
            grid.push(col);
          }

          const lineBet = Math.max(1, Math.floor(bet / m.lines.length));
          const payNum = m.pay as unknown as Record<number, Record<number, number>>;
          const scatNum = m.scatterPay as unknown as Record<number, number>;
          const ev = evaluateSlot(grid, m.lines, payNum, m.wild, m.scatter, m.scatterMin, scatNum, lineBet, bet);

          const total = ev.lineTotalBase * mult + ev.scatterWin;
          if (total > 0) credit(balanceRes, total);
          const winRes = m.winResource ? findResource(world, m.winResource) : undefined;
          if (winRes) winRes.current = Math.max(winRes.min, Math.min(winRes.max, total));

          let triggeredFree = 0;
          if (ev.scatterCount >= m.scatterMin && freeRes && m.freeAward) {
            freeRes.current = Math.min(freeRes.max, freeRes.current + m.freeAward);
            triggeredFree = m.freeAward;
          }

          const prev = world.getComponent<LineWins>(mid, 'LineWins');
          const next: LineWins = {
            type: 'LineWins',
            spin: (prev?.spin ?? 0) + 1,
            total,
            scatterCount: ev.scatterCount,
            triggeredFree,
            wins: ev.lineWins,
          };
          if (prev) { prev.spin = next.spin; prev.total = total; prev.scatterCount = ev.scatterCount; prev.triggeredFree = triggeredFree; prev.wins = ev.lineWins; }
          else world.addComponent(mid, next);
        }
      },
    },
  ],
});
