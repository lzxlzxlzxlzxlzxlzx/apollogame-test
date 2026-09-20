#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  scripts/game109-spec-recursion.mjs —— 验收剧本的「递归复核」（owner 2026-08-07 立的纪律·同 game108）
//
//  病：S4 的规矩是「验收剧本作者 = GD 非 PE」，靠**两个人**防「实现错了剧本也跟着错」。
//  owner 裁：同一个人可以接受，但判定逻辑要有一个**递归** ——
//    对每一条策划条款，故意把它的实现打坏 → **必须有剧本转红**。
//    没有任何剧本会红的条款 = 该条款**没有守卫**（剧本是摆设，同一个人写时尤其容易这样）。
//  这就是「撤修验红」纪律从代码测试推广到验收剧本层。
//
//  ── 与 game108 版的一处**刻意不同**（照 Lead 领工声明的硬约束）──────────────
//  game108 版**就地改实况 blueprint**（try/finally 复原）。本仓非 git 仓库、就地改的唯一恢复手段是
//  手写备份，且 auto-mode 权限分类器会当场拒写 —— 故本脚本**只在隔离副本内打坏**：
//      _g109-recursion-copy/{games/game109/*.ts, docs/design/game109/acceptance/*.scenario.jsonc}
//  再用 `ZEROCRAFT_ACCEPTANCE_ROOT` 把 runner 指过去（runner 支持这个环境变量·见其 ROOT 解析）。
//  **实况文件全程只读**；跑完 `rm -rf` 副本，并打印实况文件跑前跑后的 sha256 对照（必须逐字相同）。
//
//  用法：node scripts/game109-spec-recursion.mjs
//  退出码：0 = 每条款都至少有一条剧本守着 · 1 = 有条款无人守（**剧本要补**，不是实现要改）
//          / 锚点未命中（**脚本过期**，不许静默判绿） / 前提不成立（未破坏时剧本就没全绿）
//  每处破坏都带锚点断言：`find` 找不到就报「脚本过期」并失败 —— 防「全绿其实是根本没改到文件」
//  （本仓踩过三次的假绿形态）。
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_GAME = join(ROOT, 'games', 'game109');
const LIVE_SCEN = join(ROOT, 'docs', 'design', 'game109', 'acceptance');
const COPY = join(ROOT, '_g109-recursion-copy');
const GAME_FILES = ['blueprint.ts', 'data.ts', 'hud.ts', 'theme.ts', 'acceptance-adapter.ts'];

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/**
 * 每条 = 一个策划条款 + 打坏它的最小改动 + 期望「至少一条剧本转红」。
 *  file  = 改哪一份（副本内的相对路径）
 *  edits = [{find, replace}] —— 可多刀（如「成熟即停」要同时抬掉 max 与摘掉 not-ripe 门）
 *  guard = 'guarded'（默认·没剧本红就是裸奔，脚本判红）
 *        | 'known-naked'（**已知无牙且已有记载**：报了只记录、不计入裸奔清单——README §6 的待裁项）
 */
