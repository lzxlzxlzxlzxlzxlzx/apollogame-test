# ZeroCraft Preview — 项目规则（每会话必读）

## ⛔ Owner 本机操作边界（最高优先级）

> 本节由 owner 明确制定，优先于本文其余全部规则，包括分支、抢锁、门禁、验证、发布、数据库和启动流程。任何任务、角色卡、skill、工单或“正常实现步骤”都不构成例外。Agent 可执行本地 Git、受控本地数据库操作、本地工程文件保存和短生命周期测试探针；直接修改远程 Git 仓库、在本地运行时修改远程数据库、以及自行拉起整套 ZeroCraft 系统仍须由 owner 亲自执行。只有 owner 明确要求修改本节规则原文后，行为边界才会改变。

### 1. 禁止 agent 直接修改远程 Git 仓库

- Agent 可以执行本地 Git 读取与本地仓库操作，例如 `git status`、`git diff`、`git log`、`git add`、`git commit`、本地分支切换以及仅更新本地引用/工作树的 `git fetch`、`git pull`、`git rebase`；仍须保护共享工作树和他人改动。
- Agent 严禁自行执行 `git push`，也不得执行任何会直接修改远程 Git 仓库、远程分支、标签或其他远端仓库状态的操作，包括远程删除、强推及通过 `gh`、GitHub API、IDE/GUI、MCP、脚本包装或子进程达到相同效果。
- 需要直接修改远程 Git 仓库时，agent 必须把准确命令、工作目录、用途、影响和预期结果发给 owner，由 owner 亲自执行；在 owner 贴回真实结果前，不得宣称远端操作已完成。只读远端检查和不会修改远端的本地 Git 操作不受此交接限制。

### 2. 本地运行时禁止 agent 修改远程数据库

- Agent 可以在任务范围内自行创建、修改和清理**确认位于本机的数据库**，包括隔离测试用 IndexedDB、SQLite、本机数据库实例及其迁移、seed 和测试。优先使用任务级临时或隔离数据库；操作前核对实际连接目标、库名/路径及影响范围，避免触及 owner 的真实业务数据、日常浏览器资料或其他项目。
- “本地”以实际数据存储位置为准，而非访问入口：`localhost` 代理、端口转发、SSH 隧道、容器映射或本地客户端连接到远程数据库，仍属于**远程数据库**。只要目标位于其他机器、云服务或无法确认位置，agent 严禁执行任何可能写入的 DDL、DML、迁移、回滚、seed、导入、清库、ORM schema push、管理后台写操作，以及可能间接触发写入的脚本、测试或命令；开发/测试环境也不例外。不得通过 SQL 客户端、ORM、HTTP/API、MCP、GUI、浏览器或脚本绕过。
- 本地数据库操作仍须遵守任务授权与最小影响原则。对现有本地业务库执行清库、破坏性迁移、批量覆盖或不可逆改写前，必须明确目标、备份/回滚办法，并取得 owner 对该具体操作的同意；不能把“允许本地数据库”理解为可任意改动用户存档、账号或其他业务持久化数据。操作必须尽可能隔离、可恢复，测试后清理临时数据。
- 本地运行任务涉及远程数据库写入时，agent 必须把准确命令、目标环境与数据库、修改目的、影响范围、备份/回滚办法和预期结果交给 owner 亲自执行。只有能够确认不会写入、不会迁移、不会改变持久化状态的纯只读远程检查才可由 agent 执行；无法确认目标位置或副作用时，按远程写入处理并交给 owner。

### 2.1 项目路线图控制台例外（Owner 明确授权）

- Agent 可以自行创建、维护和保存 `docs/projects/<project-id>/project-roadmap.json` 这一**文件制项目控制台**，可通过现有 `main_entry.project_roadmap` 的合法保存入口或等价的控制台保存 API 登记项目、真实证据、进度、后续计划、阻塞与复查状态；无需每次交给 Owner 操作。此授权不扩展到远程数据库或 Owner 人门；游戏 `pipeline.json` 属第 2.2 条的本地工程文件，须经合法 CLI/控制台入口按真实证据写入。
- Agent 保存前必须读取当前路线图并核对来源证据，使用既有校验器，保护并发变更；只按事实推进 `planned/active/blocked/review`，不得直接提交 `done`、伪造自检/独立复查或跳过依赖。`owner=not-required` 项在真实证据与门禁均满足后，可由保存入口自动收束为 `done`。
- **Owner 人门只由 Owner 本人通过或退回。** Agent 严禁调用 `owner_decide`、`/api/projects/<id>/roadmap/owner-decision` 或任何等价审批入口，也不得把 Owner 的聊天表态伪造成控制台人门操作。保存后应重新读取控制台，报告真实状态与尚待 Owner 审批的事项。

