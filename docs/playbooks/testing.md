# 测试与验收线手册（接线图）

> 行业知识见 `wiki/skills/testing.md`（建测试体系/定准则才读）；本手册只回答「在 ZeroCraft 测 X 用哪个基座件」。全员适用，交付前必过。

## 做 X → 用什么

| 要测什么 | 基座件 | 判定 |
|---|---|---|
| 纯逻辑 / capability 语义 | vitest（`src/**/*.test.ts`）· 夹具 `src/test-fixtures/test-kit.ts`（`worldWith/button/press/tickN` + **契约三件套** `expectDeterministic/expectRestoreContinues/expectQuiescent`·带运行态的能力必过·样板 `tier2/contracts.test.ts`·不变量样板 `tier2/invariants.test.ts`·评审 `docs/design/test-strategy-review-2026-09-10.md`） | 退出码 0 |
| capability 注册完整性 | `src/assembly/registry-guard.test.ts`（漏注册即红·计数下限防空 glob 假绿） | vitest 内 |
| 确定性 / 回放 / 性能 | ZeroCraftBench（`src/bench/`·双跑同 hash）·单 manifest 走 `scripts/bench-manifest.mjs` | hash 一致 |
| 数值平衡 | `scripts/game-d-balance-sim.mjs` · `games/game-g/simulate-balance.ts`（N=500 胜率扫描） | 胜率∈目标带 |
| UI 卫生 | `/check-ui` 技能 + validateLayoutNode | issue 归零 |
| 真浏览器旅程 | playwright-core e2e（`scripts/studio-*-e2e.mjs` 模式·chromium=/opt/pw-browsers） | 脚本退出码 |
| 产品线冒烟 | `scripts/*-smoke.py`（library / studio / **steam 发行编排**·后者 `steam-publish-smoke.py` 无真账号用 480 验 VDF/命令/plan · **AI 生成人审门** `art-review-smoke.py` 全链 generate→pending→approve/reject + provenance 硬校验 · **美术替换工作流** `art-replace-smoke.py` 全链 derive→batch(mock)→replace(parseManifest 零 error)+断点续跑+编号稳定·进程内 API·快照恢复零污染） | 退出码 |
| 游戏体检 | `node scripts/game-skill-audit.mjs <game>` | 零红旗 |
| 系统调度积木稳定性 | `npx vite-node scripts/system-graph-audit.mjs [capId…]`（悬空定序边/重复 system id/Tarjan 切最小 SCC+破环建议·`src/assembly/system-graph.test.ts` 守硬不变量） | `SYSTEM-GRAPH: PASS` |
| 共同零件（组件）清单漂移 | `node scripts/component-manifest-guard.mjs`（扫全部 `readonly type:'X'` 对比冻结基线·加/改名/删组件须同提交 `--update`·`scripts/component-manifest-guard.test.mjs` 守门） | `COMPONENT-MANIFEST: PASS` |
| 3D 截图对拍 / 渲染冒烟 | `scripts/shoot-game.mjs`（真渲染截图·`SHOOT_QUERY`/点击穿透）→ 人审；机器判定走 `scripts/render-probe.mjs --game <slug>`（非空白像素 + 零 console error·REQ-RENDERCHECK·S3 门） | 截图=人审；render-probe 退出码 0 |
| 视觉里程碑验收 / 出货 | `docs/playbooks/visual-scorecard.md`（8 维评分卡）→ **落账进流程板** `game-pipeline.mjs scorecard`（任一维 0=S7 红灯） | 全维 ≥2 = premium |
| 阶段复查（三门制·复查人≠施工人） | `game-pipeline.mjs checklist <SN>` → 对抗核证 → `review --verdict --note --by`（`docs/playbooks/review-gates.md`） | PASS/CONCERNS/FAIL |
| 上下文预算（防信息膨胀·新 session 读得完） | `node scripts/context-budget-guard.mjs`（requests 池/T0 必读/手册行数各封顶·基线 `scripts/context-budget-baseline.json`·超顶正解=归档不是抬顶） | `CONTEXT-BUDGET: PASS` |
| S4 玩法正确性（GD×PE 循环·防「绿门不可玩」） | 验收剧本 harness（`scripts/acceptance-run.mjs` + `acceptance.test.mjs`·REQ-ACCEPT） | 全部剧本绿 + ≥3 场景 |
| **交互可玩性（防「绿门不可玩」渲染层盲区）** | **真浏览器手势目击**：playwright 点/拖**真 DOM 元素** → 断言**可见产出/落点**（非只机读态·非合成注入世界） | 见下红线「可玩性目击」·可见结果达成 + 附截图 |

