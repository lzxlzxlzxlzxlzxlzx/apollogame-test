# SIMLIFE-ENG-17｜通用 Life 游戏宿主与安全落盘路径实查

> 状态：只读实查完成；未实现宿主或物化器，未创建游戏，未修改 launcher、资产索引或持久化数据。  
> owner 裁决：2026-10-09 选择 **A（补通用 Life 宿主/运行描述符，再接受限物化）**。

## 1. 架构结论

### 接受

`LifeGenerationBundle v1` 已能把不可信生成内容收敛为经过严格 Life validator/compiler、能力图、两 tick 运行、snapshot/order/hash/restore 和 AssetSlot 闭包验证的内容。下一步应补的是 **sim 外的通用宿主与受限 authoring 物化边界**，不是新增 Life 玩法 system，也不是把 Little Valley 宿主逐份复制给每个生成游戏。

### 回驳

1. **回驳“通过 bundle 后直接复制 `games/game-simlife/game-simlife.ts`”**：该文件虽正确复用 `mountHost`、`createRunLoop`、`CanvasRenderer`、`mountUI`、存储端口和资产装载器，但包、视觉目录、HUD 文案、view model、互动投影、存档槽和 launcher 注册均与 Little Valley 绑定。复制会把一款游戏的展示与存档策略扩散成 N 份宿主代码。
2. **回驳“把 Life package 当普通 manifest 交给 `DataCartridgeRunner`”**：普通卡带运行器只认识 `manifest.json -> parseManifest -> WorldBlueprint`，提供固定画布和通用 Controllable 键位；它没有 Life package 编译、Life world preview、语义动作、互动菜单、LayoutNode HUD、AssetSlot visual catalog 或 Life 存档生命周期。
3. **回驳“bundle 一通过就自动正式落盘并自动上架”**：bundle 的成功只证明内容可编译、可确定性运行及 slot draft 闭包，不证明 S1-P/能力计划/美术人审/launcher 审核已完成。现有 `buildLifeMaterializationPlan()` 也明确只返回 `writesPerformed:false` 的 handoff 描述。
4. **回驳复用现有 `/api/library/create` 作为 Life 物化器**：该路径的真相格式是普通 `manifest.json + meta.json`，并会触发版本化、台账派生和立项卡副作用；其实现还可能在卡带子目录调用 Git。它既不是 Life bundle 的格式，也不满足“各阶段显式授权、无隐式 Git/资产批准”的边界。

因此，真实缺口是：**缺一个由数据描述、可被 launcher 统一选择的 `life-host.v1` 运行契约，以及在 owner/asset-manager 门之后才执行的分阶段物化命令。** 这属于共享宿主/authoring 控制面，不属于游戏层规则。

## 2. 证据：现有 game-simlife 哪些可复用，哪些耦合

