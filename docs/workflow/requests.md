# 引擎需求池 · Requests

> **10 硬槽铁律（owner 2026-07-15 拍板）**：本池只放 **owner 级需求·最多 10 条**——**10 条做不完不许加新的，必须清掉（做完归档/降级）才能加**（机器守卫 `context-budget-guard` 卡条数+字符数·超=红灯拦推送）。
> 各角色（按 `docs/roles/index.md` 名录）提需求前先看槽位；游戏级工作票（G/D/Q/I 的 bug/战斗/演出/平衡单）**不占槽**——写**该游戏自己的需求单** `docs/design/<game>/requests.md`（工单随游戏走·游戏可暂停·**编号唯一：开单前 grep 同名防重号**——2026-08-08 game108 GD-01 重号复盘）；3D 线写 `requests-3d.md`；已完结条目删除留 git 历史。
> 状态：`open` / `in-progress` / `done`（附 commit·**标 done 同提交删除条目腾槽·全文留 git 历史**）/ `wontfix`（附理由）。差需求（"不行"）会被打回。

---

## 待处理 / 进行中

### REQ-SIMLIFE-PUI-ICON-FEEDBACK-01 · 图标按钮精确反馈 · Owner A · 施工主体=PUI Codex/root（2026-10-16 本地领锁） · status: in-progress · P1

- 已实查skinFeedback仅用于贴图皮，不能组合表达无皮iconOnly的hover -3px/1.2/5px轮廓光、pressed +3px/.85及disabled视觉；Owner直接选择通用PUI路线。[固定规格/实证/边界](../design/game-demon-castle/work-orders/REQ-SIMLIFE-PUI-ICON-FEEDBACK-01.md)。仅PUI闭集表现合同，旧行为兼容；BDM后续只消费。不是Label/极长名称改造单，不含资产或人门。

### REQ-SIMLIFE-PUI-ICON-BUTTON-01 · 原生可访问图标按钮 · Owner A · 施工主体 = PUI Codex/root（2026-10-16 本地领锁） · status: in-progress · P1

- 既有 Button.icon 仍带可见 label，Panel.action 不能替代原生键盘按钮；需闭集 icon-only、非空名称、图尺寸、缺图文字回退及旧行为不变。[固定规格/实查/验收](../design/game-demon-castle/work-orders/REQ-SIMLIFE-PUI-ICON-BUTTON-01.md)。只归 PUI 域；Life Host 消费由 BDM程序完成，独立复查不自签。
- 2026-10-16 PUI 能力与 game-i 活例异人独立局部 **PASS**，见[自检](../design/game-demon-castle/self-check/REQ-SIMLIFE-PUI-ICON-BUTTON-01.md)与[复查](../design/game-demon-castle/review/REQ-SIMLIFE-PUI-ICON-BUTTON-01-independent.md)；全库门禁仍有域外红，Life Host/正式视觉消费尚未由本票签收，故不作 done。

### REQ-GAL-HOST-EXIT-01 · 宿主退出 · Owner A/B · in-progress · P1 · H1=Codex/root局部PASS；H2/H3桌面后置

[合同与验收](../design/galgame/gal-eng-host-exit-01.md)；H2 后置 web-desktop-release，不接旧壳。

<!-- REQ-GAL-NARRATIVE-TRANSITION-POLICY-01：2026-10-16 共享合同完结出池。独立复查 docs/design/galgame/review/REQ-GAL-NARRATIVE-TRANSITION-POLICY-01-independent-2026-10-15.md 局部 PASS。不关 ui-settings-confirmations，不代签 Owner 人门。全文查 git 历史。 -->

### REQ-LIFE-FORMAL-PROMOTION · Life 正式游戏四文件提升与安全更新入口 · [2026-10-12] · **owner 选择 A** · **施工主体 = Codex/root（2026-10-12 通用返修续锁；Owner 禁令下未作 Git 抢锁/推送）** · status: in-progress · P1 · 类型: 跨游戏 authoring 物化边界

**权限边界更新（2026-10-12，压过本条历史 owner-only 表述）**：Owner 已在 `AGENTS.md §2.2` 明确，仓库内 `games/<slug>/` 四文件属于正式工程文件而非数据库/用户数据/远程持久化；具体游戏/施工单/候选方向已获授权后，agent 应自行执行严格的 `--promote/--update` plan、双 hash、原子写入与写后复验，不再要求 owner 手工复制命令。Owner 人门、素材审批、远程发布、Git/GitHub、远程数据库和服务启动仍不在授权内。下文“owner 本机显式调用/owner-only”仅保留当时裁决历史，不再作为当前执行禁令。

