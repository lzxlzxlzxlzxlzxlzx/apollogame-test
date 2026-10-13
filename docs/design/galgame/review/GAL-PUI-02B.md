# GAL-PUI-02B · 通用 Modal 大框与键盘语义

> 施工记录，2026-10-10。施工者 Codex/root；owner 已就本单明确授权其作为 PUI 施工者修改 `src/ui/**`。未执行 Git/GitHub、数据库修改或应用服务启动。

## 范围与实现

- `Modal.size` 由 `sm|md|lg` 扩为闭集 `sm|md|lg|xl|wide`：前三档保持 320/460/640px；`xl` 固定 800px；`wide` 固定 1080px 且最小高 610px。
- `Modal.skin` / `skinSlice` 复用已解析 URL 与九宫格框皮语义；不引入自由样式或游戏专用 DOM。
- 渲染器输出 `role="dialog"`、`aria-modal="true"`，并由标题提供可访问名称。
- `mountUI` 在模态打开时记住启动控件并移入焦点，Tab/Shift+Tab 圈定在顶层 dialog 内；Escape、遮罩仍只派发声明的 `closeAction`，关闭更新后返回原触发控件；捕获层阻止背景 click/pointerdown 穿透。
- `game-i` 的 `t-modal` 活范例已改用 `xl`，目录与 UI 手册同步登记；`tools/audits/modal-semantics.audit.ts` 是 1440×900 真浏览器审计入口。

## 自验

| 项目 | 结果 |
|---|---|
| `npx vitest run src/ui/components/modal-semantics.test.ts src/ui/components/modal-close.test.ts src/ui/components/ui-contract.test.ts src/ui/components/catalog-validate.test.ts games/game-i/game-i.test.ts` | 5 files / 31 tests passed |
| `node tools/ui-audit.mjs tools/audits/modal-semantics.audit.ts --w 1440 --h 900`（临时 Edge headless 配置） | 0 overlap、0 hard contrast、0 contrast warning、0 border-image prerequisite；浏览器已关闭 |
| 范围 ESLint（`types/catalog/render/server`、新增测试/审计、game-i 样例） | exit 0 |
| `npx tsc --noEmit --pretty false` | exit 1；仅既有 `game-dice`、`game-simlife`、`game-theft`、`src/launcher/game-runner.tsx` 诊断，本单文件无诊断 |

首次 Vitest 与审计在沙箱内均因 Vite 的只读 `realpath` 遭 EPERM；获准后在隔离外环境复跑。审计使用 Playwright 临时 profile 的 headless Edge，仅访问本地构建产物，不启动服务。

## 施工者撤修验红

临时将 `server.ts` 的 Tab 守卫从 `e.key !== 'Tab'` 改为 `e.key !== 'BrokenTab'`，再执行：

```text
npx vitest run src/ui/components/modal-semantics.test.ts -t "moves focus in"
```

得到 **1 failed / 3 skipped，exit 1**；锚点断言准确显示焦点仍停在 `#confirm`，而非应回绕的关闭按钮。已用 `apply_patch` 恢复 `Tab` 守卫，并重跑完整定向 5 文件 31/31 与审计通过。

## 独立复查门

施工者不自评 PASS。复查人须独立复跑上述定向集与 1440×900 审计，并做带锚点的撤修验红：至少撤去 `wide` 的 `min-height:610px` 或 Modal 的 Tab 圈定分支，确认 `modal-semantics.test.ts` 精确转红后恢复；同时核对旧 `sm/md/lg` 宽度、ActionSink 的遮罩关闭、无 `closeAction` 的 Escape no-op，以及背景事件确不穿透。

## 非施工者独立复查（2026-10-10）— FAIL，待修

复查人独立复跑以下命令；首次沙箱内 Vitest 因 Vite `realpath` EPERM 无测试执行，获准后在隔离外环境复跑。未执行 Git/GitHub、数据库写入或应用服务启动；两次 Edge 无头浏览器均为临时进程，脚本退出后已关闭并清理临时目录。

