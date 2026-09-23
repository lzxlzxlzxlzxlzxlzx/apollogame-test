# 引擎需求池 · Requests

> **10 硬槽铁律（owner 2026-07-15 拍板）**：本池只放 **owner 级需求·最多 10 条**——**10 条做不完不许加新的，必须清掉（做完归档/降级）才能加**（机器守卫 `context-budget-guard` 卡条数+字符数·超=红灯拦推送）。
> 各角色（按 `docs/roles/index.md` 名录）提需求前先看槽位；游戏级工作票（G/D/Q/I 的 bug/战斗/演出/平衡单）**不占槽**——写**该游戏自己的需求单** `docs/design/<game>/requests.md`（工单随游戏走·游戏可暂停·**编号唯一：开单前 grep 同名防重号**——2026-08-08 game108 GD-01 重号复盘）；3D 线写 `requests-3d.md`；已完结条目删除留 git 历史。
> 状态：`open` / `in-progress` / `done`（附 commit·**标 done 同提交删除条目腾槽·全文留 git 历史**）/ `wontfix`（附理由）。差需求（"不行"）会被打回。

---

## 待处理 / 进行中

### REQ-HOST-GAME-SESSION · 外部游戏会话（请求 / 初始随机 seed / 结构化结果回传）· [2026-09-21] · owner 选择路线 A · **施工主体 = Codex（2026-09-21 抢锁）** · status: in-progress · P1 · 类型: 跨游戏宿主能力

**问题**：现有卡带 `mount(container, host)` 只有可选退出钩子。外部平台无法以统一、可校验的方式传入一次游戏请求，调用方未预定结果时也没有合法的初始熵入口；游戏层若自行写 `postMessage` / `crypto` / 回调协议，将为每个小游戏复制一份跨平台和随机语义，违反数据驱动边界。

**现有能力核查**：`t2-dice-roll` 已能消费 `DicePool + RandomSeed` 产出确定性骰池；`RandomSeed` 只解决「已有 seed 后」的序列推进；标准 `HostHooks`（game111）仅含 `exit()`。三者均不能表达 requestId、预定值、宿主熵、结果去重与输出合同。

**裁决（owner A）**：下沉 `external-game-session`，作为任意可嵌入小游戏的通用能力。固定输入合同：`{version, requestId, input, seed?, preset?}`；固定输出合同：`{version, requestId, status, result}`。若未给 seed/preset，仅会话创建期向宿主熵端口索取一次 seed，写入世界 `RandomSeed` 并随结果回传；之后一律消费现有确定性 PRNG。协议适配（iframe / 直接挂载 / SDK）放宿主实现，游戏只通过该能力读写闭集会话组件。

**验收**：① 同 seed / 同 input 双跑结果逐字节相同；② preset 不消费 RNG；③ 缺 requestId / 重复 result / 越界输入 fail-closed；④ 无宿主熵时可明确拒绝，不退回 `Math.random`；⑤ 至少两个独立小游戏能消费同一 capability。

**影响**：阻塞 game-dice S2-S4；不改 Doki Design Base。

<!-- REQ-MOBILE-SHELL（手机客户端=WebView 壳·Capacitor 路线）owner 2026-08-22 令**暂停出池**——架构定性/四步分解/红线全文查 git 历史（git log -S REQ-MOBILE-SHELL）·重启时恢复原文 -->

### REQ-FLOWFIELD · 群体流场寻路 `t2-flow-field` · [2026-08-10] · **owner 拍板**（「我想做大规模 rts」）· **施工主体 = 主程 = 本 session（2026-08-24 抢锁·owner 当面指派「你就是主程」·本行即锁）** · 复查 = 独立 agent（三轮毕） · status: **M1 + 软分离 + ORCA 全交·三轮复查毕（FAIL→CONCERNS→CONCERNS「可交 Demo」）·13 条实伤全修 → 等 game211 Demo 反馈；M2/M3/M4 未做** · P1 · 类型: 引擎能力下沉

**为什么做**：`t2-pathfind`（A*-per-agent）在 RTS 规模撞墙——500 单位 / 2304 节点首拍 **534ms**、稳态 20.4ms/tick，
且对图规模超线性。流场**铺一次服务全部单位**（2304 格 0.9ms，之后每单位 O(1) 查表），每 tick 差两个数量级。

