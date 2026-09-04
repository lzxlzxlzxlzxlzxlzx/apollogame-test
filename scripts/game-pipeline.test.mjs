// 生产流程板自检（owner 2026-07-10「N 步拆分·每步 review·不能只靠手册」）：
// 形态识别 · 内容指纹（排除 pipeline.json/gen-mock·变更即过期）· 看板推导（机器门×人门双验语义）。
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { detectForm, gameHash, gapsHash, boardFor, artSubState, STAGES, GATE_STAGES, pipelineFile, mockDebt, writeConcept, priorGaps, orderGate, reviewPrereqGaps, acceptanceScenarioCount, MIN_ACCEPTANCE_SCENARIOS, REVIEW_CHECKLISTS, selfCheckArtifacts, selfCheckBlock, selfCheckNote, MIN_SELFCHECK_SHOTS, readCapabilityGaps, evalCapabilityGaps, blockingGaps, GAP_STATES, GAP_ROUTES, GAP_PRIORITIES, capabilityGapsFile } from './game-pipeline.mjs';

const withRoot = async (fn) => { const r = mkdtempSync(join(tmpdir(), 'gpipe-')); try { return await fn(r); } finally { rmSync(r, { recursive: true, force: true }); } };
const put = (root, rel, content) => { const p = join(root, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2)); };

const MANIFEST = { name: 'G', capabilities: [], entities: { hero: { Sprite: { textureKey: 'art:knight' } } } };

describe('阶段表（八阶段·每阶段一本手册）', () => {
  it('8 阶段·手册列全非空·机器门阶段=S2/S3/S4/S5/S8（S2=gap-check·REQ-S18PANEL②）', () => {
    expect(STAGES).toHaveLength(8);
    expect(STAGES.every((s) => s.handbook)).toBe(true);
    expect(GATE_STAGES).toEqual(['S2', 'S3', 'S4', 'S5', 'S8']);
    expect(STAGES.find((s) => s.id === 'S2').gate).toBe('gap-check'); // 面板按这个字段画「跑机器门」按钮
  });
});

describe('形态识别', () => {
  it('library→cart · public manifest→builtin · src 目录→compiled · 都无→null', () => withRoot(async (root) => {
    put(root, 'library/g1/manifest.json', MANIFEST);
    put(root, 'public/games/g2/manifest.json', MANIFEST);
    mkdirSync(join(root, 'games/g3'), { recursive: true });
    expect(detectForm(root, 'g1')).toBe('cart');
    expect(detectForm(root, 'g2')).toBe('builtin');
    expect(detectForm(root, 'g3')).toBe('compiled');
    expect(detectForm(root, 'nope')).toBeNull();
  }));
});

describe('游戏内容指纹（证据过期的机器判据）', () => {
  it('稳定·文件变更即变·pipeline.json 与 gen/mock 不入指纹', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const h0 = gameHash(root, 'g');
    expect(gameHash(root, 'g')).toBe(h0); // 幂等
    put(root, 'public/games/g/pipeline.json', { signoffs: {} });
    expect(gameHash(root, 'g')).toBe(h0); // 记账不自我过期
    put(root, 'public/games/g/art/gen/mock/art-01.png', 'noise');
    expect(gameHash(root, 'g')).toBe(h0); // mock 预览物不入指纹
    put(root, 'public/games/g/probe/S3-render.png', 'shot');
    put(root, 'public/games/g/probe/S4-uiwalk.json', { ok: true });
    expect(gameHash(root, 'g')).toBe(h0); // 探针门证不入指纹（否则跑门→指纹变→板自我过期·2026-08-08 game108 实测）
    put(root, 'public/games/g/golden/boot.png', 'baseline');
    put(root, 'public/games/g/golden/golden-ledger.json', { states: [] });
    expect(gameHash(root, 'g')).toBe(h0); // 标准照基准同理不入指纹
    put(root, 'docs/design/g/self-check/S7-scorecard-selfassess.md', '自评一行');
    put(root, 'docs/design/g/self-check/shots/r1/a.png', 'shot');
    put(root, 'docs/design/g/review/REVIEW-S2-S5.md', '导航单');
    expect(gameHash(root, 'g')).toBe(h0); // 自证单/复查单=门证产物不入指纹（REQ-PIPEHASH-03·第三次同形）
    put(root, 'docs/design/g/s3-program-evidence.md', 'S3 本轮门证');
    put(root, 'docs/design/g/s4-program-evidence.md', 'S4 本轮递归门证');
    expect(gameHash(root, 'g')).toBe(h0); // 程序回报同为门自产证据，写回不应自我过期
    put(root, 'public/games/g/art/gen/art-01.png', 'real');
    const h1 = gameHash(root, 'g');
    expect(h1).not.toBe(h0); // 真图入指纹
    put(root, 'public/games/g/manifest.json', { ...MANIFEST, name: 'G2' });
    expect(gameHash(root, 'g')).not.toBe(h1); // manifest 变更即过期
    const h2 = gameHash(root, 'g');
    put(root, 'docs/design/g/requests.md', '### 工单回执一条');
    expect(gameHash(root, 'g')).toBe(h2); // 工单池台账不入指纹（回执/批注不作废复查·2026-07-17 修）
    put(root, 'docs/design/g/gdd.md', '# 设计变更');
    expect(gameHash(root, 'g')).not.toBe(h2); // 设计档变更仍然即过期（gdd/plan 真影响复查有效性）
    // **门自产的证据不入指纹**（Lead 2026-08-08·同「记证据不得自我过期」）：
    // probe/ 整个目录是各阶段机器门自己写出来的（S3-render.png / S4-play-*.png / S4-uiwalk.json…）。
    // 不排除的实测后果：game108 对局屏有时间驱动动画 ⇒ 同源码连跑两次 S3 截图字节就不同 ⇒
    // 跑 S3 把 S4/S5 判过期、跑 S4 又把 S3 判过期，两者永远不可能同时绿。
    const h3 = gameHash(root, 'g');
    put(root, 'public/games/g/probe/S3-render.png', 'frame-a');
    expect(gameHash(root, 'g')).toBe(h3);
    put(root, 'public/games/g/probe/S3-render.png', 'frame-b-不同字节');
    expect(gameHash(root, 'g')).toBe(h3);
    put(root, 'public/games/g/probe/S4-play.json', '{"ok":true}');
    expect(gameHash(root, 'g')).toBe(h3);
  }));
});

describe('美术关子状态（复用五步条口径·MOCK 不算完成）', () => {
  const ledger = (rows, artStyle = {}) => ({ version: 1, artStyle, rows });
  it('无台账=dim·全 approved 无 mock=ok·有 MOCK=warn 且明说', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    expect(artSubState(root, 'g').state).toBe('dim');
    put(root, 'public/games/g/art/art-ledger.json', ledger([{ no: 'art-01', status: 'approved', gen: { mock: false } }], { packId: 'pixel-retro' }));
    expect(artSubState(root, 'g').state).toBe('ok');
    put(root, 'public/games/g/art/art-ledger.json', ledger([{ no: 'art-01', status: 'approved', gen: {} }, { no: 'art-02', status: 'replaced', gen: { mock: true } }]));
    const s = artSubState(root, 'g');
    expect(s.state).toBe('warn');
    expect(s.detail).toContain('MOCK 1');
  }));
});

