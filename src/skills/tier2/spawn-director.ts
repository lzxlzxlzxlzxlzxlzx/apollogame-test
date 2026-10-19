// ═══════════════════════════════════════════════════════════════
//  spawn-director —— 波次刷怪调度的**确定性纯函数核**
//  （REQ-SURVIVOR编排 E3·非 capability，先例见 dice.ts / hex.ts）。
//
//  薄缺口（Lead 裁决 2026-07-23）：k1-spawn 原子只「单发一个 SpawnRequest」，没有
//  「按波表 + 每秒速率累积 + 同屏上限（cap）调度出**本 tick 该发几个**」。吸血鬼幸存者式
//  割草的持续刷怪、任何塔防/生存的波次涌怪通用。本核只算「发什么、发几个」，
//  真生成交给现有 k1-spawn 原子（返回 SpawnRequest 形状·消费方逐个入队）。
//
//  分工（严守 manifesto，只补「速率累积 + cap + 波表调度」真缺口）：
//    · 波表（何时起、发什么、每秒几个、上限、开波爆发）= 纯数据表（DirectorWave[]，最弱 LLM 可产）。
//    · 位置放哪 = 消费游戏事（知道玩家/竞技场）；给可选 ring 则本核确定性环形布点，否则只出 templateId。
//    · 真实例化 = k1-spawn（模板展开由 assembly spawner 负责）。本核只出「该发的清单」。
//  确定性（lockstep/录放安全）：状态全在 director 对象里（elapsed/每波累积/开波爆发标/seedState 整数）——
//  可序列化、可从 {waves,seed} 重建；环形布点用 mulberry32 步进 seedState（绝不 Math.random·绝不 cos/sin）。
// ═══════════════════════════════════════════════════════════════
import type { SpawnRequest, RandomSeed } from '@engine/protocol/components.js';
import { nextRandom } from '@atom-skills/random/index.js';

/** 一条波表项（纯数据）。atTime=起效时刻（秒·now≥atTime 该波激活）；template=k1-spawn 模板 id；
 *  ratePerSec=每秒刷几个（累积制·可小数）；cap=该 template 同屏上限（含本 tick 已发·达上限不再发）；
 *  burst=开波瞬间一次性爆发数（可选·激活那刻发一次·同受 cap 约束）。 */
export interface DirectorWave {
  atTime: number;
  template: string;
  ratePerSec: number;
  cap: number;
  burst?: number;
}

/** 调度器运行态（可序列化·录放安全）。waves=波表（静态数据）；
 *  elapsed=上次 tick 的 now（算 dt 用）；acc=每波累积的刷怪信用（下标对齐 waves）；
 *  burstFired=每波开波爆发是否已发（下标对齐）；seedState=环形布点 PRNG 整数态。 */
export interface Director {
  waves: readonly DirectorWave[];
  elapsed: number;
  acc: number[];
  burstFired: boolean[];
  seedState: number;
}

/** 环形布点（可选）：绕 (cx,cy) 半径 radius 的圆周上确定性取角度落点。 */
export interface SpawnRing {
  cx: number;
  cy: number;
  radius: number;
}

export interface TickOpts {
  now: number; // 当前 sim 时刻（秒·单调不减）
  aliveCounts: Readonly<Record<string, number>>; // 每 template 当前存活数（cap 判据）
  ring?: SpawnRing; // 可选环形布点；缺省则输出 x=y=0（消费游戏自放位）
}

/** 建调度器：波表 + 种子 → 初始态（elapsed=0·累积清零·爆发未发）。 */
export function createDirector(waves: readonly DirectorWave[], seed = 0): Director {
  return {
    waves,
    elapsed: 0,
    acc: waves.map(() => 0),
    burstFired: waves.map(() => false),
    seedState: seed | 0,
  };
}

