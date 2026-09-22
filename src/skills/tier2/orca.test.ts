import { describe, it, expect } from 'vitest';
import { orcaVelocity, linearProgram2, RVO_EPSILON, type OrcaAgent, type OrcaLine, type OrcaStats } from './orca.js';

const hyp = (v: { x: number; y: number }): number => Math.hypot(v.x, v.y);
let idxSeq = 0;
const agent = (x: number, y: number, vx = 0, vy = 0, radius = 0.5): OrcaAgent => ({ x, y, vx, vy, radius, idx: idxSeq++ });

/** 与实现**同源重算**的 ORCA 约束（用于"结果落在半平面内"与"LP3 违反量"两条判据）。 */
function orcaLinesOf(self: OrcaAgent, neighbors: readonly OrcaAgent[], timeHorizon: number): OrcaLine[] {
  const lines: OrcaLine[] = [];
  const invT = 1 / timeHorizon;
  for (const o of neighbors) {
    const rp = { x: o.x - self.x, y: o.y - self.y };
    const rv = { x: self.vx - o.vx, y: self.vy - o.vy };
    const distSq = rp.x * rp.x + rp.y * rp.y;
    const cr = self.radius + o.radius;
    let dir: { x: number; y: number }; let u: { x: number; y: number };
    if (distSq > cr * cr) {
      const w = { x: rv.x - invT * rp.x, y: rv.y - invT * rp.y };
      const wLenSq = w.x * w.x + w.y * w.y;
      const dp = w.x * rp.x + w.y * rp.y;
      if (dp < 0 && dp * dp > cr * cr * wLenSq) {
        const wl = Math.sqrt(wLenSq); const uw = { x: w.x / wl, y: w.y / wl };
        dir = { x: uw.y, y: -uw.x }; const k = cr * invT - wl; u = { x: k * uw.x, y: k * uw.y };
      } else {
        const leg = Math.sqrt(distSq - cr * cr);
        dir = (rp.x * w.y - rp.y * w.x) > 0
          ? { x: (rp.x * leg - rp.y * cr) / distSq, y: (rp.x * cr + rp.y * leg) / distSq }
          : { x: -(rp.x * leg + rp.y * cr) / distSq, y: -(-rp.x * cr + rp.y * leg) / distSq };
        const dv = rv.x * dir.x + rv.y * dir.y;
        u = { x: dv * dir.x - rv.x, y: dv * dir.y - rv.y };
      }
    } else {
      const w = { x: rv.x - rp.x, y: rv.y - rp.y };          // timeStep = 1
      const wl = Math.sqrt(w.x * w.x + w.y * w.y);
      const uw = { x: w.x / wl, y: w.y / wl };
      dir = { x: uw.y, y: -uw.x }; const k = cr - wl; u = { x: k * uw.x, y: k * uw.y };
    }
    const share = o.reciprocal === false ? 1 : 0.5;
    lines.push({ point: { x: self.vx + share * u.x, y: self.vy + share * u.y }, direction: dir });
  }
  return lines;
}