describe('看板推导（机器门×复查门×人门三验·REQ-QC-三门）', () => {
  it('证据新鲜+复查+签核=绿；缺复查=黄；exit≠0=红；指纹变=过期黄', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const h = gameHash(root, 'g');
    put(root, pipelineFile(root, 'g').slice(root.length + 1), {
      version: 1, slug: 'g',
      concept: { name: 'G', pitch: '测试', planWaiver: '纯数据' },
      signoffs: { S1: { by: 'o', note: 'n', at: '2026-07-10T00:00:00Z' }, S3: { by: 'o', note: 'n', at: '2026-07-10T00:00:00Z' } },
      evidence: { S3: { exit: 0, gameHash: h, at: '2026-07-10T00:00:00Z' }, S4: { exit: 1, gameHash: h, at: '2026-07-10T00:00:00Z' } },
      reviews: { S3: { verdict: 'PASS', note: '逐条核过', by: 'r', at: '2026-07-10T00:00:00Z', gameHash: h } },
    });
    let b = boardFor(root, 'g');
    const by = (id) => b.stages.find((s) => s.id === id);
    expect(by('S1').status).toBe('ok'); // 机器 ok + 签核 ok（S1 免复查）
    expect(by('S2').status).toBe('warn'); // 免 plan 裁决在案但未复查未签核
    expect(by('S3').status).toBe('ok'); // 证据绿 + 复查 PASS + 签核 → 三门齐才绿
    expect(by('S4').status).toBe('fail'); // exit 1 = 红
    expect(by('S8').status).toBe('dim'); // 未跑未查未签
    expect(b.next).toBe('S2'); // 第一个非绿即下一步
    // 游戏文件一动 → S3 证据过期（绿不是永久绿）
    put(root, 'public/games/g/manifest.json', { ...MANIFEST, name: 'G3' });
    b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S3').status).toBe('warn');
    expect(b.stages.find((s) => s.id === 'S3').machine.detail).toContain('过期');
  }));
  it('builtin 无 walkthrough 测试=玩法关直接红（testing.md 红线）·cart 免审计', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S4').status).toBe('fail');
    put(root, 'library/c/manifest.json', MANIFEST);
    const bc = boardFor(root, 'c');
    expect(bc.stages.find((s) => s.id === 'S5').machine.state).toBe('ok'); // 纯数据卡带天然合规
    expect(bc.form).toBe('cart');
  }));
  it('未知游戏 → ok:false', () => withRoot(async (root) => {
    expect(boardFor(root, 'ghost').ok).toBe(false);
  }));
});

describe('mockDebt（cart 终检的 mock 清账判据·REQ-WORKSHOP C2）', () => {
  const ledger = (rows) => ({ version: 1, rows });
  it('无台账=0 · 有 mock 行=计数 · retired 的 mock 行不计', () => withRoot(async (root) => {
    put(root, 'library/g/manifest.json', MANIFEST);
    expect(mockDebt(root, 'g')).toBe(0); // 无台账（纯免费库 placeholder）=清账
    put(root, 'public/games/g/art/art-ledger.json', ledger([
      { no: 'art-01', status: 'generated', gen: { mock: true } },
      { no: 'art-02', status: 'replaced', gen: { mock: true } },
      { no: 'art-03', status: 'replaced', gen: { mock: false } },
      { no: 'art-04', status: 'retired', gen: { mock: true } }, // 墓碑不计
    ]));
    expect(mockDebt(root, 'g')).toBe(2);
  }));
});

describe('writeConcept（立项卡写入·CLI 与端点共用·REQ-WORKSHOP C1）', () => {
  it('写后 S1 机器门绿；字段级合并（只传 pitch 不覆盖已有 name）', () => withRoot(async (root) => {
    put(root, 'library/g/manifest.json', MANIFEST);
    writeConcept(root, 'g', { name: 'G 游戏', pitch: '一句话玩法' });
    let b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S1').machine.state).toBe('ok');
    expect(b.concept).toMatchObject({ name: 'G 游戏', pitch: '一句话玩法' }); // board 带 concept（S1 编辑预填）
    writeConcept(root, 'g', { pitch: '改口的玩法' });
    b = boardFor(root, 'g');
    expect(b.concept).toMatchObject({ name: 'G 游戏', pitch: '改口的玩法' }); // name 未被抹掉
  }));
});

describe('cart-S8 证据双轨（cart=gameHash·builtin=head·REQ-WORKSHOP C2）', () => {
  it('cart 的 S8 证据带 gameHash：新鲜=ok·游戏文件一动=过期', () => withRoot(async (root) => {
    put(root, 'library/c/manifest.json', MANIFEST);
    const h = gameHash(root, 'c');
    put(root, pipelineFile(root, 'c').slice(root.length + 1), {
      version: 1, slug: 'c', concept: {}, signoffs: {},
      evidence: { S8: { exit: 0, gameHash: h, at: '2026-07-11T00:00:00Z' } },
    });
    let b = boardFor(root, 'c');
    expect(b.stages.find((s) => s.id === 'S8').machine.state).toBe('ok');
    put(root, 'library/c/manifest.json', { ...MANIFEST, name: 'C2' });
    b = boardFor(root, 'c');
    expect(b.stages.find((s) => s.id === 'S8').machine.detail).toContain('过期');
  }));
  it('builtin 的 S8 证据仍走 head 语义（回归）；cart 的 S8 dim 文案=轻量终检', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, pipelineFile(root, 'g').slice(root.length + 1), {
      version: 1, slug: 'g', concept: {}, signoffs: {},
      evidence: { S8: { exit: 0, head: 'not-current-head', dirty: false, at: '2026-07-11T00:00:00Z' } },
    });
    const b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S8').machine.detail).toContain('过期'); // head 不匹配（fixture 无 git → head=''）
    put(root, 'library/c/manifest.json', MANIFEST);
    const bc = boardFor(root, 'c');
    expect(bc.stages.find((s) => s.id === 'S8').machine.detail).toContain('轻量终检');
  }));
});

