// 编排器核自检（REQ-PIPESOFT P1a·图纸 docs/design/pipeline-orchestrator-spec-2026-08.md §P1a「测试·点名」）：
//   ① 锁互斥（双 dispatch 第二个必拒）② 看门狗（stub 慢进程→stalled→重派一次→failed）
//   ③ gate 独立重验（会话谎报完成 → 编排器落 FAIL 证据）④ CLI 缺失优雅拒绝
// 复查会话（dispatch --review·owner 2026-08-10 令「复查人≠施工人」自动化半边）：
//   ⑤ 豁免关拒绝（S1/S6/S7）+ 复查档预算 ⑥ 复查喂料（手册+checklist 实时输出+板/目录+复查尾注）
//   ⑦ 复查独立重验三判（缺记录/过期/by 不符=失败·FAIL verdict=成功——FAIL 也是合格交付）
//   ⑧ 串行锁共用（stage 记 SN:review·台账走既有通道）
//
// **零 token 铁律**：全部用替身进程（临时目录里 chmod 755 的 node 小脚本冒充 claude CLI），
// 任何一条测试都不许起真 LLM 会话——所有 dispatch 调用必须显式注入 claudeBin（本容器真有 claude，
// 漏注入=真烧 token）。看门狗超时参数化注入（毫秒级），不真等 600s。
//
// ③ 是**假信心自查点**：把 decideStatus 短路成读会话自述 → 本组必须转红（验证记录见提交说明）。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  lockPath, runsPath, pidAlive, readLock, acquireLock, releaseLock, touchLock, readRuns,
  budgetFor, STAGE_BUDGET, NO_SESSION_STAGES, detectRuntime, NO_RUNTIME_MSG,
  buildSessionPrompt, sessionFooter, sessionArgs, gameDirFor, decideStatus, verifyStage,
  dispatch, statusFor, abort, IDLE_TIMEOUT_MS, MAX_ATTEMPTS, STARTUP_GRACE_MS, runSession,
  reviewBudgetFor, REVIEW_BUDGET, NO_REVIEW_STAGES, REVIEW_BY_PREFIX,
  buildReviewSessionPrompt, reviewSessionFooter, checklistText, boardText, verifyReview,
} from './pipeline-orchestrator.mjs';
import { gameHash as pipelineGameHash, pipelineFile as pipelinePath } from './game-pipeline.mjs';

const ORCH_CLI = join(dirname(fileURLToPath(import.meta.url)), 'pipeline-orchestrator.mjs');
const PIPELINE_CLI = join(dirname(fileURLToPath(import.meta.url)), 'game-pipeline.mjs');
const MANIFEST = { name: 'GX', capabilities: [], entities: { hero: { Sprite: { textureKey: 'art:knight' } } } };

const withRoot = async (fn) => {
  const r = mkdtempSync(join(tmpdir(), 'orch-'));
  try { return await fn(r); } finally { rmSync(r, { recursive: true, force: true }); }
};
const put = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return p;
};
/** 一个 builtin 形态的假游戏（detectForm→builtin·让 board/gate 认得它）。 */
const fakeGame = (root, slug = 'gx') => { put(root, `public/games/${slug}/manifest.json`, MANIFEST); return slug; };

/** 替身「claude CLI」：chmod 755 的 node 脚本。body 是脚本正文（可读 STUB_* 常量）。 */
const stub = (root, name, body) => {
  const p = put(root, `stubs/${name}`, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
};
const waitFor = async (fn, ms = 4000, step = 15) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, step)); }
  return false;
};
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []);

