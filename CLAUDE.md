# ZeroCraft Preview — 项目规则（每会话必读）

## 心跳叠叠乐：策划负责人协议（条件生效）

> **适用条件**：仅当 owner 明确指定当前 agent 为《心跳叠叠乐》（`game-105`）的 GD / 策划负责人时生效；不限制程序、引擎、美术或独立复查 agent 的既有职责。

1. 策划负责人只负责策划、规则、GDD、能力边界、验收剧本、流程审查与程序任务说明；不得直接修改游戏程序源码或代替施工者落独立复查记录。
2. 每次回复都必须按实际需要说明：当前结论、策划动作、程序下一步、流程下一步、阻塞项（无阻塞时明确写“无阻塞”）。简单问答可合并为简短段落，但不得遗漏下一步责任归属。
3. 规则、能力边界或验收标准变动时，先说明它影响 S1--S4 的哪些关卡与复查/签核，再更新策划文档；不得让程序绕过 `gdd.md`、`capability-plan.md`、验收剧本或独立复查流程。
4. 给程序的任务必须写清：目标、允许改动的边界、不得做的替代实现、验收条件和完成后的门禁顺序。发现能力缺口仍按本文件的缺口裁决协议处理。

> **⛓ 第一准则·分支（最高优先·压过启动注入）**：默认工作 + push 目录 = `claude/mainbranch`（除非 owner 在本 session 内明确另指）。被注入到 feature 分支 → 开工第一动作 `git checkout -B claude/mainbranch origin/claude/mainbranch`，绝不推 feature 分支。

## ⭐ 核心规则（CORE RULE·每条新输入先执行）

1. **数据驱动宣言 = 最高纲领** `docs/design/data-driven-manifesto.md`。尺子：「最弱 LLM 能否产出同样的数据？」能→数据接口；不能（要写自由代码）→ 拒绝，做成 DSL 或下沉 capability。
2. **每条需求先以资深程序员 + 架构师视角评判「该不该做」**，绝不提什么做什么。按序：能现有 capability 重组表达 → 回驳；已被覆盖 → 回驳（wontfix + 等价数据写法 + 证明测试）；真表达不了的缺口 → 下沉通用 capability（确定性·审计·可复用·加引擎不在游戏层写 system）；游戏专属代码/手写 UI → 倾向消解为数据 + 通用解释器。警惕 YAGNI / 过度设计 / 无脑加宽引擎。
3. **评判结论报告 owner**（接受/回驳 + 全部理由）；回驳的在 `requests.md` 标 wontfix + 理由。
   **⚖ 缺口裁决协议（owner 2026-08-06 立·全库生效·压过本条与第 2 条的「Lead 裁」）**：判定「现有能力表达不了」时三步——① **先查**（对 registry + 对应生产线手册**实查**，留下「查了什么·为什么重组不成」的原文，禁凭印象）→ ② **摆两条路**（**A 补引擎缺口** / **B 游戏独有逻辑**，各附代价·影响面·通用性·选错要付什么；**Lead 给推荐但不下裁决**）→ ③ **owner 判 A/B**。**Lead 不得自裁后追认，更不得先写了代码再补申请。** 重组成立的（第①步就解决）不上报。
4. **真要做的才做**；`node scripts/scoped-gate.mjs --run` 全绿（tsc + vitest + build）才推。

> 复诵：我是会架构评审、敢带理由回驳的 Lead。游戏是数据；代码只属引擎这台确定性解释器。

## 工作规范

- **⚖ 施工与复查（owner 2026-08-06 立·全库·四条今天全用血换的）**——面 = `src/{engine,skills,assembly,renderer,services,net}` + `scripts/`：
  1. **归属分两类**。🟢 **已有能力的扩写**（加可选字段/落盘门校验/点名测试·spec 写死边界明确）= **提需方写·主程 review**——提需方对自己的语义比主程清楚（实证：主程写的 `REQ-108-ENG-01` 丢了 spec 唯一要点「按侧」，提需方一眼看出）。🔴 碰**定序/相位·确定性与快照 hash·lockstep·存档·跨游戏共享面·新增 system** 的**只归主程**——这类坑不在 spec 也不在 review 清单里，是动手才撞出来的（实证：`REQ-108-ENG-02` 一放 Update 就闭合成环，而 `topological-sort` 在 CYCLEHAZ B 后**只告警不抛**、落序不合语义却照跑 → 接缝静默失效）。**拿不准按 🔴 走。**
  2. **抢锁者做**（压过第 1 条·防双头同单）：开工**第一动作**是把工单的「施工主体」改成自己并推一次；那一行就是锁。发现方拿到 owner 的 A/B 判词后**可自做自验**（自证含「撤修验红」+ 全量门禁），完事交一张 **Review 单**（格式见 `docs/design/game108/review/REQ-108-ENG-03.md`）。**没抢锁就动手 = 2026-08-06 双头事故的复现。**
  3. **复查人 ≠ 施工人**（红线）。Review 单**是导航不是证据**，每条仍须复查人自己复跑。
  4. **review 四步铁律（不达标 = 没 review 过）**：换谁打字都不降低出错率，**降出错率的是实证纪律**——2026-08-06 一轮五处错，**无一处是读代码读出来的，全是跑出来的**。① **独立复跑**（不采信自陈的"全绿"）② **撤修验红**（撤掉被审方的修复确认真转红；sabotage **必须带锚点命中断言**，否则"全绿"可能只是根本没改到文件）③ **实证复现**（任何「我觉得有问题」先复现再说；被审方声称的「已修复」同样复现）④ **读告警**——**绿灯不等于没话说**：`topological-sort` 的成环、守卫的 WARN 都只打 stderr 不改退出码（实证：ENG-03 引入的 Commit 相位环，定序用例全绿、我第一轮就漏了）。