// ═══ F·阶段顺序闸（REQ-GATE-硬化·「跳关可以，但从悄悄跳变记录在案的决定」）═══
describe('priorGaps / orderGate（顺序闸判定·纯函数）', () => {
  // 合成看板：S1 灰（欠机器门+人门）、S2 黄（欠复查门）、S3 绿。
  const board = {
    stages: [
      { id: 'S1', title: '立项卡', status: 'dim', machine: { state: 'dim' }, review: { state: 'ok' }, human: { state: 'dim' } },
      { id: 'S2', title: '能力计划', status: 'warn', machine: { state: 'ok' }, review: { state: 'dim' }, human: { state: 'ok' } },
      { id: 'S3', title: '骨架关', status: 'ok', machine: { state: 'ok' }, review: { state: 'ok' }, human: { state: 'ok' } },
      { id: 'S4', title: '玩法关', status: 'dim', machine: { state: 'dim' }, review: { state: 'dim' }, human: { state: 'dim' } },
    ],
  };
  it('列出前置非绿关+各关欠的门；已绿关不列', () => {
    const gaps = priorGaps(board, 'S4');
    expect(gaps.map((g) => g.id)).toEqual(['S1', 'S2']); // S3 绿被跳过
    expect(gaps[0].owes.join()).toContain('机器门');
    expect(gaps[0].owes.join()).toContain('人门');
    expect(gaps[1].owes.join()).toContain('复查门');
  });
  it('目标=S1 或全前置绿 → 无欠（gate 可直跑）', () => {
    expect(priorGaps(board, 'S1')).toEqual([]);
    const allGreen = { stages: board.stages.map((s) => ({ ...s, status: 'ok', machine: { state: 'ok' }, review: { state: 'ok' }, human: { state: 'ok' } })) };
    expect(priorGaps(allGreen, 'S4')).toEqual([]);
  });
  it('复查前置硬闸（owner 2026-08-10 令）：前置「已施工未复查」→ 带理由也拒跑·点名欠查关', () => {
    // 夹具 S2 = machine ok + review dim = game108 当年「建完不复查往下跑」的原型——现在一律拦。
    expect(reviewPrereqGaps(board, 'S4').map((g) => g.id)).toEqual(['S2']);
    const d = orderGate(board, 'S4', '赶 demo 先跑玩法关');
    expect(d.allowed).toBe(false); // 撤硬闸（orderGate 忽略 reviewGaps）→ 本断言红
    expect(d.reviewGaps.map((g) => g.id)).toEqual(['S2']);
    expect(d.outOfOrder).toBeUndefined(); // 拒跑就不能同时落乱序放行痕
  });
  it('复查 stale（游戏变了没重查）同样硬拦；CONCERNS（评为 ok）放行', () => {
    const staleBoard = { stages: [{ id: 'S2', title: 'x', status: 'warn', machine: { state: 'ok' }, review: { state: 'stale' }, human: { state: 'ok' } }] };
    expect(reviewPrereqGaps(staleBoard, 'S3').map((g) => g.id)).toEqual(['S2']);
    expect(orderGate(staleBoard, 'S3', '理由').allowed).toBe(false);
  });
  it('后续相邻阶段施工仅使已签核前关 stale 时不死锁', () => {
    const approvedStale = (id) => ({ id, title: id, status: 'warn', machine: { state: 'stale' }, review: { state: 'stale' }, human: { state: 'ok' } });
    const s4Board = { stages: [approvedStale('S3')] };
    const s5Board = { stages: [approvedStale('S3'), approvedStale('S4')] };
    expect(reviewPrereqGaps(s4Board, 'S4')).toEqual([]);
    expect(reviewPrereqGaps(s5Board, 'S5')).toEqual([]);
    expect(orderGate(s5Board, 'S5', 'S5 UI 施工').allowed).toBe(true);
  });
  it('未施工的前置（machine dim）仍走老规矩：无理由拒跑·带理由放行且落痕（跳关记账语义不变）', () => {
    const unbuilt = { stages: [{ id: 'S2', title: 'x', status: 'dim', machine: { state: 'dim' }, review: { state: 'dim' }, human: { state: 'dim' } }] };
    expect(reviewPrereqGaps(unbuilt, 'S3')).toEqual([]); // 没建过=不欠复查
    expect(orderGate(unbuilt, 'S3', undefined).allowed).toBe(false);
    expect(orderGate(unbuilt, 'S3', '   ').allowed).toBe(false); // 空白理由不算
    const ok = orderGate(unbuilt, 'S3', '赶 demo 先跑玩法关');
    expect(ok.allowed).toBe(true);
    expect(ok.outOfOrder).toMatchObject({ stage: 'S3', reason: '赶 demo 先跑玩法关' });
    expect(ok.outOfOrder.at).toBeTruthy();
  });
  it('前置全绿 → allowed 且无落痕（不冤记乱序）', () => {
    const allGreen = { stages: board.stages.map((s) => ({ ...s, status: 'ok', machine: { state: 'ok' }, review: { state: 'ok' }, human: { state: 'ok' } })) };
    const d = orderGate(allGreen, 'S4', '理由');
    expect(d.allowed).toBe(true);
    expect(d.outOfOrder).toBeUndefined();
  });
});

describe('boardFor 乱序标记（板消费 outOfOrder·旧板零回归）', () => {
  it('pf.outOfOrder → 对应关 outOfOrder 非空·其余关为 null', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, pipelineFile(root, 'g').slice(root.length + 1), {
      version: 1, slug: 'g', concept: {}, signoffs: {},
      outOfOrder: [{ stage: 'S5', reason: '设计验证优先', at: '2026-07-17T00:00:00Z' }],
    });
    const b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S5').outOfOrder).toMatchObject({ reason: '设计验证优先' });
    expect(b.stages.find((s) => s.id === 'S3').outOfOrder).toBeNull();
  }));
  it('旧 pipeline.json 无 outOfOrder 字段 → 全关 outOfOrder=null（零回归）', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, pipelineFile(root, 'g').slice(root.length + 1), { version: 1, slug: 'g', concept: {}, signoffs: {} });
    const b = boardFor(root, 'g');
    expect(b.stages.every((s) => s.outOfOrder === null)).toBe(true);
  }));
});

// ═══ S4 验收剧本门（REQ-ACCEPT·图纸④·「绿门不可玩」复盘）═══
describe('acceptanceScenarioCount / S4 存在性门', () => {
  it('无 acceptance 目录=0·计 *.scenario.jsonc·忽略其它文件', () => withRoot(async (root) => {
    put(root, 'games/g/index.ts', '// compiled');
    expect(acceptanceScenarioCount(root, 'g')).toBe(0);
    put(root, 'docs/design/g/acceptance/a.scenario.jsonc', '{}');
    put(root, 'docs/design/g/acceptance/b.scenario.jsonc', '{}');
    put(root, 'docs/design/g/acceptance/readme.md', '# 说明');
    put(root, 'docs/design/g/acceptance/notes.json', '{}'); // 非 .scenario.jsonc 不计
    expect(acceptanceScenarioCount(root, 'g')).toBe(2);
    put(root, 'docs/design/g/acceptance/c.scenario.jsonc', '{}');
    expect(acceptanceScenarioCount(root, 'g')).toBe(MIN_ACCEPTANCE_SCENARIOS);
  }));
  it('MIN=3；S4 板提示随场景数变（0/3（GD 补）→ 3/3 ✓）', () => withRoot(async (root) => {
    expect(MIN_ACCEPTANCE_SCENARIOS).toBe(3);
    put(root, 'public/games/g/manifest.json', MANIFEST); // builtin·无 walkthrough → S4 fail 但 detail 带剧本提示
    let s4 = boardFor(root, 'g').stages.find((s) => s.id === 'S4');
    expect(s4.machine.detail).toContain('验收剧本 0/3（GD 补）');
    for (const n of ['a', 'b', 'c']) put(root, `docs/design/g/acceptance/${n}.scenario.jsonc`, '{}');
    s4 = boardFor(root, 'g').stages.find((s) => s.id === 'S4');
    expect(s4.machine.detail).toContain('验收剧本 3/3 ✓');
  }));
  it('复查清单 S4 含「剧本作者=GD 非 PE」+「真浏览器试玩截图序列」两行', () => {
    const joined = REVIEW_CHECKLISTS.S4.join('\n');
    expect(joined).toContain('剧本作者=GD 非 PE');
    expect(joined).toContain('真浏览器试玩截图序列');
  });
});