### 2.2 允许 agent 修改本地工程文件与执行受控正式物化（Owner 明确授权）

- **权限只按实际副作用判定，不按“候选 / 正式 / 持久化”这些称呼判定。** 只要结果仍是当前工作区内的工程文件写入，且不触及远程 Git、远程数据库、Owner 账号/存档、发布或人门，AI/agent 就有权在已交付任务范围内直接完成；文件会长期保留、会被 launcher 读取、或被称为“正式版本”，都不构成再次要求 Owner 手工执行的理由。
- 仓库中的代码、文档、配置、JSON、manifest、`games/<slug>/` 正式游戏数据、`public/` 下项目资源及游戏 `pipeline.json` 属于**本地工程文件**，不因会被运行时消费就等同于数据库、用户存档、远程发布或 Owner 人门。只要修改属于 owner 已交付的任务范围，agent 可以直接创建、修改、替换并保存这些文件，无需让 owner 逐条复制命令。`pipeline.json` 只能通过既有流程 CLI/控制台入口以真实机器门和独立复查证据写入，不得手改伪造绿灯或代签人门。
- 本节所称“正式物化”仅表示把已审候选转换为运行时会采用的**正式工程文件版本**；它是仓库文件写入，不是数据库迁移、用户数据持久化、服务端状态更新或远程发布。不得仅因文件位于 `games/<slug>/`、会被 launcher 发现，或写入结果会保留在磁盘上，就把它升级为必须由 owner 亲自执行的“持久化操作”。
- 对 `life-materialize --promote/--update` 等受控物化入口，owner 对具体游戏/施工单/候选方向的明确授权即构成执行授权；已经获得授权后，不得再以“正式文件”为由要求 owner 手工执行同一命令。Agent 执行前必须先跑零写入 plan/preflight，核对精确目标、文件清单、冲突、confirmation/current hash 与资产审批状态；只能使用仓库提供的严格工具和原子/可回滚路径，禁止手工拼接绕过 gate。
- 执行后必须重读真实落盘文件，复验 canonical bytes/hash、严格 validator/compiler/discovery 和相应测试；发现 drift、冲突、目标越界、额外文件、symlink、审批缺失或回滚不可靠时必须停止写入并报告，不得放宽工具或伪造确认值。
- 本授权不允许 agent 代替 Owner 通过 S1--S8、Playtest、路线图 owner gate、素材审美/来源/许可审批，也不允许伪造 `approved`、reviewer 或 provenance。素材只有在 owner 已批准具体候选及来源/许可后才可物化；远程模型/API 调用仍需任务中明确授权。
- 本授权不扩展到远程 Git 写入、远程数据库写入、Owner 的真实账号/存档/日常浏览器资料、整套 ZeroCraft 系统启动、商店上传、远程发布或其他外部不可逆操作；这些继续按对应禁令执行。本地 Git 和短生命周期门禁探针分别按第 1 条与第 3 条执行。

### 3. 禁止 agent 自行拉起整套 ZeroCraft 系统

- 整套 ZeroCraft 系统正常由 owner 在本机命令行启动并保持运行，主入口通常为 `http://127.0.0.1:5173/`。Agent 严禁自行拉起、重启或后台常驻运行这套系统，包括以 `npm run dev`、`npm start`、`docker compose up` 或等价包装命令启动主工作台及其配套服务。
- Agent 可以为任务范围内的构建、门禁、截图与 UI 验收启动**短生命周期、隔离且由命令自动清理**的局部测试服务和无头浏览器，例如 S3 渲染/点击探针内部的临时 Vite。运行前应核对命令只启动测试所需局部服务，不会拉起整套 ZeroCraft、不连接并改写远程数据库或占用 owner 正在使用的 5173；完成或失败后确认子进程已关闭。
- 确需启动或重启整套 ZeroCraft 系统时，agent 必须把准确命令、工作目录、用途、占用端口、预期日志以及停止命令发给 owner，由 owner 亲自输入；在 owner 贴回日志或访问结果前，不得假定系统可用。Agent 可对 owner 已启动的服务做只读健康检查。