**缺口实查与裁决**：`src/authoring/life-materializer.ts` 的 M0 已严格校验 Bundle/Host/Launcher 并给出四文件与 confirmation hash；M1 `applyLifeAuthoringMaterialization` 故意拒绝 workspace、祖先与后代，只能写隔离 scratch。`docs/design/game-simlife/life-generation-sop.md` §ENG-17F 也明定 agent 不得在正式 `games/` 运行 M1。因此现有 capability 无法把已验收的通用数据包安全提升为正式游戏；手工复制会绕开 canonical bytes、严格复验与原子发布。路线 B 是 owner 手工复制四文件，每次均重写一遍完整防线、不可复用且易漏校验。owner 已选择路线 A：下沉为**通用的、owner 本机显式调用**的正式提升能力；不添加任何游戏私有 TS、运行时 system 或素材逻辑。

**施工 spec（共享 authoring / scripts 面；禁止变更游戏行为）**：

1. 在现有 materializer/CLI 增加与 `--plan`、`--apply-authoring` 互斥的 `--promote` 模式。它仍只接受 `LifeGenerationBundle v1`、`life-host.v1`、`life-launcher.v1` 三份输入，先完全重跑既有 M0 gate；必须同时给出逐字相等的 `--owner-confirm <confirmationHash>` 与绝对、真实、非 symlink 的 `--workspace-root <workspace>`。不得接受自由文件清单、目标子目录、payload 或游戏专属分支。
2. `--promote` 的唯一目标是 canonical `workspace-root/games/<bundle.game.slug>`，且只能原子写入 `life.json`、`asset-slots.json`、`life-host.json`、`life-launcher.json` 四个 canonical JSON bytes。不得创建/修改 `public/`、AssetIndex、图片、TS 入口、launcher 代码、pipeline、存档、数据库、服务或 Git；不得调用模型或网络。
3. workspace / games / target 每层做 absolute、realpath、plain-directory、containment 与 symlink 防线。目标不存在时在同一 `games/` 下 staging，写后先重读 JSON、hash、Bundle/Host/Entry 与 catalog discovery，再单次 rename 发布；目标已存在时仅当恰好四个 regular files 且逐字等于当前 canonical plan 才返回幂等成功（`writtenFiles:0`）。partial、extra、different、file/directory symlink、路径逃逸、确认 hash 过期或 I/O/rename/复验失败全部 fail-closed、零覆盖，并清理本事务 staging。
4. 结果 mode 必须明确为 `promote`（或等价的可判别闭集值），返回 slug、confirmation hash、target directory、writesPerformed、writtenFiles 与 M0 四文件计划；help、SOP、workflow 文档同时说明该命令只能由 owner 在本机执行，agent 只能提供命令和核对输出。保留现有 scratch M1 的拒绝 workspace 语义和所有字节级行为不变。

**点名验收 / 自证**：临时 workspace fixture 覆盖首次成功、重复幂等、确认 hash 不同/输入已变、非绝对/根/symlink workspace、games/target partial-extra-different/symlink、路径逃逸、写/rename/复验故障清理；每例锚定未出现 target 或保留原有 bytes。CLI 覆盖 mode/参数互斥和错误码。复验后 launcher discovery 必须看到恰好一个 runnable item；M0 与 scratch M1 回归不变。施工者提供一个唯一锚点撤修验红记录；非施工者独立重跑目标测试、再做一次破坏性验证及读诊断。不得启动服务、操作数据库或执行 Git/GitHub。

**范围与非目标**：仅 `src/authoring/life-materializer*`、`scripts/life-materialize*`、对应文档/测试与独立 review 记录；不新增 game runtime、UI、资产批准或任意 `games/game-demon-castle` 正式文件。魔王城使用该能力前仍须由 owner 亲自执行正式提升命令；成功不代签 Playtest、S1-P、capability plan、素材审批或独立复查门。

**施工自检（2026-10-12）**：已实现判别式 `promote` API/CLI，复用完整 M0 gate，以真实 workspace/games/target containment、四文件 canonical bytes、同目录 staging、单 rename、发布前后严格复验和 exact-idempotence 提供正式提升；scratch M1 回归不变。独立复查首轮复现 post-rename 外部替换目录被旧回滚误删的 Major，已用 `dev+ino` 目录身份守卫修复并补永久竞态回归；修后定向回归 5 files / 76 tests 全绿，ESLint 通过，`tsc` 本单零命中；初版 DOCS-REF、Vite build 已通过。confirmation 锚点撤修精确 1 failed / 24 skipped，恢复后 1 passed / 24 skipped。全库 tsc/context-budget 仅命中已记录的无关既有红。自检与复查导航：`docs/design/game-simlife/self-check/REQ-LIFE-FORMAL-PROMOTION.md`、`docs/design/game-simlife/review/REQ-LIFE-FORMAL-PROMOTION.md`。

