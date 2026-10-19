# 美术管线手册（给游戏配美术 · 接线图）

> 深文：**如建全景 `docs/design/art-pipeline-asbuilt-2026-08.md`（现状唯一权威）** + 工作流 `docs/design/art-replacement-workflow.md`（schema/五步全文）；07-09 终态档=历史快照。
> 本册只回答「做 X 用哪个件、按什么顺序」。资产登记/vendor 见 `docs/playbooks/assets.md`；视觉验收见 `docs/playbooks/visual-scorecard.md`。

## 卡带游戏线（创作台产出·demo 主线）· 八步

| 步 | 做什么 | 用哪个件 |
|---|---|---|
| 1 | 生成游戏：LLM 出 manifest，**视觉实体必带 `art:` 皮肤槽**，引用写成详细图像小样（主体+特征+颜色+视角·4-10 词·禁裸名词） | 创作台 /api/generate（系统提示词已强制） |
| 2 | 秒可玩：art: 确定性解析到免费 CC0 库（同查询同图·placeholder=真图） | `resolveArtRefs`（引擎·自动） |
| 3 | 出需求台账：机器扫 art: 槽位→**按素材去重**（owner 07-12：一行=一种素材·同 query 多实体共用一行·slots[] 记全部槽位·生成一张扇出写回全部·旧重复行自动吸收） | 美术平台/工坊素材屏自动（或 POST /api/art/derive） |
| 4 | 配风格：选**风格包**（闭集·中英双方言+palette+钉死供应商）+ 填**本游戏风格锚**；模型菜单默认随包 | 平台头部（风格包/🎯风格锚/模型下拉） |
| 5 | 一键全量：逐行拼 prompt（`prompt`>`query+desc`>`query` + 类型词 + 包方言 + 游戏锚）→ 调 API → palette-snap+按规格缩放 → 落**`art/ai/pending/` 待审区**+provenance；审前不写最终 index/skinKey alias；断点续跑·无 key=探针+mock | 平台「⚡ 一键全量」（大脑=`scripts/art-replace.mjs`） |
| 6 | 写回：按编号重钉 manifest art: 引用→**parseManifest 零 error 才落盘**（玩法零改） | 平台自动（library 线 batch 后 replace） |
| 7 | 优化：缩略图墙按编号三式——重生成(可改 prompt)/库选换/上传（magic-bytes 嗅探）——只动那一行 | 平台详情面板 |
| 7.5 | **人审复核（double verify 人门）**：逐行/全部「☑ 复核通过」→ approved——五步流程条全绿才算这条线走完 | 平台流程条+复核按钮 |
| 8 | 换皮量产：同玩法 × 换风格包整批重跑 → 新卡带（记 reskinOf 谱系） | 平台「🎭 一键换皮」 |

## Workshop 工坊一站式（owner 07-12「占位/提示词/模型/替换全在工坊」）

- 工坊素材屏：点任意台账卡=详情卡（提示词全文/改词输入/风格包 chips/文生图模型 chips）+
  「⚡ 重新生成这张 / ▶ 生成全部占位 / ⤵ 替换写回」——四步 4-7 不必再去旧工作台。