| 面 | 可直接复用的通用件 | Little Valley 耦合证据 | 裁决 |
|---|---|---|---|
| 世界装载 | `compileAndParseLifeGamePackage()`、`Engine`、`QueuedInputSource` | `game-simlife.ts` 静态 import `LITTLE_VALLEY_PACKAGE`，输入源固定为 `life:player` | 编译/引擎可复用；package 应改为描述符注入 |
| 宿主骨架 | `mountHost()` 只负责 wrapper/scene/playfield/top/bottom/overlay 和缩放，不碰 sim | `LIFE_DEMO_HOST_LAYOUT` 固定 900×620、52px 顶栏和 Little Valley 配色 | 骨架可复用；尺寸/主题进入闭集 host config |
| 运行环 | `createRunLoop()` 管 create/read/sig/paint/dispose 生命周期 | 当前 read/paint 固定 `selectLifeDemoView()`、`buildLifeDemoTopHud()`、Little Valley interaction controller | 运行环可复用；Life 投影与 UI 需通用化 |
| 渲染 | `CanvasRenderer` 已支持 `lifePreviewOptions`、`lifeVisualCatalog`、responsive viewport、`WorldUI2D` | 当前 cellSize、背景、viewport 和 visual catalog 都由游戏文件写死 | 参数进入描述符；继续保持 render-only |
| UI | `mountUI` + `STARTER_THEME` 严格走 LayoutNode | HUD 写有“小山谷”、固定中文操作提示；view model 把 `farm-field/forest-grove/mine-mouth/town-plaza` 映射成专名 | 宿主只解释通用 Life HUD schema；地点/目标/词条来自数据，不识别具体 id |
| 互动 | 所有世界写入最终仍通过 `QueuedInputSource.enqueueAction()`；`LifeInteractionController` 本身是 host-side 状态机 | action/target/reason 的中文词表和 `Mayor/Merchant/Berry/Ore` 等语义在游戏文件；presentation 锚定 `life:player` | 抽通用控制器/默认词表；游戏仅提供可选文案覆盖，不允许自由 handler |
| 键盘 | `installLifeDemoKeyboard()` 的按下/释放、E/Tab/Enter/Escape 生命周期可复用 | 固定键位和 `LifeDemo` 命名 | 形成 `LifeHostInputSpec` 闭集，缺省沿用现有键位 |
| 资产 | `parseAssetSlotManifest()`、`compileLifeVisualCatalog()`、`createArtAssets()`、`loadGameArtInto(slug)` 可复用；失败时语义预览仍可跑 | 当前直接 import `little-valley.asset-slots.json`，art slug 固定 `game-simlife` | 描述符注入 slot manifest 与 art slug；批准事实仍只认 AssetIndex |
| 存档 | `SaveSystem` 提供 snapshot+order+hash 的 fail-closed 存取；`createStoragePort` 选择云/IndexedDB/localStorage/memory | `LIFE_DEMO_SAVE_SLOT='little-valley-v1'`、版本 label 固定；恢复运动直接操作 `life:player`；提交投影策略写在 game 文件 | Life 编译器已保证标准实体 id，复位逻辑可通用；槽名/兼容版本必须按游戏命名空间派生 |

补充事实：Life compiler 本身稳定地产生 `life:player`、`life:calendar`、`bag:life:player` 和语义 KeyBinding，因此通用宿主依赖这些 **LifeGamePackage v1 编译契约** 是合理的；不能依赖 `mayor`、`farm-field` 等某份内容 id。

## 3. launcher / 卡带 / 模板机制实查

### 3.1 内置编译期游戏

- `src/launcher.tsx` 的 `GAMES` 是手写字面量卡片表，且 `main_entry/games_list.py` 通过正则读取它。
- `src/launcher/game-runner.tsx` 的 `GameRunner` 另有一份 `gameId -> dynamic import -> mount()` 手写 loader 表。
- 所以新增一个现行编译期 Life 游戏至少需要两处人工代码注册，纯数据尚不能上架；`LifeGenerationBundle` dry-run 中的 launcher handoff 对当前事实描述准确。

### 3.2 library 数据卡带

- `library/<slug>/meta.json` 只提供货架展示元数据；`manifest.json` 是普通数据卡带唯一玩法真相。
- `DataCartridgeRunner` 拉取 `/api/library/<slug>/manifest`，经 `parseManifest()` 后交给 `runBlueprintInto()`。
- `runBlueprintInto()` 只做普通 Engine + CanvasRenderer + Controllable 自动键位；没有 Life 专用宿主面。
- `logic.ts` 是显式 TS 例外，并由 `hasLogic + allowTs` fail-closed；它不应成为生成 Life 游戏逃生口。

### 3.3 现有模板/物化器

- `main_entry/templates.py` 的模板库均产出普通 manifest；没有 LifeGamePackage 模板或 Life host 描述符。
- `main_entry/library.py::_scaffold()` 创建 `manifest.json/meta.json`，并附带版本化、台账和立项副作用；不是可复用的 Life 物化事务。
- `src/assembly/manifest-core.ts` 所称 materialize 只是 manifest 内 `$template/$repeat` 展开，不是把生成 bundle 创建成新游戏。
- `scripts/game-blueprint-to-ledger.mjs` 等工具处理已存在游戏/manifest 的导出或美术台账，也不承担 Life bundle 物化。

