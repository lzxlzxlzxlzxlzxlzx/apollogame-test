#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/game-pipeline.mjs —— 逐游戏生产流程板（owner 2026-07-10：
//  「不能靠一个手册让 LLM 一口气跑完整条流程——要 N 步拆分·每步做完对手册 review·反复迭代」）
//
//  治的病：LLM 长流程上下文丢失/漂移（game-k RCA=会话早于手册·plan 门没接住）。
//  药方＝把「流程走到哪了」放到 LLM 之外：
//    · 状态**从工件推导**（manifest/测试/台账/审计真跑），不信模型的口头汇报；
//    · 跑过的机器门记**证据**（退出码+游戏内容指纹）——游戏文件一动，证据自动标过期，绿不是永久绿；
//    · 每步双验（double verify）：机器门（本脚本 gate 真跑）+ 人门（signoff 落账·带 note）；
//    · 台账=public/games/<slug>/pipeline.json——新 session 先 board 再干活，只做第一个非绿阶段。
//
//  八阶段（每阶段一本手册·≤80 行·弱模型也读得完）：
//    S1 立项卡 → S2 能力计划 → S3 骨架关 → S4 玩法关 → S5 UI 关 → S6 美术关 → S7 品质关 → S8 终检关
//
//  用法：
//    node scripts/game-pipeline.mjs board <slug> [--json]      看板（推导态·不跑重活）
//    node scripts/game-pipeline.mjs gate <slug> <S2|S3|S4|S5|S8>  跑该阶段机器门→记证据
//                                                （S2=gap-check·纯 fs 秒回；其余可能真跑重活）
//    node scripts/game-pipeline.mjs checklist <slug> <SN>      打印该阶段复查清单（复查 session 开工第一命令）
//    node scripts/game-pipeline.mjs review <slug> <S2|S3|S4|S5|S8> --verdict PASS|CONCERNS|FAIL --note "…" --by 复查人   复查门落账（REQ-QC-三门）
//    node scripts/game-pipeline.mjs scorecard <slug> --scores "艺术方向:2,…八维" --by 复查人 --note 证据   S7 评分卡落账（全维≥2=premium·任一 0 分=红）
//    node scripts/game-pipeline.mjs signoff <slug> <SN> --note "…" [--by 名]   人门落账
//    node scripts/game-pipeline.mjs reopen <slug> <SN> --note "…" --by 名      作废该关及后续旧结论，重新走三门
//    node scripts/game-pipeline.mjs concept <slug> --name "…" --pitch "…" [--refs …] [--style …] [--plan-waiver 理由]
//  线手册：docs/playbooks/game-production.md + docs/playbooks/review-gates.md（三门制·复查清单）。
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
// R3（REQ-RENDERCHECK·标准照比对）门读码只要「有没有 blessed 基准」这一个纯 fs 判断——从
// scripts/lib/golden-ledger.mjs（而非 golden-shot.mjs 本体）import，避免跟 golden-shot.mjs
// （它反过来要 import 本文件的 detectForm/gameHash）互相 import 成环。
import { blessedStates, readLedger } from './lib/golden-ledger.mjs';

// ROOT=仓库根（默认）。ZEROCRAFT_PIPELINE_ROOT（旧名 APOLLO_PIPELINE_ROOT 过渡期仍读）仅供测试
// 注入临时根（跑 CLI 端到端·不碰真仓库）——生产不设此环境变量，行为逐字节同旧版。
const REAL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.ZEROCRAFT_PIPELINE_ROOT || process.env.APOLLO_PIPELINE_ROOT || REAL_ROOT;
// R1·渲染冒烟探针（REQ-RENDERCHECK）只在真仓库根下跑——它天生要连「真运行中的 app」（vite 起服 +
// 真 Chromium + 真游戏注册表），跟本文件其余门那种「随便指个空临时目录」式沙盒测试前提不兼容
// （沙盒根没有 node_modules/index.html，探针连 vite 都起不来）。SANDBOXED=true 时 S3 门保留旧语义
// （零回归：本仓已有的 S3 CLI 测试全部走沙盒根）；真仓库根下照常追加跑探针。
const SANDBOXED = ROOT !== REAL_ROOT;

const readJson = (f, fb) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };

export const pipelineFile = (root, slug) => join(root, 'public', 'games', slug, 'pipeline.json');

// 游戏形态：cart=创作台卡带（library/）· builtin=内置纯数据（public/games/<slug>/manifest.json tracked）· compiled=编译期（games/）。
export function detectForm(root, slug) {
  if (existsSync(join(root, 'library', slug, 'manifest.json'))) return 'cart';
  if (existsSync(join(root, 'public', 'games', slug, 'manifest.json'))) return 'builtin';
  if (existsSync(join(root, 'games', slug))) return 'compiled';
  return null;
}

const manifestPath = (root, slug, form) =>
  form === 'cart' ? join(root, 'library', slug, 'manifest.json')
    : form === 'builtin' ? join(root, 'public', 'games', slug, 'manifest.json')
      : null;

/** 游戏内容指纹：只哈希**这款游戏自己的**输入（manifest/源码/美术/设计档），引擎全局变化由 S8 的 git HEAD 兜。
 *  排除 pipeline.json 自身（记证据不得自我过期）、gen/mock/（mock 预览物不影响出货内容）
 *  与 requests.md（工单池=沟通台账非游戏内容——回执/批注不得作废复查·Lead 2026-07-17 修 game-b S3 误失效）。
 *
 *  **同理排除 `public/games/<slug>/probe/`（Lead 2026-08-08 补·同一条「记证据不得自我过期」）**：
 *  那整个目录是**各阶段机器门自己写出来的证据**（S3-render.png / S4-play-*.png / S4-uiwalk.json / S5-*.png），
 *  不是游戏的输入。不排除的后果实测复现过——game108 的对局屏有时间驱动的动画，
 *  同一份源码连跑两次 S3，截图字节就不同（md5 `e5105b6d…` → `72d5a3d9…`）⇒ 指纹变 ⇒
 *  **跑 S3 把 S4/S5 的证据判过期、跑 S4 又把 S3 的判过期，两者永远不可能同时绿**，
 *  流程板上是一串永远追不上的 ⚠。这跟当年 pipeline.json 自我过期是同一个形状，只是漏了这个孪生目录。 */
const EVIDENCE_DIRS = new Set(['mock', 'probe', 'golden', 'self-check', 'review']);
// 阶段程序回报也是门自产物：写入本轮命令结果不能反过来让同一轮证据过期。
// S2 仍通过 stageReviewHash 单独读取 s1-s2-program-evidence.md，故排出完整 gameHash 不会放松 S2 裁决。
const EVIDENCE_FILES = new Set(['s1-s2-program-evidence.md', 's3-program-evidence.md', 's4-program-evidence.md']);

export function gameHash(root, slug) {
  const roots = [
    join(root, 'library', slug),
    join(root, 'public', 'games', slug),
    join(root, 'games', slug),
    join(root, 'docs', 'design', slug),
  ];
  const files = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = statSync(p);
      // 证据目录判据（REQ-PIPEHASH-03 终态·三次同形复盘）：指纹只答「游戏变了没有」；
      // 凡回答「门跑过没有」的目录（门自产证据）一律排除——mock 预览物·probe 探针门证·
      // golden 标准照基准·self-check 自证单与截图·review 复查导航单。
      // ⚠ gdd/capability-plan/acceptance 是**规格**必须继续入指纹（改了就该重验）——只排证据不排被验物。
      if (st.isDirectory()) { if (!EVIDENCE_DIRS.has(name)) walk(p); continue; }
      if (name === 'pipeline.json') continue;
      if (name === 'requests.md') continue; // 工单池台账不入指纹（高频回执≠内容变更）
      if (EVIDENCE_FILES.has(name)) continue;
      // 缺口台账同理（REQ-S18PANEL②·同「工单池台账」判据）：capability-gaps.json 记的是
      // **缺口被裁到哪一步了**（open→accepted→delivered），不是游戏内容——把某条缺口标
      // delivered 不该让 S3/S4/S5 的证据全体过期。缺口真被消费时游戏文件会动，指纹那时才该变。
      // 门的新鲜度另有保障：S2 机器态是**板上现算**的（不读证据·见 boardFor 的 S2 分支）。
      if (name === 'capability-gaps.json') continue;
      files.push(p);
    }
  };
  for (const r of roots) walk(r);
  const h = createHash('sha256');
  for (const f of files) { h.update(relative(root, f)); h.update('\0'); h.update(readFileSync(f)); h.update('\0'); }
  return h.digest('hex').slice(0, 16);
}

// S2 复查只裁决立项/能力输入；游戏实现与 S3 证据属于后续阶段，不得反复作废这份裁决。
const S2_REVIEW_INPUTS = [
  'brief.md',
  'gdd.md',
  'capability-plan.md',
  'capability-gaps.json',
  's1-s2-program-handoff.md',
  's1-s2-program-evidence.md',
];