### 3.1 无头浏览器与短时测试探针

- Agent 可以为验收启动短生命周期的无头浏览器进程，例如 Chromium、Playwright 或 Puppeteer，用于截图、视觉回归、布局检查、可访问性检查和 UI 自动化测试；测试需要写入隔离的本地 IndexedDB 时，按第 2 条执行。
- 无头浏览器可以访问 owner 已启动的本地服务、任务级临时测试服务、已存在的远程页面、本地静态文件或完成的构建产物。测试探针同时启动临时 Vite 等局部服务时，须满足第 3 条的隔离、短生命周期与清理要求。
- 无头浏览器必须使用任务级临时隔离配置；不得使用 owner 的日常浏览器配置、账号、Cookie 或持久化用户目录。验收结束或失败后必须主动关闭，不得后台常驻。
- 无头浏览器默认只能执行不会改变业务或持久化状态的操作；第 2 条允许的隔离本地数据库写入除外。远程数据库、账号、内容发布或其他持久化写入仍受对应禁令约束，不得借浏览器验收绕过。
- 交付时应说明访问地址、执行的审计以及临时浏览器是否已经关闭。

### 4. 强制交接格式

需要 owner 执行上述受限操作时，agent 必须使用以下格式，不得只说“请运行一下”：

```text
需要你在本机执行：
工作目录：<绝对路径>
目的：<为什么需要执行>
命令：
<可直接复制的完整命令>
影响/风险：<会改变什么；无则写“无”>
预期结果：<成功时应看到什么>
停止/回滚：<适用时给出；不适用则写“不适用”>
请把完整输出贴回来，我再继续依赖此步骤的工作。
```

### 5. 禁止绕过与冲突处理

- 不得把受限操作藏进 npm script、批处理、PowerShell、Node、Python、测试、构建钩子、容器、子 agent 或自动化工具中执行；第 1 条允许的本地 Git、第 2 条的受控本地数据库操作、第 2.1 条的项目路线图合法保存、第 2.2 条的本地工程文件/受控物化及第 3 条的短时测试探针不属于受限操作，也不得借它们修改远程 Git 仓库、写远程数据库、拉起整套 ZeroCraft 或改变其他未经授权的外部状态。
- 不得使用权限申请、沙箱升级或用户曾经授予的命令前缀来绕过本节。
- 后文凡出现“agent 应直接修改远程 Git 仓库 / 修改远程数据库 / 拉起整套 ZeroCraft”的规则，统一解释为：agent 负责准备并核对命令，owner 负责亲自执行，agent 根据 owner 返回的真实输出继续工作；本地 Git、本地数据库、工程文件及短时探针分别按第 1、2、2.2、3 条执行。

> **⛓ 第一准则·分支（受上方 Owner 本机操作边界约束）**：默认工作目录/分支 = `Codex/mainbranch`（除非 owner 在本 session 内明确另指）。Agent 可自行执行安全的本地分支操作；向任何远端推送仍由 owner 亲自执行。

## 📚 开工前强制阅读闸（每个游戏生产任务必过）

> 本节适用于任何新建、续做、修改、迁移、接入或打包游戏的任务。它是**开工前置条件**，不是建议阅读。Agent 在完成本节前，只能进行定位文件所必需的只读检查；严禁修改文件、写玩法代码、接 UI/资产、运行构建/测试/审计、生成 dist 或宣称已经开工。恢复旧会话、接手其他 agent 工作或“只是小改”均不豁免。

### A. 所有游戏生产任务必读

Agent 必须由主 agent 本人完整阅读并遵守以下文件，禁止只读标题、摘要或让子 agent 代读：