结论：现有系统有 **普通 manifest 卡带宿主** 和 **编译期游戏宿主** 两条路，但没有第三条“Life package + Life host descriptor”的纯数据入口。

## 4. 最小通用接口

建议新增共享契约名 `life-host.v1`。它是 sim 外、严格闭集、可静态校验的数据，不进入 World/snapshot/hash/save。

```ts
interface LifeHostDescriptorV1 {
  schema: 'zerocraft.life-host.v1';
  slug: `game-${string}`;
  packagePath: 'life.json';
  assetSlotsPath: 'asset-slots.json';
  artSlug: string;
  viewport: {
    fieldW: number;
    fieldH: number;
    topBarH: number;
    bottomBarH?: number;
    cellSize: number;
    mode: 'fixed' | 'responsive';
    cameraFit: 'contain' | 'cover';
  };
  theme: 'starter';
  hud: {
    preset: 'life-standard-v1';
    title?: string;
    labels?: Record<LifeHostLabelKey, string>;
  };
  input: { preset: 'life-keyboard-v1' };
  save: {
    namespace: string;
    schemaVersion: 1;
    autosave: 'life-commit-v1';
  };
}
```

约束：

- `packagePath` / `assetSlotsPath` 只能是同游戏目录内固定文件名，不接受 URL、绝对路径或 `..`。
- `hud.labels` 的 key 是闭集，仅覆盖展示词条；不得携带 LayoutNode、CSS、DOM、函数或 action handler。
- `theme` 第一版只允许成熟 house/starter 主题；不得让生成内容自由构造 UITheme。
- action 名仍由现有 Life capability/编译器定义；宿主只把键盘或 LayoutNode action 入队，绝不直接写 World。
- `artSlug` 只决定去哪里读取已批准 AssetIndex；AssetSlot prompt/governance 不进入运行时。
- `save.namespace` 必须由物化器从 slug 派生并核对，例如 `life:<slug>:v1`，禁止跨游戏共享 `little-valley-v1`。

最小共享运行 API 可收成：

```ts
mountLifeGame(container, descriptor, lifePackage, assetSlots, host?) => cleanup
```

它内部组合现有 `mountHost`、Life compiler、Engine、`createRunLoop`、CanvasRenderer、通用 Life view projection、LayoutNode HUD/互动、键盘、AssetManager 与 Life save adapter。游戏目录不再生成一整份宿主实现；若内置编译期入口仍要求 `mount()`，只允许生成一个无逻辑的薄入口，或由 launcher 的 `LifeGameRunner` 直接读取描述符。

## 5. 保存、快照、渲染和 UI 的分界

1. **World 真相**：只含 Life compiler 生成的 POD 组件。宿主文案、主题、资源路径、prompt、许可、provider、slot approval 不得进入 World。
2. **快照真相**：沿用 `SaveSystem` 的 `world.snapshot() + snapshotOrder() + hashWithOrder()`；恢复必须先进入隔离 World，校验通过后一次替换活动世界。
3. **存档命名空间**：当前底层端口默认共享 `apollo-save:` / IndexedDB `snap:` 空间，因此每个 Life 游戏必须使用稳定且唯一的 slot：`life:<slug>:slot-1`；label 记录 Life package/host save schema 兼容版本。不能只用 `meta.id`，因为不同游戏可能复用内容 id。
4. **autosave**：保留“只对持久进展投影签名，移动/相机/UI 不触发”的策略。组件 allowlist 归通用 Life save policy；新增 Life 持久组件时需同步升级 policy/schema 与迁移测试，不得每游戏私加。
5. **恢复输入**：恢复后清空 `LifeContinuousMotion`、`Velocity` 及一次性 move/warp request，继续依赖标准 `life:player` 编译契约。
6. **渲染**：CanvasRenderer 只读 World + 编译后的 visual catalog；资产缺失继续走语义 fallback，未批准 pending 图不得覆盖。
7. **UI**：HUD/互动菜单仅由通用 view projection 读取 World，产出 LayoutNode；按钮只发具名 action 入队。地点名、目标文本、任务 objective 应来自 Life 数据或闭集本地化表，禁止按具体 zone id 写 `if`。

