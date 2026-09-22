# 游戏生产总线手册（八阶段流程板 · 接线图）

> owner 2026-07-10 拍板：**不许让一个 LLM 会话一口气跑完整条产游戏流程**——上下文会丢失/漂移
> （实证=game-k 事故：会话早于手册·把程序化占位当最终交付）。药方不是更厚的手册，而是
> **N 步拆分 + 每步双验（机器门+人门）+ 状态放在 LLM 之外**。本册就是那条总线的接线图。

## 一句话

**每款游戏一张生产流程板**（八阶段·状态从工件推导·证据带内容指纹）——新会话开工先看板，
只做第一个非绿阶段；做完过**三道门**（机器门+复查门+人门·REQ-QC-三门 owner 2026-07-15）再往前走。
复查门=另一 session 按清单对抗性核证（`docs/playbooks/review-gates.md`）；S7 品质关的复查形态=
八维评分卡落账（任一维 0 分=红灯·全维≥2 才 premium——品质下限由这道门抬）。台账=`public/games/<slug>/pipeline.json`。
**⛓ 复查前置硬闸（owner 2026-08-10 令）**：开任何一关的机器门前，**前面已施工的关必须复查在档且不过期**——
没查/过期/FAIL 一律拒跑，`--out-of-order` 不放行；正路=**派一个非施工 agent** 按清单复查落账（复查人≠施工人）。

> **门测契约·先证闭环**：真正卡住的是**最基本的逻辑闭环**（开始→操作→分胜负/推进→重开跑不通），
> 不是好不好玩。见 `docs/playbooks/game-flow-questions.md`——**T2 闭环竖切**把「一条最小循环跑通」用
> 验收剧本 conformance（真引擎逐步对账）**机器证**成第一道强制门；好不好玩（T4/T7）排在闭环之后。

## 入口

| 入口 | 用法 |
|---|---|
| UI：主屏「🏭 生产流程」（两模式）/ 架上操作条「🏭 生产板」/ 保存成功条「下一步→🏭」 | 选游戏 → 八阶段看板 → 每行可「▶ 跑机器门」「☑ 人门通过（note 必填）」；S1 侧栏可直接填改立项卡 |
| Workshop 壳（`python zerocraft.py workshop` → 编辑工坊） | 八关灯摘要 + ⬇下载包；详情跳旧工作台生产板 |
| CLI：`node scripts/game-pipeline.mjs board <slug>` | 看板（会话开工第一命令） |
| CLI：`gate <slug> <S3\|S4\|S5\|S8>` | 真跑该阶段机器门 → 记证据（退出码+游戏内容指纹） |
| CLI：`checklist <slug> <SN>` → 核证 → `review <slug> <SN> --verdict … --note … --by 复查人` | **复查门**（另一 session 照单对抗性核证·空 note 不收·绑内容指纹） |
| CLI：`scorecard <slug> --scores "八维:0-3" --by 复查人 --note 证据` | S7 评分卡落账（任一维 0=红·全维≥2=premium） |
| CLI：`signoff <slug> <SN> --note "…" [--by 名]` | 人门落账（review 内容必填·不许空签） |
| CLI：`concept <slug> --name --pitch [--plan-waiver 理由]` | 填立项卡 / 记免 plan 裁决（UI 同语义=`POST /api/pipeline/concept`） |

**立项卡自动化（REQ-WORKSHOP C1）**：建库（create 带 description）/ 装示例 / 换皮（谱系 pitch）都会
**自动写 S1 立项卡**；PUT manifest 即自动重推美术台账（编号不漂移）。手填只剩改口与补参考/风格。
**板自 S3 起（Lead 2026-07-18 裁决·A-005）**：零代码的 S1/S2 阶段板未开卡=正常——判词先记
`docs/design/<slug>/`（brief/plan + requests 判词），S3 骨架落地后板自动识别、立项卡由 CLI 补落。

## 八阶段（每步唯一必读=手册列·每本 ≤100 行·owner 2026-08-07 放宽·机器守卫同口径）

