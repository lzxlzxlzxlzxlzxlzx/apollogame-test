# Review 单 · `SIMLIFE-DEMO-19A` 响应式世界画布与相机满幅

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-19A` |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | ✅ 已独立验收（2026-10-09） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | 通用 mount host / CanvasRenderer opt-in 响应式 viewport、Life 宿主接线、DPR/投影/释放回归、三档真浏览器证据 |

## 一、架构与边界

1. **接受 A 施工**：现有 host 与 CanvasRenderer 都是初始化时定尺，无法重组出容器 resize、DPR backing 和 WorldUI 同步投影。补在通用 render-only 层，禁止 Little Valley 自建 ResizeObserver、Canvas 或 Camera system。
2. **默认零回归**：`viewportMode` / renderer `viewport` 均须显式 opt-in；省略时仍是历史定尺 scene 信箱与固定 logical canvas。
3. **权威边界**：responsive 只维护 DOM/CSS/backing store 与 render-local camera multiplier；不修改 Camera、follow/clamp、World、snapshot/hash、存档或 Life JSON。
4. **同投影链**：普通 renderables、Life preview 与 WorldUi2D 使用同一有效 Camera；cover 只做等比缩放，一轴受控裁切，不做 CSS 非等比拉伸；采样保持 nearest-neighbor。

## 二、请独立逐条复核

| # | 核什么 | 建议复跑 / 观察 | 施工方结果 |
|---:|---|---|---|
| 1 | fixed 默认 | `mount-host.test.ts` 与 `canvas-renderer.viewport.test.ts` 的固定模式尺寸/结构 | PASS |
| 2 | responsive host | play-field 与 overlay 同时扣除 52px top HUD；三档 resize 后 rect 一致 | PASS |
| 3 | CSS + DPR | logical CSS 尺寸随容器；bitmap 始终为 CSS×DPR；resize 后重绘 last World | PASS |
| 4 | camera fit | cover/contain 纯函数；Life cell reference 为 viewport×cellSize；不写 Camera | PASS |
| 5 | Canvas / WorldUI 对齐 | `world-ui2d.test.ts` 的响应式 Life 投影对拍 | PASS |
| 6 | dispose | ResizeObserver disconnect、window listener 移除、Canvas/overlay 清理 | PASS |
| 7 | 真玩家 resize | 640→1060→1440→640，地图满幅、HUD 不遮挡，末尾点击 N 推进日期 | PASS |
| 8 | 游戏层红线 | 仅声明式 opt-in 与 attach target；无专属 observer/canvas/camera/game system | PASS |
| 9 | 撤修验红 | 取消 Little Valley 两处 opt-in 后，640×720 的 640×668 画布尺寸断言必须红 | PASS |

## 三、当前证据

- 点名回归：`mount-host.test.ts`、`canvas-renderer.viewport.test.ts`、`world-ui2d.test.ts`、`life-scene-render.test.ts`、`game-simlife.test.ts`、`save.test.ts`、`world-interaction.test.ts` 共 **7 文件 / 85 测试全绿**。
- check-ui 回归：`src/ui/components` + `games/game-simlife` 共 **66 文件 / 538 测试全绿**；本单 7 个 TS 文件 ESLint 0 warning。三档 UI audit 均为 overlap 0、硬对比失败/警告 0、border-image 0。
- 真浏览器连续 resize：640×720→1060×760→1440×900→640×720；Canvas/field/overlay 分别为 640×668、1060×708、1440×848、640×668，DPR backing 同步，平滑关闭，页面错误 0。
- `self-check/shots/demo19a/` 四张当前源码截图已逐张目视；末尾真实点击 N 后 HUD 从 spring 1 日变为 spring 2 日。
- 浏览器访问本地 `file://` 静态构建，使用 `MemoryStoragePort`，未启动应用服务、未写业务持久化；Edge 已关闭，临时构建/入口已删除。
- component manifest **199/199 PASS**；system graph 无重复 id/悬空边（全局信息环不阻断）；`game-skill-audit game-simlife` 为 **AUDIT PASS / RATCHET PASS**；docs-ref guard PASS；S4 align-count 为 **✅60 / ⚠0 / ❌0**，退出码 0。
- 全库 `tsc --noEmit` 已执行；只剩既有/并行的 `game-dice`、`game-theft` 与 launcher 类型错误，输出中无本单文件。`scoped-gate --run` 不执行，因为其内部调用 Git，而项目规则禁止 agent 执行任何 Git 命令。

## 四、独立复查重点

1. 用与作者相机不同宽高比的 viewport 检查 cover 裁切是否符合“满幅优先”，并确认不是非等比 CSS 拉伸。
2. 在 deviceScaleFactor≠1 时核对 Canvas CSS / backing store 与 overlay 包围盒；resize 后世界 UI 锚点应与实体保持同投影。
3. 对任一未 opt-in 旧 Canvas 游戏复跑尺寸断言，确认 fixed 模式没有被 responsive observer 改写。
4. destroy 后触发 resize，Canvas 不应继续变化，window listener / ResizeObserver / WorldUI DOM 不应残留。

## 五、独立复查结论（2026-10-09）

- 复查人：本会话策划，非施工主体 BDM程序。独立复跑 mount host、响应式 Canvas viewport、WorldUi2D 和 Little Valley 集合 **4 文件 / 50 测试**，均通过。输出中的 iframe abort/network stderr 来自既有 external-frame happy-dom 用例，退出码为 0，与本单无关。
- 独立撤修：将 Little Valley 的 `viewportMode` 暂改为 `fixed`；游戏 HUD/world projection 锚点准确 **1 红 / 17 skipped**，预期 `responsive`、实际 `fixed`。已精确恢复，锚点再次通过。
- 目视复核 1440×900 真宿主截图：HUD 下的网格世界占满主区域，地图不再缩在左上角；无信箱空区、非等比拉伸或 HUD 遮挡。生产证明使用真实 `mount()`，而非旧 320×240 测试 renderer。
- 结论：**PASS**。响应式模式是通用 opt-in；默认 fixed 模式仍由专门单测锁定。Canvas CSS/backing、WorldUi2D 与相机缩放在渲染本地统一更新，未写入 World、snapshot 或 hash。
