# SIMLIFE-UI-SKIN-PACK-01｜共享 Life UI 皮肤包数据合同

施工主体：**BDM程序**  
状态：**待独立复查**

## 目标

让 Life 游戏可在严格 `life-host.json` 中选择一份可选、可复用的 UI 皮肤包；皮肤只提供无文字框皮、图标或装饰图，地点、任务、数值、快捷键及无障碍名称仍由 `LifeHostViewModel` 与 LayoutNode 动态渲染。首个消费者为 `game-demon-castle` 的“月影庭院”样例。

## 已实查能力与架构判断

接受。`Panel.skin` / `Button.skin` / `Image` 及 `skinSlice` 已是 LayoutNode 闭集能力，能表达九宫格画框、连续状态栏和资源图标；不需要新增 `src/ui/**` 控件，也禁止从 HTML 原型复制 DOM/CSS。当前缺口仅是 Life Host 严格描述符尚无 UI 皮肤 key 的数据槽，导致已批准候选不能有真实消费者。

## 写死合同

- 在 `LifeHostDescriptorV1` 增加**可选** `uiSkin` 对象；缺失时保持现有 Life 游戏像素级行为和默认主题。
- `uiSkin.id` 为受限、小写 kebab 标识；`uiSkin.slots` 是固定闭集，不接受 URL、路径、Data URL、CSS、任意属性名或自由布局值。
- 固定槽位仅为本版确有消费者的：`trackedQuestFrame`、`worldStatusRibbon`、`panelFrame`、`hudChrome`。每个值只能是非空、且 `<game>` 必须等于 `artSlug` 的 `art:<game>:ui:<name>` key；运行时必须经 `AssetManager` 解析，缺图时保留当前诚实的默认 LayoutNode 外观，绝不崩溃或改写模拟。
- `uiSkin.slices` 只允许固定槽位 `trackedQuestFrame`、`panelFrame` 的正整数源边距 1..256；显示边宽如需独立值同样固定闭集且 1..128。不得把尺寸、位置、颜色、中文文字或 CSS 放入 descriptor。
- `life-hud.ts` 使用已解析 URL 给 `Panel.skin`/`skinSlice`；三个 Drawer 通过其内部现有 Panel 组合消费框皮（当前 DrawerProps 无 skin 字段，策划已确认此组合）。资源与属性图集第一版不得登记、更不得以 CSS 切图或假装每个属性已有独立图标。逐帧裁切若现有 `Image` 闭集不可表达，另行提 PUI 缺口。
- 三个抽屉必须实际消费 `panelFrame`；不改 `src/ui/**`，不引入游戏私有 React/DOM，仍遵守全视口 pointer 透传合同。
- `game-demon-castle/life-host.json` 可声明该皮肤包，但在资产管理者正式登记 key 前不得引入悬空 key；此单先完善合同与测试。素材导入和 descriptor 实际绑定由后续资产单完成。
- 不新增 World 状态、输入、存档字段、快照/hash 内容或 gameplay JSON；皮肤替换必须 render-only。

## 验收

1. 描述符严格拒绝未知 `uiSkin`/`slots`/`slices` 字段、不安全 key、空 key、超界切片；缺省 descriptor 仍通过且 canonical hash 行为可证明兼容。
2. 共享 Host 仅消费已经由 `AssetManager` 成功解析的 skin key；缺图/未声明均优雅退回当前 starter 视觉。真实 URL 不得来自 JSON。
3. LayoutNode tree 对月影皮肤含 `Panel.skin`/`skinSlice` 与动态 Labels；任务、日期、背包、档案数据变化时贴图不替代动态文字。
4. 定向 Host/descriptor 测试、`validateLayoutNode`、dark/light UI audit、`npx tsc --noEmit` 通过；提供带锚点的撤修验红。
5. 不修改 `src/ui/**`、正式 art 索引、AI 候选、World/存档/正式 materialize 文件；完成后只进入独立复查。

## 交付纪律

先将本单施工主体改为自己作为锁，再开始实现。你不是唯一在共享工作树工作的 agent；不得回退、覆盖或清理他人改动。自行工作，直到完成、真正需要 owner A/B 裁决或明确阻塞才回复；完成时提交自检、测试实证和独立复查导航。