/** 阶段复查指纹：S2 只读其裁决输入；其他阶段保持完整游戏指纹。 */
export function stageReviewHash(root, slug, stage) {
  if (stage !== 'S2') return gameHash(root, slug);
  const base = join(root, 'docs', 'design', slug);
  const h = createHash('sha256');
  for (const name of S2_REVIEW_INPUTS) {
    const file = join(base, name);
    h.update(name); h.update('\0');
    if (existsSync(file)) h.update(readFileSync(file));
    else h.update('<missing>');
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

// ── 阶段表（id·名·手册·机器门语义）。手册列=该步开工前唯一必读（每本 ≤80 行）。──
export const STAGES = [
  { id: 'S1', title: '立项卡', handbook: 'docs/llm-onboarding.md', gate: null },
  // S2 的机器牙齿（REQ-S18PANEL②·owner 2026-08-16 令）=gap-check：能力计划在档 ∧ 缺口台账
  // 合法且**全部已裁决**（state≠open）。此前 gate=null＝S2 只看「plan 文件在不在」，于是
  // 「识别出 6 条引擎缺口→无处对齐→带着未裁决的缺口一路生成下去」是合法路径（owner 实撞）。
  { id: 'S2', title: '能力计划', handbook: 'docs/design/capability-plan-template.md', gate: 'gap-check' },
  { id: 'S3', title: '骨架关', handbook: 'docs/playbooks/index.md', gate: 'manifest-check' },
  { id: 'S4', title: '玩法关', handbook: 'docs/playbooks/testing.md', gate: 'walkthrough' },
  { id: 'S5', title: 'UI 关', handbook: 'docs/playbooks/ui.md', gate: 'audit' },
  { id: 'S6', title: '美术关', handbook: 'docs/playbooks/art-pipeline.md', gate: null },
  { id: 'S7', title: '品质关', handbook: 'docs/playbooks/visual-scorecard.md', gate: null },
  { id: 'S8', title: '终检关', handbook: 'docs/playbooks/testing.md', gate: 'full-suite' },
];
export const GATE_STAGES = STAGES.filter((s) => s.gate).map((s) => s.id);

const led = (root, slug) => readJson(join(root, 'public', 'games', slug, 'art', 'art-ledger.json'), null);

// ── 验收剧本存在性（REQ-ACCEPT·图纸④·「绿门不可玩」复盘）─────────────────
// S4 门在原 walkthrough/bench 之上加一道：GD 写的验收剧本 ≥3 场景才许过（防零剧本空转）。
// 纯 fs 计数（不装载·不跑）——导出供 gate 与单测共用（compiled/builtin/cart 通用）。
export const MIN_ACCEPTANCE_SCENARIOS = 3;
export function acceptanceScenarioCount(root, slug) {
  const dir = join(root, 'docs', 'design', slug, 'acceptance');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith('.scenario.jsonc')).length;
}

// ── S2 能力缺口台账（REQ-S18PANEL②③·owner 2026-08-16 令）──────────────────────
// 病（owner 用叠叠乐 Demo 实撞）：控制台的「生成」从 S3 骨架起步，S1 立项 / S2 能力计划在面板上
// 没有落点——识别出来的引擎缺口无处对齐，于是「带着 6 条未裁决的缺口一路往下生成」是合法路径。
// 药：给 S2 装机器牙齿，缺口本身做成**机读产物**（面板 = 这份 JSON 的直接渲染）。
//
// 台账 = docs/design/<slug>/capability-gaps.json（PST 建项端点落盘·本文件只读不写）：
//   [{ id, title, priority:P0|P1|P2|P3, route:engine|3d|pui, state:…, ticket, blocks:[SN…] }]
// · route 不是装饰——缺口按池分流（engine=10 硬槽 / requests-3d=P3D 独立池 / pui=UI 基座）；
//   闭集与 ① 的落盘端点 main_entry/projects.py::_GAP_ROUTES **逐字对齐**（那一头先落盘、这一头判门，
//   两套写法就等于合法文件被自己人判非法——工单明示「以 projects.py 归一后形状为准」）。
//   一股脑丢引擎池会当场撑爆槽位（叠叠乐那 6 条里 4 条是 3D 线）。
// · state 闭集：open=未裁决（owner 还没判 A/B）· accepted=已裁待做 · in-progress=施工中 ·
//   delivered=已交付（能力真在了）· wontfix=回驳（用现有能力重组·不阻塞任何关）。
// · blocks=这条缺口**卡住哪几关**（第一版粗粒度整关阻塞·owner 明示 YAGNI：不做「只阻塞
//   依赖它的那部分规则」，那要把「哪条规则依赖哪个缺口」也结构化，等真被卡烦了再说）。
export const GAP_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
export const GAP_ROUTES = ['engine', 'requests-3d', 'pui'];
export const GAP_STATES = ['open', 'accepted', 'in-progress', 'delivered', 'wontfix'];
/** 只有 P0/P1 锁关（owner 边界：「有未解 P0/P1 → 该关锁」）——P2/P3 板上可见但不拦路。 */
export const GAP_BLOCKING_PRIORITIES = ['P0', 'P1'];
/** 已了结=不再阻塞：delivered（能力到位）/ wontfix（判定不做·游戏侧按现有能力重组）。 */
const GAP_SETTLED = ['delivered', 'wontfix'];
export const capabilityGapsFile = (root, slug) => join(root, 'docs', 'design', slug, 'capability-gaps.json');

/** 缺口台账读取 + 闭集校验（纯 fs·不抛）。无文件={absent:true·零缺口}——**存量游戏零回归**：
 *  今天全库没有一个 capability-gaps.json，故所有既有板/门逐字节同旧版。导出供 board/gate/单测共用。 */
export function readCapabilityGaps(root, slug) {
  const file = capabilityGapsFile(root, slug);
  if (!existsSync(file)) return { absent: true, gaps: [], errors: [] };
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { return { absent: false, gaps: [], errors: [`capability-gaps.json 不是合法 JSON（${String(e.message).slice(0, 80)}）`] }; }
  if (!Array.isArray(raw)) return { absent: false, gaps: [], errors: ['capability-gaps.json 顶层须是数组：[{id,title,priority,route,state,ticket,blocks}]'] };
  const errors = [];
  const seen = new Set();
  const gaps = [];
  raw.forEach((g, i) => {
    const at = `#${i + 1}${g && typeof g === 'object' && g.id ? `(${g.id})` : ''}`;
    if (!g || typeof g !== 'object' || Array.isArray(g)) { errors.push(`${at} 不是对象`); return; }
    if (typeof g.id !== 'string' || !g.id.trim()) errors.push(`${at} 缺 id`);
    else if (seen.has(g.id)) errors.push(`${at} id 重复（缺口 id 须唯一——面板按它跳工单）`);
    else seen.add(g.id);
    if (typeof g.title !== 'string' || !g.title.trim()) errors.push(`${at} 缺 title`);
    if (!GAP_PRIORITIES.includes(g.priority)) errors.push(`${at} priority 非法 ${JSON.stringify(g.priority)}（闭集 ${GAP_PRIORITIES.join('/')}）`);
    if (!GAP_ROUTES.includes(g.route)) errors.push(`${at} route 非法 ${JSON.stringify(g.route)}（闭集 ${GAP_ROUTES.join('/')}——缺口要分流到不同的池，别一股脑进引擎池）`);
    if (!GAP_STATES.includes(g.state)) errors.push(`${at} state 非法 ${JSON.stringify(g.state)}（闭集 ${GAP_STATES.join('/')}）`);
    if (g.blocks !== undefined && !Array.isArray(g.blocks)) errors.push(`${at} blocks 须是数组（可空=不锁关）`);
    const blocks = Array.isArray(g.blocks) ? g.blocks : [];
    for (const s of blocks) if (!STAGES.some((st) => st.id === s)) errors.push(`${at} blocks 含未知阶段 ${JSON.stringify(s)}（闭集 ${STAGES.map((st) => st.id).join('/')}）`);
    // 已裁决就必须有落点：面板只做「展示 + 跳转到工单」，没有 ticket 的已裁缺口=裁词在哪没人知道。
    if (GAP_STATES.includes(g.state) && g.state !== 'open' && !(typeof g.ticket === 'string' && g.ticket.trim())) {
      errors.push(`${at} state=${g.state} 却无 ticket（已裁决的缺口须指向工单——裁决全文在池里·面板要跳过去）`);
    }
    gaps.push({
      id: typeof g.id === 'string' ? g.id : '', title: typeof g.title === 'string' ? g.title : '',
      priority: g.priority, route: g.route, state: g.state,
      ticket: typeof g.ticket === 'string' ? g.ticket : '', blocks,
    });
  });
  return { absent: false, gaps, errors };
}

/** S2 机器门判词（纯函数·board 与 gate 共用同一只嘴）：台账不合法=fail（红）；有 open 缺口=warn
 *  （⚠·「未裁决」不是错误是待办·owner 验收原话「S2⚠(缺口 6)」）；其余=ok。 */
export function evalCapabilityGaps(res) {
  if (res.errors.length) return { state: 'fail', detail: `✗ 缺口台账不合法（${res.errors.length} 处）· ${res.errors.slice(0, 3).join(' · ')}${res.errors.length > 3 ? ' …' : ''}` };
  if (res.absent) return { state: 'ok', detail: '缺口台账未建（零缺口=直接过）' };
  const n = res.gaps.length;
  if (!n) return { state: 'ok', detail: '缺口台账空（零缺口）' };
  const open = res.gaps.filter((g) => g.state === 'open');
  if (open.length) {
    return { state: 'warn', detail: `⚠ 缺口 ${open.length}/${n} 未裁决（走缺口裁决协议：先查 → 摆 A/B → owner 判）· ${open.map((g) => `${g.id}[${g.priority}·${g.route}]`).join(' ')}` };
  }
  const undone = res.gaps.filter((g) => !GAP_SETTLED.includes(g.state));
  return {
    state: 'ok',
    detail: `✓ 缺口 ${n} 条全已裁决${undone.length ? ` · 未交付 ${undone.length}：${undone.map((g) => `${g.id}→锁${g.blocks.join('/') || '无'}`).join(' ')}` : ' · 全部了结'}`,
  };
}

/** 缺口台账指纹（复查新鲜度锚·独立复查 2026-08-16 P1 发现）：台账不入 gameHash（裁决回执≠游戏内容），
 *  于是「把一条 P0 从 accepted 手改成 delivered」可以**无痕解开缺口锁**——复查门当时审的正是这份台账，
 *  却没有任何东西记住它当时长什么样。故给 S2 复查记录单独绑这一枚指纹：台账一动，S2 复查门转 stale，
 *  而「已施工未复查」是不可自赦的硬闸 ⇒ 锁重新扣上。无台账 = 空串（存量零回归）。 */
export function gapsHash(root, slug) {
  const f = capabilityGapsFile(root, slug);
  if (!existsSync(f)) return '';
  return createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
}

/** 某关的缺口锁（REQ-S18PANEL③）：blocks 含本关 ∧ P0/P1 ∧ 未 delivered/wontfix 的缺口。
 *  空数组=本关不被缺口卡。纯函数（吃 board 或 {gaps}）——导出供 orderGate/board/单测共用。 */
export function blockingGaps(board, stage) {
  return (board?.gaps || []).filter((g) => GAP_BLOCKING_PRIORITIES.includes(g.priority)
    && !GAP_SETTLED.includes(g.state)
    && Array.isArray(g.blocks) && g.blocks.includes(stage));
}

// ── 自证产物存在性（REQ-SELFCHECK·图纸①②·手册 docs/playbooks/self-check.md）─────────
// owner 2026-07-29 拍板（101/102/103 复盘）：「门禁全绿」只证逻辑闭环——好不好看/好不好玩/
// 和策划文本对不对得上，从来没人检查。故 S4/S5 门在原牙齿之上加一道**最便宜的前置**：
// 施工 session 的自证产物（策划对齐单 + 真渲染自玩截图序列）不在档 → 拒跑重活（点名「自证未做」）。
// 纯 fs 计数（不装载·不跑）——导出供 gate/board 与单测共用（compiled/builtin/cart 通用）。
export const MIN_SELFCHECK_SHOTS = 5;
export const SELFCHECK_HANDBOOK = 'docs/playbooks/self-check.md';

/** shots/ 下的截图计数（png/jpg/jpeg·递归）：手册要求「每轮都做」，按轮分子目录（shots/r1/…）是
 *  正当组织方式，不该被门罚——故递归计数；非图片文件（对齐单草稿/说明）不计。 */
function countShots(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { n += countShots(p); continue; }
    if (/\.(png|jpe?g)$/i.test(name)) n += 1;
  }
  return n;
}