**三档开销**（同机 bench·1000/4000 单位 ms/tick）：纯流场 0.39/2.51 · 软分离 1.01/4.08 · ORCA **8.64/35.77**
⇒ 4000 单位开 ORCA 超一帧预算；默认软分离，ORCA 留给「不许穿模」的小队面。

**⚠ 对外口径已两次改口（都是复查打掉我把话说大）**
- ~~「timeHorizon 拍内保证互不碰撞」~~ → 前提是线性规划有可行解，迎面对撞时经常没有。同场景扫一族排布（中场段）：
  纯流场 0.047~0.100 · 软分离 0.061~0.128 · **ORCA 0.644~0.701**（半径和 0.70）⇒ **把穿模从 ~90% 压到最坏 8%，不是 0**。
- ~~「不还礼的邻居仍有 0.603 的底」~~ → **没有下界**（2v2 0.505 · 3v3 0.187）。混装要干净 = 双方都开 ORCA。

**全文别在池子里重抄**：三轮判词与 13+21+15 刀 sabotage → `docs/design/game211/orca-review{,2,3}-2026-08-25.md`；
病根与修法 → 调研 `crowd-pathfinding-research.md` §10.5/§10.6/§10.7；消费方交接单 → `docs/design/game211/requests.md` REQ-G211-CROWDDEMO。

**沉淀成全库纪律的四条**（比单子本身值钱）：
· 「告警没出现」≠「没有告警」——可能只是没人组装到那个配置。
· 新增的回归测试必须在被修的那一版上跑一遍确认它真会红。
· **承重用例只钉一个初始条件本身就是缺陷形状**——尤其被测指标对初始条件混沌时（挪 0.25 就翻盘）。
· **修 A 时新增的机制 B，B 自己也要配一刀**——三轮的新伤全是这个形态。

### REQ-P3TAIL · 架构路线图 P3 收尾（宿主拆分 / 持久化收编 / 输入与 Replay / 引擎成包）· [2026-09-12] · **owner 令「第三阶段后面请你都做完」**（承独立审查 2026-09-12 的引擎演进建议） · **施工主体 = 主程 = 本 session（抢锁·本行即锁）** · 复查 = 另派独立 agent（复查人≠施工人） · status: **in-progress（M1 施工中）** · P1 · 类型: 引擎结构收尾

> **spec 不在池子里重抄**：四项的「做什么 / 为什么先 / 迁移 / 风险 / 验收」全文在
> `docs/design/engine-architecture-review-2026-09-02.md` §5（P3a / P3b / P3c / P3e），照它做。
> 前置 P0·P1a·P1b·P1c·P2a·P2c·P2d·P2e **均已落地**（实查 git 历史），本单只做 P3 这四项。

**⛔ 不在本单（域红线·CLAUDE.md 专职域例外）**：`P2b` UI repeat 原语归 **PUI**；`P3d` 渲染提取层 FrameDesc 归 **P3D**。
别的 session 勿擅改这两片——要做走各自的池子派工，本单不碰。

**分期（按「风险 × 依赖」排，不按路线图字母序）**

| 期 | 内容 | 为什么排这个位置 | 验收 |
|---|---|---|---|
| **M1** | **P3a 的机器围栏**：`core + skills + net` 单独 tsconfig（`lib: es2022`·**无 dom**） | 这正是 P3a 的验收判据本身，且**零语义改动**——它会把"sim 里到底还有多少 DOM 依赖"一次性暴露出来，没有这份真实清单，后面的拆分只能靠猜 | sim 面不带 dom lib 过 tsc（存量违规入基线棘轮·新增即红） |
| M2 | P3e 引擎成包（API 面棘轮先行·再收 exports） | 纯治理面·零 sim 风险；`engine.api.md` 进仓当棘轮后，后面三项的公共面漂移才有东西咬 | 仓外 `npm i` 能构建 game101 |
| M3 | P3b 持久化收编（三套端口 → 一套 Envelope + FileBridge） | 依赖 P1c（已落）；碰存档=数据风险，放在 API 棘轮之后做 | 改组件字段名后旧档读入 hash 与续跑同轨 |
| M4 | P3c 输入单一真相 + NetSession + Replay | 最大一项·🔴 碰 lockstep/确定性；依赖 P1a/P2c（已落），且应在存档收编后做（keyframe 复用 Envelope） | 卡牌类双端 lockstep 跑通·导出的 replay 在 vitest 里复现到拍 |