**独立复查（2026-10-12）**：**PASS**。复查人独立复跑 **5 files / 76 tests**、ESLint、DOCS-REF 与路线图 **11 tests** 均通过；`tsc --noEmit` 仅命中既有无关游戏/launcher 红，本单零命中。首轮 Major 的 post-rename 外部目录替换误删已由 `dev+ino` 身份守卫关闭，永久竞态用例与完整回归均绿；独立 confirmation 撤修准确转为 `missing_root` 红，恢复后点名和完整回归全绿，marker/临时目录残留均为 0。完整证据见 Review 单。本单只通过通用提升能力复查，不代签 owner 人门或端到端新游戏试点。

**Owner A 通用返修扩展（2026-10-12）**：Playtest 前置实证发现魔王城三个固定建设点在合法交互距离均稳定 `zone-disallowed`。返修须在 strict Generation Bundle/materializer 前置 gate 增加通用建设可达性合同：每个 construction project 的固定 placement 交互邻域必须存在允许 `build` 的 zone，并以真实 affordance 投影证明可达到 available；缺失或不可达以稳定诊断阻断候选与正式发布，且不得扩宽合法非建设动作。owner-only materializer 同时增加安全 `update` 闭集模式，要求旧正式四文件整组 hash 与新 confirmation hash 双确认；复验当前正式组、校验新输入、同目录 staging、受身份守卫的目录 swap 与回滚，drift/conflict/发布中外部替换一律 fail-closed 且不删除外部文件；计划保持零写、`promote` 不放宽不同内容、同一目标更新幂等。完成能力自检与独立复查后，才可修正魔王城候选 World、重组 Bundle/M0，并只把准确 owner 更新命令交给 owner 亲自执行。

**Owner A 扩展施工/独立复查（2026-10-12）**：共享建设可达性 gate 与 owner-only `plan-update/update` 已完成。非施工人首轮发现 Windows `dev/ino` 以 JS `number` 表示会丢精度的 Major；终态改用 `lstatSync(...,{bigint:true})`，四轮真实外部替换竞态均保留外部目录与旧恢复组，Major 关闭。最终独立判定 **PASS（Critical 0 / Major 0 / Minor 1）**；Minor 测试表达已补强为魔王城当前三项目逐项 sabotage 锚定与三个真实 Engine session 的 `nearby/allowed/available` 直接断言。终态定向 **3 files / 46 tests PASS**、ESLint PASS、Vite build 765 modules PASS；全库 tsc 仅为既有无关红，本单文件零命中。魔王城修正候选、M0 与零写 update preflight 已通过，当前等待 owner 以旧组 hash `sha256:801242eb0e9c2445c24241f51172fa0161202d39ee0fcec2742e85080bf9bfa6` 和新 confirmation `sha256:559fb88aa44660ac1d33c15331ad92ffa674a62a897f7669e409e2b5664173f7` 亲自执行正式更新；agent 未触碰正式目录。

**Owner 正式更新闭环（2026-10-12）**：owner 亲自执行双 hash `--update`，真实结果为 `mode:"update"`、`writesPerformed:true`、`writtenFiles:4`、previous group `sha256:801242eb0e9c2445c24241f51172fa0161202d39ee0fcec2742e85080bf9bfa6`、new group `sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`。更新后只读 plan-update 返回 `currentFilesHash` 等于新组、`conflicts:[]`；正式 `life.json` 与候选 canonical 内容相等，三个真实 Engine session 再次全部投影可用 build affordance。通用能力与魔王城返修链已闭环，后续可进入共享 Host 可视化 Playtest。

<!-- REQ-HOST-GAME-SESSION-SECOND-CONSUMER：Owner 2026-10-14 取消并移出共享池；非 done，历史见 docs/workflow/archive/REQ-HOST-GAME-SESSION-SECOND-CONSUMER-2026-10-14.md。 -->

<!-- REQ-MOBILE-SHELL（手机客户端=WebView 壳·Capacitor 路线）owner 2026-08-22 令**暂停出池**——架构定性/四步分解/红线全文查 git 历史（git log -S REQ-MOBILE-SHELL）·重启时恢复原文 -->

<!-- REQ-P3TAIL 依 Owner 2026-10-14 决定暂停归档；非 done，原规格见 docs/workflow/archive/REQ-P3TAIL-2026-10-14.md。REQ-S3CLICK 原已出池，归档索引见 docs/workflow/archive/REQ-S3CLICK-2026-10-14.md。 -->

