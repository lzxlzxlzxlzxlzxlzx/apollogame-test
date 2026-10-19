# SIMLIFE-HUD-RESOURCE-01｜共享 Life 顶栏状态与资源条

施工主体：**BDM程序**  
状态：**独立复查 PASS（2026-10-14）**

## 目标

将已定稿 UI 原型的全局信息层纳入共享 Life Host：顶部稳定显示当前位置、季节/日期/时段；右侧显示游戏作者选择公开的核心资源与 I/J/C 快捷入口。不得新建资源账本或在游戏端写专属 HUD。

## 写死边界

- 扩写现有 `LifeProfileAttribute`，新增严格闭集 `surfaces: readonly ('profile'|'hud')[]`。profile 面板仍显示全部属性；只有带 `hud` 的属性进入顶栏资源条。缺省为 `['profile']`，保证当前游戏零视觉漂移。
- HUD 条仅消费现有 profile presenter 投影：resource/relationship 的数值、范围、label、`iconSkinKey`；不得重新读取 package、重算关系、修改资源或另做配置表。
- 状态文字从现有 `LifeCalendar` 与当前 `LifeScene.title` 投影；没有 calendar 时显示安全空态，不补墙钟/真实时间。
- top bar 的 resource 属性稳定按 profile author order；最大显示 4 项。超过上限必须在 package validator 和 generation review 中 fail-closed，不能 UI 静默截断。
- `ui-icon` 继续走现有 placeholder/审批链。不得生成、批准或登记真实素材；不得修改 `src/ui/**`，所有表现用现有 LayoutNode。
- 生成流程把 `surfaces` 写入 profile prompt/review，并让 review 明示 hud/profile placement；不新增第二份 JSON 产物或 owner gate。
- Demon Castle 选择 `profile.dread` 和石像鬼盟约作为实际 HUD 资源；仅更新 candidate/正式 canonical 数据与 Host 表现，不改剧情、建设、资源效果或存档语义。正式更新仍须先做 `--plan-update` 且完全走现有受控 gate。

## 验收

1. strict schema 正负例：非法 surface、重复、空数组、超过 4 个 hud、未知字段与 prototype input 稳定拒绝；旧 profile 缺 `surfaces` 完整兼容。
2. presenter 与顶栏读取权威最新 resource/relationship/calendar/scene；读取与 HUD 开关不改变 World snapshot/order/hash/save。
3. 顶栏具有地点、日期/时段、稳定资源条与 I/J/C 三个入口；键盘和点击等价，原有 Drawer 互斥与移动/E/对话非阻塞不回归。
4. `LifeProfileReview v1` 与生成 diagnostics 明确 rows 的 `surfaces`，canonical round-trip/stale review 均可测。
5. Demon Castle candidate/正式四文件通过 generation check、Host mount、launcher/materializer 预检；所有图标仍按 placeholder truthful 状态显示。
6. dark/light LayoutNode audit、定向测试、tsc、lint、docs/context gate；施工自检必须含可撤修锚点（推荐破坏 hud surface max 校验或把 presenter current 改 initial）。

## 架构判断

接受为已批准 `LifeProfile v1` 的可选表现面扩写，而非新能力系统：现有 Profile、Resource、Relationship、Calendar、Scene 和 LayoutNode 已能完整表达。让 profile authoring 选择 `surfaces` 可确保生成数据、人物页与顶栏共用同一权威字段和图标槽；禁止引入第二个资源目录。

## 交付纪律

你不是唯一在共享工作树工作的 agent；不得回退、覆盖或清理他人修改。自行工作，直到完成、真正需要 Owner A/B 裁决或明确阻塞才回复。完成时提交 self-check 与 review 导航，禁止自签独立复查或收束路线图。
