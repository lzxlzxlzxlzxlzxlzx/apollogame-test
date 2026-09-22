// scripts/scoped-gate.test.mjs —— 智能门禁分类器行为契约（owner 2026-07-21）。
// 铁律=只在可证明安全时缩范围·任何不确定一律 full——本测钉死"缩错"不发生。
import { describe, it, expect } from 'vitest';
import { classify, auditGamesOf, planFor, facesOf } from './scoped-gate.mjs';

describe('scoped-gate 分类器（缩范围只在可证明安全时）', () => {
  it('无改动 → none', () => {
    expect(classify([]).scope).toBe('none');
  });

  it('碰引擎/共享面 → full（下游全可能坏·绝不缩）', () => {
    expect(classify(['src/engine/protocol/components.ts']).scope).toBe('full');
    expect(classify(['src/skills/tier3/hand-pattern.ts']).scope).toBe('full');
    expect(classify(['src/ui/components/render.ts']).scope).toBe('full');
    expect(classify(['scripts/game-pipeline.mjs']).scope).toBe('full');
    expect(classify(['vite.config.ts']).scope).toBe('full');
    expect(classify(['src/launcher.tsx']).scope).toBe('full');
  });

  it('引擎面 + 游戏面同改 → full（不因掺了游戏就缩）', () => {
    expect(classify(['games/game-a/rules.ts', 'src/engine/x.ts']).scope).toBe('full');
  });

  it('改动收敛单游戏（src/public/docs 混合）→ game:<g>', () => {
    const c = classify([
      'games/game-a/guandan-session.ts',
      'public/games/game-a/art/index.json',
      'docs/design/game-a/requests.md',
    ]);
    expect(c.scope).toBe('game');
    expect(c.game).toBe('game-a');
  });

  it('单游戏面 + 通用文档 → 仍 game:<g>（通用文档不影响编译）', () => {
    const c = classify(['games/game-b/mahjong.ts', 'docs/workflow/requests.md']);
    expect(c).toMatchObject({ scope: 'game', game: 'game-b' });
  });

  it('多游戏同改 → full（安全兜底）', () => {
    expect(classify(['games/game-a/x.ts', 'games/game-b/y.ts']).scope).toBe('full');
  });

  it('仅通用文档 → docs-only（跳过编译门禁）', () => {
    expect(classify(['docs/workflow/requests.md', 'README.md']).scope).toBe('docs-only');
  });

  it('仅单游戏文档（无编译/资产）→ docs-only', () => {
    expect(classify(['docs/design/game-a/gdd.md']).scope).toBe('docs-only');
  });

  it('无法归类的非文档改动 → full（不认识=不敢缩）', () => {
    expect(classify(['weird/unknown-file.ts']).scope).toBe('full');
    expect(classify(['src/foo.ts']).scope).toBe('full'); // src 下非 games = 引擎/共享
  });

  it('游戏资产单改（public/games/<g>）→ game（该游戏 vendor/asset 测试守）', () => {
    const c = classify(['public/games/game-a/art/cards/ace-of-spades.svg']);
    expect(c).toMatchObject({ scope: 'game', game: 'game-a' });
  });
});