// ═══ ① 锁互斥（图纸 §会话契约 6·M1 撞车事故律：同库双头施工=浪费+冲突）═══════════
describe('① 串行锁互斥', () => {
  it('活 pid 持锁 → 第二个 dispatch 必拒并显示占用方（且一步都不往下走）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    put(root, '.zerocraft/orchestrator.lock',
      { slug: 'other-game', stage: 'S4', pid: process.pid, startedAt: new Date().toISOString() });
    const marker = join(root, 'spawned.txt');
    const bin = stub(root, 'never', `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x\\n');`);

    const r = await dispatch({ root, slug, stage: 'S3', claudeBin: bin });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('LOCKED');
    expect(r.holder.slug).toBe('other-game');
    expect(r.holder.stage).toBe('S4');
    expect(r.reason).toContain('other-game');
    expect(r.reason).toContain('S4');
    expect(lines(marker)).toHaveLength(0);              // 被拒 = 替身会话一次都没起
    expect(readLock(root).slug).toBe('other-game');     // 别人的锁没被踩
  }));

  it('真·双 dispatch 并发：第二个在第一个跑着的时候被拒（只起了一个会话）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const marker = join(root, 'spawned.txt');
    const bin = stub(root, 'slow-ok', [
      `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x\\n');`,
      `console.log('{"type":"stream","text":"working"}');`,
      `setTimeout(() => process.exit(0), 300);`,
    ].join('\n'));

    const first = dispatch({ root, slug, stage: 'S3', claudeBin: bin, idleTimeoutMs: 5000 });
    expect(await waitFor(() => existsSync(lockPath(root)))).toBe(true);   // 一号已占锁

    const second = await dispatch({ root, slug, stage: 'S3', claudeBin: bin, idleTimeoutMs: 5000 });
    expect(second.code).toBe('LOCKED');
    expect(second.holder.slug).toBe(slug);
    expect(second.holder.stage).toBe('S3');

    await first;
    expect(lines(marker)).toHaveLength(1);              // 全程只起过一个会话
    expect(existsSync(lockPath(root))).toBe(false);     // 一号跑完自己放锁
  }));

  it('死 pid 的锁自动清（图纸：锁进程死亡=自动清锁）· 坏 JSON 同样按无锁处理', () => withRoot(async (root) => {
    const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    expect(dead.status).toBe(0);
    const deadPid = 2147480000;                          // 稳定不存在的 pid（> pid_max）
    expect(pidAlive(deadPid)).toBe(false);

    put(root, '.zerocraft/orchestrator.lock', { slug: 'zombie', stage: 'S4', pid: deadPid, startedAt: '2020-01-01T00:00:00Z' });
    expect(readLock(root)).toBeNull();                   // 读到即清
    expect(existsSync(lockPath(root))).toBe(false);

    put(root, '.zerocraft/orchestrator.lock', 'not json at all');
    expect(readLock(root)).toBeNull();
    const got = acquireLock(root, { slug: 'fresh', stage: 'S3' });
    expect(got.ok).toBe(true);
    expect(readLock(root).slug).toBe('fresh');
  }));

  it('占锁/心跳/放锁：只动自己那把（别人的锁不踩不删）', () => withRoot(async (root) => {
    expect(acquireLock(root, { slug: 'a', stage: 'S3' }).ok).toBe(true);
    expect(acquireLock(root, { slug: 'b', stage: 'S3' }).ok).toBe(false);   // 已被占

    expect(touchLock(root, { lastOutputAt: '2030-01-01T00:00:00.000Z' }, { pid: 999999, throttleMs: 0 })).toBeNull();
    const beat = touchLock(root, { lastOutputAt: '2030-01-01T00:00:00.000Z' }, { throttleMs: 0 });
    expect(beat.lastOutputAt).toBe('2030-01-01T00:00:00.000Z');

    expect(releaseLock(root, { pid: 999999 })).toBe(false);                 // 不是我的，不释放
    expect(existsSync(lockPath(root))).toBe(true);
    expect(releaseLock(root)).toBe(true);
    expect(existsSync(lockPath(root))).toBe(false);
  }));
});

// ═══ ② 看门狗（图纸 §会话契约 4：600s 无输出=stalled → 杀 → 重派一次 → 再停=failed）═══
// **为什么这组分两层**（独立复查 2026-09-12 打回「看门狗测试在别人机器上红」）：
// 「停滞→重派一次→failed」是编排逻辑，「超时杀进程」是机制，混在一条真子进程测试里就只能
// 赌「Node 冷启动比毫秒级阈值快」——快机器绿、慢机器红，同一份代码两种结果 = 判据不作数。
// 所以 ② 编排逻辑注入假 runner（零子进程·零计时·完全确定）；②′ 机制真起进程但阈值给到
// 秒级、且只验 runSession 自己，不掺编排。
describe('② 看门狗编排：停滞→重派一次→failed（注入 runner·零计时）', () => {
  /** 假会话执行器：按脚本逐次返回结果（用尽后重复最后一条），并记下每次收到的参数。 */
  const fakeRunner = (results) => {
    const calls = [];
    const impl = async (o) => { calls.push(o); return results[Math.min(calls.length - 1, results.length - 1)]; };
    impl.calls = calls;
    return impl;
  };
  const STALLED = { outcome: 'stalled', code: null, signal: 'SIGTERM', bytes: 0, error: null };
  const EXITED = (bytes = 42) => ({ outcome: 'exited', code: 0, signal: null, bytes, error: null });
  const anyBin = (root) => stub(root, 'unused', 'process.exit(0);');   // 只为过运行时探测，注入后不真跑

  it('全程静默的会话：起两次（首派+重派一次·不多不少）→ failed「需人工」', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const runner = fakeRunner([STALLED]);
    const r = await dispatch({ root, slug, stage: 'S3', claudeBin: anyBin(root), idleTimeoutMs: 200, runSessionImpl: runner });
    expect(runner.calls).toHaveLength(2);                // 首派 + 自动重派**一次**，不是三次
    expect(r.ok).toBe(false);
    expect(r.code).toBe('STALLED');
    expect(r.attempts).toBe(2);
    expect(r.session.outcome).toBe('stalled');
    expect(r.entry.state).toBe('failed');
    expect(r.entry.needsHuman).toBe(true);
    expect(r.reason).toContain('停滞');
    expect(readRuns(root)[slug].state).toBe('failed');   // 台账落红（status/板读得到）
    expect(existsSync(lockPath(root))).toBe(false);      // 失败也放锁（不留死锁堵后续）
  }));

  it('首派停滞、重派那次正常退出 → 不再起第三次（重派名额只有一个）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const runner = fakeRunner([STALLED, EXITED()]);
    const r = await dispatch({ root, slug, stage: 'S3', claudeBin: anyBin(root), idleTimeoutMs: 200, runSessionImpl: runner });
    expect(runner.calls).toHaveLength(2);
    expect(r.attempts).toBe(2);
    expect(r.session.outcome).toBe('exited');
    expect(r.code).toBe('GATE_FAIL');                    // 会话正常退出 ≠ 阶段绿：还得过独立重验（见 ③）
  }));

  it('会话一次就正常退出 → 只起一次（不白烧第二个名额）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const runner = fakeRunner([EXITED(7)]);
    const r = await dispatch({ root, slug, stage: 'S3', claudeBin: anyBin(root), idleTimeoutMs: 200, runSessionImpl: runner });
    expect(runner.calls).toHaveLength(1);
    expect(r.attempts).toBe(1);
    expect(r.code).toBe('GATE_FAIL');
  }));

  it('看门狗参数真传到会话执行器（空闲阈/启动宽限/杀宽限不是摆设·心跳回调已接线）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const runner = fakeRunner([EXITED(1)]);
    await dispatch({ root, slug, stage: 'S3', claudeBin: anyBin(root), idleTimeoutMs: 1234,
                    killGraceMs: 77, startupGraceMs: 4321, runSessionImpl: runner });
    expect(runner.calls[0].idleTimeoutMs).toBe(1234);
    expect(runner.calls[0].killGraceMs).toBe(77);
    expect(runner.calls[0].startupGraceMs).toBe(4321);
    expect(typeof runner.calls[0].onOutput).toBe('function');   // 心跳落锁（status 靠它分 running/stalled）
  }));

  it('看门狗默认值照图纸：600s 空闲阈 / 首派+重派一次 / 启动宽限 20s', () => {
    expect(IDLE_TIMEOUT_MS).toBe(600_000);
    expect(MAX_ATTEMPTS).toBe(2);
    expect(STARTUP_GRACE_MS).toBe(20_000);
  });
});