- 美术对话 agent 可产 ```art-ops 操作提议（regen/batch/replace 三式），壳出确认卡「✔ 执行全部」
  ——agent 开方子、人点头、工坊执行；**agent 永不代执行**，也不许再叫用户去旧平台手动 retire。

## 编译期游戏线（games·如 game-103）· 差异只在两处

- **接入**（一次性·三行）：theme 定 skin key → 蓝图视觉实体加 `Sprite:{textureKey,anchorX:0.5,anchorY:0.5,zOrder:0}`（**必与 Shape 并存**·未就绪回退 Shape=观感零变）→ 照 `scripts/game-g-art-requirements.mjs` 样板写 requirements 推导脚本。mount 拉本地 index 注册 AssetManager（`games/game-103/game-103.ts` 的 `loadGameArtInto` 样板）。
- **程序矢量=索引一等公民（REQ-VECTOR-ART 步3·07-13）**：参数化程序美术不留在渲染代码里——索引条目
  `type:'texture'+spec.generator:{name,params}`（免 path·params=纯数据·双皮=两组 params），game 模块
  `registerTextureGenerator(name, fn)`（确定性纯函数→data-URI）**先登记后 registerAssetIndex**；
  热替换=同 id 条目在 `path`(raster)↔`spec.generator`(矢量) 间只改索引数据，textureKey/调用点零改。
- **写回**：不钉 manifest——生成/上传按 `skinKey` **别名登记**进 `public/games/<g>/art/index.json`，资产就绪自动换装。其余步骤与卡带线相同（换库/换皮动作在平台自动隐藏）。
- **程序化背景 = 可换背景槽（REQ-ART ②·owner 2026-07-22）**：宿主层 CSS 渐变背景（原直传 `mountHost({sceneBackground})`）改用背景皮肤槽：`mountHost({ sceneBackground: 程序化底, sceneBgSkin: { skinKey, imageUrl: filledSrc(gameIndex, skinKey) } })`——有生成图叠图、无图纯回退程序化底（**兜底永不丢**）。台账加一行 `skinKey=<g>/scene/<名>`（孤儿审计据此认作有槽）；生成图入索引前过 M2.5 人审才上画面（不拿空/未审图盖掉手绘背景）。`filledSrc`=`src/assets/asset-index.ts`（skinKey→URL 解析口）。

## 美术存哪（REQ-CARTART·2026-08-06 归位）

**单一真相 = `paths.py::art_root` / `art-paths.mjs::artRoot`**（两实现·冒烟跨语言比对防跑偏）：
- **卡带**（`library/<slug>/` 存在）→ `library/<slug>/art/`——**不入引擎仓**，随卡带自己的 git 仓版本化（换图不再与 mainbranch 撞冲突）。
- **内置游戏** → `public/games/<slug>/art/`——tracked 出货内容，照旧；改完可用平台「⤴ 提交推送」一键 commit+rebase+push。

**URL 契约 `/games/<slug>/art/**` 两者共用**（引擎只认 URL·伺服层回退），故台账里的 servedPath 与游戏侧消费点**一律不用改**。
存量搬迁：`python3 scripts/cartridge-art-migrate.py [--apply]`（缺省 dry-run·幂等·不代人提交）。

## 红线

- **禁纯色块游戏**：主体视觉实体必须有皮肤槽（art: 或 Sprite+skinKey）——没槽=不可换皮=生成线白搭（历史反面教材：已删的 game-q 初版）。
- **台本只列「有消费槽」的行（owner 2026-07-22·REQ-ART-可消费槽铁律）**：`art-ledger.json` 每行必须有真实消费槽（manifest `art:` 或游戏侧消费的 `skinKey`）——**孤儿行（无槽·生成/换了游戏里不上画面）禁止列进台本**（换了白换=坑 owner）。程序化背景要能替换→用 `mountHost` 背景皮肤槽（有生成图用图·无则回退程序化·兜底不丢）。清台本二选一：接槽 或 退役。反面教材=game-c 37 行素坯 skinKey:null（REQ-C-112）。
  - **机器守卫**：`npm run ledger:audit`（=`node scripts/ledger-audit.mjs [<game>|--all]`）——报 `ORPHAN-LEDGER-ROW`（无 skinKey 且无 manifest `art:`）。默认顾问态不阻推送；PE 清完自己游戏可 `--strict` 单游戏门禁（有孤儿即退 1）。完工判据=该游戏零孤儿（样板 game-g 110/110）。
- **游戏侧消费必须读台账/skinMap·禁只读硬编码路径（owner 2026-07-27「换了没反应」铁律）**：视觉加载先取 `skinMap['<skinKey>']`（=台账当前图·含创作台替换图——编译期游戏替换写 `row.gen.servedPath`+别名登记），**硬编码路径只作回退**。有 skinKey 但渲染读死路径=创作台替换进了台账也不上画面（「换了没反应」）；生成器/物品/立绘/背景走**同一条皮肤槽装载路径**。诊断「换了没反应」第一步=查该视觉是否 skinMap 优先。反面教材=game-101 订单卡立绘读死 `CUST_PORTRAITS`（art-49~54 换脸无效·2026-07-27 修）。
- **占位最低标准=成形矢量图（owner 2026-08-08 立·game108 S6 账单复盘）**：台账每行落账即须有一张**真实入游戏渲染的 SVG 矢量图**——造型明确、看得出是什么东西（牌面像牌面·图标像图标）；**灰块/字框/空框式「无图占位」不再合法**。程序化 SVG 允许且鼓励（保号在档·风格锚到位后逐行替真图·替换语义不变）；出 S6 账单给 owner 时，「占位」列展示的必须是这张矢量图而非空位符。判据：逐行点开有图、图有形。
- **设计稿切图入账（owner 设计定稿的正路·2026-08-08 立·game108 复盘）**：Claude Design 稿的参考包归 `docs/design/<slug>/ui-refs/`（经收稿箱·**不放 games/<slug>/ 运行时树**）；从稿中切出的**真图**逐张走台账行（status:filled·provenance 记「design-handoff:<稿名>」·接 skinKey/art: 消费槽），**禁散放+硬编码路径直读**（反面教材=game108 手型图标·REQ-108-ART-02）。稿是参考、切图是资产，两者账目分开。
- **编号 append-only**：台账编号永不挪号（重跑合并·墓碑保号）；改提示词改台账行，**勿手改 md 当真相**。
- **`art/orig/` 是只进不出的备份区（REQ-UPBACKUP·2026-08-19）**：`orig/<no>.<ext>` 里躺的永远是**第一次被替换之前**那张图——它是「一键还原」唯一的底牌。故：**已在案的备份绝不重拷**（`_backup_orig` / `backupOrigFile` 幂等·别再靠 `'orig' in row` 这种会被 derive/restore/直传批抹掉的标记防重入），**还原把备份内容拷回原服务路径**而不是把线上别名指进 `orig/`（否则备份自己成了线上文件，下次替换就拿它当源）。反面教材=game101 art-59 备份被替换图逐字节顶掉、真原图永久丢失。改这条线先跑 `python3 scripts/art-backup-smoke.py`（已在门禁 `backupSmoke` 面）。
- **mock 只许显式，且永不上画面（owner 07-10）**：不勾=真调尝试；无 key 必须见探针输出——静默顶替=假绿（testing.md 红线）。mock 产物只落独立命名空间 `gen/mock/`（gitignored）供平台墙预览（⚙MOCK 标）：**不写回 manifest、不登记 skinKey 别名、不可 approve**——真图到位前游戏保持原始 placeholder 观感。把 mock 钉进游戏=事故（game-j/m 2026-07-10 反面教材）。
- **写回必过校验门**：library 线 parseManifest 零 error；编译期线只走别名登记，**绝不改蓝图代码来换皮**。
- key 只进设置面板/.env（打码回显·不落日志）；进**共享货架**仍必须 M2.5 人审门。

## 查不到怎么办

- 新资产类型/新供应商/参考图模式等本册没有 → `docs/workflow/requests.md` 提缺口等裁决，**绝不自造旁路**。
# Life surface / landmark 审美检查

Life 世界审阅按两张矩阵验收：`warp → landmark → destination` 检查出口是否由同场景可见实体表达；`surface → actions → asset slot` 检查普通、未耕、干耕、湿耕和作物阶段是否视觉可辨。候选为 placeholder 时只评 brief、尺寸、anchor 与落点，不得写 approved/provenance。