## 验收剧本（S4 玩法关裁判·REQ-ACCEPT·「绿门不可玩」复盘）

- **schema**：GD 写纯数据剧本 `docs/design/<game>/acceptance/*.scenario.jsonc`＝`{name,game,seed,config?,steps:[{signal,args?,by?}|{tick:N}|{waitUntil:[断言…],cap:N}|{expect:[断言]}]}`；断言闭集只读机读态 `{res|flag|sv|comp}`（不读 DOM）·坏本装载即报错带行位。
- **waitUntil 条件等待（REQ-WAITUNTIL·owner 2026-08-09 判 A）**：等某状态成立再继续——断言复用 expect 闭集，`cap`=封顶拍数（必填·防死等）；**先查后拍**（已成立=0 拍），到 cap 仍不成立=FAIL（bug 单带已等拍数）。**新剧本的「等结算/等相位」一律用它，别写死拍数**（裸 `{tick:N}` 仍合法但节奏一调就要人肉重算——game108 十二本剧本 103 处魔法数的教训）；等待拍数入 trace（同 seed 同轨连它一起比）。
- **runner**：`npx vite-node scripts/acceptance-run.mjs [--game g]`（经薄适配 `games/<game>/acceptance-adapter.ts`＝createWorld/applySignal/readWorld 驱动真引擎·失败报告=步号+期望 vs 实际+机读态快照）；全部剧本也进 vitest（`scripts/acceptance.test.mjs`·推送门禁自动咬）。
- **分工**：剧本＝**GD 域**（懂规则方）；**PE 修码不改剧本**（剧本错=GD 改+记录）；PE 只落薄适配（纯接线零规则）。S4 门要 ≥3 场景 + conformance 绿才过（`game-pipeline.mjs gate <slug> S4`）——无剧本/无 adapter=门红。

## 递归复核：**用实现反过来判剧本**（owner 2026-08-07 立）

> **隔离施工配方（深审 2026-08-10 验证）**：破坏性验证要临时改代码——**绝不碰共享工作树**：
> `git worktree add <scratchpad>/probe-XX HEAD` + 软链 node_modules，验完撤树；破坏前**预告锚点**（哪条测试该红），全绿先怀疑「没改到文件」。

> 病：「剧本作者 = GD 非 PE」靠**两个人**防「实现错了剧本也跟着错」。owner 2026-08-07 裁：
> **同一个人可以接受，但判定时候的逻辑需要有一个递归。**
> **署名行规（REQ-C-108④·Lead 裁）**：剧本首注释行 `// author: <角色>`=归属唯一凭据（同 git 署名 blame 分不出角色·PE-C 自写 4 本实证）；新写/改动缺行=S4 打回，存量随下次改动补。

**递归 = 剧本判完实现之后，再用实现反过来判剧本一遍**：逐条策划条款**故意打坏它的实现 → 必须有剧本转红**。
没有任何剧本会红的条款 = **该条款没有守卫**，剧本是摆设。同一个人写剧本时最容易这样——
不自觉贴着自己的实现写，看着全绿其实什么都没守。

样板 `scripts/game108-spec-recursion.mjs`（13 条条款 · 0 条裸奔）。照抄四个要点：
① **每处破坏带锚点断言**（`find` 串不在文件里就报错），防「全绿其实是根本没改到文件」；
② **早退也必须先复原**——`process.exit()` 跳过 `finally`（实测被这个坑留下过破坏态的蓝图）；
③ **先验前提**：未破坏时必须全绿，否则「变红」不成立；④ 判词说清被哪几条剧本抓住，裸奔的点名。