const SABOTAGES = [
  // ── 通关阈值（两个方向各一条·07 的「阈值两侧」）───────────────────────────
  {
    clause: '通关阈值·下方：金币 < 1000 必须仍 playing（990 不许提前通关）',
    file: 'blueprint.ts',
    edits: [{ find: "{ when: { kind: 'resource', id: RES.gold, cmp: 'gte', value: BALANCE.goldTarget }, to: 'won' }", replace: "{ when: { kind: 'resource', id: RES.gold, cmp: 'gte', value: 900 }, to: 'won' }" }],
  },
  {
    clause: '通关阈值·上方：金币 ≥ 1000 必须通关（1002 必须 won）',
    file: 'blueprint.ts',
    edits: [{ find: "{ when: { kind: 'resource', id: RES.gold, cmp: 'gte', value: BALANCE.goldTarget }, to: 'won' }", replace: "{ when: { kind: 'resource', id: RES.gold, cmp: 'gte', value: 1200 }, to: 'won' }" }],
  },
  // ── 数值表（§裁决行 A）────────────────────────────────────────────────────
  {
    clause: '南瓜 3 天成熟（三作物天数 1/2/3 里的那条 3）',
    file: 'data.ts',
    edits: [{ find: "id: 'pumpkin', name: '南瓜', days: 3, price: 75, invRes: 'inv-pumpkin',", replace: "id: 'pumpkin', name: '南瓜', days: 2, price: 75, invRes: 'inv-pumpkin'," }],
  },
  {
    clause: '胡萝卜卖价 12 金（卖价换算）',
    file: 'data.ts',
    edits: [{ find: "id: 'carrot', name: '胡萝卜', days: 1, price: 12, invRes: 'inv-carrot',", replace: "id: 'carrot', name: '胡萝卜', days: 1, price: 10, invRes: 'inv-carrot'," }],
  },
  {
    clause: '起始体力 20（一天恰 20 个动作的预算）',
    file: 'data.ts',
    edits: [{ find: 'energyStart: 20, // 起始体力', replace: 'energyStart: 25, // 起始体力' }],
  },
  {
    clause: '一个动作扣 1 体力',
    file: 'data.ts',
    edits: [{ find: 'actionCost: 1, // 每个动作 1 体力', replace: 'actionCost: 2, // 每个动作 1 体力' }],
  },
  // ── 干活链（三拍握手）─────────────────────────────────────────────────────
  {
    clause: '被拒不白扣：扣费拍只认「本次点击已被认领」（busy）',
    file: 'blueprint.ts',
    edits: [{ find: '    when: atState(TILE_STATE.BUSY), whenGlobal: hasEnergy,\n  });\n\n  // ③落定拍', replace: '    whenGlobal: hasEnergy,\n  });\n\n  // ③落定拍' }],
  },
  {
    clause: '体力耗尽：前置满足也不许干（P3·全局体力门）',
    file: 'blueprint.ts',
    // ⚠ 锚点与实况 `blueprint.ts` 的**全局门那一行**强耦合。2026-09-18 δ（R-20 冻结门）
    //   给这条门加了第三个合取项 `notFrozen` ⇒ 旧锚点 `and(hasEnergy, toolIs(tool))` 失配、
    //   脚本照规矩 `fatal=1; break` 停摆，**27 条只验了 8 条**。故替换式**必须保住 `notFrozen`**，
    //   否则会连带打坏冻结门、把无关条款的红算到本条头上。
    edits: [{ find: "      when, whenGlobal: and(hasEnergy, toolIs(tool), notFrozen),", replace: '      when, whenGlobal: and(toolIs(tool), notFrozen),' }],
  },
  {
    clause: '工具门：干活必须用当前选中的那把工具（不是任何一把都行）',
    file: 'blueprint.ts',
    edits: [{ find: '      when, whenGlobal: and(hasEnergy, toolIs(tool), notFrozen),', replace: '      when, whenGlobal: and(hasEnergy, notFrozen),' }],
  },
  {
    clause: '点谁改谁：干活链打的是**点中的那一格**（@signal-source）',
    file: 'blueprint.ts',
    edits: [{ find: "      targetId: TILE_FSM, targetEntity: '@signal-source', value: TILE_STATE.BUSY,", replace: "      targetId: TILE_FSM, targetEntity: 'tile-r0c0', value: TILE_STATE.BUSY," }],
  },
  {
    clause: '工具切换**不扣体力**（换手不是干活）',
    file: 'blueprint.ts',
    edits: [{
      find: '      targetId: RES.tool, op: \'set\', value: t.index,\n    });\n  }\n  return out;',
      replace: '      targetId: RES.tool, op: \'set\', value: t.index,\n    });\n    out[`pick-${t.id}-cost-fx`] = effect({ onSignal: t.pickSignal, kind: \'modify-resource\', order: 1, targetId: RES.energy, op: \'add\', value: -1 });\n  }\n  return out;',
    }],
  },
  // ── 四把工具各自的前置门（from）──────────────────────────────────────────
  {
    clause: '前置门·锄地：只对荒地（wild）有效',
    file: 'blueprint.ts',
    edits: [{ find: "claim('till-claim-fx', TOOL_TILL, atState(TILE_STATE.WILD));", replace: "claim('till-claim-fx', TOOL_TILL, atState(TILE_STATE.TILLED));" }],
  },
  {
    clause: '前置门·播种：只对已翻土（tilled）有效（点荒地不播种）',
    file: 'blueprint.ts',
    edits: [{ find: "claim('sow-claim-fx', TOOL_SOW, atState(TILE_STATE.TILLED));", replace: "claim('sow-claim-fx', TOOL_SOW, atState(TILE_STATE.WILD));" }],
  },
  {
    clause: '前置门·浇水：只对已播种（sown）有效',
    file: 'blueprint.ts',
    edits: [{ find: "claim('water-claim-fx', TOOL_WATER, and(atState(TILE_STATE.SOWN), notWatered));", replace: "claim('water-claim-fx', TOOL_WATER, and(atState(TILE_STATE.TILLED), notWatered));" }],
  },
  {
    clause: '前置门·收获：只对已成熟（stage ≥ 天数）有效',
    file: 'blueprint.ts',
    edits: [{ find: 'claim(`reap-${c.id}-claim-fx`, TOOL_REAP, and(atState(TILE_STATE.SOWN), isRipe(c), isCrop(c.id)));', replace: 'claim(`reap-${c.id}-claim-fx`, TOOL_REAP, and(atState(TILE_STATE.SOWN), isCrop(c.id)));' }],
  },
  {
    // ✅ **已转正（S5·2026-09-18）**：`known-naked` → `guarded`。
    //   依据：S5 补了专属守卫 `docs/design/game109/acceptance/09-water-repeat-no-free-spend.scenario.jsonc`
    //   （判别式 = 同日重浇后 `energy` 必须停在 17；拿掉 `notWatered` ⇒ 16 = S3 首轮实红原值）。
    //   **实证**（隔离副本·全量回归日志）：本条款那行由 `○` 变 `✓`，
    //   下一条明细 = 「被这些剧本抓住：R-19 同日重浇被拒不白扣 … [09-water-repeat-no-free-spend.scenario.jsonc]」。
    //   为什么必须摘标记（不只是文字整齐）：摘前若 09 被删，本条款会以 `○（已知无牙）` 被**豁免**；
    //   摘后同样的破坏会以 `✗ 裸奔` **报红**——标记是「没守住时怎么判」的开关，不是注释。
    //   ⚠ `clause` 标题里那半句「README §6 记为待裁·可能无牙」已**陈旧**（是历史条款名，未随标记改）。
    clause: '临水门：同一格同日不重复浇水（notWatered）——**README §6 记为待裁·可能无牙**',
    file: 'blueprint.ts',
    edits: [{ find: "claim('water-claim-fx', TOOL_WATER, and(atState(TILE_STATE.SOWN), notWatered));", replace: "claim('water-claim-fx', TOOL_WATER, and(atState(TILE_STATE.SOWN)));" }],
    guard: 'guarded',
  },
  // ── 生长（SelfRule）──────────────────────────────────────────────────────
  {
    clause: '只有浇过水的格子才长（未浇水不长）',
    file: 'blueprint.ts',
    edits: [{ find: "        { kind: 'flag', id: TILE_FLAG },\n        atState(TILE_STATE.SOWN),", replace: '        atState(TILE_STATE.SOWN),' }],
  },
  {
    clause: '每夜恰一阶（不是 +2 也不是每拍一阶）',
    file: 'blueprint.ts',
    edits: [{ find: '        { kind: \'modify-resource\', op: \'add\', value: 1 },\n        // ⚠ 自清是**要害**', replace: '        { kind: \'modify-resource\', op: \'add\', value: 2 },\n        // ⚠ 自清是**要害**' }],
  },
  {
    // ⚠ 实测（2026-09-18·隔离副本）：**单独摘掉这一行，没有剧本变红**——「睡完即清」这条承诺有
    //   **两条清旗路径互为兜底**（SelfRule 自清 ∧ day-end 的 tagged 批量清），摘任一条、另一条照做。
    //   故 it 记「已知无牙」：**这一行代码没有专属守卫**（它是有意的纵深防御，不是遗漏）；
    //   可观察的承诺本身由下面那条（摘掉 day-end 兜底 → 02 红）+ 03/06/07/08 守着。
    clause: '生长 SelfRule 的自清（`set-flag:false`）**单独**摘掉 —— 无专属守卫（被 day-end 兜底兜住）',
    file: 'blueprint.ts',
    edits: [{ find: '        // ⚠ 自清是**要害**（P2-b 实查）：不清则 Resolve 每拍都满足条件 → 每拍长一阶（首轮实测 4 tick 长 3 阶）。\n        { kind: \'set-flag\', value: false },\n', replace: '        // 破坏：不自清（浇水旗卡真）\n' }],
    guard: 'known-naked',
  },
  {
    clause: '成熟即停（生长阶封顶 = 作物天数）',
    file: 'blueprint.ts',
    edits: [
      { find: 'Resource: { id: RES.stage, current: 0, min: 0, max: crop.days }, // 成熟即停（stage 停在 days）', replace: 'Resource: { id: RES.stage, current: 0, min: 0, max: 99 }, // 破坏：不封顶' },
      { find: '        { kind: \'not\', of: isRipe(crop) }, // ⚠ 单个 expr，不是数组（同 notWatered 的坑）\n', replace: '' },
    ],
  },
  {
    // 摘掉整个效果（不是把 value 改成 true ——那等于「给全场浇水」，是另一回事，实测 7 份红）。
    // 实测（2026-09-18·隔离副本）：摘掉它 → **02 红**（兜底清旗缺席会让浇水标记跨夜残留，
    // 作物天数/卖价那条链上的时序立刻对不上）。
    clause: '清全场浇水标记（day-end 兜底拍·摘掉实现）',
    file: 'blueprint.ts',
    edits: [{ find: '  out[\'day-end-clear-fx\'] = effect({\n    onSignal: SIGNALS.DAY_END, kind: \'set-flag-tagged\', order: 1,\n    tagMask: TILE_BIT, targetId: TILE_FLAG, value: false,\n  });', replace: '  // 破坏：摘掉 day-end 兜底清旗' }],
  },
  // ── 睡觉结算 ────────────────────────────────────────────────────────────
  {
    clause: '睡觉回满体力（20）',
    file: 'blueprint.ts',
    edits: [{ find: 'targetId: RES.energy, op: \'set\', value: BALANCE.energyRefill,', replace: 'targetId: RES.energy, op: \'set\', value: 5,' }],
  },
  {
    clause: '睡觉日期 +1（推一天）',
    file: 'blueprint.ts',
    edits: [{ find: "    onSignal: SIGNALS.SLEEP, kind: 'modify-resource', order: 2,\n    targetId: RES.day, op: 'add', value: 1,", replace: "    onSignal: SIGNALS.SLEEP, kind: 'modify-resource', order: 2,\n    targetId: RES.day, op: 'add', value: 0," }],
  },
  // ── 收获 / 卖货 ──────────────────────────────────────────────────────────
  {
    clause: '收获进背包（按作物路由，每收一格 +1）',
    file: 'blueprint.ts',
    edits: [{ find: "      targetId: c.invRes, op: 'add', value: 1,\n      when: and(atState(TILE_STATE.BUSY), isCrop(c.id)), whenGlobal: toolIs(TOOL_REAP),", replace: "      targetId: c.invRes, op: 'add', value: 0,\n      when: and(atState(TILE_STATE.BUSY), isCrop(c.id)), whenGlobal: toolIs(TOOL_REAP)," }],
  },
  {
    clause: '收获后清生长阶（地还原成可播种·当前判别点钉在收获侧）',
    file: 'blueprint.ts',
    edits: [{ find: "    targetId: RES.stage, targetEntity: '@signal-source', op: 'set', value: 0,", replace: "    targetId: RES.stage, targetEntity: '@signal-source', op: 'set', value: 1," }],
  },
  {
    clause: '卖货不白送：结账后清仓（重复卖货不再给钱）',
    file: 'blueprint.ts',
    // ⚠ 同上：δ 给这条 effect 加了 `whenGlobal: notFrozen`，锚点必须跟着走。本条 replace 是**整句删掉**，
    //   所以 `notFrozen` 随该 effect 一起消失 —— 不会波及别的门（与上面两条「只换谓词」的替换式不同）。
    edits: [{ find: '    out[`sell-${c.id}-clear-fx`] = effect({\n      onSignal: SIGNALS.SELL, kind: \'modify-resource\', order: 1,\n      targetId: c.invRes, op: \'set\', value: 0, whenGlobal: notFrozen,\n    });', replace: '    // 破坏：不清仓（重复卖货白送）' }],
  },
  // ── 宿主生命周期（S4 终局出口·落在 acceptance-adapter）──────────────────
  {
    clause: '重开回初态（终局屏唯一出口·宿主拆局重挂的等价落法）',
    file: 'acceptance-adapter.ts',
    edits: [{ find: '  const { engine, input } = newRound(w.seed);', replace: '  const { engine, input } = { engine: w.engine, input: w.input }; // 破坏：重开变空操作' }],
  },
];