/** 某关自证产物盘点：docs/design/<slug>/self-check/{SN-alignment.md, shots/}。纯 fs·无副作用。 */
export function selfCheckArtifacts(root, slug, stage) {
  const dir = join(root, 'docs', 'design', slug, 'self-check');
  const alignment = `${stage}-alignment.md`;
  const hasAlignment = existsSync(join(dir, alignment));
  const shots = countShots(join(dir, 'shots'));
  return { ok: hasAlignment && shots >= MIN_SELFCHECK_SHOTS, hasAlignment, shots, alignment, dir: `docs/design/${slug}/self-check/` };
}

/** 门拒判词（缺什么点名什么）：齐活=null 放行。导出供 gate 与单测共用。 */
export function selfCheckBlock(a, stage) {
  if (a.ok) return null;
  const owes = [];
  if (!a.hasAlignment) owes.push(`缺策划对齐单 ${a.alignment}`);
  if (a.shots < MIN_SELFCHECK_SHOTS) owes.push(`截图 ${a.shots}/${MIN_SELFCHECK_SHOTS}（真渲染自玩序列：开局→关键操作≥3→失败路径→终局→重开）`);
  return `✗ ${stage} 自证未做（见 ${SELFCHECK_HANDBOOK}）· ${owes.join(' · ')} · ${a.dir}`;
}

/** 板上自证提示（图纸②·新鲜度绑 gameHash）：产物缺=✗ 点名；产物在档但上次自证时的指纹已变=⚠ 过期
 *  **提示**（不硬拦——图可能真没变，重玩重截或在对齐单注明即可）；否则 ✓。导出供单测。 */
export function selfCheckNote(root, slug, stage, rec, freshHash) {
  const a = selfCheckArtifacts(root, slug, stage);
  if (!a.ok) return `自证 ✗ 未做（${a.hasAlignment ? `截图 ${a.shots}/${MIN_SELFCHECK_SHOTS}` : `缺 ${a.alignment}`} · 见 ${SELFCHECK_HANDBOOK}）`;
  if (rec?.gameHash && rec.gameHash !== freshHash) return `自证 ⚠ 对齐单可能过期（游戏文件已变动·重玩重截或在单中注明未变）`;
  return `自证 ✓（对齐单 + ${a.shots} 图${rec?.at ? ` @ ${String(rec.at).slice(0, 10)}` : ''}）`;
}

/** mock 债：live 行（非 retired）里 gen.mock 的计数——「mock 永不上画面」在终检关的机器化表达。无台账=0（纯免费库 placeholder 也算清账）。 */
export function mockDebt(root, slug) {
  const l = led(root, slug);
  if (!l || !Array.isArray(l.rows)) return 0;
  return l.rows.filter((r) => r.status !== 'retired' && r.gen?.mock).length;
}

/** 立项卡写入（字段级合并·只覆盖出现的字段）。CLI concept 与 /api/pipeline/concept 共用。 */
export function writeConcept(root, slug, fields) {
  const pf = readJson(pipelineFile(root, slug), { version: 1, slug, concept: {}, signoffs: {}, evidence: {} });
  for (const k of ['name', 'pitch', 'refs', 'style', 'planWaiver']) {
    if (fields[k] !== undefined) pf.concept[k] = fields[k];
  }
  (pf.history ||= []).push({ action: 'concept', at: new Date().toISOString() });
  writeJson(pipelineFile(root, slug), pf);
  return pf.concept;
}

/** 美术关子状态（复用美术平台五步条口径·纯推导）：MOCK 行不算完成——mock 永不上画面（owner 07-10）。 */
export function artSubState(root, slug) {
  const l = led(root, slug);
  if (!l || !Array.isArray(l.rows) || !l.rows.length) return { state: 'dim', detail: '无台账（美术平台进游戏自动初始化 / POST /api/art/derive）' };
  const live = l.rows.filter((r) => r.status !== 'retired');
  const mockN = live.filter((r) => r.gen?.mock).length;
  const wrote = live.filter((r) => ['replaced', 'filled', 'approved'].includes(r.status)).length;
  const ok = live.filter((r) => r.status === 'approved').length;
  const anchor = !!(l.artStyle && (l.artStyle.stylePrompt || l.artStyle.packId));
  const detail = `台账 ${live.length} 行 · 锚${anchor ? '✓' : '✗'} · 写回 ${wrote} · 复核 ${ok}${mockN ? ` · MOCK ${mockN}（不算完成）` : ''}`;
  if (ok === live.length && live.length > 0 && mockN === 0) return { state: 'ok', detail };
  if (wrote > 0 || anchor || live.some((r) => r.status !== 'placeholder' && r.status !== 'needs-art')) return { state: 'warn', detail };
  return { state: 'warn', detail }; // 有台账即已开工（placeholder 版也是流程一步）
}

// ── 复查门（REQ-QC-三门·owner 2026-07-15「每步要有其他 session 复查/自检，品质比预期低」）──
// 三门制：机器门（真跑）→ 复查门（另一 session 按 checklist 对抗性复核·落账）→ 人门（owner 签）。
// 复查适用 S2-S5/S8；S1 免（owner 亲提）；S6 免（人审内嵌美术平台逐行复核）；S7 的复查形态=评分卡（见下）。
export const REVIEW_STAGES = ['S2', 'S3', 'S4', 'S5', 'S8'];
export const REVIEW_CHECKLISTS = {
  S2: ['能力清单逐条对 registry 实名核真（无幻觉能力）', '规则面全有现成解释器（无「数据表+待写解释器」虚胖）', '游戏层代码例外逐条有 Lead 裁决', '§4.5 美术接入已答（纯程序化须申请例外）'],
  S3: ['manifest 纯 JSON（无代码走私）', '实体/组件用途与 plan 一致（无 plan 外私加系统性机制）', '落盘门真跑过（load+2tick 证据新鲜）', '组件字段无「填了但没人解释」的死数据'],
  S4: ['走查测试断言的是行为而非常量（假信心自查：故意改坏被测逻辑应变红）', '核心循环闭环：开局→行动→反馈→终局→可重开', '失败路径有测试（非法输入被拒/终局判定不误报）', '确定性：同 seed 同结果有断言', '验收剧本作者=GD 非 PE：每本剧本首注释行 `// author: <角色>`（REQ-C-108④ Lead 2026-08-18 裁——全 session 同 git 署名下 blame 分不出角色，author 行=归属唯一凭据；新写/改动的剧本缺行=打回·存量随下次改动补齐；PE 自写剧本=FAIL·REQ-ACCEPT 循环律）', '附真浏览器试玩截图序列（开局→N 步→终局→重开·非仅 CLI 绿）', '自证对齐单抽样重走 ≥3 条（含 ⚠降格行的裁决去向核对）+ 好玩三问已作答非敷衍（docs/playbooks/self-check.md）', '**玩家视角复核八问**已逐条作答（含第 8 问归属+时效：屏上每样东西玩家知道是谁的、哪一刻的·docs/playbooks/self-check.md）', '**递归复核**跑过且零裸奔（逐条款打坏实现→必须有剧本转红·无人红的条款=剧本是摆设·docs/playbooks/testing.md）', 'UI 货架**选型**逛过（house 主题 / @ui/starters / 按品类挑成熟件）——选型定信息层级属结构归 S4，观感精修归 S5（owner 2026-08-07·两层 1:1 律）', '有对手/敌人 AI 的游戏：**AI 设定在档**（capability-plan §4.65 摘要 + docs/design/<slug>/ 详设·初版可基本·迭代同步更新·owner 2026-08-10「有 AI 必须有 AI 设定」）+ AI 行为有点名测试（手册 docs/playbooks/opponent-ai.md）'],
  S5: ['UI 全走 LayoutNode/引擎渲染（无手写 DOM 逃生）', 'audit 零新增红旗（棘轮绿）', '/check-ui 四关过（重叠/对比度/透明度/布局）', '交互可发现（按钮可见可点·不靠猜）', '**只换皮不动布局**——布局在 S4 已冻结；S5 动布局=返工（owner 2026-08-07·两层 1:1 律）', '自证对齐单抽样重走 ≥3 条（含 ⚠降格行的裁决去向核对）+ 好玩三问已作答非敷衍（docs/playbooks/self-check.md）'],
  S8: ['三绿证据绑当前 HEAD 且净树', '本游戏走查在全量并发下仍绿（非单跑侥幸）', '复盘：本次撞到的手册缺口已回填或提单'],
};
// S7 评分卡（docs/playbooks/visual-scorecard.md 八维·0-3 分·premium=全维≥2·无证据不给分）。
export const SCORECARD_DIMS = ['艺术方向', '主角面', '世界密度', '材质', '渲染管线', 'VFX', 'UI美术', '性能证据'];