**红线**：四项都**不得改变既有 golden hash**（除非同提交给出逐条理由与新基线）；碰确定性面的改动按 🔴 主程口径走。

### REQ-111-AINPC · LLM NPC 三件套下沉（`NpcAgentPort` + `t2-intent-barrier`）· [2026-09-12] · **owner 判 A×2**（game111 `framework.md` §6 缺口②③）+ owner 令「game111 的需求你也做一下」 · **施工主体 = 主程 = 本 session（2026-09-12 抢锁·本行即锁）** · 复查 = 另派独立 agent（复查人≠施工人·**待派**） · status: **✅ 已交（2026-09-12·门禁全绿·已推送）·等复查** · P1 · 类型: 引擎能力下沉

**捆绑不拆**（owner 判词原文「只做端口不做 barrier = 最坏组合」）：有了调模型的能力却没有把结果确定性落地的能力，
不确定性直漏 sim。症状是「偶发 desync / 存档读出来不一样」——本仓最难查的 bug 形状。

**一句话**：外部 AI 当**输入源**（不当解释器）。端口只产 `Intent[]` 不写世界；barrier 把乱序/迟到/失败的异步回包
**收成一个确定性结果**：按 npcId 排序注入 · 超期按**整数回合数**（禁墙钟）补默认动词 · 闭集外动词当场拒收并记 `reject`。

**全文别在池子里重抄**：裁决原文（实查留痕 · A/B 两路代价 · 红线）+ 交付细节 + 撤修验红记录
→ `docs/design/game111/requests.md` REQ-111-ENG-01 / REQ-111-ENG-02；架构依据 → `framework.md` §1.2 · §2 · §6②③。

**落地**：契约 `src/engine/protocol/agent.ts`（`Intent`/`AgentContext`/`NpcAgentPort`）· 端口 `src/services/npc-agent/`
（Null 确定性桩 + Http 骨架·**绝不抛**）· 门 `src/skills/tier2/intent-barrier{,-core}.ts` = `t2-intent-barrier`（registry 已登记）。

**施工中真撞出来的两条**（spec 只预警了第一条的存在，没预警它会「恰好排对」）：
① 首版让门读 `TurnOrder.round` 当回合号 → 与 `turn-order` 组件推断边双向成立 → 真 2-环。软环**只告警不抛**，
   平局裁决按系统 id 字典序，那次排出来**恰好是对的**——纯属碰巧，改个系统名就反过来且全绿。
   先用显式 `runsBefore` 压住（单文件测试全绿），**但全库 SCC 棘轮照样红** → 治本是去掉那条读边：
   回合号改由 `setBarrierTurn` 推。另：我曾误判「去掉读边就脱离了全库软环 blob」——实测没有，
   它与 turn-order/keybind/clickable 同款（runsAfter event-when + writes Signal 必然入环），已按棘轮纪律更新基线留理由。
② lockstep 缺一条 spec 没写的：非权威端必须 `authority:false` 永不自结算。否则权威端收真意图、对端全部超期补默认
   → 第一回合就分叉，**而两端各自全绿**。

**复查门按这几条核**：① 端口不碰 world/snapshot/hash ② `NullNpcAgentPort` 无网可跑（**全库 AI 游戏的 CI 基建**）
③ barrier 产出与回包到达次序**无关**（乱序投递测试必须同 hash）④ 超期判据零墙钟、零浮点
⑤ 异步暂存组件登记 `NON_DETERMINISTIC`（漏登记 = 开日志就改 hash，lockstep 当场误报）
⑥ 定序测试断言 `topological-sort` **warn 数为零**（它成环只告警不抛 → 绿灯不等于没话说）。