## 6. 安全物化边界

物化不得是一个“全自动复制并上架”按钮；必须是可审计的分阶段事务，每阶段都从 **同一个已通过 bundle canonical hash** 开始，并在写前/写后核对目标、内容 hash 与状态。

### 阶段 M0：只读计划

- 输入：原始 bundle + `checkLifeGenerationBundle()` 成功结果。
- 输出：规范化目标、每项内容 hash、冲突清单、所需人门；零写入。
- 已由 ENG-16A 覆盖，继续保持 `writesPerformed:false`。

### 阶段 M1：authoring 草稿落盘（需 owner 明示执行）

- 只允许创建一个不存在的 `games/<slug>/` 草稿目录中的：`life.json`、`asset-slots.json`、`life-host.json`。
- 创建前逐段解析 real path，要求全部仍位于精确的 `games/<slug>/`；禁止覆盖、符号链接逃逸、额外文件、launcher 修改和资产索引修改。
- 文件写入临时同目录并原子 rename；任一步失败则撤销本阶段新建文件。再次执行必须按 content hash 幂等。
- 写后重新跑 envelope/Life/AssetSlot/host descriptor 全套只读校验；不能信任 M0 的旧结果。
- 本阶段不生成 `game.ts`，不触发 Git、library API、台账、模型、网络或服务。

### 阶段 M2：生产门

- 新游戏必须补齐并由 owner 目击定稿 S1-P HTML 原型；完成 capability plan 和缺口裁决。
- `life-host.json` 的 viewport/HUD/交互状态必须对齐定稿原型；无法用 `life-standard-v1` 表达的 UI 缺口报 PUI，不准生成自由 DOM。
- 只有 M1 内容与 owner 定稿 hash 一致，才能进入运行接线。

### 阶段 M3：资产交接（asset-manager 专属）

- asset-manager 根据 placeholder briefs vendor/生成候选，仅写 pending；机器校验后经人审 approve 才登记本游戏 AssetIndex。
- 物化器不得生成图片、伪造 `approved/contentHash/license`、写 `gen/` 或改 `public/games/<slug>/art/index.json`。
- 资产缺失不是阻塞宿主灰盒运行的理由，Canvas 继续使用 fallback；但 S5/S6 交付仍需资产闭包与人审。

### 阶段 M4：launcher 接线

- 方向 A 下应由 launcher 识别 `life-host.v1` 描述符，避免每游戏扩 loader switch。
- 在该通用入口落地前，任何临时内置入口仍需人工 review，禁止物化器直接改 `GAMES` 和 `GameRunner.loaders`。
- 上架元数据与运行描述符分离：展示卡片可读一个严格 meta，但不能把自由模块路径当数据执行。

### 阶段 M5：验证与交付

- validator/compiler、host descriptor、两 tick/hash/restore、通用宿主交互、存档隔离、AssetSlot 闭包、UI 审计、原型 1:1 和游戏流水线分别验收。
- 物化工具本身须有冲突、路径穿越、陈旧 hash、部分写入回滚、重复执行、跨游戏存档污染和未审批资产等负例。
- Git、启动服务以及任何持久化外部操作继续由 owner 按仓库禁令亲自执行；物化器不得把这些动作藏进脚本。

## 7. A/B 裁决

### A｜补通用 `life-host.v1` + descriptor runner + 分阶段物化（owner 已选择，推荐）

- **代价**：需要先抽取通用 view projection、互动/HUD/键盘/save adapter，并给 launcher 增加一种受控描述符入口；首单工作量较 B 大。
- **影响面**：`src/engine/host` 或新的共享 Life host 模块、launcher 的运行分流、authoring materializer、相关测试；不改 Life sim capability。
- **通用性**：后续每个 Life 游戏只需 Life 数据、slot 草稿、host descriptor 和货架元数据；弱模型能稳定填数据。
- **选对收益**：宿主 bug、存档迁移、输入/UI/资产隔离只修一处；launcher 不再为每个 Life 游戏新增动态 import 分支。

### B｜复制 game-simlife 宿主 + 每游戏手写 launcher 注册（不采用）