/** 复查记录评估：无=dim；FAIL=fail；指纹过期=stale；CONCERNS=有条件过（ok·⚠标注）；PASS=ok。导出供单测。 */
export function evalReview(rv, freshHash, freshGapsHash, stage) {
  if (!rv) return { state: 'dim', detail: '未复查（checklist 打单 → 另开 session 复核 → review 落账）' };
  const when = (rv.at || '').slice(0, 16).replace('T', ' ');
  if (stage === 'S2') {
    if (!rv.reviewHash) return { state: 'stale', detail: `⚠ 复查记录缺少 S2 reviewHash（旧记录需重新复查一次）· 上次 ${rv.verdict} @ ${when}` };
    if (rv.reviewHash !== freshHash) return { state: 'stale', detail: `⚠ 复查过期（S2 策划/能力输入已变动·须重查）· 上次 ${rv.verdict} @ ${when}` };
  } else if (rv.gameHash && rv.gameHash !== freshHash) {
    return { state: 'stale', detail: `⚠ 复查过期（游戏文件已变动·须重查）· 上次 ${rv.verdict} @ ${when}` };
  }
  // 缺口台账变动 → S2 复查过期（台账不入 gameHash·见 gapsHash 注释）。旧复查记录无该字段=不判过期（零回归）。
  if (freshGapsHash !== undefined && rv.gapsHash !== undefined && rv.gapsHash !== freshGapsHash) {
    return { state: 'stale', detail: `⚠ 复查过期（**缺口台账已变动**·须重查——改一条 state 就能解开缺口锁，故复查必须重来）· 上次 ${rv.verdict} @ ${when}` };
  }
  if (rv.verdict === 'FAIL') return { state: 'fail', detail: `✗ FAIL by ${rv.by} @ ${when} · ${String(rv.note).slice(0, 80)}` };
  const tag = rv.verdict === 'CONCERNS' ? '⚠ CONCERNS（有条件过）' : '✓ PASS';
  return { state: 'ok', detail: `${tag} by ${rv.by} @ ${when} · ${String(rv.note).slice(0, 80)}` };
}

/** 评分卡评估（S7 机器门）：未打=dim；过期=stale；任一维 0=fail；全维≥2=ok(PREMIUM YES)；否则 warn。导出供单测。 */
export function evalScorecard(sc, freshHash) {
  if (!sc || !sc.scores) return { state: 'dim', detail: '评分卡未打（scorecard 子命令·由复查人执行·八维 0-3·无证据不给分）' };
  const when = (sc.at || '').slice(0, 16).replace('T', ' ');
  if (sc.gameHash && sc.gameHash !== freshHash) return { state: 'stale', detail: `⚠ 评分过期（游戏文件已变动·须重评）· 上次 ${sc.total}/24 @ ${when}` };
  const vals = SCORECARD_DIMS.map((d) => sc.scores[d] ?? 0);
  const total = vals.reduce((a, b) => a + b, 0);
  const zeros = SCORECARD_DIMS.filter((d) => (sc.scores[d] ?? 0) === 0);
  const premium = vals.every((v) => v >= 2);
  const verdict = `VISUAL: ${total}/24 · PREMIUM: ${premium ? 'YES' : 'NO'}（by ${sc.by} @ ${when}）`;
  if (zeros.length) return { state: 'fail', detail: `✗ ${verdict} · ${zeros.join('/')}=0 分（缺失/敷衍）` };
  if (premium) return { state: 'ok', detail: `✓ ${verdict}` };
  return { state: 'warn', detail: `⚠ ${verdict} · 未达全维≥2（短板决定观感）` };
}

/** 机器门证据评估：无证据=dim；exit≠0=fail；指纹过期=stale；否则 ok。 */
function evalEvidence(ev, freshHash, headNow) {
  if (!ev) return { state: 'dim', detail: '未跑（gate 跑一次落证据）' };
  const when = (ev.at || '').slice(0, 16).replace('T', ' ');
  if (ev.exit !== 0) return { state: 'fail', detail: `✗ 未过（exit ${ev.exit} @ ${when}）${ev.summary ? ' · ' + ev.summary : ''}` };
  if (ev.gameHash && ev.gameHash !== freshHash) return { state: 'stale', detail: `⚠ 证据过期（游戏文件已变动·须重跑）· 上次绿 @ ${when}` };
  if (ev.head && (ev.head !== headNow || ev.dirty)) return { state: 'stale', detail: `⚠ 证据过期（${ev.dirty ? '跑时工作树不净' : '仓库已前进'}）· 上次绿 @ ${when}` };
  return { state: 'ok', detail: `✓ 过（@ ${when}）${ev.summary ? ' · ' + ev.summary : ''}` };
}

/** 看板推导（读盘+轻推导·不跑重活）。绿=机器 ok/免 + 人门 ok；任何一边欠=黄；机器 fail=红。 */
export function boardFor(root, slug) {
  const form = detectForm(root, slug);
  if (!form) return { ok: false, error: `未知游戏: ${slug}（library/public/src 三处均无）` };
  const pf = readJson(pipelineFile(root, slug), { version: 1, slug, concept: {}, signoffs: {}, evidence: {} });
  const hashNow = gameHash(root, slug);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim() || '';
  const c = pf.concept || {};
  const hasTests = form !== 'cart' && existsSync(join(root, 'games', slug))
    && readdirSync(join(root, 'games', slug)).some((f) => f.endsWith('.test.ts'));
  const planFile = join(root, 'docs', 'design', slug, 'capability-plan.md');
  // 缺口台账（REQ-S18PANEL②③）：**板上现算**（不读证据）——缺口台账已被排除出 gameHash，
  // 若改走证据就再没有东西替它标过期；现算则「把缺口标 delivered」下一次 board 立刻反映。
  const gapsRes = readCapabilityGaps(root, slug);
  const gapEval = evalCapabilityGaps(gapsRes);
  const gapsNow = gapsHash(root, slug);   // S2 复查记录的新鲜度锚（台账不入 gameHash·见 gapsHash）

  const stages = STAGES.map((st) => {
    let machine;
    switch (st.id) {
      case 'S1':
        machine = c.name && c.pitch
          ? { state: 'ok', detail: `${c.name} —— ${String(c.pitch).slice(0, 40)}` }
          : { state: 'dim', detail: '立项卡未填（concept 子命令：--name --pitch）' };
        break;
      case 'S2': {
        // 机器门 = 能力计划在档 ∧ 缺口全已裁决（gap-check·REQ-S18PANEL②）。plan 都没有=灰（原样）；
        // plan 在档则由缺口台账定色：全裁=绿 · 有未裁=⚠ · 台账不合法=红。
        const planDetail = existsSync(planFile) ? 'capability-plan.md 在档'
          : c.planWaiver ? `纯数据卡带免正式 plan（裁决在案：${String(c.planWaiver).slice(0, 40)}）` : null;
        machine = planDetail === null
          ? { state: 'dim', detail: '无能力计划也无免 plan 裁决（模板见手册列）' }
          : { state: gapEval.state, detail: `${planDetail} · ${gapEval.detail}` };
        break;
      }
      case 'S3':
        // R1（REQ-RENDERCHECK）：编译期游戏免 manifest 校验，但 gate 现在追加跑渲染探针——
        // 有证据（跑过）就照实证据走（ok/fail/stale）；从未跑过才显示「免」的旧提示（未跑≠免责）。
        machine = evalEvidence(pf.evidence?.S3, hashNow, head);
        if (machine.state === 'dim' && !manifestPath(root, slug, form)) {
          machine.detail = '编译期游戏免 manifest 校验·渲染探针未跑（gate 跑一次落证据）';
        }
        break;
      case 'S4': {
        machine = evalEvidence(pf.evidence?.S4, hashNow, head);
        const nScen = acceptanceScenarioCount(root, slug);
        const scenNote = `验收剧本 ${nScen}/${MIN_ACCEPTANCE_SCENARIOS}${nScen < MIN_ACCEPTANCE_SCENARIOS ? '（GD 补）' : ' ✓'}`;
        if (machine.state === 'dim') machine.detail = form === 'cart' ? `未跑（gate=bench 五轴 + ${scenNote}）` : hasTests ? `未跑（gate=该游戏 vitest + ${scenNote}）` : `✗ 无 walkthrough 测试（testing.md：先补测试再谈玩法完成）· ${scenNote}`;
        if (machine.state === 'dim' && form !== 'cart' && !hasTests) machine.state = 'fail';
        machine.detail += ` · ${selfCheckNote(root, slug, 'S4', pf.selfCheck?.S4, hashNow)}`;
        break;
      }
      case 'S5':
        machine = form === 'cart'
          ? { state: 'ok', detail: '纯数据卡带无游戏层代码（LayoutNode 纪律天然满足）' }
          : evalEvidence(pf.evidence?.S5, hashNow, head);
        // 卡带 S5 本就免审计（无游戏层代码）→ 不加自证前置；其余形态板上常显自证态（缺=✗·陈旧=⚠）。
        if (form !== 'cart') machine.detail += ` · ${selfCheckNote(root, slug, 'S5', pf.selfCheck?.S5, hashNow)}`;
        break;
      case 'S6':
        machine = artSubState(root, slug);
        break;
      case 'S7':
        machine = evalScorecard(pf.scorecard, hashNow); // 品质关机器牙齿=评分卡落账（REQ-QC-三门）
        break;
      case 'S8':
        machine = evalEvidence(pf.evidence?.S8, hashNow, head);
        if (machine.state === 'dim') machine.detail = form === 'cart' ? '未跑（gate=manifest-check+bench+MOCK 清账·卡带轻量终检）' : '未跑（gate=tsc+vitest+build 三绿）';
        break;
      default:
        machine = { state: 'dim', detail: '' };
    }
    // 复查门（REQ-QC-三门）：S2-S5/S8=另一 session 按 checklist 复核落账；S1/S6/S7 各有豁免语义。
    const review = st.id === 'S1' ? { state: 'ok', detail: '免（立项=owner 亲提·无需复查）' }
      : st.id === 'S6' ? { state: 'ok', detail: '免（复核已内嵌美术平台逐行 ☑）' }
        : st.id === 'S7' ? { state: machine.state === 'ok' || machine.state === 'warn' ? 'ok' : 'dim', detail: '复查形态=评分卡本身（复查人打分·机器门即其判词）' }
          : evalReview(pf.reviews?.[st.id], stageReviewHash(root, slug, st.id), st.id === 'S2' ? gapsNow : undefined, st.id);
    const so = pf.signoffs?.[st.id];
    // S6 人门已内嵌美术平台逐行 approve（不设重复签核）；其余阶段一律要 signoff。
    const human = st.id === 'S6'
      ? { state: machine.state === 'ok' ? 'ok' : 'dim', detail: '人门=平台逐行 ☑ 复核（已内嵌·不另签）' }
      : so
        ? { state: 'ok', detail: `✓ ${so.by || '人审'} @ ${(so.at || '').slice(0, 10)}${so.note ? ' · ' + String(so.note).slice(0, 60) : ''}` }
        : { state: 'dim', detail: '待人审（signoff 落账）' };
    const reviewExempt = ['S1', 'S6', 'S7'].includes(st.id);
    const status = machine.state === 'fail' || review.state === 'fail' ? 'fail'
      : machine.state === 'ok' && review.state === 'ok' && human.state === 'ok' ? 'ok'
        : machine.state === 'dim' && human.state === 'dim' && (reviewExempt || review.state === 'dim') ? 'dim' : 'warn';
    // 乱序放行痕（F·REQ-GATE-硬化）：该关曾在前置未全绿时被 --out-of-order 放行——板上显 ⚠乱序标。
    // 旧 pipeline.json 无 outOfOrder 字段=零回归（取最近一条）。
    const ooo = (pf.outOfOrder || []).filter((o) => o.stage === st.id);
    const outOfOrder = ooo.length ? ooo[ooo.length - 1] : null;
    // 缺口锁（REQ-S18PANEL③）：本关被哪几条未交付的 P0/P1 缺口卡住（空=不卡·面板据此画 🔒）。
    const blockedBy = blockingGaps({ gaps: gapsRes.gaps }, st.id);
    return { id: st.id, title: st.title, handbook: st.handbook, gate: st.gate, machine, review, human, status, outOfOrder, blockedBy };
  });
  // A later implementation stage naturally changes the shared game tree. When an earlier stage
  // was already three-gate-approved, show the latest active stage instead of sending the board
  // backwards to re-do a superseded review snapshot.
  const latestActiveStage = [...stages].reverse().find((s) => s.machine.state !== 'dim')?.id;
  const reopened = pf.reopen?.stage ? stages.find((s) => s.id === pf.reopen.stage) : null;
  // A deliberate reopen is an owner decision to re-verify this stage. Its predecessor may be
  // stale only because that later implementation changed the shared tree, so keep the board on
  // the reopened stage until it receives a fresh signoff.
  const next = reopened && reopened.status !== 'ok' ? reopened : stages.find((s) => s.status !== 'ok'
    && !(latestActiveStage && canAdvancePastApprovedStaleReview(s, latestActiveStage)));
  // gaps/gapErrors 上板供面板直接渲染（「展示 + 跳转到工单」——面板不做缺口的编辑/裁决 UI，
  // 裁决仍走既有协议）。旧游戏无台账 → gaps=[]·gapErrors=[]（零回归）。
  return { ok: true, slug, form, gameHash: hashNow, concept: c, stages, gaps: gapsRes.gaps, gapErrors: gapsRes.errors, next: next ? next.id : null };
}