### REQ-111-MEMORY · 记忆能力 `t2-memory`（衰减 · 确定性 top-K 检索 · 跨实体流转）· [2026-09-12] · **owner 判 A**（game111 `framework.md` §6 缺口①） · **施工主体 = 主程 = 本 session（2026-09-12 抢锁·本行即锁）** · 复查 = 另派独立 agent（**待派**） · status: **✅ 已交（2026-09-12·门禁全绿·已推送）·等复查** · P1 · 类型: 引擎能力下沉

**为什么是引擎面不是 game111 面**：「谁在何时对谁做了什么，且这件事会淡忘、会被传开」是 RPG/模拟/社交的通用原语。
通用性证据已在库里——`docs/design/game101/`（海港绯闻）整作以「绯闻传播」为名，与记忆流转同构。判 B 则 101/108/111
各写一套，正是 `modifier-stack` 下沉前的原样。**实查**：registry 零记忆能力；`t1-event-log` 只是平铺流水
（无衰减/无检索/无归属，且未注册为 capability）。

**红线**：检索打分**全整数**（强度/时近/标签命中均整数权重）——浮点跨端 JIT/FMA 可能 1 ULP 漂移，纳入排序即误报
desync（`determinism.ts` 对 Camera 的同款理由）。条目进 hash → 注意快照体积与**存档兼容**，新组件要给迁移口径。

**落地**：`src/skills/tier2/memory{,-core}.ts` = `t2-memory`（registry 已登记）。衰减触发二选一（具名信号 / 拍周期）·
检索整数打分 top-K 同分按 id 兜底 · `shareMemory` 打折转述且副本 `source` 记 `share:<from>`。
**多做一条**：`entries` 恒按 id 升序存——数组序会进 canonical 即进 hash，按插入序存等于把「谁先被记」焊进指纹。
**存档口径**：新组件旧档缺席 → 旧档 hash 语义原样不变；加记忆属新世代存档，不做旧档原地迁移。

**全文 + 撤修验红记录**：`docs/design/game111/requests.md` REQ-111-ENG-03。

### REQ-UPBACKUP · 原图备份被替换图盖掉（「一键还原」的底牌丢了）· [2026-08-19] · Lead 巡检 owner 直传批带出（实证：game101 art-59 backupPath 文件与 gen/art-59-up.png 逐字节同） · **施工主体 = PST（已交·本行即锁）** · 复查 = Lead（2026-08-22·owner 点名） · status: **done·⚖ Lead 复查 PASS·余 F3 一腿归 PST（清完即出池）** · P3 · 类型: 创作台 bug（上传/替换/还原线）
> **实证复现**（非按报告推断·样本已随 affbcd96 删除，故在临时目录上重建）：备份步骤**时序是对的**
> （`handle_art_upload` 确实在 `write_bytes` 之前抓），真病根在**重入**——备份靠 `'orig' not in row`
> 防重复，而这个标记会被 `derive` 重建台账行 / `handle_art_restore` 弹出 / 绕台账的直传批抹掉。
> 一抹掉「首次替换」就又成立一次 → 拿**当时线上那张（已经是替换图）**盖掉真原图。跑出来的实况：
> `TRUE-ORIGINAL` 被 `REPLACEMENT-1` 覆盖后**永久找不回**；再循环一次备份就与线上新图逐字节同（= 巡检报的形状）。
> **修**：① `_backup_orig` + JS 孪生 `backupOrigFile`——**备份已在案就原样返回、绝不重拷**（重入变幂等·
> 原图只有一张只该备份一次）；② `handle_art_restore` **把备份内容拷回原服务路径**，不再把线上别名指进
> `orig/`——旧写法让「永不被覆盖的备份」自己变成线上文件，下一次替换就以它为源（Python 侧
> `SameFileError` 抛穿成 500·JS 侧 copyFileSync 同路径静默 no-op）。曾另写一道「源在 orig/ 下不拷」的闸，
> **撤修验红实测永远够不着**（闸① 全覆盖）→ 已删：测不出红的守卫不是守卫。
> **自证**：`scripts/art-backup-smoke.py` 27 腿（① 备份=真原图≠新图 ② orig 标记丢失后再替换备份纹丝不动
> ③ 连替 5 次恒等 ④ 还原回原路径·备份区仍在 ⑤/⑤b 还原后再替换不炸 ⑥ 程序化槽不凭空造 ⑦ JS 孪生同闸）；
> 撤修验红三轮各按锚点转红（撤闸① → ②③ 红；撤还原拷回 → ④ 红；撤 JS 闸 → ⑦ 红）。
> **顺带补的门**：`t2_replace.py` 不带 `art_` 前缀 → **此前任何面旗都不命中**，改它一行没有任何门在验；
> 新增 `backupSmoke` 面旗（`t2_replace.py` / `art-replace.mjs` / 冒烟自身）+ 行为契约两例。
> **⚖ Lead 复查判词（2026-08-22·PASS）**：27+52 腿独立复跑绿（退出码直取）；撤修验红三轮恰中锚点——撤 Python 闸①→②③红（本单病根被咬住）·撤 JS 闸→⑦红·复现主程刀（砍 docs/design 落点）→7 腿红与自陈逐字同；复原后双绿·工作树净。改判病根（时序对·真病=重入）成立；F2 留痕降级已读码核实（合「留痕即可」判词）。
> **F3（必办·PST·复查唯一实伤）**：Lead 自选最小突变「只砍 restore 的 `copyfile`·保留新指路」**27 腿全绿存活**——④ 腿内容断言在 upload 夹具下恒真（upload 写 `NO-up.png`·从不覆盖 `gen/NO.png`），「拷回」的内容语义零钉；而 regen 流按 docstring 复用同名覆盖原文件=拷回真吃劲的现场。补一腿覆盖式夹具（先把目标文件盖成替换内容再 restore·断内容=真原图）使该突变会红。自陈锚点「撤拷回→④红」系整块回退刀型（路径断言咬）·非虚但粗，F3 落地即闭。

