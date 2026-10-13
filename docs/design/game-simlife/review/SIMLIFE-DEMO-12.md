# Review 单 · `SIMLIFE-DEMO-12` 交互体验返修

> 施工方自做自验后提交；复查人必须与施工人不同并独立复跑。农田状态 capability 裁决不在本单。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-12`（输入残留、镇长链路、HUD 可读性、世界菜单防裁切） |
| 施工 | BDM程序（已抢锁） |
| 复查 | **待策划指派** |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 改动面 | `games/game-simlife/{keyboard.ts,ui.ts,world-interaction.ts,world-interaction.test.ts,game-simlife.test.ts}`、`src/renderer/{world-ui2d.ts,world-ui2d.test.ts}`、能力计划/渲染手册/工单 |

## 一、做了什么（三句话）

1. keyboard adapter 统一 `releaseAll`：E/Tab/Enter/Escape、blur、dispose 都先把真实 held direction 转成既有 `life.move.stop` 并清空 held，再处理 UI；不碰 `LifeContinuousMotion`。
2. 镇长单选叶子的同批 `select-target + talk` 已以真实 `QueuedInputSource → World tick` 端到端证明可靠；现有引擎同 tick 相位成立，因此没有引入跨 tick 私有调度器。
3. 顶栏换成完全不透明 `ink-deep` Panel；WorldUi2D presentation 新增 opt-in `keepInViewport:{padding}`，mount 后按逻辑 CSS 尺寸左右夹紧，顶边翻到实体下方，小山谷菜单已启用。

## 二、复查请逐条核

| # | 核什么 | 怎么自己验 | 施工方自验 |
|---|---|---|---|
| 1 | 四个交互键都先停移动 | 复跑 `world-interaction.test.ts` 的参数化 KeyE/Tab/Enter/Escape 用例 | 每键均严格得到 `move.start:up → move.stop:up`；随后 KeyUp 不重复 stop |
| 2 | 无 KeyUp 的真实世界也停止 | 复跑 game entry 的 `releases held movement...` | tick 后 `LifeContinuousMotion.right=false`，再一 tick x 不再变化 |
| 3 | blur/dispose 同一路径 | 复跑既有 keyboard 映射用例并读 `keyboard.ts` | blur 调 `releaseAll`；dispose 调 blur 后摘 listener |
| 4 | 镇长真有反应 | 复跑 `executes the controller mayor leaf...` | controller 产同批 target+talk，真实 queue/tick 后 view 出现“梅尔镇长”对话 |
| 5 | HUD 不透明且不恢复旧 chrome | 复跑 game UI test | top Panel `bg:'ink-deep'`、`edge:'gold'`、非 bare/非 ribbon、height=50≤52；无底栏/永久按钮/Modal |
| 6 | 防裁切是通用能力 | 复跑 `world-ui2d.test.ts` viewport-safe 用例 | mock 60×30 实际尺寸：左边→8px，右边→52px，顶边翻到 top=10px；pointer-events none |
| 7 | 小山谷实际启用 | 复跑 game UI test并查 presentation | `keepInViewport:{padding:10}`，仍锚 `life:player`，snapshot 只读 |
| 8 | 没有越界实现 | 搜 `keyboard.ts/world-interaction.ts` | 无计时器、World 写、DOM/CSS、游戏 system；所有变化仍是 semantic queue 或 render-local data |

## 三、撤修验红

临时让 `releaseAll()` 开头直接 `return`，运行两份 game 测试：

- 实测 **6 红 / 15 绿**。
- 四个参数化交互键分别缺少 `life.move.stop:up`；真实世界用例保持 `right=true`；blur 映射用例也缺少 stop。
- 恢复后最终定向 **3 files / 29 tests 全绿**。

## 四、请重点看三个取舍

1. **同方向多物理键去重。** `W + ArrowUp` 同时 held 时 releaseAll 只发一次 `life.move.stop(up)`，随后清空全部 code；请核这是否是期望的语义最小集。
2. **同 tick target-select + talk 保留。** 端到端已经证明在当前系统相位中可靠；没有为了预防假设而造 render-local 跨 tick 队列。请核是否接受“证据优先，不加无用调度层”。
3. **viewport-safe 只对 presentation source opt-in。** 静态 `WorldUI2D` 组件保持逐位旧行为；小山谷临时菜单显式启用。请核是否要另开后续工单把同字段扩入稳定组件 schema，本单没有扩大组件协议。

## 五、门禁实情

- 合并回归：**72 files / 581 tests 全绿**；定向恢复后 **3 files / 29 tests 全绿**。
- eslint 本单 TS 文件通过；component manifest/component universe、game skill audit、system graph、docs guard 均通过。
- UI audit 完成 bundle 后因本机不存在 `/opt/pw-browsers/chromium` 无法启动；临时目录已清理，无浏览器进程遗留。
- `tsc --noEmit` / `npm run build` 仍被既有无关 `game-dice`、`game-theft`、launcher 错误阻断；本单一度暴露的测试类型访问已修复，最终错误列表无本单文件。
- 未运行内部调用 Git 的 scoped-gate；未执行 Git/GitHub、未启动服务、未修改数据库。