// ── 阶段顺序闸（F·REQ-GATE-硬化·owner「跳关可以，但从悄悄跳变记录在案」）─────────────
/** 目标阶段之前（S1..S(N-1)）里所有非绿（status≠ok）的关，连同各关欠的门（机器/复查/人）。
 *  空数组=前置全绿·可直跑。导出供 CLI 与单测共用（纯函数·不碰盘）。 */
export function priorGaps(board, stage) {
  const idx = STAGES.findIndex((s) => s.id === stage);
  if (idx <= 0) return []; // S1 或未知阶段：无前置
  const gaps = [];
  for (const st of (board?.stages || []).slice(0, idx)) {
    if (canAdvancePastApprovedStaleReview(st, stage)) continue;
    if (st.status === 'ok') continue;
    const owes = [];
    if (st.machine?.state !== 'ok') owes.push(`机器门(${st.machine?.state ?? '?'})`);
    if (st.review?.state !== 'ok') owes.push(`复查门(${st.review?.state ?? '?'})`);
    if (st.human?.state !== 'ok') owes.push(`人门(${st.human?.state ?? '?'})`);
    gaps.push({ id: st.id, title: st.title, owes });
  }
  return gaps;
}

/** Later implementation stages share the same game tree. An earlier three-gate-approved handoff
 * remains a valid predecessor when later-stage work naturally stales its source snapshot. Missing,
 * failed or unsigned reviews are never waived. */
function canAdvancePastApprovedStaleReview(stageState, targetStage) {
  const from = STAGES.findIndex((stage) => stage.id === stageState?.id);
  const to = STAGES.findIndex((stage) => stage.id === targetStage);
  return from >= 0
    && to > from
    && stageState.machine?.state === 'stale'
    && stageState.review?.state === 'stale'
    && stageState.human?.state === 'ok';
}

// ── 复查前置硬闸（owner 2026-08-10 令「每步开工前，上一步必须已被不同 agent 真复查」）──
/** 已施工未复查清单：目标阶段之前，凡机器门已过（ok/warn/stale=建过）而复查门未过的关（dim=没查·
 *  stale=游戏变了没重查·fail=查了红着）。这类欠账**不可被 --out-of-order 自赦**——复查门是唯一
 *  不能由施工方自己豁免的门（game108 曾 S2-S5 复查全空跑到 S7 的通道就是自助跳关）。
 *  未施工的前置（machine dim/fail）仍走老规矩：跳关可以但记账（「从悄悄跳变记录在案」不动）。导出供单测。 */
export function reviewPrereqGaps(board, stage) {
  const idx = STAGES.findIndex((s) => s.id === stage);
  if (idx <= 0) return [];
  const gaps = [];
  for (const st of (board?.stages || []).slice(0, idx)) {
    if (canAdvancePastApprovedStaleReview(st, stage)) continue;
    const built = ['ok', 'warn', 'stale'].includes(st.machine?.state);
    if (built && st.review?.state !== 'ok') gaps.push({ id: st.id, title: st.title, state: st.review?.state ?? '?', detail: st.review?.detail ?? '' });
  }
  return gaps;
}

/** 顺序闸判定：①本关被未交付的 P0/P1 能力缺口锁住 → 一律拒跑（REQ-S18PANEL③·理由不放行）；
 *  ②前置里有「已施工未复查」→ 一律拒跑（reviewGaps 非空·理由不放行）；
 *  ③其余欠账：无欠→allowed；有欠且给了 --out-of-order 理由→allowed+落痕；有欠无理由→拒跑。
 *
 *  缺口锁为什么不给 --out-of-order 自赦：缺口=「引擎现在表达不了这件事」。跳过去施工，唯一的
 *  产出方式就是在游戏层写逃生代码（手写 system / 手写 DOM / 自造解释器）——正是宪法要治的病。
 *  等不了就把缺口降级/回驳（state=wontfix，附等价数据写法），那是裁决，不是放行。 */
export function orderGate(board, stage, reason) {
  const blockedBy = blockingGaps(board, stage);
  const reviewGaps = reviewPrereqGaps(board, stage);
  const gaps = priorGaps(board, stage);
  if (blockedBy.length) return { allowed: false, gaps, reviewGaps, blockedBy };
  if (reviewGaps.length) return { allowed: false, gaps, reviewGaps };
  if (!gaps.length) return { allowed: true, gaps: [] };
  const r = (reason || '').trim();
  if (r) return { allowed: true, gaps, outOfOrder: { stage, reason: r.slice(0, 200), at: new Date().toISOString() } };
  return { allowed: false, gaps };
}

// ── 机器门执行（gate 子命令·真跑·记证据）──────────────────────────────
// Windows exposes npm executables as .cmd shims, which spawnSync cannot execute directly.
// Invoke the installed ESM CLIs through Node instead of relying on a shell to resolve npx.
const run = (cmd, args, opts = {}) => {
  if (cmd === 'npx' && args[0] === 'vite-node') {
    return spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite-node', 'vite-node.mjs'), ...args.slice(1)], { cwd: ROOT, encoding: 'utf8', timeout: 900_000, ...opts });
  }
  if (cmd === 'npx' && args[0] === 'vitest') {
    return spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), ...args.slice(1)], { cwd: ROOT, encoding: 'utf8', timeout: 900_000, ...opts });
  }
  if (cmd === 'npx' && args[0] === 'tsc') {
    return spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), ...args.slice(1)], { cwd: ROOT, encoding: 'utf8', timeout: 900_000, ...opts });
  }
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 900_000, ...opts });
};

/** R1 探针门读码（REQ-RENDERCHECK）：探针 exit 0=过·3=环境无浏览器（不算红·权威判定以有浏览器
 *  环境为准）·其余（1/2/…）=红。纯函数（不碰盘/不 spawn）——导出供单测直接灌各退出码，
 *  不必真起浏览器就能验「S3 门怎么读探针退出码」这条接线逻辑本身对不对。 */
export function interpretRenderProbe(baseSummary, probeExit, probeTail) {
  if (probeExit === 3) return { exit: 0, summary: `${baseSummary} · ⚠ 渲染探针未跑·环境无浏览器（权威判定以有浏览器环境为准）` };
  if (probeExit === 0) return { exit: 0, summary: `${baseSummary} · ✓ 渲染探针过（截图 public/games/<slug>/probe/S3-render.png）` };
  return { exit: 1, summary: `${baseSummary} · ✗ 渲染探针未过${probeTail ? ' · ' + probeTail : ''}` };
}

/** REQ-S3CLICK·点击门读码：0=过 · 3=环境无浏览器（同 R1/R3 语义·不算红）· 其余=红。
 *  纯函数（不碰盘/不 spawn）——导出供单测直接灌各退出码，不必真起浏览器就能验「门怎么读」。 */
export function interpretClickGate(baseSummary, clickExit, clickTail) {
  if (clickExit === 3) return { exit: 0, summary: `${baseSummary} · ⚠ 点击门未跑·环境无浏览器` };
  // 探针自己的那句已经带「✓ 点击打穿（…）」，这里只剥掉 `[click-probe] <slug> ` 前缀直接接上，
  // 别再套一层自己的措辞——套了就成「✓ 点击打穿（✓ 点击打穿（…））」（实测出来的重复）。
  const tail = (clickTail || '').replace(/^\[click-probe\]\s*\S+\s*/, '').trim();
  if (clickExit === 0) return { exit: 0, summary: `${baseSummary} · ${tail || '✓ 点击打穿'}` };
  return { exit: 1, summary: `${baseSummary} · ✗ 点击门未过${clickTail ? ' · ' + clickTail : ''}` };
}

/** R3 标准照比对门读码（REQ-RENDERCHECK）：compare exit 0=过·3=环境无浏览器（同 R1 语义·不算红）
 *  ·其余=红（提示「有意变更请 bless」——漂移未必是 bug，也可能是真改动没走 bless 转正）。
 *  纯函数（不碰盘/不 spawn）——导出供单测直接灌各退出码。 */
export function interpretGoldenCompare(baseSummary, compareExit, compareTail) {
  if (compareExit === 3) return { exit: 0, summary: `${baseSummary} · ⚠ 标准照比对未跑·环境无浏览器（权威判定以有浏览器环境为准）` };
  if (compareExit === 0) return { exit: 0, summary: `${baseSummary} · ✓ 标准照比对过（golden-shot compare）` };
  return { exit: 1, summary: `${baseSummary} · ✗ 标准照漂移（有意变更请 golden-shot capture+bless 转正）${compareTail ? ' · ' + compareTail : ''}` };
}