// ═══ S2 能力缺口门（REQ-S18PANEL②③·owner 2026-08-16 令·叠叠乐 Demo 实撞）═══
describe('readCapabilityGaps（闭集校验·纯 fs·不抛）', () => {
  const gap = (o = {}) => ({ id: 'GAP-01', title: '球体刚体', priority: 'P1', route: 'engine', state: 'open', blocks: ['S3'], ...o });
  it('无文件=absent 零缺口零错（存量游戏零回归）', () => withRoot(async (root) => {
    put(root, 'games/g/index.ts', '// compiled');
    expect(readCapabilityGaps(root, 'g')).toEqual({ absent: true, gaps: [], errors: [] });
  }));
  it('合法台账全量读出（含 route/blocks/ticket）', () => withRoot(async (root) => {
    put(root, 'games/g/index.ts', '// compiled');
    put(root, 'docs/design/g/capability-gaps.json', [gap(), gap({ id: 'GAP-02', route: 'requests-3d', priority: 'P0', state: 'accepted', ticket: 'requests-3d.md#REQ-3D-X', blocks: ['S4', 'S5'] })]);
    const r = readCapabilityGaps(root, 'g');
    expect(r.errors).toEqual([]);
    expect(r.gaps.map((g) => g.id)).toEqual(['GAP-01', 'GAP-02']);
    expect(r.gaps[1]).toMatchObject({ route: 'requests-3d', state: 'accepted', ticket: 'requests-3d.md#REQ-3D-X', blocks: ['S4', 'S5'] });
  }));
  it('坏 JSON / 非数组顶层 → 各自一条点名错（不抛不崩）', () => withRoot(async (root) => {
    put(root, 'games/g/index.ts', '// compiled');
    put(root, 'docs/design/g/capability-gaps.json', '{ 这不是 JSON');
    expect(readCapabilityGaps(root, 'g').errors[0]).toContain('不是合法 JSON');
    put(root, 'docs/design/g/capability-gaps.json', { gaps: [] }); // 包一层的写法不认（单一真相=裸数组）
    expect(readCapabilityGaps(root, 'g').errors[0]).toContain('顶层须是数组');
  }));
  it('闭集违规逐条点名：priority/route/state/未知阶段/id 重复/缺 title', () => withRoot(async (root) => {
    put(root, 'games/g/index.ts', '// compiled');
    put(root, 'docs/design/g/capability-gaps.json', [
      gap({ priority: 'P9' }), gap({ id: 'GAP-02', route: 'game' }), gap({ id: 'GAP-03', state: '待定' }),
      gap({ id: 'GAP-04', blocks: ['S9'] }), gap({ id: 'GAP-04' }), gap({ id: 'GAP-06', title: '' }),
    ]);
    const errs = readCapabilityGaps(root, 'g').errors.join('\n');
    expect(errs).toContain('priority 非法 "P9"');
    expect(errs).toContain('route 非法 "game"'); // 池闭集=engine/requests-3d/pui（与 projects.py 逐字对齐）
    expect(errs).toContain('state 非法 "待定"');
    expect(errs).toContain('blocks 含未知阶段 "S9"');
    expect(errs).toContain('id 重复');
    expect(errs).toContain('缺 title');
  }));
  it('已裁决（state≠open）却无 ticket → 红（面板要跳工单·裁词不能没落点）', () => withRoot(async (root) => {
    put(root, 'games/g/index.ts', '// compiled');
    put(root, 'docs/design/g/capability-gaps.json', [gap({ state: 'delivered' })]);
    expect(readCapabilityGaps(root, 'g').errors.join()).toContain('无 ticket');
    put(root, 'docs/design/g/capability-gaps.json', [gap({ state: 'delivered', ticket: 'requests.md#REQ-X' })]);
    expect(readCapabilityGaps(root, 'g').errors).toEqual([]);
    put(root, 'docs/design/g/capability-gaps.json', [gap({ state: 'open' })]); // open 免 ticket（还没裁哪来的单）
    expect(readCapabilityGaps(root, 'g').errors).toEqual([]);
  }));
});

describe('缺口契约跨侧对齐（落盘端 main_entry/projects.py ×  判门端本文件）', () => {
  // 一头先落盘、一头判门——两套闭集就等于「端点收下的合法文件被自己人判非法」。
  // 这条测试直接从 Python 源码抠出那张表比对（抄一份常量就等于没对过）。
  it('route 闭集与 projects.py::_GAP_ROUTES 逐字相同', () => {
    const py = readFileSync(fileURLToPath(new URL('../main_entry/projects.py', import.meta.url)), 'utf8');
    const m = py.match(/_GAP_ROUTES\s*=\s*\(([^)]*)\)/);
    expect(m).toBeTruthy(); // 端点那头改了名/改了写法 → 本断言红（提醒重新对账，别静默分叉）
    const pyRoutes = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(GAP_ROUTES).toEqual(pyRoutes);
  });
  it('priority 闭集 P0–P3 与端点同（端点 upper 归一后落盘）', () => {
    expect(GAP_PRIORITIES).toEqual(['P0', 'P1', 'P2', 'P3']);
  });
  it('state：端点只查形状（小写 token）·语义闭集归本门——本门认这五个', () => {
    expect(GAP_STATES).toEqual(['open', 'accepted', 'in-progress', 'delivered', 'wontfix']);
  });
});

describe('evalCapabilityGaps（S2 机器门判词·board 与 gate 共用一只嘴）', () => {
  const res = (gaps, errors = []) => ({ absent: false, gaps, errors });
  const g = (o) => ({ id: 'G1', title: 't', priority: 'P1', route: 'engine', state: 'open', ticket: '', blocks: [], ...o });
  it('无台账/空台账=ok · 有 open=warn 且点名 · 台账不合法=fail', () => {
    expect(evalCapabilityGaps({ absent: true, gaps: [], errors: [] }).state).toBe('ok');
    expect(evalCapabilityGaps(res([])).state).toBe('ok');
    const w = evalCapabilityGaps(res([g({ id: 'GAP-01' }), g({ id: 'GAP-02', state: 'delivered' })]));
    expect(w.state).toBe('warn');
    expect(w.detail).toContain('1/2 未裁决');
    expect(w.detail).toContain('GAP-01[P1·engine]'); // 点名 + 分池（面板照抄）
    expect(evalCapabilityGaps(res([], ['坏字段'])).state).toBe('fail');
  });
  it('全裁决（含 wontfix）=ok；未交付的仍在判词里报数（绿≠没话说）', () => {
    const r = evalCapabilityGaps(res([
      g({ id: 'A', state: 'wontfix', ticket: 't' }), g({ id: 'B', state: 'accepted', ticket: 't', blocks: ['S4'] }),
    ]));
    expect(r.state).toBe('ok');
    expect(r.detail).toContain('未交付 1');
    expect(r.detail).toContain('B→锁S4');
  });
});