1. `AGENTS.md`（本文件，完整阅读）；
2. `docs/llm-onboarding.md`；
3. `docs/playbooks/index.md`；
4. `docs/playbooks/game-production.md`；
5. `docs/playbooks/game-requests.md`；
6. 根据 `docs/playbooks/index.md` 判定本任务涉及的生产线，并完整阅读对应的全部 playbook（例如 UI、卡牌、事件、战斗、随机、资产、美术、音频、存档、3D、测试、自证、复查等；涉及哪条读哪条，禁止凭印象跳过）。

新游戏 / 新玩法还必须在写游戏层代码前完整阅读 `docs/design/capability-plan-template.md`，并先产出、评审通过 `docs/design/<game>/capability-plan.md`；plan 未通过不得实现玩法。

### B. DokiWorld 接入或打包的追加必读

只要任务包含 DokiWorld SDK、宿主输入输出、manifest、调用说明、资产闭包、dist、zip、上传目录、接入测试或发布中的任一项，除 A 组外还必须完整阅读：

7. `docs/playbooks/dokiworld-app-current.md`；
8. `docs/sdk/dokiworld-app/identity-manifest.md`；
9. `docs/sdk/dokiworld-app/contracts-lifecycle.md`；
10. `docs/sdk/dokiworld-app/integration-documentation.md`；
11. `docs/sdk/dokiworld-app/assets-build-release.md`；
12. `docs/sdk/dokiworld-app/testing-delivery.md`；
13. `vendor/dokiworlds-app-sdk/GUIDE.md`；
14. `vendor/dokiworlds-app-sdk/src/index.d.ts`。

新建或更新调用说明时还必须使用 `docs/playbooks/templates/dokiworld-integration.zh-CN.template.md`，不得从空白自由发挥；历史 `docs/playbooks/dokiworld-pack.md` 只作发布线背景，若与当前规范冲突，以 vendored SDK 与 `dokiworld-app-current.md` 分册为准。

### C. 阅读证据与冲突处理

- Agent 的第一次施工进度更新必须列出“已完整阅读”的实际文件清单，并说明本任务命中了哪些生产线 / playbook；未列出即视为未过阅读闸。
- 读取后必须先按资深程序员 + 架构师视角给出“接受 / 回驳 / 需 owner A/B 裁决”的需求判断，再开始实现；不得一边读一边先写代码。
- 文件缺失、无法完整读取、内容冲突或规范版本不明时，必须停止依赖该部分的施工并报告原文证据；不得猜测、沿用记忆或用旧示例替代。
- 规则优先级：Owner 本机操作禁令与本文件最高；DokiWorld 协议事实以 vendored SDK `GUIDE.md` / `src/index.d.ts` 为先，其次当前 DokiWorld 分册；具体模块以 capability registry 和对应生产线 playbook 为准。
- “已经在以前会话读过”“另一个 agent 读过”“文件看起来没变化”均不能替代本会话完整阅读。

## 🧭 新游戏 HTML 原型先行铁律（S1-P·Owner 人门）

> 每一款新游戏都必须在正式玩法/UI/美术施工前，先有一份经 owner 目击并明确定稿的可运行 HTML 视觉交互原型。原型是目标产物的 authoring-time 单一视觉真相，解决“文字聊清了、最终画面仍与预期不同”；它不是生产代码，也不得被直接塞进游戏运行时。