// ── 隔离副本 ───────────────────────────────────────────────────────────────
const scenFiles = () => readdirSync(LIVE_SCEN).filter((f) => f.endsWith('.scenario.jsonc')).sort();

function makeCopy() {
  rmSync(COPY, { recursive: true, force: true });
  mkdirSync(join(COPY, 'games', 'game109'), { recursive: true });
  mkdirSync(join(COPY, 'docs', 'design', 'game109', 'acceptance'), { recursive: true });
  for (const f of GAME_FILES) cpSync(join(LIVE_GAME, f), join(COPY, 'games', 'game109', f));
  for (const f of scenFiles()) cpSync(join(LIVE_SCEN, f), join(COPY, 'docs', 'design', 'game109', 'acceptance', f));
  return Object.fromEntries(GAME_FILES.map((f) => [f, readFileSync(join(COPY, 'games', 'game109', f), 'utf8')]));
}

// 直接跑本仓 node_modules 里的 vite-node（**不用 `npx`**）：Windows 上 `spawnSync('npx', …)` 起不来
// ——Node 对 `.cmd`/`.bat` 免 shell 执行会 ENOENT（npx 只有 npx.cmd），实测 `spawnSync npx ENOENT`。
// 走 process.execPath + 本地 bin 既跨平台又省掉 npx 的解析开销，脚本在 Windows/Linux 上同一份。
const VITE_NODE = join(ROOT, 'node_modules', 'vite-node', 'vite-node.mjs');