## ⚔ 对抗性输入清单（owner 2026-08-07 立·**踩过的坑一律回填成常规项**）

> 立这条的复盘（game108）：条款【R-108-10】写「T1 往一手存 **+1**」，实现是「**每点一次 +1**、上限 3」——
> 两者从 S3 起就不一致，**验收剧本、递归复核、35 条试玩断言，一个都没抓到**。
>
> **为什么全漏：剧本是照着实现的口径写的。** 剧本原文是 `charge.rock ×2 → 对手 −30`——
> 这句话描述的是「按几次键」，而「按两次加两层」在两种实现下**都成立**。
> 一条**能被两种实现同时满足**的断言，等于没测那条条款。
>
> **铁律：剧本从条款原文写，不从实现写。** 写完自问一句——
> **「如果实现是另一种合理写法，这条断言还会绿吗？」还绿 = 这条没测到东西，重写。**

**每个游戏的试玩/剧本必须覆盖这一栏**（踩过一个就往下加一条，只增不减）：

| 对抗手法 | 抓什么 | 出处 |
|---|---|---|
| **连点同一个键**（一个时区内点满） | 「每回合一次」还是「每次都算」——**条款与实现最容易分叉的地方** | game108 R-108-10 |
| **点已禁用的键** | 禁用是真禁用（不产生信号），还是只是画灰了 | game108 满槽键 |
| **相位边界抢点**（快到点时点 / 刚切相位就点） | 信号落到哪一拍、会不会跨拍生效 | — |
| **终局屏每个出口都点一次** | 死键（`self-check.md`「终局出口必点」） | game108 `duel.next` |
| **点完不动**（超时路径） | 超时分支真的走了没有——「什么都没发生」的分支最没人测 | game108 R-108-02 |
| **重复进出同一个屏**（菜单开合、重开局） | 状态残留（上一局的记忆跟进新局） | game108 重开 |

> **两条写法坑**（2026-08-08 各白查一轮）：① **连点别用 `await page.click()` 循环**——每次点前都做可点性检查，而"点一下就消失"的键第一下之后就没了，剩下几下各等 30 秒超时、`.catch(()=>{})` 再静默吞掉；用 `page.evaluate(() => { for (...) el?.click(); })` 一个 JS 回合内同步连点（这才是真手速），断言改成**"只推进了一格"**。② **叠层遮挡会伪装成逻辑 bug**：按钮画出来了、`data-action` 也对、单测全绿，但被**自适应高度**的容器（横幅/字幕/自动换行说明——下边界不写在代码里）压住 → 探针点在别人身上、**世界零反应且零报错**。同日撞两次：挪了位置仍被同一条横幅压住，因为横幅高度**随伤害数字变化**（掉 20 不压、掉 40 压）⇒ **解不是挪位置，是挂进那个自适应容器当子节点**，让布局保证不重叠。「按当前数据量了一下不重叠」不是结论，**数据会变**。故新加的可点元素首跑就留一张所在屏截图。

## 红线（一体适用）