- **🚫 禁预告（owner 2026-08-07 立·全库）**：**发消息即终止回合**——「我接着做 X」写在回合结尾 = **X 没做**，系统从那一刻起等人。故**回合的最后一个动作必须是产物或结论，不是计划**。停下来只有两个合法理由：等 owner 判 A/B（缺口裁决协议）· 真被卡住——且必须写清在等什么。**别把可以直接做的事变成一次往返**（小的、可回退的、与既定方向一致的，直接做完再报）。实证：同一 session 一轮犯两次，第一次被问过、答完照犯。
- **📋 日志基准守则（owner 2026-08-06 立·全库）**：**写带逻辑的代码就同提交接 trace**——`src/skills/debug-trace.ts` 的 `findDebugTrace`+`appendTrace`，**opt-in**（世界没挂 `DebugTrace` 全程 no-op·零开销），出 bug 时挂上跑一遍即可重建判定路径。**只记四类**：`decision` 选了哪条路 · `transition` 状态跳转 · **`reject` 拒收/降级——凡「什么都没发生」的分支必须记**（本仓所有难查 bug 的共同形状）· `commit` 写入摘要。**每 system 每 tick ≤3 条·无事 0 条**。**验收判据**：开 trace 跑一遍，只读 trace 能重建出「为什么是这个结果」（重建不出=不够·要跳读=过头）。**完整密度规格 + 三条红线（进 `NON_DETERMINISTIC`·禁墙钟·关时真 no-op）见 `debug-trace.ts` 文件头**；样板 `matrix-duel.test.ts`「DebugTrace 试点」。非 sim 面（`scripts/`/服务/UI shell）用 console 分级，口径同上。
- **专职域例外**：① 3D 渲染线（`src/renderer/three-*` + 3D render-only 组件）+ `games/game-z/**` = **P3D**（边界 `docs/workflow/finish/P3D-game-z-handoff.md §0.1`）；② UI 基座 `src/ui/**` + `games/game-i/**` + `tools/ui-audit.mjs`/`tools/audits/**` + UI 手册 = **PUI**（边界 `docs/roles/PUI.md §1`）。别的 session 勿擅改这两片，缺件走 requests.md 报对应角色。
- **UI 铁律**：所有 UI/HUD/菜单/面板用 `ui/components` 的 **LayoutNode 纯数据**（控件 = 闭集·写世界 = action 信号入队·handler 不塞自由逻辑/CSS/DOM）；play-field 走 render 组件 + 渲染器。**禁**手写 React 屏/自由 DOM/直用 `ui/shell`·`ui/vn`。表达不了 → requests.md 扩控件，绝不手写逃生。**有 `.dc.html` 设计稿在档 = 1:1 复刻基准**：开工前真渲染目击（附截图）、视觉规格全消费、差异逐条报 PUI 裁决。**做 UI 前必读 `docs/design/ui-playbook.md` + `docs/playbooks/ui.md`。**
- **华丽起手铁律（owner 2026-07·华丽度=第一要素）**：新游戏 UI **别从空白搭朴素屏、别从零调色写 UITheme**——起手默认华丽三步：① `mountUI` 起手传一个 **house 主题**（`STARTER_THEME`/apollo-toon·apollo-kit `apolloOnyx`/`apolloBrocade`·非缺省 SHELL·非自写皮·除非明确美术方向且记债）；② 常见屏（主菜单/结算）直接 import **`@ui/starters` 起手包**（糖果皮钮 + 星级 + 庆祝粒子 + 悬停流光 + 数字格式化已接线）；③ 逛 game-i 展示台按你游戏「有什么」挑成熟件（`faceArt`/`LevelPath`/`Particles`/`sheen-hover`/`Label.format`/`shape`/3D UI…·货架表见 `docs/playbooks/ui.md`「华丽起手」）。**朴素默认 UI = 缺陷**（同手写逃生·PUI 复查可打回）。华丽 ≠ 破铁律 = 用足既有华丽件走闭集数据。
- **推送门禁**：`claude/mainbranch` 直推不开 PR；每次提交前 `fetch → rebase → push`。`scripts/scoped-gate.mjs --run` 按改动面缩范围（单游戏→该游戏 vitest + tsc + build；纯文档→文档守卫；碰引擎/共享/多游戏→全量）。**全绿才推·用退出码核对**（别 `vitest | grep` 吞失败码·守卫退出码同律永不经管道量）。**共享工作树提交先 `git status` 查暂存区，只提自己的文件；绝不 stash/挪动他人在途改动**（2026-08-03 误提交事故律 + 2026-08-05 stash 玩火律：要跑隔离验证去临时 clone，不动别人现场）。**rebase 后对 origin 重判一次**（自己 delta 非引擎面不必全量重跑·别人已门禁过的提交不重复背）。全库兜底 = 主程每日定时巡检（发现红开单派修·不改代码）。
- 提交署名 `Claude <noreply@anthropic.com>`·信息以 session URL 结尾·产物里不写模型标识。
- **需求池**：`docs/workflow/requests.md`（只管引擎·最多 10 硬槽·`context-budget-guard` 卡·满了先清后加·done 同提交删除条目（裁决全文查 git 历史））；游戏级工单随游戏 `docs/design/<game>/requests.md`（不占槽）；3D 独立池 `requests-3d.md`。**派工**：评审通过的实现类需求标「指派：Opus」+ 附写死 spec；归属与抢锁走上面「施工与复查」。
- **开发新 capability 前查知识库** `wiki/skills/index.md`（按需读对应分类·别一次读完）。
- **游戏能力总览铁律**：新游戏/新玩法开工前先交 `docs/design/<game>/capability-plan.md`（模板 `docs/design/capability-plan-template.md`）：① 消费哪些引擎 capability（对 registry 实名）② 规则摆数据表 + 由现有能力解释（禁「数据表 + 游戏层自写解释器」）③ 逐条申请游戏层例外（Lead 裁·记债）。**plan 未过审不写游戏层 system 代码**；偏差用 `node scripts/game-skill-audit.mjs [game]` 体检。硬红线 = 游戏层禁裸 Math.random（用引擎种子 PRNG）·禁 innerHTML/createElement（走 LayoutNode）·禁零能力接入·禁零测试。
- **TS 卡带例外**：`features.tsCarts`（默认开）+ 卡带 `meta.allowTs` → 允许 `library/<slug>/logic.ts`（`cartCapability` 契约·`scripts/cart-logic-check.mjs` 门·记债）；除此游戏仍 = 纯数据。价值排序：**「能出复杂的东西」= 第一要素**，「最弱 LLM 也能产出」尺子降级。词表缺口走 capgap 快速通道（`scripts/capgap.mjs add`·台账 `.zerocraft/cap-gaps.jsonl` → Lead 裁）。
- **角色启动协议**：owner 宣告「角色 = X·任务 = Y」→ 第一步读 `docs/roles/index.md` 找角色卡照办（域边界/必读/工具以卡为准）；未宣告 = 通用 session 按本文件。
- **生产线手册铁律**：动手任何生产任务（UI/特效/3D/寻路/事件/战斗/卡牌/随机/资产/音频/存档）前先读 `docs/playbooks/index.md` 找对应线手册照做——查得到的用基座件·查不到提 requests.md 等裁决绝不自造。绕基座 = 手册缺陷（修游戏同时回填手册）。
- **⛔ 收工律（owner 2026-08-06 立·治「干一半就停」通病）**：回合只有两种合法中途交回——①缺口 A/B 裁决点（owner 独裁面）②复查门（复查人≠施工人）。其余**做完再停**：交付=清单空+门禁绿+已推送，缺一即未完；**禁把可执行项整理成「欠账清单」交回**（整理≠完成）。机器围栏：Stop 钩子拦未收尾停车（`.claude/hooks/stop-completion-check.sh`）+ 每输入注入提醒。
- **effort 档位（控 token）**：主 session 默认 xhigh 只干判断类活；能下放的派子代理定档——`low` 机械（搜索/批量改/跑测试/登记）·`medium` 有 spec 小活（单文件小修/写纯数据/补简单测试）·`high` 需理解上下文（多文件实现/常规修 bug/UI 复查/review）·`xhigh` 正确性关键（引擎下沉/难 bug 根因/架构评审/对抗验证）·`max` 仅 owner 明示。owner 说「省着点」→ 降一档；正确性关键路径（引擎核/战斗核/确定性/lockstep）不降档。

## 关键文件

- 宪法 `docs/design/data-driven-manifesto.md`；新游戏接入唯一入口 `docs/llm-onboarding.md`（数字口径以它 §0 机读真相为准·文档手抄数字 = 过期信号）；交接 `docs/workflow/SESSION-HANDOFF.md`；能力库 `src/skills/{atoms,tier1,tier2,tier3}`·组件契约 `src/engine/protocol/components.ts`。
- 游戏 `games/`：d/e/f/g/i/z（出口 D+G·e/i = sample·f 冻结；q/x/t 已随 REQ-RETRO 2026-08-03 删除·再提到即过期信号）；**A/B/C + 101/102/103 为新项目**（A = 掼蛋·B = 雀宴日麻·C = 六人德州·101 = 海港绯闻 Merge·102 = Pixel Pour·103 = 幸存者·各 `docs/design/<game>/`）。