// ═══ ②′ 杀进程机制单测（真子进程·秒级阈值·不掺编排）═══════════════════════════
describe('②′ runSession 机制：静默→杀 · 有心跳→不杀 · 冷启动宽限内不误杀', () => {
  it('全程静默的慢进程 → 被杀并判 stalled（不等它自己跑完 30s）', () => withRoot(async (root) => {
    const marker = join(root, 'spawned.txt');
    const bin = stub(root, 'silent-slow', [
      `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x\\n');`,
      `setTimeout(() => process.exit(0), 30000);`,        // 一个字都不吐（心跳=输出 → 判停滞）
    ].join('\n'));
    const t0 = Date.now();
    const s = await runSession({ bin, args: [], prompt: '', cwd: root, idleTimeoutMs: 3000, killGraceMs: 500, startupGraceMs: 3000 });
    expect(lines(marker)).toHaveLength(1);                // 真起来了（否则下面几条没意义）
    expect(s.outcome).toBe('stalled');
    expect(s.bytes).toBe(0);
    expect(Date.now() - t0).toBeLessThan(25000);
  }), 40000);

  it('持续吐流的慢进程跑到自然退出（心跳判据非闹钟：总时长 > 空闲阈也不杀）', () => withRoot(async (root) => {
    const bin = stub(root, 'chatty-slow', [
      `let n = 0;`,
      `const t = setInterval(() => { console.log('{"type":"stream","n":' + (++n) + '}'); if (n >= 8) { clearInterval(t); process.exit(0); } }, 120);`,
    ].join('\n'));
    const s = await runSession({ bin, args: [], prompt: '', cwd: root, idleTimeoutMs: 900, killGraceMs: 300, startupGraceMs: 5000 });
    expect(s.outcome).toBe('exited');                     // 总时长 ~1s > 900ms 空闲阈，但每 120ms 一次心跳
    expect(s.code).toBe(0);
    expect(s.bytes).toBeGreaterThan(0);
  }), 40000);

  it('冷启动宽限：第一口输出之前按宽限计时，不按空闲阈（慢机器不误杀）', () => withRoot(async (root) => {
    // 进程憋 600ms 才吐第一口。空闲阈 200ms：没有宽限必被误杀；宽限 10s → 必须活到吐出来。
    const bin = stub(root, 'slow-boot', `setTimeout(() => { console.log('{"type":"stream"}'); process.exit(0); }, 600);`);
    const s = await runSession({ bin, args: [], prompt: '', cwd: root, idleTimeoutMs: 200, killGraceMs: 300, startupGraceMs: 10000 });
    expect(s.outcome).toBe('exited');
    expect(s.code).toBe(0);
    expect(s.bytes).toBeGreaterThan(0);
  }), 40000);

  it('起不来的 bin → spawn-error（不抛·落结构化结果）', () => withRoot(async (root) => {
    const s = await runSession({ bin: join(root, 'nope-does-not-exist'), args: [], prompt: '', cwd: root,
                                idleTimeoutMs: 1000, killGraceMs: 200, startupGraceMs: 1000 });
    expect(s.outcome).toBe('spawn-error');
    expect(s.bytes).toBe(0);
  }), 40000);
});

