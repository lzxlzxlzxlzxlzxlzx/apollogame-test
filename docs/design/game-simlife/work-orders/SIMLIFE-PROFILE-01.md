# SIMLIFE-PROFILE-01｜共享 Life 人物档案与生成审阅

施工主体：**BDM程序**  
状态：**独立复查 PASS（2026-10-14）**  
Owner 裁决：**A（2026-10-14）**——补齐共享 `LifeProfile v1`，让每个 Life 游戏以 JSON 声明可验证的人物属性页；拒绝只为月影魔王城硬编码一张角色卡。

## 目标

任意 Life 游戏可从严格 `LifeGamePackage.profile` 声明角色档案字段，并通过严格 `LifeHostDescriptor.profilePanel` opt-in，在共享 Host 中以 `C`/点击/`Esc` 打开右侧人物档案。属性值只能单向投影已经权威存在的 `logic.resources` 或 `LifeRelationshipProjection`；不得新增自由表达式、游戏回调、第二份属性账本或 UI 自行重算。

生成链必须产出并校验 `LifeProfileReview v1`，让模型明确：自定义属性 = 先声明可变权威资源或关系，再声明 profile 行与 UI 图标槽；不能只写几行显示文本。

## 写死合同与边界

### 1. Package authoring / compile

- `LifeGamePackage.profile` 可省略，省略必须零回归；存在时是严格闭集：
  - `titleKey`（档案标题）；
  - `attributes[]`（非空、稳定 id、作者顺序即显示顺序）；
  - 每项：`id`、`titleKey`、`display: 'value' | 'gauge'`、`source`、`iconSkinKey`。
- `source` 为严格 tagged union：
  - `{ kind:'resource', id }`：`id` 必须唯一引用 `logic.resources`；投影 `current/min/max`。
  - `{ kind:'relationship', npcId }`：`npcId` 必须唯一引用 `relationships`；投影当前 value、min/max、level id/title。
- `display:'gauge'` 只能在 source 有有限 min/max 时成立；`value` 显示标量。禁止 `formula`、`expression`、函数、自由路径、任意实体 id、重复 source/id 与未知字段。
- compiler 建立仅供 Host 读取的 `LifeProfileCatalog` 静态组件或等价严格只读合同；不可复制 resource/relationship 当前值进新的权威 component。profile 运行值一律读现有 `Resource`/`LifeRelationshipProjection`。
- 既有 `logic.resources` 是自定义数值的唯一权威账本、已经进入条件/效果/快照/save；本单不得改变其写入顺序、snapshot/hash/save 形状或新增 Life system。

### 2. 素材与生成边界

- 每个 `profile.attributes[*].iconSkinKey` 必须由 AssetSlot 闭包精确消费；新增最小、通用的 `ui-icon` AssetSlot kind/fallback 以容纳透明小图标，不能伪装成 world item，也不能把 URL/base64/CSS 塞进 package。
- 图标仍是 pending → owner 审核 → asset-manager 物化的既有链；本单不生成图片、不批准候选、不登记真实 AssetIndex。
- 新增 `LifeProfileReview v1`：canonical bundle hash、profile rows、权威 source、当前初值/范围、精确 icon slot/pointer、placeholder 状态。Bundle 需要 profile 时，Actors 阶段必须要求 `profile-review`；没有 profile 时不能凭空要求该 artifact。
- 更新生成 prompt packet、workflow、SOP 和 simlife skill：模型先决定 `logic.resources`/relationship，再写 profile 字段和 UI 图标 brief；不能把“自定义属性”当作纯展示文案。

### 3. Shared Host UI

- descriptor 新增可省略的严格 `profilePanel: { enabled, titleLabelKey }`；默认缺省零回归。`titleLabelKey` 只允许 Host HUD label 闭集 key；不得接收坐标、CSS、模板、URL 或自由图标。
- presenter 稳定投影 `profile`: player skin、profile title、attribute id/title/icon、`value/min/max`、relationship level（如有）。读取前后 World snapshot/hash 相同；不重新解释 relation 规则、resource effect 或资源条件。
- `C`、点击按钮与 `Esc` 操作右侧 `LayoutNode` Drawer；`I`、`J`、`C` 三个面板互斥。打开/切换/关闭完全是 Host 渲染本地态，不能写 World、package、snapshot、network hash 或 Save payload；移动、E、对话保持非阻塞。
- 使用既有 `LayoutNode` 闭集（Avatar/Image、ProgressBar ring 或 gauge、Panel、Label、Button 等）和 Host 的 resolved asset URL。禁止改 `src/ui/**`、手写 React/DOM/CSS、另造 UI capability。

### 4. Demon Castle 接入

- 仅更新月影魔王城的 candidate 与正式 authoring 数据，让其 profile 至少消费：一个 `logic.resources` 属性和一个 NPC relationship 属性；每行绑定精确 `ui-icon` 槽。不得改建设/剧情/任务规则或虚构资源效果。
- Host descriptor 只做 `profilePanel` opt-in 和必要已有 HUD label；复用玩家图与新 icon slots。正式更新须走既有受控 `life-materialize --plan-update/--update`，只有满足现有授权与四文件 gate 时才执行。

## 验收锚点

1. strict package/descriptor 正负例：缺 profile 兼容；错误 union、重复 id/source、坏 resource/NPC 引用、gauge 无范围、未知字段/原型继承均在稳定路径拒绝。
2. 编译 profile 后，资源与关系改变会在 presenter 更新；profile catalog 不持有第二份 current 值。切换 profile 面板前后 snapshot/order/hash/save bytes 保持一致。
3. `C`/点击/`Esc` 等价，I/J/C 互斥，held movement 与 E/dialogue 不被释放或阻塞；Host dispose 清理输入。
4. `LifeProfileReview v1` 可 JSON round-trip、canonical hash 稳定，精确校验资源/关系和 UI icon asset consumer；profile 存在而 artifact 缺失必须在 Actors gate 转红。
5. `ui-icon` 槽在 profile JSON pointer 上闭合；缺槽、孤儿槽、错误 kind/spec、pending 未批准均由既有 guard 拒绝。没有真实素材/审批时不物化。
6. Demon Castle 真实 candidate/正式四文件能通过 profile review、compile、Host mount 与 launcher discovery；不改变原任务/建设/存档语义。
7. 施工人提交 self-check 与 review 导航，含独立可撤修锚点（推荐把 resource source 改为无效 id，或让 presenter 用 catalog 初值冒充 current），不得自行写 PASS。

## 架构判断

接受为共享 authoring/Host/生成合同缺口：现有 `f1-resource`、`t2-life-relationship`、`t2-inventory` 与 LayoutNode 能提供权威数值和表现原件，但 `LifeGamePackage` 目前没有 profile schema，生成 Bundle 也不要求属性与 icon consumer 闭合。单靠游戏私有 JSON 或 UI 常量无法让最弱模型生成可验证、可保存、可复用的人物页。采用现有 resource/relationship 作唯一 source，避免新增数值系统或游戏层解释器。

## 交付纪律

你不是唯一在共享工作树工作的 agent：不得回退、覆盖或整理他人文件。自行工作直到完成本单、真正需要 Owner 新裁决，或存在明确阻塞才回复；完成时只交 self-check、review 导航和真实命令/输出摘要，等待非施工人独立复查。