/** R2b 走查探针门读码（REQ-RENDERCHECK）：探针 exit 0=过·3=环境无浏览器（不算红）·其余=红。
 *  纯函数（不碰盘/不 spawn）——导出供单测直接灌各退出码。判红只认「真出错」（装载失败/驱动点击后
 *  控制台 error/未捕获异常/零验收剧本）——UI 可驱动率低是诚实发现（剧本 signal 词表与 UI 词表本就
 *  不同源），不拿它当红线（同 spec-trace-guard.mjs「human 型占比」先例：报告不设阈值门）。 */
export function interpretUiWalkthrough(baseSummary, probeExit, probeTail) {
  if (probeExit === 3) return { exit: 0, summary: `${baseSummary} · ⚠ UI 走查未跑·环境无浏览器（权威判定以有浏览器环境为准）` };
  if (probeExit === 0) return { exit: 0, summary: `${baseSummary} · ✓ UI 走查过（可驱动率见 public/games/<slug>/probe/S4-uiwalk.json）` };
  return { exit: 1, summary: `${baseSummary} · ✗ UI 走查未过${probeTail ? ' · ' + probeTail : ''}` };
}

/** S4 门收尾（REQ-RENDERCHECK R2b）：conformance（+ bench/walkthrough）已绿才追加真界面走查——
 *  base 已红不必再跑（省时间·结论不变）。SANDBOXED 根跳过（无真 app 可连·同 R1/R3 先例——
 *  game-pipeline.test.mjs 的沙盒 fixture 从不会真跑到这一步，故对既有测试零影响）。 */
function withUiWalkthroughGate(slug, base) {
  if (base.exit !== 0 || SANDBOXED) return base;
  const script = join(dirname(fileURLToPath(import.meta.url)), 'ui-walkthrough-probe.mjs');
  const probe = run('node', [script, '--game', slug]);
  const tail = (probe.stdout || probe.stderr || '').trim().split('\n').slice(-2).join(' / ').slice(0, 200);
  return interpretUiWalkthrough(base.summary, probe.status ?? 1, tail);
}

/** S5/S8 门收尾（REQ-RENDERCHECK R3）：base 门（audit/三绿等）已过才追加标准照比对——base 已红
 *  不必再跑（省时间·结论不变）。无 blessed 基准＝⚠ 提示不拦（golden-shot bless 建基准前，标准照
 *  比对对该游戏是可选项非硬门）；有基准则真起服跑 compare 子进程按 interpretGoldenCompare 读码。
 *  SANDBOXED 根跳过（同 R1 SANDBOXED 语义——沙盒测试根无真 app 可连）。 */
function withGoldenGate(slug, base, stage) {
  if (base.exit !== 0 || SANDBOXED) return base;
  const prefix = stage === 'S5' ? 's5-' : undefined;
  const ledger = readLedger(ROOT, slug);
  const currentHash = gameHash(ROOT, slug);
  const states = blessedStates(ROOT, slug, { prefix }).filter(
    (state) => ledger.states[state]?.gameHash === currentHash,
  );
  if (!states.length) {
    return { exit: 0, summary: `${base.summary} · ⚠ 无当前版本标准照基准·未比对（golden-shot capture+bless 建基准）` };
  }
  const script = join(dirname(fileURLToPath(import.meta.url)), 'golden-shot.mjs');
  for (const state of states) {
    const cmp = run('node', [script, 'compare', '--game', slug, '--state', state]);
    const tail = (cmp.stdout || cmp.stderr || '').trim().split('\n').slice(-2).join(' / ').slice(0, 200);
    const judged = interpretGoldenCompare(base.summary, cmp.status ?? 1, tail);
    if (judged.exit !== 0) return judged;
  }
  return { exit: 0, summary: `${base.summary} · ✓ 当前版本标准照比对过（${states.join(', ')}）` };
}

function gateRun(slug, stage, form) {
  if (stage === 'S2') {
    // gap-check（REQ-S18PANEL②）：纯 fs·秒回·不 spawn 任何重活。与 board 的 S2 分支同一只嘴
    // （evalCapabilityGaps），故「面板上按一下」与「板上看一眼」永远不会给出两种说法。
    const pf = readJson(pipelineFile(ROOT, slug), {});
    const hasPlan = existsSync(join(ROOT, 'docs', 'design', slug, 'capability-plan.md'));
    if (!hasPlan && !pf.concept?.planWaiver) {
      return { exit: 1, summary: '✗ 无能力计划也无免 plan 裁决（模板 docs/design/capability-plan-template.md·纯数据卡带走 concept --plan-waiver）' };
    }
    const ev = evalCapabilityGaps(readCapabilityGaps(ROOT, slug));
    // ⚠（有未裁决缺口）在门这一侧就是红——「不许带未裁决的缺口往下走」。板上仍显 ⚠（待办非错误）。
    return { exit: ev.state === 'ok' ? 0 : 1, summary: `${hasPlan ? 'capability-plan.md 在档' : '免 plan 裁决在案'} · ${ev.detail}` };
  }
  if (stage === 'S3') {
    const mf = manifestPath(ROOT, slug, form);
    let baseSummary;
    if (mf) {
      const r = run('npx', ['vite-node', 'scripts/manifest-check.mjs'], { input: readFileSync(mf, 'utf8') });
      if ((r.status ?? 1) !== 0) return { exit: r.status ?? 1, summary: (r.stderr || r.stdout || '').trim().slice(0, 300) };
      baseSummary = 'parse+引擎装载（load+2tick）零 error';
    } else {
      baseSummary = '编译期游戏免 manifest 校验';
    }
    // R1·渲染冒烟探针接线（REQ-RENDERCHECK）：现有检查（manifest-check 或编译期免检）过了才追加跑——
    // 证明「画面真画得出」而非只「逻辑跑得动」。沙盒临时根（见 SANDBOXED 定义）下跳过（无真 app 可连）。
    if (!SANDBOXED) {
      const here = dirname(fileURLToPath(import.meta.url));
      const probe = run('node', [join(here, 'render-probe.mjs'), '--game', slug]);
      const probeTail = (probe.stdout || probe.stderr || '').trim().split('\n').slice(-2).join(' / ').slice(0, 200);
      const rendered = interpretRenderProbe(baseSummary, probe.status ?? 1, probeTail);
      if (rendered.exit !== 0) return rendered;
      // REQ-S3CLICK（owner 2026-08-07 判 A）·「点击打穿」门：画得出 ≠ 点得动。
      // 渲染探针一次都不点，于是「按钮画得好看但点了没反应」能一路绿着过 S3
      // （game108 实测踩到两发·都不报错）。**S3 只问「信号打得穿吗」**，
      // 「规则对不对」仍归 S4 验收剧本。存量游戏在 click-probe 的可见豁免名单里（owner 明示不回溯）。
      const click = run('node', [join(here, 'click-probe.mjs'), '--game', slug]);
      const clickTail = (click.stdout || click.stderr || '').trim().split('\n').slice(-2).join(' / ').slice(0, 240);
      return interpretClickGate(rendered.summary, click.status ?? 1, clickTail);
    }
    return { exit: 0, summary: baseSummary };
  }
  if (stage === 'S4') {
    // 图纸④·验收剧本存在性门（compiled/卡带通用·先查最便宜的）：<3 场景直接拒，不空转跑重活。
    const nScen = acceptanceScenarioCount(ROOT, slug);
    if (nScen < MIN_ACCEPTANCE_SCENARIOS) {
      return { exit: 1, summary: `✗ 验收剧本不足（GD 补·需≥${MIN_ACCEPTANCE_SCENARIOS}·现 ${nScen}）· docs/design/${slug}/acceptance/*.scenario.jsonc` };
    }
    // REQ-SELFCHECK·图纸①·自证产物存在性（同为 spawn 前的纯 fs 前置·缺=拒跑不空转）：
    // 「先过自己这关」——对齐单 + 真渲染截图序列在档才许送机器门/复查门（手册 self-check.md）。
    const scBlock = selfCheckBlock(selfCheckArtifacts(ROOT, slug, 'S4'), 'S4');
    if (scBlock) return { exit: 1, summary: scBlock };
    // conformance：真引擎逐 step 对账 GD 剧本（无 adapter/断言不过=非零退出）。
    // 脚本用绝对路径 + 显式对齐 runner 的根（Lead 验收加固：ROOT 被测试注入临时根时，
    // 相对路径以 cwd=临时根解析不到脚本、runner 又按自身位置定根——两处都会错位成崩溃式落红）。
    // ZEROCRAFT_ACCEPTANCE_CLI=1（旧名 APOLLO_ACCEPTANCE_CLI）是 CLI 握手：VITEST 变量会穿透嵌套
    // spawn 使 runner 误判被 import 而静默退 0（conformance 假绿）——显式握手封死该路径。
    const accScript = join(dirname(fileURLToPath(import.meta.url)), 'acceptance-run.mjs');
    const acc = run('npx', ['vite-node', accScript, '--game', slug], { env: { ...process.env, ZEROCRAFT_ACCEPTANCE_ROOT: ROOT, ZEROCRAFT_ACCEPTANCE_CLI: '1' } });
    const accTail = (acc.stdout || acc.stderr || '').trim().split('\n').slice(-3).join(' / ').slice(0, 200);
    if ((acc.status ?? 1) !== 0) return { exit: acc.status ?? 1, summary: `✗ 验收剧本 conformance 未过（${nScen} 场景）· ${accTail}` };
    if (form === 'cart') {
      const mf = manifestPath(ROOT, slug, form);
      const r = run('npx', ['vite-node', 'scripts/bench-manifest.mjs'], { input: readFileSync(mf, 'utf8') });
      let pass = false, score = '?';
      try { const j = JSON.parse((r.stdout || '').trim().split('\n').pop()); pass = !!j.pass; score = j.score; } catch { /* 输出非 JSON 即失败 */ }
      if (!pass) return { exit: 1, summary: `✗ bench 五轴 score=${score}` };
      return withUiWalkthroughGate(slug, { exit: 0, summary: `bench 五轴 score=${score} · 验收剧本 ${nScen} 场景绿` });
    }
    const r = run('npx', ['vitest', 'run', `games/${slug}/`]);
    const tail = (r.stdout || '').trim().split('\n').filter((l) => /Tests|Test Files/.test(l)).join(' · ');
    if ((r.status ?? 1) !== 0) return { exit: r.status ?? 1, summary: `✗ walkthrough · ${tail.slice(0, 160) || (r.stderr || '').slice(0, 160)}` };
    return withUiWalkthroughGate(slug, { exit: 0, summary: `walkthrough 绿（${tail.slice(0, 120)}）· 验收剧本 ${nScen} 场景绿` });
  }
  if (stage === 'S5') {
    // R3（REQ-RENDERCHECK）：S5 收尾一律经 withGoldenGate——它自己在 base.exit≠0 时原样透传，
    // 故这里两条路径（cart 免审计的即时过 / 非 cart 的 audit 结果）都直接包一层，不必分叉判断。
    if (form === 'cart') return withGoldenGate(slug, { exit: 0, summary: '纯数据卡带免审计' }, 'S5');
    // REQ-SELFCHECK·图纸①（UI 关同款前置·spawn audit 前的纯 fs 检查）：
    // UI 好不好看/交互顺不顺，audit 判不了——自证对齐单 + 真渲染截图序列在档才许跑。
    const scBlock5 = selfCheckBlock(selfCheckArtifacts(ROOT, slug, 'S5'), 'S5');
    if (scBlock5) return { exit: 1, summary: scBlock5 };
    const r = run('node', ['scripts/game-skill-audit.mjs', slug]);
    const verdict = (r.stdout || '').split('\n').filter((l) => /^(AUDIT|RATCHET):/.test(l)).join(' · ');
    return withGoldenGate(slug, { exit: r.status ?? 1, summary: verdict || (r.stderr || '').slice(0, 200) }, 'S5');
  }
  if (stage === 'S8') {
    if (form === 'cart') {
      // 卡带轻量终检（REQ-WORKSHOP C2·Lead 裁决）：纯数据卡带不背全仓门——
      // mock 债清零（「mock 永不上画面」的终检表达）∧ 完整性（manifest-check）∧ 可玩健康（bench 五轴）。
      // 债最便宜先查（不给 mock 未清的卡带白跑重门）。
      const debt = mockDebt(ROOT, slug);
      if (debt > 0) return { exit: 1, summary: `✗ MOCK 债 ${debt} 行未清（mock 不算真图·重生成或清账后再终检）` };
      const mf = manifestPath(ROOT, slug, form);
      const chk = run('npx', ['vite-node', 'scripts/manifest-check.mjs'], { input: readFileSync(mf, 'utf8') });
      if ((chk.status ?? 1) !== 0) return { exit: chk.status ?? 1, summary: `✗ manifest-check · ${(chk.stderr || chk.stdout || '').trim().slice(0, 200)}` };
      const b = run('npx', ['vite-node', 'scripts/bench-manifest.mjs'], { input: readFileSync(mf, 'utf8') });
      let pass = false, score = '?';
      try { const j = JSON.parse((b.stdout || '').trim().split('\n').pop()); pass = !!j.pass; score = j.score; } catch { /* 输出非 JSON 即失败 */ }
      if (!pass) return { exit: 1, summary: `✗ bench 五轴 score=${score}` };
      // R3（REQ-RENDERCHECK）收尾：三项已绿才追加标准照比对——中途任一红已提前 return，不会到这里。
      return withGoldenGate(slug, { exit: 0, summary: `cart 终检：MOCK 0 · manifest-check=0 · bench score=${score}` });
    }
    const steps = [
      ['npx', ['tsc', '--noEmit']],
      ['npx', ['vitest', 'run', '--silent']],
      ['npm', ['run', 'build']],
    ];
    const parts = [];
    for (const [cmd, args] of steps) {
      const r = run(cmd, args);
      parts.push(`${args[0]}=${r.status ?? 1}`);
      if ((r.status ?? 1) !== 0) {
        const diagnostics = (r.stderr || r.stdout || r.error?.message || '').trim().slice(0, 200);
        return { exit: r.status ?? 1, summary: `✗ ${parts.join(' ')} · ${diagnostics}` };
      }
    }
    // R3（REQ-RENDERCHECK）收尾：tsc+vitest+build 三绿才追加标准照比对。
    return withGoldenGate(slug, { exit: 0, summary: `tsc+vitest+build 三绿（${parts.join(' ')}）` });
  }
  return { exit: 1, summary: `阶段 ${stage} 无机器门` };
}