| 项目 | 独立结果 |
|---|---|
| `npx vitest run src/ui/components/modal-semantics.test.ts src/ui/components/modal-close.test.ts src/ui/components/ui-contract.test.ts src/ui/components/catalog-validate.test.ts games/game-i/game-i.test.ts` | 5 files / 31 tests passed，exit 0 |
| `node tools/ui-audit.mjs tools/audits/modal-semantics.audit.ts --w 1440 --h 900`（`UI_AUDIT_CHROMIUM` 指向临时 headless Edge） | 0 overlap、0 hard contrast、0 contrast warning、0 border-image prerequisite；非阻断的华丽度警告为 0 命中 |
| 临时隔离撤修 probe | 包装 `mountUI` 并仅抑制生产 `server.modalKeydown` 监听；临时 probe 测试得到 **1 failed / exit 1**，锚点断言显示焦点留在 `#review-last` 而非回绕关闭按钮；probe 已删除，随后原始 `modal-semantics.test.ts` 4/4 通过 |
| 无 `closeAction` 边界 | 临时 probe 派发 Escape，ActionSink 计数保持 0；1/1 passed，probe 已删除 |
| wide 真浏览器量测 | 1440×900 Edge 中 `[data-modal-dialog]` 实测 `width:1126`、`height:656`、`minHeight:"610px"` |

焦点进入、Tab/Shift+Tab 圈定、关闭更新后的焦点返回、遮罩外合成 click/pointerdown 防穿透，以及旧 `sm/md/lg` 的 320/460/640 声明宽度，均由独立定向集和源码/渲染输出复核。`closeAction` 缺席时 Escape 的 no-op 亦已实证。全库 `tsc` 的既有非 GAL 红项维持 **CONCERNS**，不属本单。

**FAIL 原因：** 定稿原型全局采用 `*{box-sizing:border-box}`，其 `.overlay-panel.wide` 的 1080×610 是外框视觉尺寸；当前 `renderModal` 未设置 `box-sizing:border-box`，在 `width:1080px;min-height:610px;padding:22px;border:1px` 下，真浏览器外框膨胀为 **1126×656**。这不满足本单要求的约 1080×610 历史／CG 大框，也意味着 `xl` 的 800px 确认框同样会被 chrome 加宽。请施工者修正 Modal 的盒模型或等价闭集尺寸计算，新增真浏览器外框尺寸锚点测试后，重新交独立复查；在此之前不得标记 PASS 或称 C4 验收完成。

## 非施工者独立复审（2026-10-10）— PASS（局部）

施工者将 `data-modal-dialog` 明确设为 `box-sizing:border-box`，并在 `modal-semantics.test.ts` 对该输出加入断言。复查人未采信自陈，独立复跑：

| 项目 | 独立结果 |
|---|---|
| `npx vitest run src/ui/components/modal-semantics.test.ts src/ui/components/modal-close.test.ts src/ui/components/ui-contract.test.ts src/ui/components/catalog-validate.test.ts games/game-i/game-i.test.ts` | 5 files / 31 tests passed，exit 0 |
| `node tools/ui-audit.mjs tools/audits/modal-semantics.audit.ts --w 1440 --h 900`（临时 headless Edge） | 0 overlap、0 hard contrast、0 contrast warning、0 border-image prerequisite，exit 0；华丽度 0 命中仅为隔离 capability 审计的非阻断警告 |
| 真浏览器外框复量测 | 1440×900 Edge 中 `[data-modal-dialog]` 为 **`width:1080`、`height:610`、`minHeight:"610px"`、`boxSizing:"border-box"`** |

此前独立复查已完成的 Tab 圈定撤修验红、无 `closeAction` Escape no-op、焦点进入／返回、背景防穿透以及旧 `sm/md/lg` 回归仍有效；本次回归未破坏这些合同。临时量测入口、临时目录和 Edge 进程均已清理／关闭。全库 `tsc` 的非 GAL 既有红项继续仅记 **CONCERNS**，不属于本单。本判词仅签通用 Modal 局部能力，不宣称 GAL 正式 UI、原型视觉 1:1 或项目整体交付。