- **阶段位置**：`S1 立项卡 → S1-P HTML 原型 → owner 定稿 → S2 能力计划 → S3+ 正式实现`。`S1-P` 是 S1 内的独立子关，不改变现有 `game-pipeline.mjs` 的 S1–S8 编号；但 **S1 人门只有在原型定稿后才允许签核**。没有定稿原型，不得进入 S2，不得写正式玩法代码、LayoutNode UI、play-field 或美术接线。
- **落盘位置与格式**：原型随游戏设计档落在 `docs/design/<game>/`；优先单文件、自包含、浏览器可直接运行的 `.dc.html`。图片较多时可交 `.zip` 并按工坊设计稿收件流程落入 `ui-refs/`，保持相对路径；禁止把仅存在于聊天、临时目录、远程链接或截图里的稿件当作已交付原型。
- **最低覆盖**：必须呈现目标逻辑画布（默认 **1440×900**；不同尺寸须 owner 明确拍板）、完整主界面布局、全部玩家可见核心屏、关键阶段/弹窗/胜负态、控件默认/悬停/按下/禁用态，以及至少一条从“开始操作”到“结果反馈”的完整关键演出链。抽牌/出牌/受击/QTE/进度变化等关键动效必须能在原型中触发或回放，写明时长、先后与并行关系；禁止只交一张静态好看首页。
- **占位诚实**：原型可使用占位图，但角色、卡牌、按钮、文本区和特效的尺寸、锚点、遮挡关系与层级必须代表最终目标；占位必须显式标注，不能用“以后接真素材”掩盖尚未决定的构图。
- **定稿证据**：owner 必须真机目击原型并明确说定稿；在设计稿台账或同目录说明中记录定稿版本、逻辑画布、覆盖屏幕、关键演出和 owner 判词。Agent 不得代签，不得把“文件存在”“能打开”或 agent 自评当作 owner 验收。
- **实现边界**：`.dc.html` 只定义目标外观、状态与时序。正式实现必须遵守本引擎数据驱动、LayoutNode、render 组件、资产索引和信号铁律；禁止复制原型的自由 DOM/CSS/JS 作为游戏实现，表达不了的部分按缺口裁决协议报 PUI/对应生产线。
- **两层 1:1 验收**：S4 完成结构 1:1（布局、比例、信息层级、状态可见性与交互路径）；S5/S6 完成视觉与演出 1:1（字体、颜色、纹样、素材、特效、动画时长/轨迹/并行关系）。自证必须提交原型与真实游戏的同画布并排截图/关键帧序列及逐条差异单；存在未裁决偏差不得宣称完成。
- **原型优先变更**：定稿后若要改布局、卡面、视觉状态或动画节奏，必须先修改原型、由 owner 重新确认并更新定稿记录，再修改正式游戏。禁止程序侧先漂移、事后反向改原型追认。

## ⭐ 核心规则（CORE RULE·每条新输入先执行）

### 项目路线图控制台

- 涉及已注册项目的实现、规划、验收或派工前，先读取 `docs/projects/<project-id>/project-roadmap.json`；agent 可追加真实证据并推进到 review。仅 `owner=not-required` 的自动闭环项可由服务端在真实自检与独立复查均 pass 后收束 done；agent 不得直接提交 done 或代替 owner 批准。owner 人门仍仅由 owner 在控制台通过/退回。该控制面不改变游戏 S1--S8 人门。
- **大型/跨阶段项目的持续同步闸**：凡已有 `docs/projects/<project-id>/project-roadmap.json`，每次接手先核对“控制台状态 ↔ 最新工单、独立复查、未决差异”；每次局部复查、Owner 裁决、阶段范围/依赖或阻塞变化后，在本回合收工前再次核对并准备更新。只把实证写到对应里程碑的描述/证据/状态；局部 PASS 不等于整个里程碑通过，未来工作和缺口须保留可执行的验收项。不得因会话里的口头进度、施工者自评或测试单项通过而把里程碑标成 done；更新后重读控制台确认真实落盘结果，并在交接中报“已同步/待 Owner 同步”及原因。
- **与最高优先级边界的执行关系**：第 2.1 条已授权 agent 自行保存文件制项目路线图；每次保存后必须重新读取并核对真实落盘结果。Owner 人门、远程 Git 写入和远程数据库写入仍受限；游戏流程板按第 2.2 条合法入口写入，短时门禁探针按第 3 条执行。本地数据库操作按第 2 条独立判断。

### 模拟经营游戏生成流程（全 agent 触发）