// ═══ ③ 独立重验（图纸 §会话契约 5「绿不靠嘴」）· 假信心自查点 ═════════════════
describe('③ 绿不靠嘴：会话谎报完成 → 编排器自己量退出码落 FAIL', () => {
  it('会话高喊「门禁全绿」且退出码 0 —— 编排器真跑 game-pipeline gate 量到 1 → failed', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const bin = stub(root, 'liar', [
      `console.log('{"type":"result","result":"✅ 全部完成，门禁全绿，S3 已通过，可以推送了"}');`,
      `process.exit(0);`,
    ].join('\n'));

    // 注意：**不注入 verifyCmd** —— 编排器必须自己 spawn 真的 scripts/game-pipeline.mjs gate。
    const r = await dispatch({ root, slug, stage: 'S3', claudeBin: bin, idleTimeoutMs: 5000 });

    expect(r.session.code).toBe(0);                      // 会话自称成功、退出码也是 0
    expect(r.session.outcome).toBe('exited');
    expect(r.verify.kind).toBe('gate');                  // 独立重验走的是真 gate 命令
    expect(r.verify.exit).not.toBe(0);                   // 编排器自己量到的退出码 = 非 0
    expect(r.ok).toBe(false);                            // ← 判定跟着门走，不跟着嘴走
    expect(r.code).toBe('GATE_FAIL');
    expect(r.entry.state).toBe('failed');
    expect(r.entry.needsHuman).toBe(true);
    expect(JSON.parse(readFileSync(runsPath(root), 'utf8'))[slug].state).toBe('failed'); // 证据落盘
  }), 30000);

  it('反向对照：会话退出码 1「自称失败」，但重验绿 → done（判定 100% 由重验决定）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const bin = stub(root, 'gloomy', [`console.error('失败了，我放弃');`, `process.exit(1);`].join('\n'));
    const r = await dispatch({
      root, slug, stage: 'S3', claudeBin: bin, idleTimeoutMs: 5000,
      verifyCmd: ['node', ['-e', 'process.exit(0)']],    // 替身门：绿
    });
    expect(r.session.code).toBe(1);
    expect(r.verify.exit).toBe(0);
    expect(r.ok).toBe(true);
    expect(r.entry.state).toBe('done');
  }), 20000);

  it('decideStatus 只读重验退出码（短路它 → 上面两条必转红）', () => {
    expect(decideStatus({ exit: 0 })).toBe('done');
    expect(decideStatus({ exit: 1 })).toBe('failed');
    expect(decideStatus({ exit: 137 })).toBe('failed');
    expect(decideStatus(null)).toBe('failed');
  });

  it('S1/S2 无 gate 命令 → 重验改用 board --json 重新推导该阶段机器态（board 自身退出码不作数）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const v = verifyStage(root, slug, 'S1');
    expect(v.kind).toBe('board');
    expect(v.exit).toBe(1);                              // 空立项卡 → 机器态非 ok
    expect(v.summary).toContain('S1');
  }), 20000);
});

// ═══ ④ CLI 缺失优雅拒绝（图纸 §会话契约 2：编排器是加速器不是依赖）═════════════
describe('④ 无编排运行时 → 优雅拒绝', () => {
  it('探测不到 CLI：dispatch 拒绝并说「板照常手动用」·不占锁·不落红账', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const missing = join(root, 'stubs', 'no-such-claude-binary');
    expect(existsSync(missing)).toBe(false);

    const r = await dispatch({ root, slug, stage: 'S3', claudeBin: missing });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NO_RUNTIME');
    expect(r.reason).toContain('本机无编排运行时');
    expect(r.reason).toContain('板照常手动用');
    expect(r.reason).toContain('game-pipeline.mjs board');
    expect(existsSync(lockPath(root))).toBe(false);      // 拒绝不占锁
    expect(readRuns(root)).toEqual({});                  // 拒绝 ≠ 该阶段失败：不脏台账
  }));

  it('detectRuntime：缺失→{ok:false}·存在（含绝对路径替身）→{ok:true}', () => withRoot(async (root) => {
    expect(detectRuntime({ bin: join(root, 'nope') }).ok).toBe(false);
    expect(detectRuntime({ bin: join(root, 'nope') }).reason).toBe(NO_RUNTIME_MSG(join(root, 'nope')));
    const bin = stub(root, 'present', 'process.exit(0);');
    const ok = detectRuntime({ bin });
    expect(ok.ok).toBe(true);
    expect(ok.path).toBe(bin);
  }));

  it('CLI 端到端：真跑 pipeline-orchestrator.mjs dispatch → 退出码 3（P1b 靠这码回落手动）', () => withRoot(async (root) => {
    fakeGame(root);
    const r = spawnSync(process.execPath, [ORCH_CLI, 'dispatch', 'gx', 'S3', '--json'], {
      cwd: root, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: root, ZEROCRAFT_ORCH_CLAUDE: join(root, 'no-such-claude') },
    });
    expect(r.status).toBe(3);                            // 3=本机无编排运行时（≠1 失败·壳要分得开）
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    expect(out.code).toBe('NO_RUNTIME');
    expect(out.reason).toContain('本机无编排运行时');
  }), 60000);
});

