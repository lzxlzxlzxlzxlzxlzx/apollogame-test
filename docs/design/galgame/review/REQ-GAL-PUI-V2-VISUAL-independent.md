# REQ-GAL-PUI-V2-VISUAL · 独立复查

2026-10-13 · 非施工者复查。结论：**局部 PASS，通用 API 可交 GAL 消费**。本结论只覆盖 PUI 的 `Modal.visual`、`layout.fx:cue`、`Button.skinFeedback`，不代表 GAL 接线、S5 或全库门禁通过，也不代签 Owner 人门。

## 合同核对

- Owner 在 [差异单](../gal-art-01a-modal-gap-2026-10-13.md) 对三处选择 A。施工落点均在 PUI 闭集：`Modal.visual` 限定数值区间和左右/居中枚举；`cue` 有固定时序与 100–5000ms 范围；`skinFeedback` 仅五个字段，有限数/安全色校验，拒绝额外字段、空显式 skin、`stateColors` 混用。`src/ui/components/validate.ts`、`types.ts`、`render.ts`、`server.ts` 一致。
- 无配置时保持原 Modal/旧 `pulse`/旧 Button 路径；贴图反馈只在实际解析到 skin 时输出。`game-i` 活示例 `demo-modal-overlay`、`anim-cue`、`sk-feedback` 与 `docs/playbooks/ui.md` 同步。现有 Modal 焦点、`aria-labelledby`、Escape/遮罩关闭，Button 原生 disabled 与 ActionSink 没被替换。
- 边界说明：`skinFeedback` 不写 `skin` 也允许通过静态校验，因为主题可能提供贴图；若最终主题无贴图，渲染侧不启用反馈。这是受控 no-op，不是无贴图按钮获得新状态。

## 四步独立实证

1. **独立复跑**：`npx vitest run src/ui/components games/game-i/game-i.test.ts --maxWorkers=2 --minWorkers=1`，72 文件、554/554 通过；`npx tsc --noEmit --pretty false` 退出 0。包含 `v2-visual.test.ts` 的几何、a11y、非法值、默认路径和状态反馈断言。
2. **锚点命中的隔离撤修验红**：短生命周期 `file://` fixture 使用临时 Vite bundle、独立无头 Edge；每处先断言唯一 DOM 锚点命中 1，再只在浏览器内改样式。Modal `#modal [data-modal-dialog]` 的 310px 改 200px，几何断言转红；`#cue` 动画改 `none`，`apollo-cue` 身份断言转红；在 `#closed` 无 Modal 页面将 `#skin-button` 的 hover 亮度变量从 1.32 改 1，计算样式从 `brightness(1.32)` 变为 `brightness(1)`，断言转红。按钮首次探针因仍开着的 Modal 遮罩导致 hover 超时，该次假红已排除，不计作撤修证据。未改生产文件；临时 bundle 已删除，浏览器已关闭。
3. **真浏览器复现**：暗/亮主题 1440×900 下 Modal 实测 800×310、标题 30px 居中、初始焦点/aria 正常，Escape 与遮罩均发 `modal.close`；cue 暂停在 650ms 得到 1.3s 动画、约 .35 透明度、下移 4px；旧 Button 未 opt-in，贴图 Button hover 为 1.32+8px glow、pressed 为 .85，点击进入 `skin.start` ActionSink，disabled 原生禁用且无 `skin.disabled`；`prefers-reduced-motion: reduce` 下 cue 动画与 Button 过渡时长均为 0。访问的只是隔离临时 `file://`，未启动整套系统、未访问账号或持久化库。
4. **读告警**：独立运行 `node tools/ui-audit.mjs src/ui/components/v2-visual.audit.ts --w 1440 --h 900` 退出 0；重叠、硬对比失败、3–4.5 对比警告、边框皮前提失败均为 0。定向 Vitest/tsc 与浏览器探针没有本票相关 WARN。施工自证另记全库 `scoped-gate` 因跨层依赖 32 项、缺比较 ref，以及需求池 11/10 而失败；这些不是本次局部 PASS 的绿色证据，本复查未把全库状态改写为通过。

## 交接边界

GAL 可以消费上述通用数据 API，但仍须由非该消费者施工者独立验收 GAL 的真实 1:1 画面、交互和相应门禁。`skinFeedback` 的亮度/光晕属于贴图视觉，实际故事皮图上的可读性仍需 GAL 实景审计；本 PUI fixture 的 0 contrast WARN 不代替该检查。