/** 步进 director.seedState 取 [0,1)——环形布点确定性取角度用。走 atoms/random 的 nextRandom（B-7：不再私藏一份 mulberry32·逐位同序列）。 */
function draw(dir: Director): number {
  const st: RandomSeed = { type: 'RandomSeed', seed: dir.seedState, sequence: 0 };
  const r = nextRandom(st);
  dir.seedState = st.seed;
  return r;
}

/** 按可选 ring 给一个 spawn 定位（无 ring → 原点·消费方自放）。出真 SpawnRequest（含 type 判别位·可直接入队 k1-spawn）。 */
function placed(dir: Director, template: string, ring: SpawnRing | undefined): SpawnRequest {
  if (!ring) return { type: 'SpawnRequest', templateId: template, x: 0, y: 0 };
  // 环上均匀取点·零三角函数（P0 治理围栏：sim 面禁 Math.cos/sin——非正确舍入·跨引擎可异）：
  // Marsaglia 拒绝采样——单位方块内取 (a,b) 直到落进单位圆，则 ((a²−b²)/(a²+b²), 2ab/(a²+b²)) 在单位圆上**均匀**分布，
  // 只用 ± × ÷（IEEE 正确舍入）。抽样次数随 PRNG 走、确定性不变；同 seed 同点。
  let a: number, b: number, r2: number;
  do {
    a = draw(dir) * 2 - 1;
    b = draw(dir) * 2 - 1;
    r2 = a * a + b * b;
  } while (r2 === 0 || r2 > 1);
  const ux = (a * a - b * b) / r2;
  const uy = (2 * a * b) / r2;
  return { type: 'SpawnRequest', templateId: template, x: ring.cx + ux * ring.radius, y: ring.cy + uy * ring.radius };
}

/** 推进一 tick：按波表算本 tick 该发的 spawn 列（尊重 rate 累积 + cap 上限 + 波段时序）。
 *  就地推进 director 运行态（elapsed/acc/burstFired/seedState），返回 SpawnRequest[]（可空）。
 *  dt = now − 上次 now（clamp ≥0·防回拨）；now 回退或相等 → dt=0（仍可发未发的开波爆发）。 */
export function tickDirector(director: Director, opts: TickOpts): SpawnRequest[] {
  const dt = Math.max(0, opts.now - director.elapsed);
  director.elapsed = opts.now;
  const out: SpawnRequest[] = [];
  // 本 tick 已发数（按 template·叠加到存活数上判 cap）。
  const spawnedThisTick: Record<string, number> = {};
  const roomFor = (template: string, cap: number): boolean => {
    const alive = opts.aliveCounts[template] ?? 0;
    const already = spawnedThisTick[template] ?? 0;
    return alive + already < cap;
  };
  for (let w = 0; w < director.waves.length; w++) {
    const wave = director.waves[w];
    if (opts.now < wave.atTime) continue; // 波未起
    // 开波爆发（一次性·激活那刻·受 cap 约束）。
    if (wave.burst && wave.burst > 0 && !director.burstFired[w]) {
      director.burstFired[w] = true;
      for (let b = 0; b < wave.burst; b++) {
        if (!roomFor(wave.template, wave.cap)) break;
        out.push(placed(director, wave.template, opts.ring));
        spawnedThisTick[wave.template] = (spawnedThisTick[wave.template] ?? 0) + 1;
      }
    }
    // 速率累积（可小数·攒够 1 个发 1 个）。
    director.acc[w] += wave.ratePerSec * dt;
    while (director.acc[w] >= 1) {
      if (!roomFor(wave.template, wave.cap)) {
        director.acc[w] = Math.min(director.acc[w], 1); // 被 cap 挡：信用封顶 1，不攒无限回填洪流
        break;
      }
      director.acc[w] -= 1;
      out.push(placed(director, wave.template, opts.ring));
      spawnedThisTick[wave.template] = (spawnedThisTick[wave.template] ?? 0) + 1;
    }
  }
  return out;
}