<!-- REQ-S18PANEL-开发面板补 S1–S8 八关（P1·owner 2026-08-16 令「都要有按钮·不能采用老路子」）**2026-08-18 全件完结出池**：
     ① 存为项目（Lead 施工·50804eb1·终审 PASS）：POST /api/projects + gaps 七键归一 + 对话认领关浏览器不丢 + 工坊「💾 存为项目」钮。
     ② S2 机器缺口门 + ③ canEnter 认缺口（抢锁 session 施工·48817307 + 修复 67893d49 + route 对齐 828ce031）：capability-gaps.json 台账（四闭集·三纯函数）·S2.gate=gap-check 与 board 同一只嘴·orderGate 缺口锁·board 带 blockedBy/gaps/gapErrors。首轮独立复查 FAIL（三条判据外实测伤：编排器真回归/越界门/缺口锁 fail-open→gapsHash）全修后**再复查 PASS**（复查人≠施工人·五轮 sabotage 恰中·验收原话端到端复现·跨侧 route 活体对账·零回归=状态/退出码/指纹全等）。
     交回主程两件已落：armed 日志空数组假话一行修；「慢车道点名补跑」面 Lead 裁 **B 案**落地=scripts/slow-lane-guard.mjs 警告态基线棘轮（新红硬拦·在案红响亮放行·转绿逼降基线）+ scoped-gate slowLane 面触发 + 与 vite.config DEEP_GLOBS 对账锚测试——同批 Lead 裁掉 audit-ratchet 两条存量红（game102/game211 HARDLINE 基线亲批入册·两单结案），慢车道基线仅剩 acceptance 一条（REQ-G102-ADAPTER 等 GD 改剧本 schema 在案）。
     再复查四条非阻断（S2 文本行后缀≠逐字节/编排器陈旧注释/提交语措辞/gaps 展示层小疵）记档不阻。全文查 git 历史。 -->

<!-- REQ-DIALOGUE-剧情基础线（P1·owner 令·转型关键路径）→ **2026-08-16 关闭出池**（不占槽·同 PIPESOFT/SPECTRACE/RENDERCHECK 先例：下一步触发者不在池内）：**M1–M4 四件全 ✅ Lead 对抗性验收毕**（2026-08-10·22 例独立复跑绿 + 双破坏锚点命中：撤 neutral 降级锚→恰 3 红、撤 weight 语义→加权测红；game-i 展台 audit + 棘轮 PASS）。**余项 = M4 Sample 示范游戏**，owner 已定与「亲测约会游戏试点」合流 ⇒ **触发者 = owner 本人**，挂池子里只会占槽空等。图纸唯一真相仍在 `docs/design/dialogue-line-blueprint-2026-08.md`（派工时照它）；四件的落点与判词全文查 git 历史 grep REQ-DIALOGUE。**owner 跑完试点带回反馈即重开本条。** -->

<!-- REQ-ENGINEAUDIT-引擎全量评审落地（P1·owner 2026-08-04 令·15 子系统 110+ 发现·报告=docs/design/engine-review-2026-08-04.md）**2026-08-16 全项完结出池**：P0+21 处早批已推（批0 确定性/lockstep 加入死锁 ce3903c1/存档装配/sim 正确性/owner 四裁/Sprite.anchor·全文查历史）；根因② 组件全集基准 e8a0b02c3；Q1 audit 进门+棘轮。**根因①（最后一项）两半件均主程施工+独立复查 agent PASS**：
     (a) op:'set' 专项（98576a9b·owner 判 C）——ResourceModify 加 op:'set'|'add'（缺省 add 存量零变·词表对齐 FlowAction/Effect），resource-apply 接 set+queueResourceMod 合并规则；matrix-duel 清零搬回结算拍（set 载体·同拍原子·旧「槽被占静默漏拍」面消失·复查还实证旧实现连拍结算读陈旧蓄力的潜伏 bug 被顺手治愈），settle 诚实申报读 Resource+撤背书断言，不成环=显式 runsBefore ['resource-apply','self-rule'] 压反向软边（规则③）+定序测试连成环 warn 断言为零。复查全库 4645 例复跑·四轮 sabotage 恰中。
     (b) 对账守卫收口（08b41d9d）——declaration-audit.test.ts 两道防线：①文件字面组件访问 ⊆ 同文件**系统级**申报并集（聚合级只算文档·首日逮 9 处真瞒报全数诚实化：resource-apply 读 PrefabOrigin=SPENDONFIRE 同病·hitbox 读 PrefabOrigin/Transform·prefab 写 PrefabOrigin/HexPos·navmesh-bake 读 NavAgent·anim-state/caster 读 Relation·collision-resolve 读 Sensor）②全库 SCC 点名棘轮（多环红少环也红·禁静默漂移）。诚实申报闭合的新真环用 prefab-spawn「展开殿后」runsAfter 十连钉死=各环平局裁决现状序（复查方 dump 8 游戏落序前后逐字节相同=零行为变化）；**全库环告警 63（晨）→0**；game102 三剧本/game-103 缺 adapter 存量红经修改前 HEAD 隔离对照坐实零新伤。复查两条非阻断建议（keybind 切片锚定/docblock 数字）已同批清。
     余档：~~A 诚实申报~~/~~B 记债~~ 三选项与判词全文查 git 历史及 docs/design/game108/review/REQ-108-ENG-04-05-06.md；「运行时探针对账」（变量传入组件名的下一级覆盖）=守卫文件头在案的声明性局限，真撞到再立单。已转派：UI 契约批→PUI 完结·渲染专项→3D 池 REQ-3D-RENDERHYG。**根因④ 受信执行环境→owner 2026-08-05 令搁置（未理解·待重讲后再定·此行保活）**。 -->