// ═══ 阶段档位映射（图纸 §会话契约 3）═════════════════════════════════════════
describe('阶段档位与预算', () => {
  it('S1/S8=low · S2/S3=medium · S4/S5=high', () => {
    expect(budgetFor('S1')).toMatchObject({ ok: true, effort: 'low' });
    expect(budgetFor('S8')).toMatchObject({ ok: true, effort: 'low' });
    expect(budgetFor('S2')).toMatchObject({ ok: true, effort: 'medium' });
    expect(budgetFor('S3')).toMatchObject({ ok: true, effort: 'medium' });
    expect(budgetFor('S4')).toMatchObject({ ok: true, effort: 'high' });
    expect(budgetFor('S5')).toMatchObject({ ok: true, effort: 'high' });
    for (const b of Object.values(STAGE_BUDGET)) expect(b.maxTurns).toBeGreaterThan(0); // 预算永远封顶
  });

  it('S6/S7 拒绝 dispatch 并说明去哪儿办（美术平台 / 人门）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    for (const s of ['S6', 'S7']) {
      expect(budgetFor(s)).toMatchObject({ ok: false, code: 'NO_SESSION_STAGE' });
      const r = await dispatch({ root, slug, stage: s, claudeBin: '/definitely/not/here' });
      expect(r.code).toBe('NO_SESSION_STAGE');
      expect(r.reason).toBe(NO_SESSION_STAGES[s]);
      expect(existsSync(lockPath(root))).toBe(false);
    }
    expect(NO_SESSION_STAGES.S6).toContain('美术平台');
    expect(NO_SESSION_STAGES.S7).toContain('人门');
    expect((await dispatch({ root, slug, stage: 'S9', claudeBin: '/nope' })).code).toBe('UNKNOWN_STAGE');
    expect((await dispatch({ root, slug: 'no-such-game', stage: 'S3', claudeBin: '/nope' })).code).toBe('UNKNOWN_GAME');
  }));

  it('CLI 参数带 --effort/--max-turns 封顶（house 约定：-p 无头 + stream-json）', () => {
    const a = sessionArgs({ effort: 'high', maxTurns: 120 });
    expect(a).toContain('-p');
    expect(a[a.indexOf('--effort') + 1]).toBe('high');
    expect(a[a.indexOf('--max-turns') + 1]).toBe('120');
    expect(a).toContain('stream-json');
  });
});

// ═══ 会话契约·喂料三样 + 固定尾注（图纸 §会话契约 1）═══════════════════════════
describe('喂料只有三样 + 固定尾注', () => {
  it('恰好三样：本阶段手册 + board 实时输出 + 游戏目录（不多喂一样）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const p = buildSessionPrompt({ root, slug, stage: 'S4', boardText: '●S3 骨架关 OK\n○S4 玩法关 待做' });
    expect(p.match(/【喂料/g)).toHaveLength(3);          // 三样，一样不多
    expect(p).toContain('docs/playbooks/testing.md');    // 一·S4 手册（取自 STAGES 手册列·不另抄一张表）
    expect(p).toContain('○S4 玩法关 待做');               // 二·board 实时输出原样
    expect(p).toContain(`public/games/${slug}`);         // 三·游戏目录（按形态）
    expect(gameDirFor(root, slug)).toBe(`public/games/${slug}`);
  }));

  it('固定尾注逐条到位：完成动作=跑门量退出码 · 禁跨阶段 · 禁碰他人文件 · 禁代签（新口径）', () => {
    const f = sessionFooter('gx', 'S4');
    expect(f).toContain('game-pipeline.mjs gate gx S4');
    expect(f).toContain('退出码直接量');
    expect(f).toContain('禁跨阶段抢跑');
    expect(f).toContain('禁碰他人文件');
    // 措辞修正（owner 2026-08-10 令）：施工会话不许自记复查门——review 由编排器另派的复查会话或人落账
    expect(f).toContain('禁代签');
    expect(f).toContain('复查门**不许施工会话自记**');
    expect(f).toContain('owner 2026-08-10 令');
    expect(f).not.toContain('禁代签人门：signoff / review 永远真人点');  // 旧措辞已废（review 不再归「真人点」口径）
    expect(f).toContain('无特权通道');
    expect(f).toContain('你自称完成不算数');              // 尾注里就把「绿不靠嘴」说死
    expect(sessionFooter('gx', 'S1')).toContain('board gx'); // S1 无 gate 命令 → 完成动作改口径
  });
});

// ═══ status / abort ════════════════════════════════════════════════════════
describe('status（running·stalled·done·failed）', () => {
  it('活锁按心跳分 running / stalled；无锁时读台账终态', () => withRoot(async (root) => {
    const now = Date.now();
    put(root, '.zerocraft/orchestrator.lock',
      { slug: 'gx', stage: 'S4', pid: process.pid, startedAt: new Date(now - 5000).toISOString(), lastOutputAt: new Date(now - 1000).toISOString(), attempt: 1 });
    const running = statusFor(root, null, { idleTimeoutMs: 600_000, now });
    expect(running).toHaveLength(1);
    expect(running[0]).toMatchObject({ slug: 'gx', stage: 'S4', state: 'running', live: true });

    const stalled = statusFor(root, null, { idleTimeoutMs: 500, now });
    expect(stalled[0].state).toBe('stalled');
    expect(stalled[0].idleSec).toBe(1);

    rmSync(lockPath(root), { force: true });
    put(root, '.zerocraft/orchestrator-runs.json', {
      gx: { stage: 'S4', state: 'done', startedAt: '2026-08-04T01:00:00.000Z' },
      gy: { stage: 'S3', state: 'failed', startedAt: '2026-08-04T02:00:00.000Z', needsHuman: true },
    });
    const hist = statusFor(root, null, { now });
    expect(hist.map((r) => r.state)).toEqual(['failed', 'done']);   // 新的在前
    expect(statusFor(root, 'gx', { now })).toHaveLength(1);         // 按 slug 过滤
    expect(statusFor(root, 'nobody', { now })).toHaveLength(0);
  }));
});