- 用户提出“生成模拟经营游戏 / 种田游戏 / 小镇经营 / Life JSON / AI 生成地图、NPC、剧情或素材槽位”时，必须先使用 `.agents/skills/simlife-generation/SKILL.md`；不得把 Little Valley 的 TypeScript 复制成新游戏。
- 生成内容必须走 `Generation Brief v1 → LifeGenerationBundle v1 → 严格校验/编译/确定性探针 → 素材审核队列 → 经批准物化`。Codex 对话与未来前端/API 复用同一边界和数据格式；细则见 `docs/design/game-simlife/generation-workflow-v1.md`。
- 未经 owner 对具体游戏/施工单或候选方向的明确授权，agent 只能生成候选、诊断、预览与零写入计划，不得创建正式游戏、登记资产或调用外部模型。获得正式工程文件/物化授权后，agent 应按第 2.2 条直接完成严格 materialize，不重复索取“请你亲自运行”确认；素材批准与远程模型/API 调用仍需各自明确授权。

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
- **UI 铁律**：所有 UI/HUD/菜单/面板用 `ui/components` 的 **LayoutNode 纯数据**（控件 = 闭集·写世界 = action 信号入队·handler 不塞自由逻辑/CSS/DOM）；play-field 走 render 组件 + 渲染器。**禁**手写 React 屏/自由 DOM/直用 `ui/shell`·`ui/vn`。表达不了 → requests.md 扩控件，绝不手写逃生。**新游戏必须先过上文 S1-P 原型关；定稿 `.dc.html` = 1:1 复刻基准**：开工前真渲染目击（附截图）、视觉规格全消费、差异逐条报 PUI 裁决。**做 UI 前必读 `docs/design/ui-playbook.md` + `docs/playbooks/ui.md`。**
- **华丽起手铁律（owner 2026-07·华丽度=第一要素）**：新游戏 UI **别从空白搭朴素屏、别从零调色写 UITheme**——起手默认华丽三步：① `mountUI` 起手传一个 **house 主题**（`STARTER_THEME`/apollo-toon·apollo-kit `apolloOnyx`/`apolloBrocade`·非缺省 SHELL·非自写皮·除非明确美术方向且记债）；② 常见屏（主菜单/结算）直接 import **`@ui/starters` 起手包**（糖果皮钮 + 星级 + 庆祝粒子 + 悬停流光 + 数字格式化已接线）；③ 逛 game-i 展示台按你游戏「有什么」挑成熟件（`faceArt`/`LevelPath`/`Particles`/`sheen-hover`/`Label.format`/`shape`/3D UI…·货架表见 `docs/playbooks/ui.md`「华丽起手」）。**朴素默认 UI = 缺陷**（同手写逃生·PUI 复查可打回）。华丽 ≠ 破铁律 = 用足既有华丽件走闭集数据。
- **推送门禁**：`Codex/mainbranch` 直推不开 PR；每次提交前 `fetch → rebase → push`。`scripts/scoped-gate.mjs --run` 按改动面缩范围（单游戏→该游戏 vitest + tsc + build；纯文档→文档守卫；碰引擎/共享/多游戏→全量）。**全绿才推·用退出码核对**（别 `vitest | grep` 吞失败码·守卫退出码同律永不经管道量）。**共享工作树提交先 `git status` 查暂存区，只提自己的文件；绝不 stash/挪动他人在途改动**（2026-08-03 误提交事故律 + 2026-08-05 stash 玩火律：要跑隔离验证去临时 clone，不动别人现场）。**rebase 后对 origin 重判一次**（自己 delta 非引擎面不必全量重跑·别人已门禁过的提交不重复背）。全库兜底 = 主程每日定时巡检（发现红开单派修·不改代码）。
- 提交署名 `Codex <noreply@anthropic.com>`·信息以 session URL 结尾·产物里不写模型标识。
- **需求池与游戏需求单**：`docs/workflow/requests.md`（只管引擎·最多 10 硬槽·`context-budget-guard` 卡·满了先清后加·done 同提交删除条目）；游戏级当前控制面为 `docs/design/<game>/requests.md`（不占引擎槽）；3D 独立池为 `requests-3d.md`。游戏 `requests.md` **不是施工日志或历史档案**：只能保留当前有效约束、活动工单、阻塞/待裁决和证据链接，严禁追加完整测试输出、逐轮回执、截图过程、复查全文或已完成阶段施工单。证据分别落 `review/`、`self-check/`、流程板等权威位置；done/wontfix/superseded 当回合从当前单移除，确需追溯的原文移入 `archive/`，当前单最多留一行结论+链接。新建或重构必须使用 `docs/playbooks/templates/game-requests.template.md`，完整生命周期见 `docs/playbooks/game-requests.md`；字符/行数由 `context-budget-guard` 强制。**派工**：评审通过的实现类需求标施工主体并附写死 spec；归属与抢锁走上面「施工与复查」。
- **开发新 capability 前查知识库** `wiki/skills/index.md`（按需读对应分类·别一次读完）。
- **游戏能力总览铁律**：新游戏/新玩法开工前先交 `docs/design/<game>/capability-plan.md`（模板 `docs/design/capability-plan-template.md`）：① 消费哪些引擎 capability（对 registry 实名）② 规则摆数据表 + 由现有能力解释（禁「数据表 + 游戏层自写解释器」）③ 逐条申请游戏层例外（Lead 裁·记债）。**plan 未过审不写游戏层 system 代码**；偏差用 `node scripts/game-skill-audit.mjs [game]` 体检。硬红线 = 游戏层禁裸 Math.random（用引擎种子 PRNG）·禁 innerHTML/createElement（走 LayoutNode）·禁零能力接入·禁零测试。
- **TS 卡带例外**：`features.tsCarts`（默认开）+ 卡带 `meta.allowTs` → 允许 `library/<slug>/logic.ts`（`cartCapability` 契约·`scripts/cart-logic-check.mjs` 门·记债）；除此游戏仍 = 纯数据。价值排序：**「能出复杂的东西」= 第一要素**，「最弱 LLM 也能产出」尺子降级。词表缺口走 capgap 快速通道（`scripts/capgap.mjs add`·台账 `.zerocraft/cap-gaps.jsonl` → Lead 裁）。
- **角色启动协议**：owner 宣告「角色 = X·任务 = Y」→ 第一步读 `docs/roles/index.md` 找角色卡照办（域边界/必读/工具以卡为准）；未宣告 = 通用 session 按本文件。
- **生产线手册铁律**：动手任何生产任务（UI/特效/3D/寻路/事件/战斗/卡牌/随机/资产/音频/存档）前先读 `docs/playbooks/index.md` 找对应线手册照做——查得到的用基座件·查不到提 requests.md 等裁决绝不自造。绕基座 = 手册缺陷（修游戏同时回填手册）。
- **⛔ 收工律（owner 2026-08-06 立·治「干一半就停」通病）**：回合只有两种合法中途交回——①缺口 A/B 裁决点（owner 独裁面）②复查门（复查人≠施工人）。其余**做完再停**：交付=清单空+门禁绿；受禁的 Git 步骤只能交 owner 执行并等待真实输出，agent 不得以“未自行推送”为由绕禁令。**禁把可执行项整理成「欠账清单」交回**（整理≠完成）。旧 Stop Bash/Git 钩子因 Windows 沙箱不兼容且违反 Owner 禁令已停用；本律由 `AGENTS.md`、首次进度证据与复查门执行。
- **effort 档位（控 token）**：主 session 默认 xhigh 只干判断类活；能下放的派子代理定档——`low` 机械（搜索/批量改/跑测试/登记）·`medium` 有 spec 小活（单文件小修/写纯数据/补简单测试）·`high` 需理解上下文（多文件实现/常规修 bug/UI 复查/review）·`xhigh` 正确性关键（引擎下沉/难 bug 根因/架构评审/对抗验证）·`max` 仅 owner 明示。owner 说「省着点」→ 降一档；正确性关键路径（引擎核/战斗核/确定性/lockstep）不降档。

## 关键文件

- 宪法 `docs/design/data-driven-manifesto.md`；新游戏接入唯一入口 `docs/llm-onboarding.md`（数字口径以它 §0 机读真相为准·文档手抄数字 = 过期信号）；交接 `docs/workflow/SESSION-HANDOFF.md`；能力库 `src/skills/{atoms,tier1,tier2,tier3}`·组件契约 `src/engine/protocol/components.ts`。
- 游戏 `games/`：d/e/f/g/i/z（出口 D+G·e/i = sample·f 冻结；q/x/t 已随 REQ-RETRO 2026-08-03 删除·再提到即过期信号）；**A/B/C + 101/102/103 为新项目**（A = 掼蛋·B = 雀宴日麻·C = 六人德州·101 = 海港绯闻 Merge·102 = Pixel Pour·103 = 幸存者·各 `docs/design/<game>/`）。