<!-- REQ-UICONTRACT-UI 契约批（P1·引擎评审 §6⑨）已完结：PUI 三条（modalClose/comboClick 补 ActionSink 回退 · 键控锚点改 firstContentAnchor · 动效扫描抽 initDynamics 幂等且 mount/update 各扫一次）+ Lead item④（Sprite.anchorX/Y 抽 spriteAnchorOffset 纯函数真消费）全部落地。Lead 对抗性验收 PASS：6 例守卫独立复跑绿·撤 update 侧 initDynamics 实测转红 2 例·撤 item④ 修复转红 2 例。P2/P3 尾巴（bindings 不递归 node props / layout-solver 忽略 cols / typewriter+emoji 掉字 / apollo-kit 像素字体退化 / onboarding 缩放错位…）按报告 §5 原文另清·不占槽。全文查 git 历史。 -->

<!-- REQ-STATUSSET-资源见底置状态位（game107 带出）→ **owner 2026-08-05 令废除出池**：107 尚未开工·无现役游戏被阻塞·不该占引擎硬槽。**spec 原文完整降级存 `docs/design/game107/requests.md`**（不占槽），107 真开工时先按核心规则重核「能否用现有闭集重组」再决定升回。 -->

<!-- REQ-CARTART-卡带美术存储归位（P1·PST 提·owner 选方案 b-full）→ **2026-08-06 Lead 追认越界·结案出池**：两处跨域改动（`scripts/art-replace.mjs` 写盘落点 + `scripts/art-ledger-guard.mjs` 发现口径/台账根）**均予追认**——改法正确（都收敛到单一真相 `artRoot`，没有另起一套口径）、面最小、与 Python 侧 `paths.py::art_root` 同源。**追认时实证撞出并已修一处真 bug**：`art-replace.mjs` `fill` 的「无台账」错误分支把 `ROOT` 写成了 `root`（`run()` 内无该绑定）→ 撞上无台账的游戏不是干净报错退出而是 **ReferenceError 崩栈**；已修 + 补 2 例子进程 CLI 守卫（原 47 例单测全走导出函数，够不着 CLI 分支）·撤修复实测转红 1 例。复验：cartridge-art-smoke 18/18 · art-ledger-guard WARN(exit 2·gate allowExit 内·两条死账为既有存量) · scoped-gate scope=full 全绿。**留尾不占槽**：①`pipeline.json` 仍落 `public/games/<slug>/`（不在 art/ 下·消费方是生产板另一条线）②JS `artRoot` 用 `existsSync` 而 Py `art_root` 用 `.is_dir()`——`library/<slug>` 若是文件则两边分叉；判定不可达（需手工在 library 下造同名文件），记债不修。图纸全文 `docs/design/cartridge-art-storage-2026-08.md`。 -->

<!-- REQ-ARTGUARD-黑户判据认索引记账（P2·PST 提）已完结：判据②落地——art/index.json path 命中且有来源登记（provenance 对象 或 license+source 双齐）即免黑户·原判据①/死账/SKIP 前缀不动。黑户 65→5（非预期 3：施工方逐条实查证明「62 有登记」是算术不是核实，真有登记 60；差的 2 张 game-a 程序化桌面 SVG 真无账——施工方拒绝代写游戏账本凑数=正确，Lead 认可基线留 2 并开 A-028 归 game-a PE 清账）。Lead 终审 PASS：20 测独立复跑绿·施工方双验红（撤并集行→55 张扑克回黑+FAIL 退 1·撤登记检查→3 例红）·Lead 第三轮破坏（双齐弱化为只查 license→恰边界测红）。尾巴：gen/mock 入 SKIP 前缀未裁——唯一现行例证 game-a art-03 死账已在 A-026,随那单处理,守卫不预扩。全文查 git 历史。 -->