describe('abort（终止在跑会话 → 标「中止·需人工」）', () => {
  it('杀掉持锁进程·清锁·台账标 aborted+needsHuman', () => withRoot(async (root) => {
    const victim = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
    await waitFor(() => pidAlive(victim.pid));
    put(root, '.zerocraft/orchestrator.lock', { slug: 'gx', stage: 'S5', pid: victim.pid, startedAt: new Date().toISOString() });

    const r = abort(root, 'gx', { killGraceMs: 400 });
    expect(r.ok).toBe(true);
    expect(r.code).toBe('ABORTED');
    expect(r.stage).toBe('S5');
    expect(r.killedPid).toBe(victim.pid);
    expect(r.reason).toContain('中止·需人工');
    expect(existsSync(lockPath(root))).toBe(false);
    const entry = readRuns(root).gx;
    expect(entry).toMatchObject({ stage: 'S5', state: 'failed', aborted: true, needsHuman: true });
    expect(await waitFor(() => !pidAlive(victim.pid), 3000)).toBe(true);
    expect(statusFor(root, 'gx')[0].state).toBe('failed');
  }), 20000);

  it('无会话 / 别的游戏在跑 → 拒绝（不误杀他人施工）', () => withRoot(async (root) => {
    expect(abort(root, 'gx')).toMatchObject({ ok: false, code: 'NO_SESSION' });
    put(root, '.zerocraft/orchestrator.lock', { slug: 'other', stage: 'S3', pid: process.pid, startedAt: new Date().toISOString() });
    const r = abort(root, 'gx');
    expect(r).toMatchObject({ ok: false, code: 'OTHER_SLUG' });
    expect(r.reason).toContain('other');
    expect(existsSync(lockPath(root))).toBe(true);        // 别人的锁原封不动
  }));
});

// ═══ ⑤ dispatch --review：闭集 S2-S5/S8·豁免关拒绝（owner 2026-08-10 令·复查会话）═══
describe('⑤ --review：复查闭集与豁免', () => {
  it('S1/S6/S7 拒绝并说明豁免语义（照 NO_SESSION_STAGES 风格）·不占锁不脏台账·未知阶段同拒', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    for (const s of ['S1', 'S6', 'S7']) {
      expect(reviewBudgetFor(s)).toMatchObject({ ok: false, code: 'NO_REVIEW_STAGE' });
      const r = await dispatch({ root, slug, stage: s, review: true, claudeBin: '/definitely/not/here' });
      expect(r.code).toBe('NO_REVIEW_STAGE');
      expect(r.reason).toBe(NO_REVIEW_STAGES[s]);
      expect(existsSync(lockPath(root))).toBe(false);
    }
    expect(NO_REVIEW_STAGES.S1).toContain('owner 亲提');     // 豁免语义各说各的去处
    expect(NO_REVIEW_STAGES.S6).toContain('美术平台');
    expect(NO_REVIEW_STAGES.S7).toContain('评分卡');
    expect((await dispatch({ root, slug, stage: 'S9', review: true, claudeBin: '/nope' })).code).toBe('UNKNOWN_STAGE');
    expect(readRuns(root)).toEqual({});                      // 拒绝 ≠ 该关失败：不脏台账
  }));

  it('复查档预算：闭集五关全部 effort=high·maxTurns=80（对抗性核证要复跑测试）', () => {
    for (const s of ['S2', 'S3', 'S4', 'S5', 'S8']) {
      expect(reviewBudgetFor(s)).toMatchObject({ ok: true, effort: 'high', maxTurns: 80 });
    }
    expect(REVIEW_BUDGET).toEqual({ effort: 'high', maxTurns: 80 });
    const a = sessionArgs({ effort: REVIEW_BUDGET.effort, maxTurns: REVIEW_BUDGET.maxTurns });
    expect(a[a.indexOf('--effort') + 1]).toBe('high');       // 复查会话走同一 sessionArgs 通道
    expect(a[a.indexOf('--max-turns') + 1]).toBe('80');
  });

  it('CLI 端到端：dispatch gx S7 --review → 退出码 2 + NO_REVIEW_STAGE（豁免=用法级拒绝·不烧运行时）', () => withRoot(async (root) => {
    fakeGame(root);
    const r = spawnSync(process.execPath, [ORCH_CLI, 'dispatch', 'gx', 'S7', '--review', '--json'], {
      cwd: root, encoding: 'utf8', timeout: 60_000,
      env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: root, ZEROCRAFT_ORCH_CLAUDE: join(root, 'no-such-claude') },
    });
    expect(r.status).toBe(2);                                // 用法级拒绝（≠1 失败·≠3 无运行时）
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    expect(out.code).toBe('NO_REVIEW_STAGE');
    expect(out.reason).toContain('评分卡');
  }), 60000);
});