describe('blockingGaps / orderGate 缺口锁（REQ-S18PANEL③·整关阻塞第一版）', () => {
  const g = (o) => ({ id: 'G', title: 't', priority: 'P1', route: 'engine', state: 'accepted', ticket: 'k', blocks: ['S3'], ...o });
  const boardWith = (gaps) => ({
    gaps,
    stages: STAGES.map((s) => ({ id: s.id, title: s.title, status: 'ok', machine: { state: 'ok' }, review: { state: 'ok' }, human: { state: 'ok' } })),
  });
  it('P0/P1 未交付且 blocks 含本关 → 锁；P2/P3 不锁；delivered/wontfix 不锁；别的关不锁', () => {
    expect(blockingGaps(boardWith([g({ priority: 'P0' })]), 'S3').map((x) => x.id)).toEqual(['G']);
    expect(blockingGaps(boardWith([g({ priority: 'P2' })]), 'S3')).toEqual([]); // owner 边界：只有 P0/P1 锁关
    expect(blockingGaps(boardWith([g({ priority: 'P3' })]), 'S3')).toEqual([]);
    expect(blockingGaps(boardWith([g({ state: 'delivered' })]), 'S3')).toEqual([]);
    expect(blockingGaps(boardWith([g({ state: 'wontfix' })]), 'S3')).toEqual([]); // 回驳=裁决·不再拦路
    expect(blockingGaps(boardWith([g()]), 'S4')).toEqual([]); // 只锁 blocks 点名的关
    expect(blockingGaps({ stages: [] }, 'S3')).toEqual([]); // 无 gaps 字段=零回归
  });
  it('缺口锁 --out-of-order 也不放行（跳过去只能在游戏层写逃生代码）', () => {
    const d = orderGate(boardWith([g({ id: 'GAP-3D-01', priority: 'P0', route: 'requests-3d' })]), 'S3', '赶 demo 先跑骨架');
    expect(d.allowed).toBe(false); // 撤缺口锁（orderGate 忽略 blockedBy）→ 本断言红
    expect(d.blockedBy.map((x) => x.id)).toEqual(['GAP-3D-01']);
    expect(d.outOfOrder).toBeUndefined(); // 拒跑就不能同时落乱序放行痕
  });
  it('缺口全 delivered → 前置全绿时照常放行（锁真会开·不是单向门）', () => {
    const d = orderGate(boardWith([g({ state: 'delivered' })]), 'S3', undefined);
    expect(d.allowed).toBe(true);
    expect(d.blockedBy).toBeUndefined();
  });
});

describe('boardFor 接缺口台账（S2 机器态 + 各关 🔒 + 板带 gaps）', () => {
  const mk = (root, gaps) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, 'docs/design/g/capability-plan.md', '# 能力计划');
    if (gaps) put(root, 'docs/design/g/capability-gaps.json', gaps);
  };
  it('plan 在档 + 零台账 = S2 机器门绿（存量游戏零回归）', () => withRoot(async (root) => {
    mk(root, null);
    const s2 = boardFor(root, 'g').stages.find((s) => s.id === 'S2');
    expect(s2.machine.state).toBe('ok');
    expect(s2.machine.detail).toContain('capability-plan.md 在档');
  }));
  it('6 条缺口未裁 → S2 机器门 ⚠ 点名条数；blocks 命中的关带 blockedBy（面板画 🔒）', () => withRoot(async (root) => {
    mk(root, [0, 1, 2, 3, 4, 5].map((i) => ({ id: `GAP-0${i + 1}`, title: `缺口${i}`, priority: i < 4 ? 'P1' : 'P2', route: i < 4 ? 'requests-3d' : 'engine', state: 'open', blocks: ['S3'] })));
    const b = boardFor(root, 'g');
    const s2 = b.stages.find((s) => s.id === 'S2');
    expect(s2.machine.state).toBe('warn'); // owner 验收原话「S1✅ S2⚠(缺口 6) S3🔒」
    expect(s2.machine.detail).toContain('6/6 未裁决');
    expect(b.gaps).toHaveLength(6); // 板直接带缺口（面板零推导·只渲染）
    expect(b.gapErrors).toEqual([]);
    expect(b.stages.find((s) => s.id === 'S3').blockedBy.map((g) => g.id)).toEqual(['GAP-01', 'GAP-02', 'GAP-03', 'GAP-04']); // P2 那两条不锁
    expect(b.stages.find((s) => s.id === 'S4').blockedBy).toEqual([]);
  }));
  it('台账不合法 → S2 机器门红 + 板带 gapErrors（不静默吞）', () => withRoot(async (root) => {
    mk(root, [{ id: 'X', title: 't', priority: 'P1', route: 'engine', state: 'delivered', blocks: [] }]); // 已裁无 ticket
    const b = boardFor(root, 'g');
    expect(b.stages.find((s) => s.id === 'S2').machine.state).toBe('fail');
    expect(b.gapErrors.length).toBeGreaterThan(0);
  }));
  it('缺口台账不入 gameHash（把缺口标 delivered 不该让全关证据过期）', () => withRoot(async (root) => {
    mk(root, null);
    const h0 = gameHash(root, 'g');
    put(root, 'docs/design/g/capability-gaps.json', [{ id: 'A', title: 't', priority: 'P1', route: 'engine', state: 'open', blocks: [] }]);
    expect(gameHash(root, 'g')).toBe(h0);
    put(root, 'docs/design/g/capability-gaps.json', [{ id: 'A', title: 't', priority: 'P1', route: 'engine', state: 'delivered', ticket: 'k', blocks: [] }]);
    expect(gameHash(root, 'g')).toBe(h0); // 裁决回执≠游戏内容（同 requests.md 判据）
    expect(capabilityGapsFile(root, 'g')).toContain('capability-gaps.json');
  }));
});