// ── CLI ─────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, slug, a3] = process.argv.slice(2);
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (!cmd || !slug) { console.error('用法: game-pipeline.mjs <board|gate|checklist|review|scorecard|signoff|reopen|concept> <slug> …（头注有全表）'); process.exit(1); }
  const form = detectForm(ROOT, slug);
  if (!form) { console.error(`未知游戏: ${slug}`); process.exit(1); }

  if (cmd === 'board') {
    const b = boardFor(ROOT, slug);
    if (argv.includes('--json')) { console.log(JSON.stringify(b)); process.exit(b.ok ? 0 : 1); }
    console.log(`══ 生产流程板 · ${slug}（${form}）══`);
    const dot = { ok: '\x1b[32m●\x1b[0m', warn: '\x1b[33m●\x1b[0m', fail: '\x1b[31m●\x1b[0m', dim: '\x1b[90m○\x1b[0m' };
    for (const s of b.stages) {
      const oooTag = s.outOfOrder ? '\x1b[33m⚠乱序\x1b[0m ' : '';
      const lockTag = s.blockedBy?.length ? '\x1b[31m🔒缺口\x1b[0m ' : '';
      console.log(`${dot[s.status]} ${lockTag}${oooTag}${s.id} ${s.title}  〔手册: ${s.handbook}〕`);
      console.log(`   机器门: ${s.machine.detail}`);
      console.log(`   复查门: ${s.review.detail}`);
      console.log(`   人  门: ${s.human.detail}`);
      // 缺口锁（REQ-S18PANEL③）：这关点不动·卡在哪几条一次说清（别让人去猜）。
      for (const g of s.blockedBy || []) console.log(`   🔒 缺口锁：${g.id} ${g.title} [${g.priority}·池=${g.route}·${g.state}]${g.ticket ? ` → ${g.ticket}` : ''}`);
      if (s.outOfOrder) console.log(`   ⚠ 乱序放行：${s.outOfOrder.reason}（${(s.outOfOrder.at || '').slice(0, 10)}）`);
    }
    if (b.gapErrors?.length) {
      console.log(`\n✗ 缺口台账不合法（docs/design/${slug}/capability-gaps.json）：`);
      for (const e of b.gapErrors) console.log(`   · ${e}`);
    } else if (b.gaps?.length) {
      const byState = GAP_STATES.filter((st) => b.gaps.some((g) => g.state === st)).map((st) => `${st} ${b.gaps.filter((g) => g.state === st).length}`);
      console.log(`\n缺口台账 ${b.gaps.length} 条（${byState.join(' · ')}）· 分池：${GAP_ROUTES.filter((r) => b.gaps.some((g) => g.route === r)).map((r) => `${r} ${b.gaps.filter((g) => g.route === r).length}`).join(' · ') || '—'}`);
    }
    console.log(b.next ? `\n→ 下一步：${b.next}（只做这一步·做完 gate/review/signoff 再看板）` : '\n✔ 全绿——可推进发布/换皮量产');
    process.exit(0);
  }
  if (cmd === 'checklist') {
    const stage = a3;
    if (stage === 'S7') {
      console.log(`══ S7 品质关 · 评分卡（复查人执行·docs/playbooks/visual-scorecard.md）══`);
      console.log(`八维 0-3 分（0=缺失/敷衍 1=粗糙 2=达标 3=出色）·premium=全维≥2·无证据不给分：`);
      for (const d of SCORECARD_DIMS) console.log(`  □ ${d}`);
      console.log(`落账：node scripts/game-pipeline.mjs scorecard ${slug} --scores "${SCORECARD_DIMS.map((d) => d + ':N').join(',')}" --by 复查人 --note "逐维证据摘要"`);
      process.exit(0);
    }
    if (!REVIEW_CHECKLISTS[stage]) { console.error(`checklist 只认 ${Object.keys(REVIEW_CHECKLISTS).join('/')}/S7（S1 owner 亲提免查·S6 平台内嵌）`); process.exit(1); }
    console.log(`══ ${stage} 复查清单 · ${slug}（复查人≠施工人·另开 session 逐条对抗性核证）══`);
    console.log(`  □ 【范围核查·每关必查】git diff 对照施工方领工声明/工单「边界」栏——碰了声明外的文件=FAIL（偏离手册的硬证据·REQ-CTX③）`);
    for (const item of REVIEW_CHECKLISTS[stage]) console.log(`  □ ${item}`);
    console.log(`落账：node scripts/game-pipeline.mjs review ${slug} ${stage} --verdict PASS|CONCERNS|FAIL --note "逐条结论（带 file:line/实数）" --by 复查人`);
    process.exit(0);
  }
  if (cmd === 'review') {
    const stage = a3;
    if (!REVIEW_STAGES.includes(stage)) { console.error(`review 只认 ${REVIEW_STAGES.join('/')}（S7 用 scorecard·S1 owner 亲提·S6 平台内嵌）`); process.exit(1); }
    const verdict = opt('--verdict');
    const note = opt('--note');
    const by = opt('--by');
    if (!['PASS', 'CONCERNS', 'FAIL'].includes(verdict)) { console.error('复查判词限 PASS|CONCERNS|FAIL（闭集）'); process.exit(1); }
    if (!note || !note.trim()) { console.error('复查必须带 --note（逐条结论落账·不许空查）'); process.exit(1); }
    if (!by || !by.trim()) { console.error('复查必须带 --by（复查人身份·复查人≠施工人）'); process.exit(1); }
    const pf = readJson(pipelineFile(ROOT, slug), { version: 1, slug, concept: {}, signoffs: {}, evidence: {} });
    const rv = { verdict, note: note.trim().slice(0, 500), by: by.trim(), at: new Date().toISOString(), gameHash: gameHash(ROOT, slug),
      // S2 的复查对象里有缺口台账（不入 gameHash）——单独记一枚，台账一动这条复查即过期。
      ...(stage === 'S2' ? { reviewHash: stageReviewHash(ROOT, slug, stage), gapsHash: gapsHash(ROOT, slug) } : {}) };
    pf.reviews = { ...(pf.reviews || {}), [stage]: rv };
    (pf.history ||= []).push({ action: 'review', stage, verdict, at: rv.at });
    writeJson(pipelineFile(ROOT, slug), pf);
    console.log(JSON.stringify({ ok: true, slug, stage, ...rv }));
    process.exit(0);
  }
  if (cmd === 'scorecard') {
    const raw = opt('--scores');
    const by = opt('--by');
    const note = opt('--note');
    if (!raw || !by || !by.trim() || !note || !note.trim()) { console.error('scorecard 需 --scores "维:分,…八维全给" --by 复查人 --note 逐维证据摘要（无证据不给分）'); process.exit(1); }
    const scores = {};
    for (const kv of raw.split(',')) {
      const [k, v] = kv.split(':').map((s) => s.trim());
      const n = Number(v);
      if (!SCORECARD_DIMS.includes(k)) { console.error(`未知维度: ${k}（闭集：${SCORECARD_DIMS.join('/')}）`); process.exit(1); }
      if (!Number.isInteger(n) || n < 0 || n > 3) { console.error(`${k} 分值非法: ${v}（0-3 整数）`); process.exit(1); }
      scores[k] = n;
    }
    const missing = SCORECARD_DIMS.filter((d) => scores[d] === undefined);
    if (missing.length) { console.error(`缺维度: ${missing.join('/')}（八维必须全打·不适配的维走 requests.md 裁豁免·不得自行跳维）`); process.exit(1); }
    const total = SCORECARD_DIMS.reduce((a, d) => a + scores[d], 0);
    const premium = SCORECARD_DIMS.every((d) => scores[d] >= 2);
    const pf = readJson(pipelineFile(ROOT, slug), { version: 1, slug, concept: {}, signoffs: {}, evidence: {} });
    pf.scorecard = { scores, total, premium, by: by.trim(), note: note.trim().slice(0, 500), at: new Date().toISOString(), gameHash: gameHash(ROOT, slug) };
    (pf.history ||= []).push({ action: 'scorecard', total, premium, at: pf.scorecard.at });
    writeJson(pipelineFile(ROOT, slug), pf);
    console.log(JSON.stringify({ ok: true, slug, verdict: `VISUAL: ${total}/24 · PREMIUM: ${premium ? 'YES' : 'NO'}`, ...pf.scorecard }));
    process.exit(0);
  }
  if (cmd === 'gate') {
    const stage = a3;
    if (!GATE_STAGES.includes(stage)) { console.error(`gate 只认 ${GATE_STAGES.join('/')}（其余阶段是纯推导或纯人门）`); process.exit(1); }
    // F·阶段顺序闸：前置阶段（S1..S(N-1)）非全绿则拒跑，除非带 --out-of-order "<理由>" 记账放行。
    const oooReason = opt('--out-of-order');
    // **S2 不过顺序闸**（独立复查 2026-08-16 P0：接上顺序闸后 game-d/game102 的 `verifyStage('S2')`
    // 由 board 推导的 exit 0 翻成 gate 的 exit 1，红因是「S1 立项卡 欠：人门(dim)」——而 S1 人门是
    // **owner 亲签**且尾注写死「禁代签」⇒ 编排器派出的 S2 会话没有任何合法手段让它转绿，
    // 只剩 `--out-of-order` 一条歪路（还要给一个根本没乱序的关永久盖上 ⚠乱序 章）。
    // 判据：gap-check 是**纯 fs 校验**（不施工、不写游戏、秒回），它回答的是「缺口裁完没有」，
    // 拿「立项卡签了没有」挡它没有任何安全收益。其余 gate 关（真施工/真跑重活）一律照旧过闸。
    const decision = stage === 'S2' ? { allowed: true, gaps: [] } : orderGate(boardFor(ROOT, slug), stage, oooReason);
    if (!decision.allowed) {
      if (decision.blockedBy?.length) {
        console.error(`✗ 能力缺口闸：${stage} 被 ${decision.blockedBy.length} 条未交付的 P0/P1 引擎缺口锁住——`
          + `--out-of-order 不放行（跳过去施工只能在游戏层写逃生代码·REQ-S18PANEL③）：`);
        for (const g of decision.blockedBy) console.error(`  · ${g.id} ${g.title} [${g.priority}·池=${g.route}·${g.state}]${g.ticket ? ` → 工单 ${g.ticket}` : ''}`);
        console.error(`  → 缺口逐条走裁决协议（先查 → 摆 A/B → owner 判）；交付后把 docs/design/${slug}/capability-gaps.json 里那条改 state=delivered 再跑本关。`);
        console.error(`     确实不做的：改 state=wontfix 并在工单里写等价数据写法（那是裁决，不是放行）。`);
        process.exit(1);
      }
      if (decision.reviewGaps?.length) {
        console.error(`✗ 复查前置硬闸：${stage} 的前置里有「已施工未复查」的关——复查门不可自赦，--out-of-order 也不放行（owner 2026-08-10 令）：`);
        for (const g of decision.reviewGaps) console.error(`  · ${g.id} ${g.title} 复查门=${g.state}${g.detail ? `（${g.detail}）` : ''}`);
        console.error(`  → 派一个非施工 agent 复查（复查人≠施工人·四步铁律见 CLAUDE.md）：`);
        console.error(`     node scripts/game-pipeline.mjs checklist ${slug} <SN>  →  复核后 review ${slug} <SN> --verdict PASS|CONCERNS|FAIL --note "…" --by 复查人`);
      } else {
        console.error(`✗ 阶段顺序闸：${stage} 前置阶段未全绿，拒跑（要跳关须带 --out-of-order "<理由>" 显式记账放行）：`);
        for (const g of decision.gaps) console.error(`  · ${g.id} ${g.title} 欠：${g.owes.join(' / ')}`);
      }
      process.exit(1);
    }
    const res = gateRun(slug, stage, form);
    const pf = readJson(pipelineFile(ROOT, slug), { version: 1, slug, concept: {}, signoffs: {}, evidence: {} });
    if (decision.outOfOrder) {
      (pf.outOfOrder ||= []).push(decision.outOfOrder);
      (pf.history ||= []).push({ action: 'out-of-order', stage, reason: decision.outOfOrder.reason, at: decision.outOfOrder.at });
    }
    const ev = { exit: res.exit, summary: res.summary, at: new Date().toISOString() };
    if (stage === 'S8' && form !== 'cart') {
      // 全仓门证据绑仓库位置（引擎一动即过期）；cart 轻量门只看游戏自身内容 → 绑 gameHash（C2）
      ev.head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() || '';
      ev.dirty = (spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout || '').trim().length > 0;
    } else {
      ev.gameHash = gameHash(ROOT, slug);
    }
    // 自证快照（REQ-SELFCHECK·图纸②）：产物齐活时记下**当时的游戏指纹**——此后游戏文件一动，
    // 板上自证提示转 ⚠过期（提示不硬拦：图可能真没变）。产物不齐时不记（无快照=板显 ✗ 未做）。
    if (stage === 'S4' || stage === 'S5') {
      const a = selfCheckArtifacts(ROOT, slug, stage);
      if (a.ok) pf.selfCheck = { ...(pf.selfCheck || {}), [stage]: { at: ev.at, shots: a.shots, gameHash: ev.gameHash || gameHash(ROOT, slug) } };
    }
    pf.evidence = { ...(pf.evidence || {}), [stage]: ev };
    (pf.history ||= []).push({ action: 'gate', stage, exit: res.exit, at: ev.at });
    writeJson(pipelineFile(ROOT, slug), pf);
    console.log(JSON.stringify({ ok: res.exit === 0, slug, stage, ...ev }));
    process.exit(res.exit === 0 ? 0 : 1);
  }
  if (cmd === 'signoff') {
    const stage = a3;
    const note = opt('--note');
    if (!STAGES.some((s) => s.id === stage) || stage === 'S6') { console.error('signoff 阶段非法（S6 人门=美术平台逐行复核·不另签）'); process.exit(1); }
    if (!note || !note.trim()) { console.error('人门必须带 --note（review 内容落账·不许空签）'); process.exit(1); }
    const pf = readJson(pipelineFile(ROOT, slug), { version: 1, slug, concept: {}, signoffs: {}, evidence: {} });
    const so = { by: opt('--by') || 'owner', note: note.trim().slice(0, 500), at: new Date().toISOString() };
    pf.signoffs = { ...(pf.signoffs || {}), [stage]: so };
    if (pf.reopen?.stage === stage) delete pf.reopen;
    (pf.history ||= []).push({ action: 'signoff', stage, at: so.at });
    writeJson(pipelineFile(ROOT, slug), pf);
    console.log(JSON.stringify({ ok: true, slug, stage, ...so }));
    process.exit(0);
  }
  if (cmd === 'reopen') {
    const stage = a3;
    const note = opt('--note');
    const by = opt('--by');
    const start = STAGES.findIndex((s) => s.id === stage);
    if (start < 0 || stage === 'S1' || stage === 'S6') { console.error('reopen 阶段非法（只认 S2/S3/S4/S5/S7/S8）'); process.exit(1); }
    if (!note || !note.trim() || !by || !by.trim()) { console.error('reopen 必须带 --by 与 --note（作废原因和裁决人须留痕）'); process.exit(1); }
    const pf = readJson(pipelineFile(ROOT, slug), { version: 1, slug, concept: {}, signoffs: {}, evidence: {} });
    const cleared = STAGES.slice(start).map((s) => s.id);
    for (const id of cleared) {
      delete pf.evidence?.[id];
      delete pf.reviews?.[id];
      delete pf.signoffs?.[id];
      delete pf.selfCheck?.[id];
    }
    const entry = { action: 'reopen', stage, cleared, by: by.trim(), note: note.trim().slice(0, 500), at: new Date().toISOString() };
    pf.reopen = { stage, at: entry.at, by: entry.by, note: entry.note };
    (pf.history ||= []).push(entry);
    writeJson(pipelineFile(ROOT, slug), pf);
    console.log(JSON.stringify({ ok: true, slug, ...entry }));
    process.exit(0);
  }
  if (cmd === 'concept') {
    const fields = {};
    for (const [k, flag] of [['name', '--name'], ['pitch', '--pitch'], ['refs', '--refs'], ['style', '--style'], ['planWaiver', '--plan-waiver']]) {
      const v = opt(flag);
      if (v !== undefined) fields[k] = v;
    }
    const concept = writeConcept(ROOT, slug, fields);
    console.log(JSON.stringify({ ok: true, slug, concept }));
    process.exit(0);
  }
  console.error(`未知子命令: ${cmd}`);
  process.exit(1);
}