| 关 | 做什么 | 机器门 | 人门 | 手册 |
|---|---|---|---|---|
| S1 立项卡 | 名字+一句话玩法+参考+风格意向 | concept 字段非空 | owner/Lead 签 | `docs/llm-onboarding.md` |
| S2 能力计划 | capability-plan 过审（纯数据卡带可记免 plan 裁决）+ **缺口逐条裁决** | `gate <slug> S2`（gap-check·纯 fs 秒回）：plan 在档 或 裁决在案 **∧ `capability-gaps.json` 里零 `state:"open"`** | Lead 签 | `docs/design/capability-plan-template.md` |
| S3 骨架关 | manifest 立起来、引擎吃得下 | parseManifest 零 error **+ 真引擎装载 load+空跑2tick**（gate·「能存必须能跑」owner 07-11） | 挂载目击签 | `docs/playbooks/index.md`（找对应线） |
| S4 玩法关 | 胜负/重开/核心循环闭环 | **自证产物在档**（`S4-alignment.md`+shots ≥5·缺=拒跑）→ GD 验收剧本 ≥3 场景 conformance 绿（剧本作者=GD 非 PE）→ 该游戏 walkthrough vitest 绿；卡带=bench 五轴（gate） | 试玩签（附真浏览器截图序列） | `docs/playbooks/testing.md` |
| S5 UI 关 | HUD/菜单守 LayoutNode 纪律 | **自证产物在档**（`S5-alignment.md`+shots ≥5·缺=拒跑）→ game-skill-audit 红旗零（gate）；卡带天然免 | /check-ui 结论签 | `docs/playbooks/ui.md` |
| S6 美术关 | 台账→风格锚→生成→写回→复核 | 台账推导（MOCK 不算完成） | **已内嵌**=平台逐行 ☑ 复核 | `docs/playbooks/art-pipeline.md` |
| S7 品质关 | 视觉评分卡打分 | —（以人门为主） | 得分记 note 签 | `docs/playbooks/visual-scorecard.md` |
| S8 终检关 | 全库门禁+复盘回填 | **卡带**=MOCK 债 0+manifest-check+bench 五轴（轻量终检·证据绑 gameHash）；**内置/编译游戏**=tsc+vitest+build 三绿（gate·证据绑 git HEAD+净树位） | 手册缺口回填/提单记 note 签 | `docs/playbooks/testing.md` |

## 能力缺口台账 `docs/design/<slug>/capability-gaps.json`（S2 的机器牙齿·REQ-S18PANEL）

立项识别出的引擎缺口**写成机读数据**（裸数组·全闭集），别只写在聊天里——否则「带着未裁决的缺口
一路生成下去」是合法路径（owner 2026-08-16 叠叠乐实撞）。怎么裁仍走既有协议（先查→摆 A/B→owner 判），
本文件只是那份裁决的机读投影：`[{id,title,priority,route,state,ticket,blocks}]`。

- `priority` `P0|P1|P2|P3`——**只有 P0/P1 锁关**；`route` `engine|requests-3d|pui`（与 `POST /api/projects` 落盘端点逐字同集）——**按池分流**
  （10 硬槽 / P3D 独立池 / PUI 基座；一股脑进引擎池会当场撑爆槽位）。
- `state` `open`(未裁)`accepted`(判过 A/B 待做)`in-progress``delivered``wontfix`(回驳·附等价数据写法)；
  **`≠open` 必带 `ticket`**（面板跳过去看裁词）。有 `open` = S2 门红 / 板 ⚠。
- `blocks`=卡住哪几关：**被锁的关 `gate` 拒跑且 `--out-of-order` 不放行**——跳过去施工只能在游戏层写
  逃生代码（手写 system / 自造解释器），正是宪法要治的病；等不了就把它裁成 `wontfix`，那是裁决不是放行。
- 台账**不入游戏内容指纹**（标 delivered 不该让全关证据过期）；S2 机器态板上现算。

## 防漂移三律（为什么这样设计）

1. **状态不在会话里**：看板全部从工件推导（manifest/测试/台账/审计真跑）——模型说「做完了」不算，门过了才算。
2. **绿不是永久绿**：机器门证据带**游戏内容指纹**（S8 带 git HEAD+净树位）——游戏文件一动，证据自动标 ⚠过期，须重跑。
   陈旧基线的绿不算绿（与推送门禁同一条纪律）。
3. **每步小上下文**：一个会话/子代理只领一个阶段：`board` → 读该阶段手册那一本 → 干活 → `gate`/`signoff` → 停。
   跨阶段抢跑=漂移温床；发现手册接不住 → `requests.md` 提缺口（问责定性=手册缺陷，复盘只问手册哪里没接住）。

## 红线

- **落盘门=「能存必须能跑」（owner 07-11 定则）**：一切 manifest 落盘（PUT/生成/对话应用改动/板 gate）都过
  `scripts/manifest-check.mjs` = JSON → parseManifest → **真引擎 load + 空跑 2 tick**。parse 过但装载炸的稿
  （如 Tilemap 缺 layers）一律拒收、错误文本回喂修——绝不让「存得进去、跑不起来」的卡带进库。