<!-- REQ-NETGAPS（P2·测试护栏·指派主程）已完结（2026-08-27·施工=Lead 本 session·owner 2026-08-26「约束和补全所有用例」令下并批·净测试零行为变）：① AdversarialBus（批内倒序+每 3 条压后一轮）40 轮 → 双端零 desync·synced·tick>20·逐端同 tick 同 hash（lockstep-tab.test.ts）；② C1-C4 成员抖动产 5 桶 > MAX_INPUT_EPOCHS=4 + 离场超时（PEER_TIMEOUT 拍数推满）→ 幸存端仍推进仍 synced，epoch 序列锚点数组钉死；③ 盲区 canary（net.test.ts）：同内容异创建序双世界 snapshotOrder 不等而 hashSnapshot 相等——钉死声明 lockstep 对 order 盲，并 order 属设计变更另议（未立单·真要并入时对 hashWithOrder 先例）。两处撤修验红均锚点命中（①改推进断言红「expected 3 to be greater than 20」·②锚点数组红）。全文查 git 历史。 -->

### REQ-GATESMOKE · 14/18 产品线冒烟不在任何门内 + python 冒烟 harness 无自证 · [2026-08-22] · Lead 立（scripts 守卫评审 D 路实证） · **指派：主程（scoped-gate 面）** · status: open · 优先级: P2 · 类型: 门禁接线
> ① facesOf 对 main_entry/ 只认 art_*/artifacts.py/t2_replace.py——改 projects.py/design_ingest.py/packaging.py/workshop_*.py/apollo.py 判 full 但 full 不含对应冒烟（projects/pipeline/studio-*/library-api/art-review/cartridge-art/dokiworld-pack 全不跑·与 ARTPAR「冒烟不在门曾漏检一整天」同形）。修=py 面旗扩到对应 handler + 「每 *-smoke.py 都有触发面」对账测试。② 18 份手抄 check() 计数器无一自证「假失败→exit1」——任一份被误改即恒绿；抽公共 harness 或每份加演练腿。③ dokiworld host-witness 不在 npm test（build 产物对账只活在发包路径）——挂进 dokiworldPack 面或加 build 冒烟。④ **存量 bug（X 路施工对照实证·两版同红 7过/2败）**：pipeline-smoke.py L121 硬编码 `public/games/<slug>/art/art-ledger.json`——REQ-CARTART（2026-08-06）已把卡带台账挪 `library/<slug>/art/`，该 smoke 自 8-03 未再动过·一直红着没人看见（正是①的活例证）。