// ── audit 进推送门（8/4 大评审 Q1 消费路径批·2026-08-10）──
// 语义钉死三条：碰 games/<g>/** 非文档 → 门禁计划里出现只扫这些游戏的 audit 步；
// 纯文档/资产/引擎面不触发；绝不因单游戏改动全库扫描。
describe('scoped-gate × game-skill-audit（audit 进推送门·只扫改动游戏）', () => {
  it('auditGamesOf：games/<g>/** 非文档 → 该游戏入列（去重·字典序）', () => {
    expect(auditGamesOf(['games/game-a/rules.ts'])).toEqual(['game-a']);
    expect(auditGamesOf(['games/game-b/y.ts', 'games/game-a/x.ts', 'games/game-a/z.ts'])).toEqual(['game-a', 'game-b']);
  });

  it('auditGamesOf：纯文档/设计档/public 资产/引擎面 → 不触发（audit 只读游戏源码）', () => {
    expect(auditGamesOf(['games/game-a/README.md'])).toEqual([]);
    expect(auditGamesOf(['docs/design/game-a/gdd.md'])).toEqual([]);
    expect(auditGamesOf(['public/games/game-a/art/x.svg'])).toEqual([]);
    expect(auditGamesOf(['src/engine/core.ts', 'scripts/foo.mjs'])).toEqual([]);
  });

  it('game scope：计划含 audit 步·参数=改动游戏（放最前·秒级先拦红旗）', () => {
    const files = ['games/game-a/rules.ts'];
    const plan = planFor(classify(files), auditGamesOf(files));
    expect(plan[0].name).toBe('audit:game-a');
    expect(plan[0].cmd).toEqual(['node', ['scripts/game-skill-audit.mjs', 'game-a']]);
    expect(plan[0].allowExit).toBeUndefined(); // 红=拦：非 0 退出码即门禁失败，无放行档
  });

  it('full scope（引擎+游戏混改）：audit 只扫改动游戏·绝不全库扫描', () => {
    const files = ['games/game-a/rules.ts', 'games/game-b/y.ts', 'src/engine/x.ts'];
    const c = classify(files);
    expect(c.scope).toBe('full');
    const audit = planFor(c, auditGamesOf(files)).find((s) => s.name.startsWith('audit:'));
    expect(audit).toBeDefined();
    expect(audit.cmd[1]).toEqual(['scripts/game-skill-audit.mjs', 'game-a', 'game-b']); // 点名传参·缺省(全库)绝不出现
  });

  it('引擎单改（full）/纯文档（docs-only）：计划无 audit 步', () => {
    const engine = ['src/engine/x.ts'];
    expect(planFor(classify(engine), auditGamesOf(engine)).some((s) => s.name.startsWith('audit:'))).toBe(false);
    const docs = ['docs/design/game-a/gdd.md'];
    expect(planFor(classify(docs), auditGamesOf(docs)).some((s) => s.name.startsWith('audit:'))).toBe(false);
  });
});

