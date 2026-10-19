# SIMLIFE-QUEST-PANEL-01｜共享 Life 任务追踪 HUD 与任务抽屉

施工主体：**BDM程序**  
状态：**独立复查 PASS（2026-10-14）**

## 目标

让任意 Life 游戏只通过严格 `LifeHostDescriptor v1` opt-in，即可显示左上当前追踪目标，并用 `J`、点击按钮和 `Esc` 操作右侧完整任务抽屉。界面只能消费现有 `LifeQuestCatalog + LifeQuestProjection` 的共享只读投影；任务跟踪选择只属于 Host 渲染本地态，不得进入 World、快照、网络哈希或游戏存档。

## 写死边界

- `questPanel` 是严格、闭集、可省略的 Host descriptor 配置；省略保持现有行为。只允许开关、标题标签和闭集默认追踪策略，不接收自由坐标、CSS、模板或任意图标路径。
- presenter 按权威目录与投影稳定派生 `questItems`：章节/任务 id、标题、安全摘要、节点状态、可见进度、追踪标记和下一目标；UI 不重算条件、不猜任务状态、不写 World。
- 左上只显示一个当前追踪目标；右侧 Drawer 显示全部可见任务的状态、进度与目标。无活动任务时必须显式为空态。
- `J` 切换 Drawer、`Esc` 关闭、点击行为等价；按住移动键以及 `E` 交互/对话不得被任务面板阻塞。
- “追踪”仅改变 Host 本地偏好；禁止写入组件、快照、网络哈希、本地/云存档或游戏 JSON。
- 只使用现有 LayoutNode 闭集控件；不写自由 DOM/CSS，不修改 `src/ui/**`，不新增任务 system 或游戏私有解释器。
- 月影魔王城只 opt-in Host 配置并消费现有 JSON 任务表；不得改剧情/任务 JSON，不生成或登记素材。
- 素材策略仅允许未来的闭集可选标签/图标 key 接口或现有回退；本单不生成、审批、登记、物化素材。

## 验收锚点

1. descriptor 对未知字段、原型继承、非法类型/枚举给出稳定路径级拒绝；省略配置向后兼容。
2. presenter 对 active/locked/completed/failed/empty 提供稳定目录序与进度；默认跟踪和手动跟踪来源明确。
3. `J`/`Esc`/点击开关等价，移动与 `E` 输入不中断。
4. 跟踪切换前后 World snapshot/hash/save bytes 不变；唯一锚点撤修可令该断言转红。
5. Drawer 和 HUD 通过 LayoutNode validator、dark/light UI audit。
6. 月影魔王城正式与候选 Host descriptor opt-in，且真实现有任务表能投影出首章当前目标。
7. 定向测试、tsc、lint、依赖方向和文档/context gate；施工人只交 self-check 与 review 导航，最终结论由独立复查人给出。

## 架构判断

接受。现有 `t2-life-quest` 已把任务图解释为权威 `LifeQuestProjection`，目录中也已有章节标题、任务优先级、终止节点和稳定节点文本；本单只需共享 Host 做单向 join 与 LayoutNode 呈现。现有 Drawer、Panel、Button、Label、Badge 足以表达界面，因此不存在 capability gap。任何把跟踪偏好写入 World、另造任务状态或在 UI 复算条件的实现都应拒绝。