describe('orca — 移植自 RVO2（Apache-2.0）· 线性规划本体', () => {
  it('无邻居 → 原样返回期望速度（避让不该无中生有地改路）', () => {
    const out = orcaVelocity(agent(0, 0), [], { x: 1, y: 0 }, 1, 2, 1);
    expect(out).toMatchObject({ x: 1, y: 0 });
  });

  it('期望速度超上限 → 钳到最大速度圆上（原码 linearProgram2 第一分支）', () => {
    const r = { x: 0, y: 0 };
    linearProgram2([], 1, { x: 3, y: 4 }, false, r);   // |(3,4)|=5 > 1
    expect(hyp(r)).toBeCloseTo(1, 9);
    expect(r.x / r.y).toBeCloseTo(3 / 4, 9);           // 方向不变
  });

  it('解出来的速度**满足每一条 ORCA 约束**（半平面在直线左侧·可行场景）', () => {
    // ⚠ 只在**可行**场景下断言"全满足"：原码在无可行解时会落到 linearProgram3，
    // 那一段求的是"最不违反"而不是"不违反"（挤死时的正确行为，见下面那条 LP3 用例）。
    // 第一版这里摆了三个近距离迎面单位 —— 那是**不可行**场景，断言当场红（0.146 > eps），
    // 红得对：错的是断言的前提，不是实现。
    const self = agent(0, 0, 1, 0);
    const neighbors = [agent(6, 2.5, -1, 0), agent(7, -3, -1, 0.1)];
    const pref = { x: 1, y: 0 };
    const out = orcaVelocity(self, neighbors, pref, 1, 2, 1);
    // 用与实现同源的构造重算约束，逐条验 det(dir, point - result) <= eps
    // （这条断言 = ORCA 的定义本身：结果必须落在所有半平面内）
    // ⚠ 第二轮复查前这里有一份**内联的**构造拷贝，与 `orcaLinesOf` 逐字重复（全仓三份）。
    // 已合并——同一个东西存三份，改一处忘两处只是时间问题。
    const lines = orcaLinesOf(self, neighbors, 2);
    for (const l of lines) {
      const det = l.direction.x * (l.point.y - out.y) - l.direction.y * (l.point.x - out.x);
      expect(det).toBeLessThanOrEqual(RVO_EPSILON);
    }
    expect(hyp(out)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('**迎面对撞会侧让**：两个正对着走的单位，解出来的速度带横向分量', () => {
    // 完全正对（y 完全相同）时左右对称、理论上可以不让；给一点点错位即可打破对称（真实场景恒如此）。
    const self = agent(0, 0, 1, 0);
    const other = agent(4, 0.05, -1, 0);
    const out = orcaVelocity(self, [other], { x: 1, y: 0 }, 1, 5, 1);
    expect(Math.abs(out.y)).toBeGreaterThan(0.01);     // 真的侧开了
    expect(out.x).toBeGreaterThan(0);                  // 但仍在往前走（不是掉头）
  });

  it('**已经重叠**时的脱离速度**量级**要对（不只是方向对·原码 collision 分支）', () => {
    // ⚠ 第二轮复查的 M2b：把这条分支里的 `k = combinedRadius * invTimeStep` 改成 ×2，
    // 脱离速度从 −0.400 变成 −0.900（2.25 倍），**65 测全绿**——方向断言对量级零判别力，
    // 而 P0-2 的整个修复就住在这条分支里。所以这里改成钉闭式。
    const self = agent(0, 0, 0, 0, 0.5);
    const other = agent(0.2, 0, 0, 0, 0.5);            // 圆心距 d=0.2 < 半径和 cr=1.0 = 已重叠
    const out = orcaVelocity(self, [other], { x: 0, y: 0 }, 1, 2, 1);
    expect(out.x).toBeLessThan(0);                     // 朝远离对方的方向脱离
    // 闭式（timeStep=1·相对速度 0）：w = −相对位置 ⇒ |w| = d = 0.2·unitW = (−1,0)
    // u = (cr − |w|)·unitW = (1.0 − 0.2)·(−1,0) = (−0.8, 0)，各让一半 ⇒ 约束要求 vx ≤ −0.4，
    // 而目标速度是 0 ⇒ 取边界 −0.4。**这个数由半径和与当前间距唯一决定**，改 k 的系数就会变。
    expect(out.x).toBeCloseTo(-0.4, 9);
    expect(out.y).toBeCloseTo(0, 9);
  });

  it('**挤死时取「最不违反」的速度**（linearProgram3 兜底·判据 = 违反量不超过 LP2 的落点）', () => {
    // ⚠ 用例名与实现注释首版都写的是「不失去速度」，独立复查实测**说反了**：
    // 这个场景里 LP3 给的恰恰是 (0,0)（站住不动最不违反），撤掉 LP3 反而得到 (1,0)（撞得更狠）。
    // LP3 优化的是**最大违反量**，与速度大小无关 —— 判据只能按这个写。
    // 而且首版整段删掉 LP3 时 53 测全绿（零断言覆盖），所以这条是补的承重腿。
    const self = agent(0, 0, 0, 0, 0.5);
    const ring = [agent(0.6, 0, -1, 0), agent(-0.6, 0, 1, 0), agent(0, 0.6, 0, -1), agent(0, -0.6, 0, 1)];
    const pref = { x: 1, y: 0 };
    const out = orcaVelocity(self, ring, pref, 1, 2, 1);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);   // 不出 NaN
    expect(hyp(out)).toBeLessThanOrEqual(1 + 1e-9);

    const lines = orcaLinesOf(self, ring, 2);
    const worstViolation = (v: { x: number; y: number }): number => Math.max(
      0, ...lines.map((l) => l.direction.x * (l.point.y - v.y) - l.direction.y * (l.point.x - v.x)),
    );

    // 判据①：**对 maxSpeed 圆内撒点暴力搜**最小可达违反量，LP3 必须逼近它。
    // （复查 N8 指出：拿"与实现同源重算的约束"当唯一判据，抓不到实现与镜像**一起翻**的刀；
    //  暴力搜是独立于实现的判据——它只用约束的定义，不用实现的求解路径。）
    let best = Infinity;
    const STEPS = 220;
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        const vx = -1 + (2 * i) / STEPS; const vy = -1 + (2 * j) / STEPS;
        if (vx * vx + vy * vy > 1 + 1e-12) continue;           // 只在 maxSpeed 圆内
        best = Math.min(best, worstViolation({ x: vx, y: vy }));
      }
    }
    expect(worstViolation(out)).toBeLessThanOrEqual(best + 0.02);   // 网格步长 2/220 ≈ 0.009

    // 判据②：也要比"只到 LP2 为止"的落点不差（前提：这个场景真的无可行解）
    const lp2Only = { x: 0, y: 0 };
    const failAt = linearProgram2(lines, 1, pref, false, lp2Only);
    expect(failAt).toBeLessThan(lines.length);
    expect(worstViolation(out)).toBeLessThanOrEqual(worstViolation(lp2Only) + RVO_EPSILON);
    expect(out).not.toEqual(lp2Only);                          // LP3 真的改了落点
  });

  it('**邻居不还礼时独自让满**（reciprocal:false ⇒ u 不打对折·偏离期望速度约两倍）', () => {
    // 复查打回项 P1-3 的单元级锚点：整合层面（ORCA 队 vs 纯流场队）这条差异只有 3% 可见，
    // 因为逐拍重解会把欠让的部分补回来；在这里它是**精确两倍**，一撤就红。
    const self = agent(0, 0, 1, 0);
    const other: OrcaAgent = { ...agent(4, 0.05, -1, 0), reciprocal: false };
    const pref = { x: 1, y: 0 };
    const half = orcaVelocity(self, [{ ...other, reciprocal: true }], pref, 1, 5, 1);
    const full = orcaVelocity(self, [other], pref, 1, 5, 1);
    const devHalf = Math.hypot(half.x - pref.x, half.y - pref.y);
    const devFull = Math.hypot(full.x - pref.x, full.y - pref.y);
    expect(devFull / devHalf).toBeCloseTo(2, 1);
    // 缺省（不填 reciprocal）= 原码语义 = 各让一半
    expect(orcaVelocity(self, [agent(4, 0.05, -1, 0)], pref, 1, 5, 1)).toEqual(half);
  });

  it('**完全同位不出 NaN、按下标定左右**（原码 w/|w| 在这里除以 0·NaN 约束会被静默丢弃）', () => {
    const stats: OrcaStats = { degenerate: 0, oneSided: 0, infeasible: 0 };
    const a: OrcaAgent = { x: 3, y: 3, vx: 0, vy: 0, radius: 0.5, idx: 1 };
    const b: OrcaAgent = { x: 3, y: 3, vx: 0, vy: 0, radius: 0.5, idx: 7 };
    const va = orcaVelocity(a, [b], { x: 0, y: 0 }, 1, 2, 1, stats);
    const vb = orcaVelocity(b, [a], { x: 0, y: 0 }, 1, 2, 1, stats);
    expect(Number.isFinite(va.x) && Number.isFinite(va.y)).toBe(true);
    expect(stats.degenerate).toBe(2);
    expect(va.x).toBeGreaterThan(0);      // 下标小的往 +x
    expect(vb.x).toBeLessThan(0);         // 下标大的往 −x ⇒ 严格相反 ⇒ 互惠不破
    expect(va.x).toBeCloseTo(-vb.x, 12);
    // **量级也钉住**（同上条理由）：|w|=0 ⇒ u = cr·unitW = (1.0, 0)，各让一半 ⇒ vx ≥ 0.5，
    // 目标速度 0 ⇒ 取边界 0.5。改 `k` 的系数这条立刻红。
    expect(va.x).toBeCloseTo(0.5, 9);
    expect(va.y).toBeCloseTo(0, 9);
    // 撤掉退化分支的话这里两条速度都是 NaN·而 NaN 在 linearProgram2 的 det(...)>0 里恒假
    // ⇒ 约束被静默丢弃 ⇒ 两个单位钉死在一起（整合层实测 60 拍两心距恒 0.000000）。
  });

  it('**退化兜底方向必须背离对方**（整个取反时 68 测曾全绿——方向零判据）', () => {
    // 三复查 P2：把退化分支的兜底方向整体取反，单元实测从「背离」变成「朝向」对方，
    // 而全库 68 测全绿。方向错了的"分离"是把人往一起推，比不分离更糟。
    // 构造 w = 0 **而相对位置非零**的那一支（相对速度恰等于相对位置 / timeStep=1）：
    const a: OrcaAgent = { x: 0, y: 0, vx: 0.4, vy: 0, radius: 0.5, idx: 0 };
    const b: OrcaAgent = { x: 0.4, y: 0, vx: 0, vy: 0, radius: 0.5, idx: 1 };
    //   rp = b − a = (0.4, 0) · rv = a − b = (0.4, 0) · w = rv − rp/1 = (0, 0) ⇒ 走退化分支
    const stats: OrcaStats = { degenerate: 0, oneSided: 0, infeasible: 0 };
    const out = orcaVelocity(a, [b], { x: 0, y: 0 }, 1, 2, 1, stats);
    expect(stats.degenerate).toBe(1);              // 真的走了退化分支（不是碰巧从别处出来的数）
    expect(out.x).toBeLessThan(0);                 // **背离** b（b 在 +x）——方向取反的话这里是 >0
  });

  it('确定性：同位分离的方向只由下标定（交换下标 → 方向严格翻转）', () => {
    const mk = (selfIdx: number, otherIdx: number): { x: number; y: number } => orcaVelocity(
      { x: 0, y: 0, vx: 0, vy: 0, radius: 0.5, idx: selfIdx },
      [{ x: 0, y: 0, vx: 0, vy: 0, radius: 0.5, idx: otherIdx }],
      { x: 0, y: 0 }, 1, 2, 1,
    );
    expect(mk(2, 9).x).toBeCloseTo(-mk(9, 2).x, 12);
  });

  it('**LP3 在一族随机无解场景上都逼近暴力最优**（单场景样本量=1 抓不住它的退化）', () => {
    // 三复查：把 LP3 的推进阈值 `> distance` 加到 `+0.03`（大于用例容差）**仍然全绿**——
    // 因为那**一个**场景的答案恰好不动。判据必须跑一族。
    let seed = 20260826;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const worstOf = (lines: readonly OrcaLine[], v: { x: number; y: number }): number => Math.max(
      0, ...lines.map((l) => l.direction.x * (l.point.y - v.y) - l.direction.y * (l.point.x - v.x)),
    );
    let scenarios = 0; let worstGap = -Infinity;
    for (let trial = 0; trial < 120; trial++) {
      // 随机围一圈近距离迎面单位（容易造出无可行解）
      const n = 3 + Math.floor(rnd() * 4);
      const self = agent(0, 0, rnd() * 0.4 - 0.2, rnd() * 0.4 - 0.2, 0.5);
      const ring: OrcaAgent[] = [];
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2 + rnd() * 0.4;
        const d = 0.55 + rnd() * 0.35;
        ring.push(agent(Math.cos(th) * d, Math.sin(th) * d, -Math.cos(th) * (0.5 + rnd()), -Math.sin(th) * (0.5 + rnd()), 0.5));
      }
      const pref = { x: rnd() * 2 - 1, y: rnd() * 2 - 1 };
      const lines = orcaLinesOf(self, ring, 2);
      const lp2Only = { x: 0, y: 0 };
      if (linearProgram2(lines, 1, pref, false, lp2Only) >= lines.length) continue;   // 有解 → 不是本条要测的
      scenarios++;
      const out = orcaVelocity(self, ring, pref, 1, 2, 1);
      // 暴力：maxSpeed 圆内撒点搜最小可达违反量
      let best = Infinity;
      const STEPS = 120;
      for (let i = 0; i <= STEPS; i++) {
        for (let j = 0; j <= STEPS; j++) {
          const vx = -1 + (2 * i) / STEPS; const vy = -1 + (2 * j) / STEPS;
          if (vx * vx + vy * vy > 1 + 1e-12) continue;
          best = Math.min(best, worstOf(lines, { x: vx, y: vy }));
        }
      }
      worstGap = Math.max(worstGap, worstOf(lines, out) - best);
    }
    expect(scenarios).toBeGreaterThan(30);        // 真造出了一族无解场景（否则"全过"没有意义）
    expect(worstGap).toBeLessThan(0.01);          // 实测 LP3 甚至常优于 120 步网格（gap 为负）
  });

  it('确定性：同输入逐位相同 · 邻居列表顺序不同不影响（已按距离排好序的前提下）', () => {
    const self = agent(0, 0, 1, 0);
    const ns = [agent(2, 0.2, -1, 0), agent(2.5, -0.6, -1, 0.1)];
    const a = orcaVelocity(self, ns, { x: 1, y: 0 }, 1, 2, 1);
    const b = orcaVelocity(self, ns, { x: 1, y: 0 }, 1, 2, 1);
    expect(a).toEqual(b);
  });

  it('零墙钟零随机（源码级·同 flow-field 口径）', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./orca.ts', import.meta.url), 'utf8');
    const body = src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/Date\.now|performance\.now|Math\.random/);
  });

  it('Apache-2.0 的三件套齐全：源文件声明 + 许可证正文 + 台账里的修改说明', async () => {
    // ⚠ 首版只有源文件里那行 SPDX，独立复查指出**不满足 §4(a)/(b)**：
    // 分发时要随附许可证正文，且要载明「本文件被修改过」。三样缺一这条就红。
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./orca.ts', import.meta.url), 'utf8');
    expect(src).toContain('SPDX-License-Identifier: Apache-2.0');
    expect(src).toContain('University of North Carolina at Chapel Hill');
    expect(src).toContain('https://github.com/snape/RVO2');

    const root = new URL('../../../', import.meta.url);
    const license = fs.readFileSync(new URL('licenses/Apache-2.0.txt', root), 'utf8');
    expect(license).toContain('Apache License');
    expect(license).toContain('Version 2.0, January 2004');

    const notices = fs.readFileSync(new URL('THIRD-PARTY-NOTICES.md', root), 'utf8');
    expect(notices).toContain('RVO2');
    expect(notices).toContain('src/skills/tier2/orca.ts');
    expect(notices).toMatch(/修改说明/);
  });
});