- **代价**：首个游戏快，但每次都生成/维护 TS、HUD/view/save/键盘副本。
- **影响面**：每款游戏至少新增游戏代码并改 `GAMES` 与 loader 表；极易漏一处注册。
- **通用性**：低，且把 Little Valley 的 zone/文案/存档假设带入别的游戏。
- **选错代价**：N 份宿主漂移、存档串槽、未审资产越界、UI 不一致；之后迁回 A 还要逐游戏清债。

owner 已选择 A，故后续工单不得以“先复制一份以后再抽”为实施路径。

## 8. 建议拆分的后续施工单

1. **ENG-17A｜`life-host.v1` 数据契约与 fail-closed validator**  
   只定义闭集 descriptor、路径/slug/save namespace 约束、canonical hash 与负例；不挂 launcher、不写文件。
2. **ENG-17B｜通用 Life view / interaction / LayoutNode HUD**  
   从 Little Valley 抽取不识别具体内容 id 的投影与控制器；默认词表可覆盖，action 仍进队列；由 PUI 复查 UI 面。
3. **ENG-17C｜通用 Life save policy**  
   抽取持久组件投影、隔离恢复、输入复位、autosave coalescing、`life:<slug>:` 命名空间和版本兼容测试。
4. **ENG-17D｜`mountLifeGame` 共享宿主**  
   组合现有 host/run loop/renderer/assets/input/UI/save；以 Little Valley 作为等价迁移见证，撤掉游戏专属宿主逻辑但不改玩法数据。
5. **ENG-17E｜launcher descriptor runner**  
   为 Life 描述符增加受控加载分流和错误态；禁止自由模块路径，解决当前 `GAMES + loaders` 双注册问题。
6. **ENG-17F｜受限 materializer**  
   先只实现 M0/M1：显式 `--apply-authoring`、仅新目录三 JSON、原子/幂等/冲突 fail-closed；不碰 launcher/AssetIndex/Git/服务。后续阶段仍输出 handoff。

其中 17A/17C 涉及共享契约和存档，应由主程施工；17B 涉及 `src/ui/**` 时归 PUI 专职域复查/施工；17F 若要加入任何自动上架或资产批准，必须另开 owner 裁决，不能顺手扩大。

## 9. 验收清单

- [ ] 同一 `mountLifeGame` 可装载 Little Valley 与第二份最小 Life fixture，宿主代码零分叉。
- [ ] 第二份 fixture 使用任意合法 scene/zone/placement/npc id，HUD/互动不出现 Little Valley 专名。
- [ ] 所有 UI 是 LayoutNode；代码扫描无游戏层 DOM/CSS/React 逃生。
- [ ] 所有世界写入由具名 action 经输入队列进入；host handler 不直接写 World。
- [ ] 两游戏共享同一个 StoragePort 时槽位、列表、恢复互不污染；坏档/旧 schema fail-closed 回到新世界。
- [ ] World snapshot/hash 中不存在 host descriptor、prompt、许可、provider、文件路径或 approval 元数据。
- [ ] AssetSlot placeholder 可灰盒运行；pending 未审图不能被运行时解析；approved index 才能换皮。
- [ ] M1 对已有目录、目标文件存在、路径穿越、符号链接逃逸、陈旧 baseHash、内容 hash 不符和中途失败全部转红且不留半成品。
- [ ] 物化与运行路径不调用 Git、不启动服务、不写数据库、不调用模型/网络。
- [ ] launcher 只读严格描述符，不接受描述符提供任意 import URL/module path。
- [ ] Little Valley 迁移前后，两 tick 初始 hash、关键互动链、存档恢复与 UI 审计结果一致。

## 10. 最终结论

现有 Life **玩法解释器已经足够**，不应新增游戏专属 system。现有公共 host 基座也足够作为零件，但缺少把这些零件按 Life 契约装成同一个产品的共享适配层。owner 选择 A 后，最小正确路线是先钉死 `life-host.v1`，再抽通用 view/UI/save/host，最后才开放仅 authoring 三 JSON 的受限物化；资产批准和 launcher 上架继续分门交接。
