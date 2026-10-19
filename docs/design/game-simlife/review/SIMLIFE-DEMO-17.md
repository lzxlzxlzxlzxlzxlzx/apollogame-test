# Review 单 · `SIMLIFE-DEMO-17` 交互可用性返修

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-17` |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | **独立复查通过**（`review_eng11`；初审 0 / 0 / 2，两项证据卫生已关闭，最终 0 / 0 / 0） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | `l8-world-ui2d` render-only 交互 opt-in、game-simlife 键盘/菜单/HUD 宿主接线、点名测试与 S4 证据 |

## 一、架构与实现边界

1. owner 已裁决 A：在既有 `WorldUI2D` / render-local presentation 上增加显式 `interactive` opt-in，并把 `handlers` 与既有 `ActionSink` 传入 `mountUI`。默认仍 `pointer-events:none`，不改变旧消费者，不进 snapshot/hash，不新增 gameplay system。
2. 游戏叶项仍只描述既有语义动作；WorldUi2D 的本地 handler 只让 `LifeInteractionController.activate()` 推进 render-local 层级并把叶项动作排入 `QueuedInputSource`，不直接写 World、不写 DOM handler。
3. `keepInViewport` 除四边定位外，为 host 加 viewport 内 `maxWidth` / `maxHeight` / `overflow:auto`，覆盖超宽和多行高菜单。游戏菜单移除会裁掉左侧 12% 内容的 `shape:'tag'`，保留主题、边框、阴影与圆角。
4. 键盘 adapter 先拒绝 interaction/discrete key 的 auto-repeat，再 release held movement；同方向的 WASD/Arrow 物理别名以集合计数，最后一个别名 keyup 才发 stop；blur/dispose 仍统一 release-all。
5. HUD 的 `N：休息至明日` 是带 `action:'life.advance-day'` 的 Panel，键盘 N 和鼠标点击共享同一输入队列。首轮真渲染发现 Label 不支持 action，已修成契约内的 Panel + Label。
6. 本单只改 render-only 通用桥、游戏 host/presentation 和文档测试；未改 Life 规则 JSON、capability/system、`src/ui/**`、数据库、服务或资产。

## 二、复查请逐条核

| # | 核什么 | 独立验证建议 | 施工方自验 |
|---:|---|---|---|
| 1 | 默认兼容 | 未声明 interactive 的 WorldUI2D host 必须保持 pointer-through | PASS |
| 2 | 通用点击桥 | component 与 render-local presentation 两路 opt-in 均通过 mountUI handler/ActionSink，叶项不直写世界 | PASS |
| 3 | 四边安全 | 左/右/顶/底、超宽、多行高节点均完全受 viewport 约束；左侧文字无 tag 裁切 | PASS |
| 4 | 递归等价 | 父项鼠标点击只进入 children；叶项与键盘 Enter 发同一动作序列；禁用/走离不可点 | PASS |
| 5 | 输入恢复 | repeat、keyup、blur、menu/dialogue、W+ArrowUp alias 均无 held movement 残留 | PASS |
| 6 | 下一天入口 | HUD 常驻 N 文案；键盘 N 和真 DOM 点击都只发 `life.advance-day` 并推进日期 | PASS |
| 7 | 数据/UI 红线 | LayoutNode validation 零 issue；无 Modal、React、游戏 DOM/Canvas handler | PASS |
| 8 | 反向证明 | 临时把 interactive host 强制设为 pointer-through，点名测试应准确转红并命中 `auto` 断言 | PASS：准确 1 红，恢复后 11/11 绿 |

## 三、门禁与证据

- 最终点名：`game-simlife.test.ts` 16、`world-interaction.test.ts` 16、`world-ui2d.test.ts` 11，共 **3 文件 / 43 测试全绿**；扩展集合含 game-simlife 全部、WorldUi2D 与 ActionSink 共 **6 文件 / 56 测试全绿**；最终 UI + Little Valley + Life 输入链为 **73 文件 / 580 测试全绿**。
- ESLint（10 个本单 TS 文件）PASS；UI audit：重叠 0、硬对比失败 0、警告 0、border-image 问题 0，PASS。
- component manifest `194/194`、game-skill-audit / RATCHET、docs-ref guard、`l8-world-ui2d` system graph 全部 PASS；S4 align-count 为 ✅30 / ⚠0 / ❌0，退出码 0；独立复查已全部复跑确认。
- 全量 `tsc --noEmit` 已执行；仅有既存/并行的 `game-dice` Label size、`game-theft` Label font 与 launcher mount 签名错误，输出无本单文件。
- 新逻辑在浏览器 host / render-local controller 层，不是 sim system；不伪造 `DebugTrace`。世界写入仍由已有 Signal/system 处理。

## 四、撤修验红

- 锚点：`world-ui2d.test.ts` 的 interactive presentation 用例，断言 opt-in host 为 `pointer-events:auto`。
- 撤修：临时把 `WorldUi2DLayer.sync()` 的 pointerEvents 赋值改为恒 `none`。
- 结果：点名用例准确转 **1 红**，收到 `expected 'none' to be 'auto'`；精确恢复表达式后 **11/11 全绿**。

## 五、真渲染自证

- 当前代码构建临时单文件 IIFE，在隔离、短生命周期无头 Edge 中访问本地 `file://`；未启动前后端服务，浏览器已关闭，临时构建/入口已删除。
- `self-check/shots/demo17/` 5 张图覆盖 HUD 常驻 N、鼠标推进日期、真实农务动作反馈、左边界菜单、鼠标进入递归子层；页面错误 0。
- 浏览器对左边界菜单做真实包围盒断言（左右安全边距均 ≥9px），对叶项点击精确捕获 `life.select-item:seed.turnip → life.action:plant`。
- 目视首轮发现并修复两个自动测试未暴露的问题：Label action 无效、tag 轮廓裁掉左侧文字；最终截图已全部重生成。

## 六、独立复查结论

### 策划复查补充（2026-10-09）

- 复查人：本会话策划（非施工主体 BDM程序）。在本会话重新完成 UI、事件、移动、测试、自证与复查阅读闸后，独立复跑 `games/game-simlife/game-simlife.test.ts`、`games/game-simlife/world-interaction.test.ts` 与 `src/renderer/world-ui2d.test.ts`：**3 文件 / 43 测试全绿**；ESLint、`game-skill-audit`（含 RATCHET）和 `l8-world-ui2d` 系统图均通过。
- 对抗验证：将 `src/renderer/world-ui2d.ts` 中 interactive host 的 pointer capture 临时强制为 `none`。`world-ui2d.test.ts` 准确出现 **2 个**锚点失败：render-local descriptor 与 `WorldUI2D` component 都从期望 `auto` 变为 `none`；随后精确恢复原表达式，43 项回归再次全绿。
- UI 复核：使用隔离短生命周期 Edge 运行 1060×760 UI audit，结果为重叠 0、硬对比失败 0、警告 0、border-image 问题 0；`align-count` 为 ✅30 / ⚠0 / ❌0，文档引用守卫通过。
- 判词：**PASS**。interactive opt-in 保持默认 pointer-through，世界写入仍只经 ActionSink / QueuedInputSource；没有发现游戏专属 DOM 旁路、快照污染或未覆盖的本单新语义。

- 独立复跑 `npx vitest run games/game-simlife/game-simlife.test.ts games/game-simlife/world-interaction.test.ts src/renderer/world-ui2d.test.ts`：**3 文件 / 43 测试全绿**；加入 game-simlife 其余测试与 `action-sink.test.ts` 后为 **6 文件 / 56 测试全绿**。
- 独立复跑其自行选择的 `src/ui/components + games/game-simlife + world-ui2d + src/net/host + life-input` 集合：**73 文件 / 570 测试全绿**。施工方的 **73 / 580** 来自另一份已逐项列明的集合（以六个 Life tier2 文件替代 `src/net/host`），两者文件数恰同但测试构成不同；复核命令后确认不是同集合数字漂移。
- ESLint（本单 10 个 TS 文件）、component manifest `194/194`、game-skill-audit / RATCHET、docs-ref guard、`l8-world-ui2d` system graph、S4 align-count（✅30 / ⚠0 / ❌0）全部 PASS。UI audit 使用系统 Edge：重叠 0、硬对比失败 0、警告 0、border-image 0；短生命周期浏览器已关闭，`.ui-audit-tmp` 不存在。
- 实证确认：WorldUI2D component 与 render-local presentation 均缺省 `pointer-events:none`、仅 `interactive:true` 时为 `auto`；`keepInViewport` 对四边、超宽和多行高节点均有点名断言。父项点击只推进 render-local 递归层，叶项发出与 Enter 相同的动作序列；走离后锚点移除。HUD 的 Panel 真 DOM 点击与键盘 N 均只排入 `life.advance-day` 并推进日期。
- 输入接缝点名覆盖 interaction/discrete repeat 先拒绝再 release、W/ArrowUp 同向别名最后一键释放才 stop、keyup/blur/dispose 清理 held movement；全量输出无本单 warning。`tsc --noEmit` 仍仅报并行的 `game-dice`、`game-theft` 与 launcher 类型错误，没有 DEMO-17 文件。
- 独立撤修将 `WorldUi2DLayer.sync()` 的 pointer capture 临时改为恒 `none`；锚点用例准确 **1 红 / 10 skipped**，收到 `expected 'none' to be 'auto'`。精确恢复后 `world-ui2d.test.ts` **11/11**、最终点名 **43/43** 全绿；锚点原式仅 1 处、撤修标记 0 处，无复查临时文件或改动残留。
- 5 张 `self-check/shots/demo17/` 截图已逐张目视：HUD 日期由 1 日变 2 日、农务反馈、左边界根菜单和鼠标递归子层均与对齐单一致，未见裁切或遮挡。
- 初审两项 minor 已闭环：两套扩展回归命令的测试构成与计数已分别写清；空 `.simlife-demo17-proof/` 已在确认 0 文件且目标位于工作区内后删除。最终无临时 proof / UI audit / sabotage 残留。
- 最终结论：**PASS，建议策划验收**；初审 blocker / major / minor = **0 / 0 / 2**，闭环后 = **0 / 0 / 0**。功能、兼容、输入恢复、交互语义和证据卫生均无遗留。