- **TS 例外卡带=受控逃生门（owner 07-11 拍板·记债）**：`features.tsCarts`（默认关）+卡带 ⚡ 打勾才允许
  `library/<slug>/logic.ts`（cartCapability 契约·cart-logic-check 装载门·git 版本化）；该卡带**退出
  回放/换皮/bench 保证**（列表 allowTs/hasLogic 旗明示）。正道仍是 capgap 提案→能力下沉（TS 进引擎）；
  绝不把代码塞进 manifest JSON、绝不绕装载门。
- **验收剧本循环律（owner 2026-07-17 拍板·「绿门不可玩」复盘）**：玩法正确性的裁判=**GD 写的验收剧本**（规则→seed+操作+逐步期望·纯数据），harness 驱动真引擎对账；**PE 修码不改剧本**（剧本错=GD 改+记录）。**+ 词表对齐律（owner 2026-08-05 明训·RENDERCHECK R2 实测 game-a 可驱动率 0/19 复盘）**：剧本的操作步骤名**必须用真 UI 上的动作名**（`data-action`·机器才点得动），**不许用引擎内部信号名**；**策划案 review 时逐条对齐**剧本步骤↔UI 动作↔规则条款三者，对不上的当场改，不留到施工后。原则=**做出来的东西必须和策划案完全一致**；老游戏词表断层按需补「信号→UI 步骤」映射表（纯数据·不强制）。PE 自写 walkthrough 只是下限，不构成 S4 完成证据。
- **两层 1:1 律（Lead 2026-07-17 裁决·owner「不复刻逻辑不好验证」之问）**：有设计稿的屏，**S4 即须「结构 1:1」**——布局/信息层级/状态可见性照稿（素皮实现·人门试玩才验得动逻辑）；**「视觉 1:1」**（字体/渐变/纹样/皮）留 S5 纯观感替换（布局不动零返工）。前提=开工前渲染目击稿（CLAUDE.md Claude Design 稿铁律）。 **逛 UI 货架也照这条劈（owner 2026-08-07 拍板）**：**选型归 S4**——house 主题 / `@ui/starters` 起手包 / 按品类挑成熟件（`Button.sub` 副标、`LevelPath`、`ring` 进度…）定的是**信息层级**，选错了 S5 再改是重排版；**观感精修归 S5**——配色 / 纹样 / 艺术字 / 贴图皮 / 粒子密度。一句话：**布局怎么排 = S4 定；布局有没有排坏 = S5 的 `/check-ui` 查。**
- **「完成」判词有门（owner 2026-07-16 事故律·game-t 复盘）**：session 宣布游戏「做完/完成」必须附 `board <slug>` **全绿**输出；板不全绿只许说「做到 SN」。口头完成=无效口径，owner/Lead 一律不采信。
- **不许代签**：signoff 是人门——LLM 只能把「待人审」摆上看板，不得自己 signoff 冒充 owner/Lead（gate 随便跑，签核必须真人指令）。
- **S6 的 MOCK 行不算完成**：mock 永不上画面（终态档 §六），流程板同口径。
- **S8 过期即重跑**：rebase/新提交后 S8 证据自动过期——推送前必须净树重跑（呼应 CLAUDE.md 推送门禁）。
- **自证先于复查（owner 2026-07-29 拍板）**：S4/S5 送复查门前，施工 session 必须完成 `docs/playbooks/self-check.md` 仪式——真渲染自玩+截图序列+策划对齐单零未解释偏差；缺=复查门直接 FAIL。
- **样例只教结构，不教玩法**（2026-09-17 立·外部实践 GameFactory-3A）：「活样例/展示台」指针是看**这个引擎怎么表达一件事**（蓝图怎么摆·测试怎么写），**不是基类/模板/可抄的玩法**。① 抄结构可以抄玩法不行；② **「没有同品类样例」不构成缺件、阻塞或缩减需求的理由**，挑任意同引擎的看结构即可；③ 别整目录扫——挑最小够用的几个文件且**说得出为什么读**（S3/S4 复查清单逐条问）。两头实证：抄玩法→game-g 天罡/地煞虚胖数据；**不看参考**→`dokiworld-pack.md` 那条「把唯一参考实现定性成反例→自己发明一套」=2026-08-17 真宿主全红。
- pipeline.json 是台账不是配置——只经 CLI/端点写，勿手改造假绿。
- **代码准入阶梯（owner 2026-08-03 拍板）**：产游戏按 L0→L3 逐级降落·降级必须留痕（plan 阶梯申报或
  capgap 记录）·静默用 L3/L4 = 审计红旗（game-skill-audit/cart-logic-check 现门执法）。

## 查不到怎么办

- 新阶段诉求 / 门要加严 / 阶段语义不合某形态 → `docs/workflow/requests.md` 提缺口等裁决，**绝不自造旁路**。