// ═══ ⑥ 复查喂料：手册 + checklist 实时输出 + 板/目录 + 复查尾注 ═══════════════
describe('⑥ 复查喂料三样 + 复查尾注', () => {
  it('恰好三样：复查手册 + checklist 实时输出 + 板/游戏目录；尾注含四步铁律与唯一允许写', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const p = buildReviewSessionPrompt({
      root, slug, stage: 'S4',
      boardText: '●S4 玩法关 机器门绿·复查门 dim',
      checklistText: '□ 走查测试断言的是行为而非常量',
    });
    expect(p.match(/【喂料/g)).toHaveLength(3);              // 三样，一样不多
    expect(p).toContain('docs/playbooks/review-gates.md');   // 一·复查手册=唯一必读
    expect(p).toContain('□ 走查测试断言的是行为而非常量');     // 二·checklist 实时输出原样
    expect(p).toContain('●S4 玩法关 机器门绿·复查门 dim');    // 三·板实时输出原样
    expect(p).toContain(`public/games/${slug}`);             // 三·游戏目录（按形态）
    const f = reviewSessionFooter(slug, 'S4');
    expect(f).toContain('复查人≠施工人');                    // 天然成立·施工自陈不采信
    expect(f).toContain('四步铁律');
    expect(f).toContain('撤修验红');
    expect(f).toContain('只读产物');
    expect(f).toContain(`review ${slug} S4`);                // 唯一允许的写 = review 落账
    expect(f).toContain(`--by ${REVIEW_BY_PREFIX}`);
    expect(f).toContain('FAIL 是合法结论');                  // 不许为了绿而绿
    expect(f).toContain('review 落账后停');                  // 完成动作
    expect(f).toContain('你自称查完不算数');                  // 对标施工尾注「绿不靠嘴」口径
  }));

  it('真 spawn 组合：checklist/board 现取现喂 → prompt 含清单文本与「复查人≠施工人」句', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const cl = checklistText(root, slug, 'S3');
    expect(cl).toContain('S3 复查清单');                     // 真跑 game-pipeline checklist
    expect(cl).toContain('范围核查');                        // 每关复查第一条（REQ-CTX③）
    expect(cl).toContain('manifest 纯 JSON');
    const p = buildReviewSessionPrompt({ root, slug, stage: 'S3', boardText: boardText(root, slug), checklistText: cl });
    expect(p).toContain('manifest 纯 JSON');
    expect(p).toContain('复查人≠施工人');
    expect(p).toContain('生产流程板');
  }), 30000);

  it('豁免/未知阶段直接抛（别默默喂空清单）', () => {
    expect(() => buildReviewSessionPrompt({ root: '/x', slug: 'gx', stage: 'S1' })).toThrow(/复查闭集/);
    expect(() => buildReviewSessionPrompt({ root: '/x', slug: 'gx', stage: 'S9' })).toThrow(/复查闭集/);
  });
});

// ═══ ⑦ 复查独立重验（照「绿不靠嘴」：编排器自查 pipeline.json·verdict 不影响成败）═══
/** 照 game-pipeline.mjs review 子命令的落账形状直接写 pipeline.json（指纹默认现算·测试可注入偏差）。 */
const recordReview = (root, slug, stage, over = {}) => {
  const f = pipelinePath(root, slug);
  const pf = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { version: 1, slug, concept: {}, signoffs: {}, evidence: {} };
  pf.reviews = { ...(pf.reviews || {}), [stage]: {
    verdict: 'PASS', note: '逐条核证在案', by: REVIEW_BY_PREFIX, at: new Date().toISOString(),
    gameHash: pipelineGameHash(root, slug), ...over } };
  put(root, `public/games/${slug}/pipeline.json`, pf);
};