// ── 面触发守卫接线（REQ-GUARDGATE 守卫接线批·2026-08-16 · P0 治理围栏 2026-09-03 改造）──
// 语义钉死：① 引擎面随机/超越函数/墙钟 + 测试三禁 → 常驻 `eslint` 步（game/full 恒跑·红=拦），取代原
// engine-random / test-hygiene 两个按面点名的 regex 步；② games/src 边界 + 层向 → 常驻 `depcruise` 步；
// ③ 美术面（scripts/art-replace*/main_entry/art_*）→ art-replace-smoke.py 步（红=拦）；
// 未触发的面绝不进计划（不给无关改动加时长）。
describe('scoped-gate × REQ-GUARDGATE（面触发守卫按改动面点名进门）', () => {
  it('facesOf：dokiworld/<app>/** 非 .md → dokiApps 命中·纯 .md 与游戏目录不触发·去重排序（DOKI-APPS 后续①）', () => {
    expect(facesOf(['dokiworld/game108/src/main.ts', 'dokiworld/game108/tests/x.test.mjs', 'dokiworld/shared/src/a.mjs']).dokiApps).toEqual(['game108', 'shared']);
    expect(facesOf(['dokiworld/game108/README.md']).dokiApps).toEqual([]);
    expect(facesOf(['games/game108/game108.ts', 'docs/design/dokiworld/x.md']).dokiApps).toEqual([]);
  });
  it('dokiworld 改动（full）：计划含 doki-test:<app> 步·红=拦（撤 planFor 的 dokiApps 注入 → 本断言红）', () => {
    const files = ['dokiworld/shared/src/apps-gateway.mjs'];
    const plan = planFor({ scope: 'full' }, [], facesOf(files));
    expect(plan.some((s) => s.name === 'doki-test:shared')).toBe(true);
    expect(planFor({ scope: 'full' }, [], {}).some((s) => s.name.startsWith('doki-test:'))).toBe(false); // 缺省 faces 不炸不加步
  });
  it('代码围栏常驻：game 与 full 两档计划都含 eslint + depcruise 步·红=拦·放 tsc 前（P0 治理围栏）', () => {
    for (const files of [['src/engine/core/world.ts'], ['games/game-a/rules.ts'], ['src/debug/debug.test.ts']]) {
      const plan = planFor(classify(files), auditGamesOf(files), facesOf(files));
      const names = plan.map((s) => s.name);
      expect(names.indexOf('eslint'), files.join()).toBeGreaterThanOrEqual(0);
      expect(names.indexOf('depcruise'), files.join()).toBeGreaterThanOrEqual(0);
      expect(names.indexOf('eslint')).toBeLessThan(names.indexOf('tsc'));
      expect(names.indexOf('depcruise')).toBeLessThan(names.indexOf('tsc'));
      expect(plan.find((s) => s.name === 'eslint').cmd).toEqual(['npx', ['eslint', 'src', 'games', '--max-warnings', '0']]);
      expect(plan.find((s) => s.name === 'depcruise').cmd).toEqual(['npx', ['depcruise', '--config', '.dependency-cruiser.cjs', 'src', 'games']]);
      expect(plan.find((s) => s.name === 'eslint').allowExit).toBeUndefined();
    }
    // docs-only 无代码改动 → 不跑围栏（省 20 秒·不给纯文档改动加时长）
    expect(planFor({ scope: 'docs-only' }, [], {}).some((s) => s.name === 'eslint' || s.name === 'depcruise')).toBe(false);
  });

  it('围栏配置文件（eslint.config.mjs / .dependency-cruiser.cjs）被改 = 共享面 → full', () => {
    expect(classify(['eslint.config.mjs']).scope).toBe('full');
    expect(classify(['.dependency-cruiser.cjs']).scope).toBe('full');
    expect(classify(['tools/eslint/zerocraft-rules.mjs']).scope).toBe('full');
  });

  it('facesOf：美术面 scripts/art-replace* / main_entry/art_* → artSmoke', () => {
    expect(facesOf(['scripts/art-replace.mjs']).artSmoke).toBe(true);
    expect(facesOf(['scripts/art-replace-smoke.py']).artSmoke).toBe(true);
    expect(facesOf(['main_entry/art_replace.py']).artSmoke).toBe(true);
    expect(facesOf(['main_entry/art_jobs.py']).artSmoke).toBe(true);
    expect(facesOf(['main_entry/artbrowser.py']).artSmoke).toBe(false); // art_ 前缀之外不触发
    expect(facesOf(['scripts/art-ledger-guard.mjs']).artSmoke).toBe(false);
  });

  it('facesOf：守卫脚本自身被改也触发各自守卫（改守卫先自证跑绿）', () => {
    expect(facesOf(['games/game-a/rules.ts', 'docs/workflow/requests.md'])).toEqual({ artSmoke: false, syncSmoke: false, backupSmoke: false, platformStatic: false, workshopProvider: false, distStale: false, skillShape: false, creationLoop: false, simDom: false, dokiApps: [], slowLane: [] });
    expect(facesOf(['main_entry/server.py']).platformStatic).toBe(true); // 蓝屏面（2026-08-25）：server.py 不带 art_ 前缀·此前零旗命中
    // 假产物面（2026-08-26）：工作台选供应商那段与 generate_api 此前同样零旗命中——
    // 改一行「兜底可以落 mock」就能让全站生成变成同一份固定样例，而没有任何门在验。
    expect(facesOf(['workshop/index.dc.html']).workshopProvider).toBe(true);
    expect(facesOf(['main_entry/generate_api.py']).workshopProvider).toBe(true);
    expect(facesOf(['scripts/workshop-provider-guard.mjs']).workshopProvider).toBe(true);
    // 过期产物面（2026-08-26）：dist 是 gitignore 的，旧 bundle 被端出去时 URL/API/卡带全对，
    // 只有界面是旧的 —— 人眼查不出来，判据必须有门守着。
    expect(facesOf(['main_entry/dist_check.py']).distStale).toBe(true);
    expect(facesOf(['scripts/dist-staleness-guard.py']).distStale).toBe(true);
    expect(facesOf(['main_entry/server.py']).distStale).toBe(true);   // 告警就接在这里
    // 能力形状面（2026-09-05）：改任何能力壳都要过棘轮，新长出来的超大件当场拦。
    expect(facesOf(['src/skills/tier2/steering.ts']).skillShape).toBe(true);
    expect(facesOf(['scripts/skill-shape-baseline.json']).skillShape).toBe(true);
    // 创作闭环面（2026-09-12）：建库/编号/版本保存/生成告警这条链此前零旗命中。
    expect(facesOf(['main_entry/library.py']).creationLoop).toBe(true);
    expect(facesOf(['src/studio/CreationWizard.tsx']).creationLoop).toBe(true);
    // sim DOM 围栏面（2026-09-12·P3a）：改 sim 三面或围栏本身都要重跑。
    expect(facesOf(['src/engine/core/types.ts']).simDom).toBe(true);
    expect(facesOf(['tsconfig.sim.json']).simDom).toBe(true);
  });

  it('美术面改动（full）：计划含 art-smoke 步（python3 点名）·红=拦', () => {
    const files = ['scripts/art-replace.mjs', 'main_entry/art_replace.py'];
    const step = planFor(classify(files), auditGamesOf(files), facesOf(files)).find((s) => s.name === 'art-smoke');
    expect(step).toBeDefined();
    expect(step.cmd).toEqual(['python3', ['scripts/art-replace-smoke.py']]);
    expect(step.allowExit).toBeUndefined();
  });

  it('facesOf：git 同步面 main_entry/{art_sync,artifacts}.py + 两冒烟自身 → syncSmoke（不并进 artSmoke）', () => {
    expect(facesOf(['main_entry/art_sync.py']).syncSmoke).toBe(true);
    expect(facesOf(['main_entry/artifacts.py']).syncSmoke).toBe(true);
    expect(facesOf(['scripts/art-sync-smoke.py']).syncSmoke).toBe(true);
    expect(facesOf(['scripts/auto-sync-smoke.py']).syncSmoke).toBe(true);
    // artifacts.py 不带 art_ 前缀 → 只触发 syncSmoke；art_sync.py 两面都沾（art_ 前缀 + 同步面）
    expect(facesOf(['main_entry/artifacts.py']).artSmoke).toBe(false);
    expect(facesOf(['main_entry/art_sync.py']).artSmoke).toBe(true);
    expect(facesOf(['main_entry/art_jobs.py']).syncSmoke).toBe(false);
    expect(facesOf(['scripts/art-replace-smoke.py']).syncSmoke).toBe(false);
  });

  it('facesOf：原图备份面 t2_replace.py / art-replace.mjs / 冒烟自身 → backupSmoke（REQ-UPBACKUP）', () => {
    expect(facesOf(['main_entry/t2_replace.py']).backupSmoke).toBe(true);
    expect(facesOf(['scripts/art-replace.mjs']).backupSmoke).toBe(true);
    expect(facesOf(['scripts/art-backup-smoke.py']).backupSmoke).toBe(true);
    // t2_replace.py 不带 art_ 前缀 → 此前任何面旗都不命中，本旗即那个洞的补丁
    expect(facesOf(['main_entry/t2_replace.py']).artSmoke).toBe(false);
    expect(facesOf(['main_entry/art_jobs.py']).backupSmoke).toBe(false);
    expect(facesOf(['scripts/art-replace-smoke.py']).backupSmoke).toBe(false);
  });

  it('备份面改动（full）：计划含 art-backup-smoke 步·红=拦·放 tsc 前', () => {
    const files = ['main_entry/t2_replace.py'];
    const plan = planFor(classify(files), auditGamesOf(files), facesOf(files));
    const names = plan.map((s) => s.name);
    expect(names).toContain('art-backup-smoke');
    expect(plan.find((s) => s.name === 'art-backup-smoke').cmd).toEqual(['python3', ['scripts/art-backup-smoke.py']]);
    expect(plan.find((s) => s.name === 'art-backup-smoke').allowExit).toBeUndefined();
    expect(names.indexOf('art-backup-smoke')).toBeLessThan(names.indexOf('tsc'));
  });

  it('同步面改动（full）：计划含 art-sync-smoke + auto-sync-smoke 两步·红=拦·放 tsc 前', () => {
    const files = ['main_entry/artifacts.py'];
    const plan = planFor(classify(files), auditGamesOf(files), facesOf(files));
    const names = plan.map((s) => s.name);
    expect(names).toContain('art-sync-smoke');
    expect(names).toContain('auto-sync-smoke');
    expect(plan.find((s) => s.name === 'auto-sync-smoke').cmd).toEqual(['python3', ['scripts/auto-sync-smoke.py']]);
    expect(plan.find((s) => s.name === 'auto-sync-smoke').allowExit).toBeUndefined();
    expect(names.indexOf('auto-sync-smoke')).toBeLessThan(names.indexOf('tsc'));
  });

  it('未触发的面不进计划：游戏单改无 art-smoke·引擎单改无 art-smoke/同步冒烟', () => {
    const game = ['games/game-a/rules.ts'];
    const gamePlan = planFor(classify(game), auditGamesOf(game), facesOf(game));
    expect(gamePlan.some((s) => ['art-smoke'].includes(s.name))).toBe(false);
    const engine = ['src/engine/core/world.ts'];
    const enginePlan = planFor(classify(engine), auditGamesOf(engine), facesOf(engine));
    expect(enginePlan.some((s) => s.name === 'art-smoke')).toBe(false);
    expect(enginePlan.some((s) => s.name.endsWith('sync-smoke'))).toBe(false);
    expect(enginePlan.some((s) => s.name === 'art-backup-smoke')).toBe(false);
  });
});