<!-- REQ-AUTOSAVE-任务收工自动存档（P1·owner 2026-08-10 令「跑完的结果就没了·希望它主动去上传」）**2026-08-19 全件完结出池**：
     本体（bf820b37）先本地提交→跑门禁→绿了才推·挂 art_jobs 收工与编排器子进程退出两处·features.autoPush 开关·
     「📦 产物落点」卡回答「在哪/存住没」。主程复查 PASS（2026-08-18·四轮 sabotage 三咬一漏）+ syncSmoke 越界追认成立。
     **余项 F1/F2 已清（PST·2026-08-19）**：F1=补落点腿 ⑩–⑬（detect_form 判序 / 三形态落点全集·docs/design 每档必在列 /
     状态端点逐处分摊 + 卡带行报自有仓 / 拒绝路径），冒烟 25→52 腿，**复现主程那一刀（砍掉 docs/design 整类）实测 7 腿转红**、
     形态判序颠倒 ⑩ 转红；顺手删掉那句不实的「另测」注释。F2=`_dirty` 的 git 失败分支改为**留痕再降级**
     （空列表在上游读作「无产物·跳过」，与「真的干净」同形，不喊一声就是一次静默的白跑）。图纸
     auto-artifact-sync-2026-08（图纸已随 2026-08-24 清理删除）。判词与全文查 git 历史 grep REQ-AUTOSAVE。 -->

<!-- REQ-DOKI-APPS-「获取卡带」下沉共享接线层（P1·owner 2026-08-15 令）**2026-08-18 全件完结出池·主程双路独立复查 PASS**：
     ① 共享层 dokiworld/shared/ apps-gateway（8433c8e3·抢锁 session）：createAppsGateway 带超时/降级/dispose 薄适配 + appsDeclared；9 测不 mock SDK（真 createAppsHostExtension 对端）。复查实证：launch 缺省超时真 1 小时（apps.js:14）·「未声明就不发」快速拒绝非等超时（1.5ms 即红）·reasonOf 只读 error.code 顺带消解双份 SDK dual-package 隐患·通用性成立（src 零 game108 字样）。
     ② game108 结算屏消费（3801e35a·owner 判「结算屏加入口”）：setAppPicks/onAppPick 宿主缝 + 推荐位 LayoutNode（空则整条不画——复查以提交两侧 buildDuelScreen 全量倾印逐字节相同机器证明「非 DokiWorld 宿主逐像素同旧版」）+ manifest 五步一致（EXTENSIONS 单一真相）+ 投影⑤只收能真拉起的（input contract 缺则不画留痕）；render-only 亲测=picks 翻转三跑 hash 流逐拍相同；SDK 别名只打进一份（唯一字面量各恰 1 次）；顺手复活 witness leg④（клickStart「#phase-t 出现」在说明屏下恒真的假绿→改「世界动作真出现」·复查探针 6/6 坐实根因）。witness 终态 PASS=50 FAIL=0。
     ③ 后续①（dokiworld 测试接门）主程随 GUARDGATE 落·两处手册过期口径已更正。三轮+三轮撤修验红各恰中。全文查 git 历史。 -->

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