describe('⑦ 复查独立重验：缺/过期/by 不符=失败·FAIL verdict=成功', () => {
  it('三判 + FAIL=合格交付：缺记录→红；指纹过期（真改文件重算）→红；by 不符→红；FAIL+对齐+前缀对→绿', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    let v = verifyReview(root, slug, 'S3');                  // 判一：没落账
    expect(v).toMatchObject({ kind: 'review', exit: 1 });
    expect(v.summary).toContain('没落账');

    recordReview(root, slug, 'S3');
    expect(verifyReview(root, slug, 'S3').exit).toBe(0);     // 新鲜时先证明是过的（对照）
    put(root, `public/games/${slug}/manifest.json`, { ...MANIFEST, name: 'GX-改' });
    v = verifyReview(root, slug, 'S3');                      // 判二：落账后游戏文件又动过
    expect(v.exit).toBe(1);
    expect(v.summary).toContain('过期');

    recordReview(root, slug, 'S3', { by: '施工会话本人' });   // 判三：署名不以 orch-review 起头
    v = verifyReview(root, slug, 'S3');
    expect(v.exit).toBe(1);
    expect(v.summary).toContain(REVIEW_BY_PREFIX);

    recordReview(root, slug, 'S3', { verdict: 'FAIL', by: `${REVIEW_BY_PREFIX}-7` });
    v = verifyReview(root, slug, 'S3');                      // FAIL 也是合格交付（verdict 与成败解耦）
    expect(v).toMatchObject({ kind: 'review', exit: 0, verdict: 'FAIL' });
    expect(v.summary).toContain('FAIL');
  }));

  it('端到端：复查会话真落 FAIL 账（by=orch-review-stub）→ done·台账带 verdict（FAIL 也是合格交付）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const bin = stub(root, 'fail-reviewer', [
      `const { spawnSync } = require('child_process');`,
      `console.log('{"type":"stream","text":"独立复跑中"}');`,
      `const r = spawnSync('node', [${JSON.stringify(PIPELINE_CLI)}, 'review', ${JSON.stringify(slug)}, 'S3', '--verdict', 'FAIL', '--note', '独立复跑红了：撤修验红锚点命中（file:line 在案）', '--by', '${REVIEW_BY_PREFIX}-stub'],`,
      `  { encoding: 'utf8', env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: ${JSON.stringify(root)} } });`,
      `if ((r.status ?? 1) !== 0) { console.error('review 落账失败: ' + (r.stderr || r.stdout)); process.exit(1); }`,
      `process.exit(0);`,
    ].join('\n'));
    const r = await dispatch({ root, slug, stage: 'S3', review: true, claudeBin: bin, idleTimeoutMs: 15000 });
    expect(r.ok).toBe(true);                                 // ← FAIL verdict 照样=交付成立
    expect(r.code).toBe('DONE');
    expect(r.verify).toMatchObject({ kind: 'review', exit: 0, verdict: 'FAIL' });
    expect(r.entry.verdict).toBe('FAIL');                    // 台账带 verdict
    expect(readRuns(root)[slug]).toMatchObject({ stage: 'S3:review', state: 'done', verdict: 'FAIL' });
    expect(existsSync(lockPath(root))).toBe(false);
  }), 30000);

  it('端到端：复查会话嘴上说「全部 PASS」但没落账 → failed（谎报不通过·嘴不算数）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const bin = stub(root, 'liar-reviewer', [
      `console.log('{"type":"result","result":"复查完成，逐条核证，全部 PASS，无任何问题"}');`,
      `process.exit(0);`,
    ].join('\n'));
    const r = await dispatch({ root, slug, stage: 'S4', review: true, claudeBin: bin, idleTimeoutMs: 15000 });
    expect(r.session.code).toBe(0);                          // 会话自称成功、退出码也是 0
    expect(r.ok).toBe(false);                                // ← 判定跟着落账走，不跟着嘴走
    expect(r.code).toBe('REVIEW_FAIL');
    expect(r.verify.exit).toBe(1);
    expect(r.entry).toMatchObject({ stage: 'S4:review', state: 'failed', needsHuman: true });
    expect(r.reason).toContain('自称查完');
    expect(readRuns(root)[slug].state).toBe('failed');
  }), 30000);

  it('端到端：落账后又动游戏文件 → 现算指纹≠落账指纹=failed（过期不收·重验时点在会话退出后）', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const manifest = join(root, 'public', 'games', slug, 'manifest.json');
    const bin = stub(root, 'stale-reviewer', [
      `const { spawnSync } = require('child_process');`,
      `spawnSync('node', [${JSON.stringify(PIPELINE_CLI)}, 'review', ${JSON.stringify(slug)}, 'S5', '--verdict', 'PASS', '--note', '核证在案', '--by', '${REVIEW_BY_PREFIX}-stub'],`,
      `  { encoding: 'utf8', env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: ${JSON.stringify(root)} } });`,
      `require('fs').appendFileSync(${JSON.stringify(manifest)}, '\\n');`,   // 落账后又动游戏文件
      `process.exit(0);`,
    ].join('\n'));
    const r = await dispatch({ root, slug, stage: 'S5', review: true, claudeBin: bin, idleTimeoutMs: 15000 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('REVIEW_FAIL');
    expect(r.verify.exit).toBe(1);
    expect(r.verify.summary).toContain('过期');
  }), 30000);
});

// ═══ ⑧ 串行锁共用：复查会话与施工会话一把锁·stage 记 SN:review ═══════════════
describe('⑧ 复查会话共用串行锁（stage 记 SN:review）', () => {
  it('复查在跑=施工被拒（同一把锁）；锁与台账 stage 均记 SN:review', () => withRoot(async (root) => {
    const slug = fakeGame(root);
    const marker = join(root, 'spawned.txt');
    const bin = stub(root, 'slow-reviewer', [
      `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x\\n');`,
      `const t = setInterval(() => console.log('{"type":"stream","text":"reviewing"}'), 100);`,
      `setTimeout(() => { clearInterval(t); process.exit(0); }, 1200);`,
    ].join('\n'));
    const first = dispatch({ root, slug, stage: 'S3', review: true, claudeBin: bin, idleTimeoutMs: 15000 });
    expect(await waitFor(() => !!readLock(root))).toBe(true);
    expect(readLock(root).stage).toBe('S3:review');          // 共用锁里记 SN:review

    const second = await dispatch({ root, slug, stage: 'S4', claudeBin: bin, idleTimeoutMs: 15000 });
    expect(second.code).toBe('LOCKED');                      // 施工 dispatch 同刻被同一把锁拒
    expect(second.holder.stage).toBe('S3:review');
    expect(second.reason).toContain('S3:review');

    await first;
    expect(lines(marker)).toHaveLength(1);                   // 全程只起过复查这一个会话
    expect(existsSync(lockPath(root))).toBe(false);          // 跑完放锁（走既有通道）
    expect(readRuns(root)[slug].stage).toBe('S3:review');    // 台账同样记 SN:review
  }), 30000);
});