- **可玩性目击（owner 2026-07-25 拍板·game101「点了没反应」复盘落地·全档位一体适用）**：**headless 全绿（sim 单测 + `validateLayoutNode` + 验收剧本机读态）≠ 能玩**——门禁与验收剧本都**不点真 DOM、不看渲染可见性**（剧本 schema 明写「不读 DOM」），故「逻辑对但渲染盖住 / 产出落点玩家看不见 / 信号没接到视图」这类 bug **全部漏网**。复盘实例：生成器产出用 `caster at:'self'` 落在**生成器自己那格**、被生成器图标盖住 → 点了体力静默扣、屏上无物 = 像坏了没法玩，却 sim 测全绿。**任何可点/可拖的交互特性，宣布「能玩 / done」前必须三步目击**：① 起真浏览器（`?game=<slug>`·`/opt/pw-browsers/chromium`）② 做**真实玩家手势**（点/拖真元素·**非**合成 RawInput 直插世界）③ 断言**可见产出**（新物/反馈出现在玩家**看得见、够得着**的格/位·非只机读态涨了）——三步缺一不算目击，截图进领工声明/复查。别再拿「门禁绿」当「能玩」。
- **门禁=退出码**：`tsc + vitest + build` 全 0 才推；rebase 带进新提交必须重跑；禁 `vitest | grep` 吞失败码。
- **快/慢双车道（owner 2026-07-21 提速）**：`npm test`（推送门禁+`scripts/scoped-gate.mjs` 走这条）=快车道·`vite.config.ts` 已排除整局通关巨无霸 + 起进程 CLI 测试（占 CPU 不成比例却每推空转，具体排除项与理由见 `vite.config.ts` `exclude` 注释——不抄清单，清单本身会漂移）；`npm run test:deep`（`ZEROCRAFT_DEEP=1`）=慢车道跑全部文件·**发版前/定期必跑=完整安全网**（总文件数以实测为准，不抄数字）。缩的是「每次推的负担」非总覆盖。改动全在单游戏时 scoped-gate 只跑该游戏测试（详该脚本头注）。
- **测试代码三禁**：真实时间等待（墙钟 sleep/setTimeout）、外部 IO 直连、无种子随机——FAIL 级，用信号/mock/种子 PRNG 替代（fake timers 合法）。
- **复现=seed+tick**：bug 复现优先给种子 + tick 序列/replay 文件（确定性引擎的强项）；文字步骤是降级方案。
- **缺基线判黄不判绿**：sim 缺目标带、bench 缺 prior、AC 不可测 → CONCERNS / MANUAL CHECK 交 owner；绝不默认过、绝不编造目标值。
- **存档/回放改动必测边界**：旧版本档载入（save-port migrate 链）+ 损坏档优雅拒绝（`CorruptSaveError` 基座已给）。
- **冒烟脚本 fail-fast**：前置缺失（无 build/无 manifest）立即非零退出 + 指出补救命令，禁静默跳过造假绿。
- **凭证探针（TGS 吸收·owner 2026-07-06 批）**：任何「无 key/无环境所以跳过」的回执必须附探针输出（缺哪个 env、调用返回什么）——空口 skip 不采信，视同未测。
- **红旗棘轮（只降不升·进门禁）**：在册游戏（以 `audit-baseline.json` 实收为准·不抄数字）的裸随机/innerHTML/createElement 计数以 `scripts/audit-baseline.json` 为机读基线，任一超基线 → `scripts/game-skill-audit.mjs` 打 `RATCHET: FAIL` + 退出码 1，`scripts/audit-ratchet.test.mjs` 在 vitest 里守着。降基线是还债仪式（消灭红旗必须同提交改 baseline）；抬基线唯一合法姿势=给该游戏条目挂 `reason:"REQ-xxx"` 缺口单号。

## 验收纪律（Lead / 判官侧）

- 代理自报全绿不算数：**独立复跑 + 对抗性 diff 复核**；UI 里程碑必须真浏览器旅程。
- **偏差三分法**：diff 偏离 spec → INTENTIONAL（记录准许）/ ERROR（打回）/ OUT OF SCOPE（回改 spec/手册），分类写进工单——不许默默接受"实现替代了图纸"。
- 靶向回归先行：改 capability 先跑受影响游戏的 smoke+sim 子集定位，全量留给推前门禁。
- 判词用闭集 token（PASS / CONCERNS / FAIL；工单态 BLOCKED=等外部动作 / NEEDS WORK=可自补），理由带 `file:line` 与实数，禁套话。
- 新语义无点名测试不关单：工单关账前核对「本条新语义有无点名断言」，缺口列测试名不笼统"补测试"。

## 查不到怎么办

- 新测试形态（soak 长跑、视觉回归、多跑 flakiness 统计等）本手册没有 → `docs/workflow/requests.md` 提缺口等裁决，**绝不自造 harness**。
