# SIMLIFE-UI-SHELL-01｜共享 Life 全视口 UI 壳层对齐

施工主体：**BDM程序**  
状态：**独立复查 PASS（2026-10-14）**

## 目标

将已定稿的 `demon-castle-ui-demo.html` 信息层级落实为共享 Life Host 的 LayoutNode 壳层：地图保持可见；左上只显示当前追踪任务；顶部中央显示地点、季节/日期和时段；右上显示最多四项已 author 标记的资源及 `J/I/C` 入口；任务、背包、人物页均复用现有抽屉能力。

## 写死边界

- 这是既有 `LifeHostViewModel`、任务追踪、背包、人物档案、`LifeProfile.surfaces` 与 LayoutNode 的组合施工，**不新增状态、存档字段、游戏私有 HUD 或 `src/ui/**` 控件**。
- 顶层必须是全视口安全区的叠层：HUD/追踪任务覆盖于 play-field 上方，而不是挤占/缩小地图逻辑画布；继续服从 `life-standard-v1` 的统一 32px 格、28×19 可视格与 52px 顶部安全区。
- 左上追踪卡只读 `view.questItems` 中的 tracked 条目；无追踪任务显示紧凑空态。不得复制 quest 状态或改变 J 的完整任务抽屉语义。
- 资源、地点、日期、时段只复用已通过的 HUD 投影；资源稳定 author order、最多四项。保留无真实皮肤时的诚实 placeholder，不生成/批准/登记任何新图片或 AssetIndex 行。
- `J/I/C/Escape` 与指针入口保持已有互斥与 held movement 非阻塞合同；抽屉打开后地图仍可见，关闭不应更改 World/save/hash。
- 用 `demon-castle-ui-demo.html` 的全浏览器视口、信息层级及三类面板为 1:1 结构基准；不得复制其 DOM/CSS。

## 验收

1. Host 测试证明壳层有独立的 tracked-quest、world-status、resource-actions 节点；无 tracked 任务安全空态；属性与当前 Calendar/Scene/Resource 值更新后同步变化。
2. 现有 I/J/C 指针/键盘互斥、E 和 held movement、snapshot/hash/save 隔离回归均通过；没有 profile/HUD 第二账本。
3. LayoutNode dark/light audit 在标准审计画布无重叠、硬对比或 border-image 阻断；无绝对定位自由 DOM。
4. Demon Castle 复用正式 `life.json` / `life-host.json` 数据，无 gameplay JSON 漂移；零写入 materializer plan 通过。
5. 必须提供自检、定向测试、tsc、审计及带锚点的撤修验红；完成后进入独立复查，不得自签或推进路线图为 done。

## 架构判断

接受。定稿 UI 所需的任务、背包、人物档案、资源、日历和场景均已具备权威投影，本单只调整共享 Host 的 LayoutNode 组合和表现位置；因此不应扩大 JSON 或 capability 面。

## 交付纪律

你不是唯一在共享工作树工作的 agent；不得回退、覆盖或清理他人修改。自行工作，直到完成、真正需要 Owner A/B 裁决或明确阻塞才回复；完成时提交自检与复查导航。