// ── 门禁接线补牙（测试加固批·2026-08-24）──
// 三类此前只测半边的接线：① slowLane 面只有反向测试（零触发），正向「改被测物 → 面亮 → 计划有步」
// 没钉过；② docs-only 计划只被当"含 GUARDS"用，常驻守卫的序列与 allowExit 精确值没对过账；
// ③ facesOf 的旗和 planFor 的步各自有测试，但「每旗必有步」的总对账缺席——加第 8 旗忘接步会静默失效。
describe('scoped-gate 接线补牙（slowLane 正向 · docs-only 全量对账 · 旗↔步总对账）', () => {
  it('slowLane 正向：改 SLOW_TARGETS 被测物（scripts/game-pipeline.mjs）→ 面亮 → 计划含 slow-lane:game-pipeline 步·红=拦', () => {
    // 实证现值（node 直跑 facesOf/planFor·2026-08-24）：slowLane=['game-pipeline']，
    // 步 cmd=['node',['scripts/slow-lane-guard.mjs','game-pipeline']]、无 allowExit。
    const files = ['scripts/game-pipeline.mjs'];
    const f = facesOf(files);
    expect(f.slowLane).toContain('game-pipeline');
    const plan = planFor(classify(files), auditGamesOf(files), f);
    const step = plan.find((s) => s.name === 'slow-lane:game-pipeline');
    expect(step).toBeDefined();
    expect(step.cmd).toEqual(['node', ['scripts/slow-lane-guard.mjs', 'game-pipeline']]);
    expect(step.allowExit).toBeUndefined(); // 红=拦（guard 内部对基线棘轮判红/警·门禁只认退出码）
  });

  it('docs-only 计划全量对账：常驻守卫序列 docs-ref → context-budget → art-ledger-guard 逐步钉死（含 allowExit 精确值·decouple-check 已并入 game/full 的 depcruise 步）', () => {
    const plan = planFor({ scope: 'docs-only' }, [], {});
    expect(plan.map((s) => ({ name: s.name, cmd: s.cmd, allowExit: s.allowExit }))).toEqual([
      { name: 'docs-ref', cmd: ['node', ['scripts/docs-ref-guard.mjs']], allowExit: undefined },
      { name: 'context-budget', cmd: ['node', ['scripts/context-budget-guard.mjs']], allowExit: undefined },
      // art-ledger-guard 是常驻守卫里唯一带放行档的：0=全净·2=存量挂账警告态放行·1=新黑户硬拦。
      { name: 'art-ledger-guard', cmd: ['node', ['scripts/art-ledger-guard.mjs']], allowExit: [0, 2] },
    ]);
  });

  it('面旗↔步总对账（表驱动·八旗全盖）：每旗置位时 planFor 必产对应步——加旗忘接步即红', () => {
    // 旗名 → 该旗单独置位时计划里必须出现的步名。数组旗（dokiApps/slowLane）用代表值。
    const FLAG_TO_STEPS = {
      artSmoke: { value: true, steps: ['art-smoke'] },
      syncSmoke: { value: true, steps: ['art-sync-smoke', 'auto-sync-smoke'] },
      backupSmoke: { value: true, steps: ['art-backup-smoke'] },
      platformStatic: { value: true, steps: ['platform-static-smoke'] },
      workshopProvider: { value: true, steps: ['workshop-provider-guard'] },
      distStale: { value: true, steps: ['dist-staleness-guard'] },
      skillShape: { value: true, steps: ['skill-shape-guard'] },
      creationLoop: { value: true, steps: ['creation-loop-guard'] },
      simDom: { value: true, steps: ['sim-dom-fence'] },
      dokiApps: { value: ['game108'], steps: ['doki-test:game108'] },
      slowLane: { value: ['acceptance'], steps: ['slow-lane:acceptance'] },
    };
    // 总对账下限：facesOf 产出的旗集合 = 本表键集合。往 facesOf 加第 13 旗而不进此表 → 这里先红，
    // 逼施工者同时补 planFor 接线断言（防「加旗忘接步」静默失效——旗亮了计划却没步）。
    expect(Object.keys(facesOf([])).sort()).toEqual(Object.keys(FLAG_TO_STEPS).sort());
    for (const [flag, { value, steps }] of Object.entries(FLAG_TO_STEPS)) {
      const plan = planFor({ scope: 'full' }, [], { [flag]: value });
      for (const name of steps) {
        expect(plan.some((s) => s.name === name), `旗 ${flag} 置位但计划缺步 ${name}`).toBe(true);
      }
    }
  });
});