// ═══ S4/S5 自证门（REQ-SELFCHECK·图纸①②·「自己玩自己看对照策划」）═══
describe('selfCheckArtifacts / selfCheckBlock（自证产物存在性·纯 fs）', () => {
  const shots = (root, slug, names) => names.forEach((n) => put(root, `docs/design/${slug}/self-check/shots/${n}`, 'img'));
  it('无目录=空盘点·计 png/jpg/jpeg·忽略非图片·子目录递归计入', () => withRoot(async (root) => {
    put(root, 'games/g/index.ts', '// compiled');
    expect(selfCheckArtifacts(root, 'g', 'S4')).toMatchObject({ ok: false, hasAlignment: false, shots: 0 });
    shots(root, 'g', ['01.png', '02.PNG', '03.jpg', '04.jpeg']);
    put(root, 'docs/design/g/self-check/shots/notes.md', '# 不是图'); // 非图片不计
    expect(selfCheckArtifacts(root, 'g', 'S4').shots).toBe(4);
    shots(root, 'g', ['r2/05.png']); // 按轮分子目录也算（手册要求「每轮都做」）
    expect(selfCheckArtifacts(root, 'g', 'S4').shots).toBe(MIN_SELFCHECK_SHOTS);
    expect(selfCheckArtifacts(root, 'g', 'S4').ok).toBe(false); // 图够了但对齐单还缺
    put(root, 'docs/design/g/self-check/S4-alignment.md', '# 对齐单');
    expect(selfCheckArtifacts(root, 'g', 'S4').ok).toBe(true);
    expect(selfCheckArtifacts(root, 'g', 'S5').ok).toBe(false); // 对齐单逐关独立（S5 未做）
  }));
  it('MIN=5；判词点名缺什么（缺单/图不足各自点名·齐活=null 放行）', () => withRoot(async (root) => {
    expect(MIN_SELFCHECK_SHOTS).toBe(5);
    put(root, 'games/g/index.ts', '// compiled');
    const b0 = selfCheckBlock(selfCheckArtifacts(root, 'g', 'S4'), 'S4');
    expect(b0).toContain('自证未做');
    expect(b0).toContain('self-check.md'); // 点名手册
    expect(b0).toContain('缺策划对齐单 S4-alignment.md');
    expect(b0).toContain('截图 0/5');
    put(root, 'docs/design/g/self-check/S4-alignment.md', '# 对齐单');
    shots(root, 'g', ['01.png', '02.png']);
    const b1 = selfCheckBlock(selfCheckArtifacts(root, 'g', 'S4'), 'S4');
    expect(b1).not.toContain('缺策划对齐单');
    expect(b1).toContain('截图 2/5');
    shots(root, 'g', ['03.png', '04.png', '05.png']);
    expect(selfCheckBlock(selfCheckArtifacts(root, 'g', 'S4'), 'S4')).toBeNull();
  }));
});

describe('selfCheckNote 新鲜度（图纸②·绑 gameHash·⚠提示不硬拦）', () => {
  it('缺产物=✗·齐活=✓·快照指纹与现指纹不符=⚠过期', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    expect(selfCheckNote(root, 'g', 'S4', undefined, gameHash(root, 'g'))).toContain('自证 ✗');
    put(root, 'docs/design/g/self-check/S4-alignment.md', '# 对齐单');
    for (const n of ['1', '2', '3', '4', '5']) put(root, `docs/design/g/self-check/shots/${n}.png`, 'img');
    const h = gameHash(root, 'g');
    expect(selfCheckNote(root, 'g', 'S4', { at: '2026-07-29T00:00:00Z', gameHash: h }, h)).toContain('自证 ✓');
    expect(selfCheckNote(root, 'g', 'S4', { at: '2026-07-29T00:00:00Z', gameHash: 'stale-hash' }, h)).toContain('⚠');
    expect(selfCheckNote(root, 'g', 'S4', { gameHash: 'stale-hash' }, h)).toContain('过期');
    expect(selfCheckNote(root, 'g', 'S4', {}, h)).toContain('自证 ✓'); // 无快照字段=不冤判过期
  }));
  it('板 S4/S5 机器门提示带自证态；cart 的 S5（天然免审计）不加自证提示', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    const stage = (slug, id) => boardFor(root, slug).stages.find((s) => s.id === id);
    expect(stage('g', 'S4').machine.detail).toContain('自证 ✗');
    expect(stage('g', 'S5').machine.detail).toContain('自证 ✗');
    put(root, 'library/c/manifest.json', MANIFEST);
    expect(stage('c', 'S5').machine.detail).not.toContain('自证');
    expect(stage('c', 'S4').machine.detail).toContain('自证 ✗'); // 卡带的玩法关同受自证约束
  }));
  it('复查清单 S4/S5 各含「对齐单抽样重走 ≥3 条」+「好玩三问」行', () => {
    for (const stage of ['S4', 'S5']) {
      const joined = REVIEW_CHECKLISTS[stage].join('\n');
      expect(joined).toContain('自证对齐单抽样重走 ≥3 条');
      expect(joined).toContain('⚠降格行的裁决去向');
      expect(joined).toContain('好玩三问');
    }
  });
});

// CLI 端到端：真跑 game-pipeline.mjs（ZEROCRAFT_PIPELINE_ROOT 注入临时根·不碰真仓库）。
const CLI = fileURLToPath(new URL('./game-pipeline.mjs', import.meta.url));
const runCli = (root, args) => spawnSync('node', [CLI, ...args], { env: { ...process.env, ZEROCRAFT_PIPELINE_ROOT: root }, encoding: 'utf8' });