### REQ-S3CLICK-骨架关加「点击打穿」机器门 · [2026-08-07] · owner 判 **A**（2026-08-22 复确认留） · status: **in-progress（复查 FAIL 打回·判据层·2026-08-16）** · **施工主体 = 策划 session（锁不变·按报告修）** · 复查 = 独立复查 agent（Lead 派·原复查人楚晨未接单） · 优先级: **P0（升·game211 的 S3 正被假红卡死且判词误导排查）** · 类型: 流程门

> **⚖ 复查判词（FAIL 打回·全文 `docs/design/s3click-review-2026-08-16.md`）**：方向/豁免纪律/单测/bind 检查/接线全成立，但**承重断言双向失灵**——game211 假红（开场模态盖屏+点击超时被静默吞+预算按文档序烧不到真可点件·判词还误导去查 Engine.step）；game108 对历史病①假绿（后来的「玩法说明屏」改动无声腐蚀了噪声对照：对照趟不点=永远停首屏,运行态时间元素全不在噪声集）。**P0 三修**：①点击失败入 JSON 与「点了没变」分流 ②预算优先真可命中件（elementFromPoint 预筛/从顶层叠层往下） ③噪声对照治时间元素盲区。**P1**：JSON 落总数/未点名单·exit 3 前先跑 bind 检查·接线补 spawn 级锚点。**当下操作口径**：game211 的 S3 红按假红对待,别查引擎链。

- **病**：S3 骨架关全程**一次都不点**（机器门 = manifest + 装载 + 空跑 2 拍 + 渲染探针）。
  于是「按钮画得好看但点了没反应」能一路绿着过 S3——game108 实测踩到两发，都不报错：
  ① 宿主自搓 rAF 圈直接 `world.tick()`，绕过 `Engine.step()` 里注入输入那一句 ⇒ 队列一直填、没人取；
  ② `props.bind` 没跑 `resolveBindings` ⇒ 进度条永远画在 0，文字却是对的。
  **单测绿（自己往队列塞）+ 渲染探针绿（只画图），只有真点才露馅。**
- **同病史**：owner 2026-07-17「**绿门不可玩**」复盘的药方是给 S4 加验收剧本，
  **S3 这层的洞当时没补** ⇒ 同一个病换个位置又犯。
- **界**：S3 问「信号打得穿吗」（点一下世界动没动）；S4 问「规则对吗」（打穿之后赢的是不是该赢的）。
  接线断了属于骨架，不属于玩法——推给 S4 发现的话，验收剧本跑不动时分不清是规则错还是线没通，排查成本翻倍。
- **做法**（owner 判 A·最小断言）：S3 门追加通用点击探针——扫活体 DOM 的 `[data-action]` 控件逐个点，
  断言 ① 至少有一个点完 DOM 真的变了 ② 全程零控制台 error。**不验玩法、不需要 AI、不需要结算闭环。**
- **不回溯**（owner 2026-08-07 明示）：现存游戏进**可见的**豁免名单（照 `pipeline-registry-guard`
  的 `LEGACY_NO_BOARD` 先例·名单带理由·非静默跳过），**新游戏受检**。
- **边界**（复查门核对用）：`scripts/click-probe.mjs`（新）+ `scripts/game-pipeline.mjs` 的 S3 门读码一处
  + 其单测。**不碰**别的阶段门、不碰渲染探针、不改任何游戏。

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