const runAcceptance = () => {
  if (!existsSync(VITE_NODE)) {
    console.error(`✗ 找不到 ${VITE_NODE}（先 npm i）`);
    process.exit(1);
  }
  return spawnSync(process.execPath, [VITE_NODE, 'scripts/acceptance-run.mjs', '--', '--game', 'game109'],
    { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ZEROCRAFT_ACCEPTANCE_ROOT: COPY } });
};

// runner 的红行形如 `FAIL <剧本名>  [<文件名>]` —— 两样都留着（Lead 要「点名文件」）。
const reds = (stdout) => (stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.slice(5).trim());

// ── 主流程 ────────────────────────────────────────────────────────────────
const LIVE_BEFORE = Object.fromEntries([...GAME_FILES.map((f) => [join('games/game109', f), join(LIVE_GAME, f)])].map(([k, p]) => [k, sha(p)]));
const results = [];
let fatal = 0;

try {
  const originals = makeCopy();
  console.log(`隔离副本：${COPY}\n（实况 games/game109 全程只读·副本跑完即删）\n`);

  // 前提：未破坏时必须全绿，否则下面「变红」这件事不成立。
  const base = runAcceptance();
  if ((base.status ?? 1) !== 0) {
    console.error('✗ 前提不成立：未破坏时验收剧本就没全绿，先修那个再跑递归复核\n' + (base.stdout || ''));
    fatal = 1;
  } else {
    console.log('前提 ✓ 未破坏时验收剧本全绿（副本内）\n══ 递归复核：逐条款打坏，看有没有剧本转红 ══\n');

    for (const s of SABOTAGES) {
      const path = join(COPY, 'games', 'game109', s.file);
      let text = originals[s.file];
      for (const e of s.edits) {
        if (!text.includes(e.find)) {                        // 锚点断言：改不到就是假绿
          console.error(`✗ 锚点未命中（脚本过期，不是条款没守卫）：${s.clause}\n   文件 ${s.file} 找不到：${JSON.stringify(e.find)}\n`);
          fatal = 1;
          break;
        }
        text = text.replace(e.find, e.replace);
      }
      if (fatal) break;
      writeFileSync(path, text);
      const r = runAcceptance();
      writeFileSync(path, originals[s.file]);                // 单条用完即复原（副本内）
      // ⚠ **跑不动 ≠ 守住了**（2026-09-18 实测踩过一次：一次 spawn 超时（ETIMEDOUT·机器忙）被
      //   `(r.status ?? 1) !== 0` 判成"红"、红名单又是空的，于是那一行以 ✓ 记进了结论——正是
      //   本仓最贵的假绿形态。runner 没跑完/抛错一律单列，**不算守住**，且整体判失败。
      if (r.error || r.status === null) {
        results.push({ clause: s.clause, file: s.file, guard: s.guard ?? 'guarded', guarded: false, by: [], runner: true });
        console.error(`  ✗ ${s.clause}\n      **runner 没跑完**（${r.error?.message ?? '被信号打断'}）——这一条**不算守住了**，请重跑`);
        fatal = 1;
        break;
      }
      const red = r.status !== 0;
      const failing = reds(r.stdout);
      results.push({ clause: s.clause, file: s.file, guard: s.guard ?? 'guarded', guarded: red, by: failing });
      console.log(`${red ? '  ✓' : (s.guard === 'known-naked' ? '  ○' : '  ✗')} ${s.clause}`);
      console.log(`      ${red ? '被这些剧本抓住：' + failing.join(' / ') : '**没有剧本变红**' + (s.guard === 'known-naked' ? '（已知无牙·README 有记载·不计入裸奔）' : '——打坏了所有剧本照样全绿，该条款的剧本要补')}`);
    }
  }
} finally {
  rmSync(COPY, { recursive: true, force: true });
  if (existsSync(COPY)) { console.error('✗ 副本清理失败，手动删 ' + COPY); fatal = 1; }
  // 实况文件对照：跑前跑后必须逐字相同（本脚本从不写实况，这里是**证明**不是许诺）。
  console.log('\n══ 实况文件 sha256 对照（跑前 / 跑后）══');
  for (const [k, p] of GAME_FILES.map((f) => [join('games/game109', f), join(LIVE_GAME, f)])) {
    const after = sha(p);
    const same = after === LIVE_BEFORE[k];
    console.log(`  ${same ? '=' : '≠'} ${k}  ${LIVE_BEFORE[k].slice(0, 12)} / ${after.slice(0, 12)}${same ? '' : '  ← 变了！'}`);
    if (!same) fatal = 1;
  }
  // 剧本（GD 的域）也没被我碰 —— 一并对照。
  console.log(`  （剧本 ${scenFiles().length} 份未参与打坏：本脚本只改副本内的 games/game109/*.ts）`);
}

if (!fatal) {
  const naked = results.filter((r) => !r.guarded && r.guard === 'guarded');
  const known = results.filter((r) => !r.guarded && r.guard === 'known-naked');
  console.log(`\n══ 结论：${results.length} 条条款 · ${results.length - naked.length - known.length} 条有剧本守着 · ${naked.length} 条裸奔 · ${known.length} 条已知无牙 ══`);
  if (known.length) console.log('已知无牙（不计入裸奔·等裁决）：\n' + known.map((r) => '  · ' + r.clause).join('\n'));
  if (naked.length) console.log('裸奔的条款：\n' + naked.map((r) => '  · ' + r.clause).join('\n'));
  process.exit(naked.length ? 1 : 0);
}
process.exit(fatal);