describe('去 Apollo 化过渡期 env 旧名 fallback（REQ-PKG-位置无关与正名）', () => {
  it('只设旧名 APOLLO_PIPELINE_ROOT（不设 ZEROCRAFT_PIPELINE_ROOT）→ CLI 仍认那个临时根', () => {
    const root = mkdtempSync(join(tmpdir(), 'ord-cli-legacy-'));
    mkdirSync(join(root, 'games', 'g'), { recursive: true });
    try {
      // 故意只传旧名，且显式确保新名不在 env 里——只有 fallback 生效才会指到这个临时根。
      const env = { ...process.env, APOLLO_PIPELINE_ROOT: root };
      delete env.ZEROCRAFT_PIPELINE_ROOT;
      const r = spawnSync('node', [CLI, 'gate', 'g', 'S3'], { env, encoding: 'utf8' });
      expect(r.status).not.toBe(0); // 前关欠·同「前关欠」用例的判词——证明它真读到了这个临时根（非真仓库）
      expect(r.stderr).toContain('顺序闸');
      expect(r.stderr).toContain('S1');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('gate 顺序闸 CLI（真退出码+落痕+板 ⚠·REQ-GATE-硬化 F 点名）', () => {
  // 编译期 fixture：games/<slug> 目录存在（compiled）·空立项卡 → S1/S2 非绿。
  //   gate S3 对编译期游戏=「免 manifest 校验」exit0（不 spawn 重活）——放行路径便宜可测。
  const mkFixture = () => { const r = mkdtempSync(join(tmpdir(), 'ord-cli-')); mkdirSync(join(r, 'games', 'g'), { recursive: true }); return r; };

  it('前关欠 → gate 拒跑（退出码非 0 + stderr 指名欠项）', () => {
    const root = mkFixture();
    try {
      const r = runCli(root, ['gate', 'g', 'S3']);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('顺序闸');
      expect(r.stderr).toContain('S1'); // 指名前置欠关
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('--out-of-order → 放行·pipeline.json 落 outOfOrder 痕·board 显 ⚠乱序', () => {
    const root = mkFixture();
    try {
      const g = runCli(root, ['gate', 'g', 'S3', '--out-of-order', '赶 demo 骨架先跑']);
      expect(g.status).toBe(0);
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.outOfOrder).toEqual([expect.objectContaining({ stage: 'S3', reason: '赶 demo 骨架先跑' })]);
      const b = runCli(root, ['board', 'g']);
      expect(b.stdout).toContain('⚠乱序');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('旧板（无 outOfOrder 字段）board 正常出图·无 ⚠（零回归）', () => {
    const root = mkFixture();
    try {
      const d = join(root, 'public', 'games', 'g');
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'pipeline.json'), JSON.stringify({ version: 1, slug: 'g', concept: { name: 'G', pitch: 'p' }, signoffs: {} }));
      const b = runCli(root, ['board', 'g']);
      expect(b.status).toBe(0);
      expect(b.stdout).not.toContain('⚠乱序');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // ═══ REQ-S18PANEL②③·S2 gap-check 门 + 缺口锁（真退出码·纯 fs 路径 temp root 全可测）═══
  const putGaps = (root, gaps) => put(root, 'docs/design/g/capability-gaps.json', gaps);
  const concept = (root) => runCli(root, ['concept', 'g', '--name', 'G', '--pitch', '叠叠乐']);

  it('S2 gate：无 plan 无 waiver → 红点名模板；有 plan 零缺口 → 绿并落证据', () => {
    const root = mkFixture();
    try {
      concept(root);
      const bad = runCli(root, ['gate', 'g', 'S2']);
      expect(bad.status).not.toBe(0);
      expect(bad.stdout + bad.stderr).toContain('capability-plan-template.md');
      put(root, 'docs/design/g/capability-plan.md', '# 能力计划');
      const ok = runCli(root, ['gate', 'g', 'S2']);
      expect(ok.status).toBe(0);
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.evidence.S2.exit).toBe(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('S2 gate：有未裁决缺口 → 真红（不许带 open 缺口往下走）；逐条判完 → 转绿', () => {
    const root = mkFixture();
    try {
      concept(root);
      put(root, 'docs/design/g/capability-plan.md', '# 能力计划');
      putGaps(root, [
        { id: 'GAP-01', title: '球体刚体', priority: 'P1', route: 'requests-3d', state: 'open', blocks: ['S3'] },
        { id: 'GAP-02', title: '液面件', priority: 'P2', route: 'pui', state: 'open', blocks: [] },
      ]);
      const red = runCli(root, ['gate', 'g', 'S2']);
      expect(red.status).not.toBe(0); // 撤 gap-check（S2 门只看 plan）→ 本断言红
      expect(red.stdout + red.stderr).toContain('GAP-01');
      // owner 逐条判完（A=补引擎缺口→accepted·B=回驳→wontfix），S2 门即转绿。
      putGaps(root, [
        { id: 'GAP-01', title: '球体刚体', priority: 'P1', route: 'requests-3d', state: 'accepted', ticket: 'requests-3d.md#REQ-3D-BALL', blocks: ['S3'] },
        { id: 'GAP-02', title: '液面件', priority: 'P2', route: 'pui', state: 'wontfix', ticket: 'requests.md#REQ-UIFX', blocks: [] },
      ]);
      const green = runCli(root, ['gate', 'g', 'S2']);
      expect(green.status).toBe(0);
      expect(green.stdout).toContain('全已裁决');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('缺口锁：S3 被未交付 P0/P1 缺口锁住 → --out-of-order 也拒跑·点名卡在哪条+工单；delivered 后放行', () => {
    const root = mkFixture();
    try {
      concept(root);
      put(root, 'docs/design/g/capability-plan.md', '# 能力计划');
      putGaps(root, [{ id: 'GAP-3D-01', title: '薄牌刚体轴向', priority: 'P0', route: 'requests-3d', state: 'accepted', ticket: 'requests-3d.md#REQ-3D-CARD-FACE-AXIS', blocks: ['S3'] }]);
      const locked = runCli(root, ['gate', 'g', 'S3', '--out-of-order', '赶 demo 先跑骨架']);
      expect(locked.status).not.toBe(0);
      const out = locked.stdout + locked.stderr;
      expect(out).toContain('能力缺口闸');
      expect(out).toContain('GAP-3D-01');
      expect(out).toContain('requests-3d.md#REQ-3D-CARD-FACE-AXIS'); // 告知卡在哪+去哪看
      expect(out).not.toContain('顺序闸'); // 缺口锁先答（别把人指去查前置门）
      const b = runCli(root, ['board', 'g']);
      expect(b.stdout).toContain('🔒缺口');
      expect(b.stdout).toContain('缺口台账 1 条');
      // 缺口交付后锁自动开（compiled 游戏 S3=免 manifest 校验·沙盒根跳探针 → 走得到绿）。
      // S2 复查落账是既有硬闸（S2 机器门已绿=已施工·未复查一律拦）——与缺口锁各管各的，两道都过才跑得动。
      putGaps(root, [{ id: 'GAP-3D-01', title: '薄牌刚体轴向', priority: 'P0', route: 'requests-3d', state: 'delivered', ticket: 'requests-3d.md#REQ-3D-CARD-FACE-AXIS', blocks: ['S3'] }]);
      expect(runCli(root, ['review', 'g', 'S2', '--verdict', 'PASS', '--note', '缺口逐条核过', '--by', '复查人']).status).toBe(0);
      const opened = runCli(root, ['gate', 'g', 'S3', '--out-of-order', '前置未签·测锁已开']);
      expect(opened.status).toBe(0);
      expect(runCli(root, ['board', 'g']).stdout).not.toContain('🔒缺口');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // REQ-ACCEPT·图纸④：S4 门存在性检查（<3 场景直接拒·不空转跑重活·此路径在 spawn 前返回·temp root 可测）。
  it('S4 gate：验收剧本 <3 → 拒过·点名「验收剧本不足（GD 补）」（不空转跑 vitest）', () => {
    const root = mkFixture();
    try {
      const r = runCli(root, ['gate', 'g', 'S4', '--out-of-order', '测 S4 存在性门']);
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('验收剧本不足');
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.evidence.S4.exit).not.toBe(0); // 落证据=红
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  // REQ-SELFCHECK·图纸①：自证产物缺 → S4/S5 门在 spawn 前拒（点名「自证未做·见 self-check.md」）。
  const putSelfCheck = (root, slug, stage) => {
    put(root, `docs/design/${slug}/self-check/${stage}-alignment.md`, '# 对齐单\n- 承诺 A ✅对齐');
    for (const n of ['01', '02', '03', '04', '05']) put(root, `docs/design/${slug}/self-check/shots/${n}.png`, 'img');
  };
  const putScenarios = (root, slug) => {
    for (const n of ['a', 'b', 'c']) put(root, `docs/design/${slug}/acceptance/${n}.scenario.jsonc`, JSON.stringify({ name: n, game: slug, seed: 1, steps: [{ tick: 1 }] }));
  };

  it('S4 gate：剧本够但自证产物缺 → 拒过·点名「自证未做」+手册（未进 conformance 重活）', () => {
    const root = mkFixture();
    try {
      putScenarios(root, 'g');
      const r = runCli(root, ['gate', 'g', 'S4', '--out-of-order', '测 S4 自证门']);
      expect(r.status).not.toBe(0);
      const out = r.stdout + r.stderr;
      expect(out).toContain('自证未做');
      expect(out).toContain('self-check.md');
      expect(out).not.toContain('conformance'); // 在 spawn 前就拒了（不空转跑重活）
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.evidence.S4.exit).not.toBe(0);
      expect(pf.selfCheck).toBeUndefined(); // 产物不齐不记快照
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('S5 gate：自证产物缺 → 拒过·点名 S5-alignment.md；补齐后放行且落自证快照（绑 gameHash）', () => {
    const root = mkFixture();
    try {
      const bad = runCli(root, ['gate', 'g', 'S5', '--out-of-order', '测 S5 自证门']);
      expect(bad.status).not.toBe(0);
      expect(bad.stdout + bad.stderr).toContain('S5-alignment.md');
      putSelfCheck(root, 'g', 'S5');
      const ok = runCli(root, ['gate', 'g', 'S5', '--out-of-order', '测 S5 自证门放行']);
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(ok.stdout + ok.stderr).not.toContain('自证未做'); // 已越过自证门（后续 audit 红是另一回事）
      expect(pf.selfCheck.S5).toMatchObject({ shots: 5 });
      expect(pf.selfCheck.S5.gameHash).toBeTruthy(); // 新鲜度锚（图纸②）
      const b = runCli(root, ['board', 'g']);
      expect(b.stdout).toContain('自证 ✓');
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 60_000);

  // Lead 验收加固：≥3 场景后 gate 真进 conformance——temp 根注入下 runner 根须对齐（绝对脚本路径 +
  // ZEROCRAFT_ACCEPTANCE_ROOT 透传），落红须是真判词（缺 adapter），不许是脚本找不到的崩溃尾巴。
  it('S4 gate：3 场景 + 自证齐 → conformance 真判红（点名缺 adapter·非崩溃式落红）', () => {
    const root = mkFixture();
    try {
      putScenarios(root, 'g');
      putSelfCheck(root, 'g', 'S4');
      const r = runCli(root, ['gate', 'g', 'S4', '--out-of-order', '测 conformance 根对齐']);
      expect(r.status).not.toBe(0);
      const out = r.stdout + r.stderr;
      expect(out).toContain('conformance 未过');
      expect(out).toContain('缺 adapter'); // runner 的真实判词穿透到 gate 摘要（根对齐生效）
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 120_000);
});

// ═══ 独立复查 2026-08-16 打回的两条（P0 编排器回归 / P1 缺口锁 fail-open）═══
describe('S2 门与顺序闸/复查新鲜度（复查 FAIL 打回后的修复锚点）', () => {
  const mkFixture = () => { const r = mkdtempSync(join(tmpdir(), 'gap-fix-')); mkdirSync(join(r, 'games', 'g'), { recursive: true }); return r; };
  const putGaps = (root, gaps) => put(root, 'docs/design/g/capability-gaps.json', gaps);

  it('P0：S2 gate 不过顺序闸——S1 人门未签（owner 亲签·禁代签）也跑得动，且不落 ⚠乱序痕', () => {
    const root = mkFixture();
    try {
      runCli(root, ['concept', 'g', '--name', 'G', '--pitch', 'p']);
      put(root, 'docs/design/g/capability-plan.md', '# 能力计划');
      const r = runCli(root, ['gate', 'g', 'S2']);          // 撤「S2 不过顺序闸」→ 本断言红（stderr 顺序闸·S1 欠人门）
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('顺序闸');
      const pf = JSON.parse(readFileSync(join(root, 'public', 'games', 'g', 'pipeline.json'), 'utf8'));
      expect(pf.evidence.S2.exit).toBe(0);
      expect(pf.outOfOrder).toBeUndefined();                // 没乱序就不许盖 ⚠乱序 章
      // 其余 gate 关照旧过闸（S2 的例外不许外溢）：S2 刚跑绿=已施工未复查 → S3 被复查前置硬闸拦下
      const s3 = runCli(root, ['gate', 'g', 'S3']);
      expect(s3.status).not.toBe(0);
      expect(s3.stderr).toMatch(/顺序闸|复查前置硬闸/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('P1：台账一动 → S2 复查转 stale（改一条 state 就能无痕解锁的洞被堵上）', () => {
    const root = mkFixture();
    try {
      runCli(root, ['concept', 'g', '--name', 'G', '--pitch', 'p']);
      put(root, 'docs/design/g/capability-plan.md', '# 能力计划');
      const gap = (state, extra = {}) => [{ id: 'GAP-01', title: '球体刚体', priority: 'P0', route: 'requests-3d', state, blocks: ['S3'], ...extra }];
      putGaps(root, gap('accepted', { ticket: 'requests-3d.md#R' }));
      const h0 = gapsHash(root, 'g');
      expect(runCli(root, ['review', 'g', 'S2', '--verdict', 'PASS', '--note', '缺口逐条核过', '--by', '复查人']).status).toBe(0);
      let b = boardFor(root, 'g');
      expect(b.stages.find((s) => s.id === 'S2').review.state).toBe('ok');
      expect(b.stages.find((s) => s.id === 'S3').blockedBy.map((g) => g.id)).toEqual(['GAP-01']);
      // 手改 accepted → delivered：锁开了，但复查也必须当场过期（否则等于自己给自己解锁）
      putGaps(root, gap('delivered', { ticket: 'requests-3d.md#R' }));
      expect(gapsHash(root, 'g')).not.toBe(h0);
      b = boardFor(root, 'g');
      expect(b.stages.find((s) => s.id === 'S3').blockedBy).toEqual([]);
      const s2 = b.stages.find((s) => s.id === 'S2');
      expect(s2.review.state).toBe('stale');                 // 撤 gapsHash 绑定 → 本断言红
      expect(s2.review.detail).toContain('缺口台账已变动');
      // 复查过期 = 「已施工未复查」硬闸接管：S3 仍拒跑（--out-of-order 也不放行）
      const r = runCli(root, ['gate', 'g', 'S3', '--out-of-order', '锁开了就想跑']);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('复查前置硬闸');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('旧 S2 复查记录（无 reviewHash）明确要求重新复查一次', () => withRoot(async (root) => {
    put(root, 'public/games/g/manifest.json', MANIFEST);
    put(root, 'docs/design/g/capability-plan.md', '# 计划');
    put(root, 'docs/design/g/capability-gaps.json', [{ id: 'A', title: 't', priority: 'P2', route: 'engine', state: 'wontfix', ticket: 'k', blocks: [] }]);
    const h = gameHash(root, 'g');
    put(root, pipelineFile(root, 'g').slice(root.length + 1), {
      version: 1, slug: 'g', concept: {}, signoffs: {},
      reviews: { S2: { verdict: 'PASS', note: '旧记录', by: 'r', at: '2026-08-01T00:00:00Z', gameHash: h } },
    });
    const review = boardFor(root, 'g').stages.find((s) => s.id === 'S2').review;
    expect(review.state).toBe('stale');
    expect(review.detail).toContain('reviewHash');
  }));
});