<!-- REQ-108-ENG-07（我 2026-08-08 开的「全局条件→扣指定一侧血」引擎缺口单）**已撤销·不占槽**：
     ① 编号撞车——该号早被「结算门下的 intent 生命周期」占用（我开单时只 grep 了本文件，没扫 gdd.md）；
     ② 举证经主程实查**证伪**并回驳 wontfix——`t2-self-rule` 的 `whenGlobal`（全局 id 求值）+ `do`（施于自身）
        两头都有，等价数据写法与证明测试见 `src/skills/tier2/self-rule.test.ts`「罚血形态·回驳证明」3 例。
     2026-08-08 已按该写法接线完成（game108 罚血真扣血·验收剧本 12/12 绿）。全文查 git 历史与
     `docs/design/game108/requests.md` 的回驳单。**教训：开单编号前扫全套 docs/design/<game>/*.md，不只扫 requests。** -->

<!-- REQ-UIFX-2D 表现件补齐（P1·owner 2026-08-08 令·game108 设计定稿 v3 带出）已完结：A `Particles` 对位 Vfx3D 全轴扩写（color/colorGradient/size 分档/shape:'cone'+coneAngle/flyTo 复用 AnchorRef/trail{segments,width,fade,blend}/gravity/drag/stagger·particleSimSpec/particleSize 纯函数·rAF 胶水 render-only）+ B `ProgressBar shape:'liquid'`（radius 按盒裁·fillColor·错频双脊+slosh·气泡）+ ⑤ Label.tween 字号缩放与 anim:'tick' 节拍一并做。顺手真修四处审计基建假绿（gallery 六入口 buildGallery 参数漂移崩且 exit 0／ui-audit 对 display:none 祖先量幻影对比度／Badge tone undefined／sectionTitle dim→sub）。Lead 终审 PASS：16 例独立复跑绿·施工方三轮验红（R1 stagger/R2 slosh/R3 scale 胶水）·Lead 第四轮 sabotage（particleSize 缺省档拍平→恰中 `expected 8 to be 12`）。存量债（tab3dui 35 处硬对比·tab-new 未入审计）归 PUI 主 session 立单；game108 侧接入（粒子替换/烤水面换液面件·S5 偏差 #1/#2 届时划掉）归 game108 自治。全文查 git 历史。 -->

<!-- REQ-WAITUNTIL-验收剧本条件等待（P1·owner 2026-08-09 判 A·game108 复盘第五缺口）已完结：剧本步骤加 `{"waitUntil":[断言…],cap:N}`——断言复用 expect 闭集零新词表·先查后拍·封顶 FAIL 带已等拍数·waitedTicks 入 trace（同 seed 同轨连它一起比）·裸 tick 仍合法。主程施工（🔴 共享 harness）：schema+runner+13 例守卫·深车道点名跑绿（37 过·2 红=game-103 缺 adapter+game102 剧本漂移，经 HEAD 隔离 worktree 复跑坐实为存量且各有在案工单）·双撤修验红锚点命中（AND 语义反转→「多断言 AND 语义」红·撤 cap 校验→「cap 必填」红）。手册口径入 testing.md 验收剧本节；game108 迁移=REQ-108-GD-03（游戏自治·非强制）。spec 与判词全文查 git 历史。 -->

<!-- REQ-DEEPREVIEW-引擎底层深审战役（P1·owner 2026-08-10 令三轨全选）已完结：四路证据全回·Lead 终审毕。**体检报告全文 = `docs/design/engine-deep-review-2026-08.md` 体检结果节**（实证护住 6 面 / 裸奔 6 项已开单：REQ-GUARDGATE/DESYNC/SAVEORDER+根因① spec 扩充+3D 池 G211 单 / 记债 5 笔附理由）。战果：根因② 全集基准合入 e8a0b02c3（A1 探针当验收对照·当日闭环幽灵名裸奔）；RandomSeed.sequence NaN 潜伏 bug 直接修（撤修验红在案）；108 变更 38 笔逐笔过账体系判定=转的。余下施工挂 REQ-ENGINEAUDIT（根因①主程/Q1 已派）。 -->

<!-- REQ-DESYNC-lockstep 分歧要大声（P1·深审 A2①）已完结（53bc35ac·主程施工+独立复查 agent PASS·复查人≠施工人）：三态 syncState solo/pending/synced/desynced（缺可比数据不再默认 true·synced 须真实可比拍背书）+ 双判定点（stepTo 补拍侧 + onMessage 收报侧=领先端盲区正解）+ 首诊 console.error 一声 + onDesync 事件（每 epoch 一次·红牌不摘）+ HUD 分叉/对齐分画。施工方三轮验红（撤三态/撤收报比对/撤一次性守卫）+ 复查方自选三轮（撤本端留存恰红 2·撤 epoch 过滤恰红 1·撤 epoch 清零双重锁死）全恰中锚点；复查建议已采纳=点名用例改「健康跑过热身期后中途篡改」确保真走盲区路径（撤收报比对现恰咬它）。确定性面零沾染（复查 diff 全扫实证）。存量备注：epoch key 无代数的在途报文别名窗口=既有机制特性非本单回归。全文查 git 历史。 -->

<!-- REQ-SAVEORDER-存档 order 入指纹 fail-closed（P2·深审 A2②）已完结（fd062871·主程施工+独立复查 agent PASS·复查人≠施工人）：meta.hash=hashWithOrder(snapshot,order)（determinism.ts 单一真相·order 缺席严格退化 hashSnapshot=旧档语义不变）——反转/增删/整段剥除一律 CorruptSaveError；并入主 hash 而非旁挂指纹=剥除攻击封死（复查实证承重）。旧档兼容真（手工构造旧格式读通·键序退回语义实读确认）；envelope 不动成立（checksum 覆盖整 blob·不经手 snapshotOrder）；meta.hash 全库无活世界对表消费方。施工方两轮验红+复查方三轮（完整双侧复原恰红 2·撤 JSON.stringify 构造出裸拼碰撞样本证其承重·撤 restore 传参存活→行为面缺口已补一条混排 id 回环断言 query 序）。记档：canonical entityId/字段名裸拼的既有碰撞面被继承（威胁模型外·防损坏非认证）。全文查 git 历史。 -->

<!-- REQ-GUARDGATE-引擎面守卫接线批（P1·深审带出）已完结：① engine-random-guard 新守卫（引擎五目录非测试面禁裸 Math.random·白名单 2 条各附实查理由:atoms/random 法定点+mp-client peerId 信道身份非 sim 随机）② loop-stop [time-wait] 修红（假钟接管·断言未削·反序验红实证）+ hygiene 接门 ③ art-replace-smoke 纳门（美术面触发）——全走新 facesOf 面触发机制（改哪面跑哪守卫·不给无关改动加时长）。Lead 终审 PASS：33 测独立复跑绿·施工方三轮验红（种样本恰咬 matrix-duel:257/回退恰红 [time-wait]/清 FACE_GUARDS 恰 3 红）·Lead 第四轮（杀 testHygiene 旗→恰 4 红）。**Lead 顺手叠了 DOKI-APPS 后续①**：dokiworld/** 测试接门（facesOf.dokiApps + doki-app-test runner·真跑 33 条 app 测·撤注入恰锚点红）。全文查 git 历史。 -->


<!-- REQ-ARTPROMPT-提示词编辑被忽略（P1·PST 复查带出+owner 精简合并）已完结：职责拆分铁律落死——query=身份键（界面编辑永不写·rowIdentity 零改动）·prompt=生效主体（任何界面改词一律写它·null 显式清除）；全部改词入口 trace 换链（studio 面板/工坊详情卡/CLI --prompt 正名·--query 旧名兼容）；owner 精简同办：主体 prompt>query>desc（仅兜 query 空·实测 631 活行零 cacheKey 漂移零重生成扣费·122 行空 query 行为逐字节不变→全量生效不留双轨）。Lead 终审 PASS：67+47 独立复跑绿·施工方三轮验红（塞回 query→6 红含身份污染锚/撤精简→恰 2 色值红/撤预填→恰 2 红）·Lead 第四轮（null 不清除→恰点名红）·顺手补 artbrowser.py prompt 回带一行。施工方自曝一次 stash 误操作已复原并披露（诚实合格）。全文查 git 历史。 -->


<!-- REQ-DOKIPACK-DokiWorld 出包线（P1·owner 2026-08-12 令「以后产物都往这里打包」）首件已完结出池：手册 docs/playbooks/dokiworld-pack.md + 规范快照 docs/design/dokiworld/ 在档=常备产线；game108 首包 ✅ Lead 终审 PASS——dokiworld/game108/（manifest 生成器§5 逐条校验·SDK 薄接线零规则·toGameResult 纯函数=血差线性投影与验收剧本同口径·12 测独立复跑绿·施工方 outcome 反转验红+Lead 钳位破坏恰中边界测·无宿主等待屏与 createAppHost 真握手挂载双目击截图在档）。game108 加 setWorldObserver 只读观察口（照 setCard 形态·render-only）。**下一步触发者=owner**：整目录复制/PR 到 dokiworld-apps 仓 + 真宿主跑一遍（§12 末项·本仓无那边推送权）。**记债**：引擎两条站点绝对资产约定（/games/<slug>/art·/ui-fonts）在 iframe 子路径下逃包，现由打包层改写+复制资产兜住——「资产 URL 基准可配置」是引擎缺口候选,下个游戏出包再撞就立单下沉。后续游戏照手册,World 形态等首个剧情向产物。 -->

### 📦 3D 渲染线需求 → 已移至 `docs/workflow/requests-3d.md`（owner 2026-06-28 立独立池）

> Mesh3D/Transform3D/Camera3D/Sky3D/Model3D/Light3D/Post3D 等 **3D 盒庭渲染线 + Game Z** 的需求 / 工单（含 `REQ-3D-W1高效引擎`·实例化绘制、`REQ-3D-Model导入`·glTF）**全部移至 [`requests-3d.md`](./requests-3d.md)**。新 3D 需求进那里、不进本文件；本文件留通用 UI 库 / 其它游戏需求。

## 已结案条目 → 查 git 历史（owner 2026-08-03 拍板删除归档层·`git log --oneline --grep=REQ-XXX` 或按提交信息 grep·随时可恢复）

## 需求模板（复制这段填写·先确认：游戏级工单请写该游戏的 `docs/design/<game>/requests.md`，此处只收引擎级）

```
### [YYYY-MM-DD] · [提出人角色] · status: open
- 想实现的行为：
- 已经试了什么（哪些能力 / 怎么拼）：
- 卡在哪 / 缺什么（引擎做不到的点）：
- 建议方案（可选）· 边界（本单允许触碰的文件范围·复查门核对用）：
```

---
