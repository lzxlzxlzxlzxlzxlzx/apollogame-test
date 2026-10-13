# GAP-LOCKPICK-02 独立复查 · 可皮肤化 Slider

- 施工主体：`PUI / Codex-root`（见 `requests.md`）
- 复查主体：`Codex/root/slider_independent_review`（与施工主体不同）
- 日期：2026-09-29
- 边界：未执行 Git / GitHub / 数据库操作，未启动或重启服务。UI 审计只启动短生命周期、隔离的 Edge，进程已由审计工具关闭。

## 独立实证

| 项目 | 独立做法 | 结果 |
| --- | --- | --- |
| 闭集与默认兼容 | 读 `types.ts`、`catalog.ts`、`render.ts`，并运行 `npm.cmd test -- --run src/ui/components/slider-skin.test.ts src/ui/components/panel-action-fade-keyframes.test.ts src/ui/components/catalog-validate.test.ts` | ✅ 21/21。四个可选字段均登记；未同时给两张皮时仍为旧原生 range + `accent-color`。 |
| 同一 value 驱动皮肤位置 | 检查 `ratio=(value-min)/(max-min)` 和 `left:calc(...)`；运行 `slider-skin.test.ts` | ✅ 0/1/2 分别为 0/50/100%。原生 `input[type=range]` 是唯一真实输入，视觉层 `pointer-events:none`，皮肤模式的系统滑块以透明输入隐藏。 |
| URL / 表现安全边界 | 复跑 `slider-skin.test.ts` 的净化与上下界断言；检查 `safeUrl()` 调用 | ✅ 皮肤 URL 经既有安全路径，尺寸限制 16–128 px、时长限制 0–2000 ms。 |
| reduced-motion | 检查 `ensureUiKeyframes` 样式注入及其点名测试 | ✅ `prefers-reduced-motion:reduce` 将 `[data-skin-slider-thumb]` transition 归零；规则输入不在动画回调中。 |
| 机关锁真消费 | 检查 `lockpick-screen.ts` 与 `dokiworld/game-lockpick/tests/screen.test.ts` | ✅ 每枚机关 Slider 实传打包 rail / knob URL、44 px、150 ms；卡带屏幕测试断言两项正式 `*-retro.png` URL。 |
| 810×506 与 1440×900 | `UI_AUDIT_CHROMIUM=C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe node tools/ui-audit.mjs tools/audits/game-lockpick.audit.ts --w 1440 --h 900`；同命令 `--w 810 --h 506` | ✅ 两次退出码 0：重叠 0、硬性低对比 0、border-image 前提 0。华丽度均为 9（skin:1、shape:7、fx:1）。 |
| 卡带合同回归 | `npm.cmd --prefix dokiworld/game-lockpick test` 与 `npm.cmd --prefix dokiworld/game-lockpick run typecheck` | ✅ Vitest 11/11、node:test 2/2；类型检查退出码 0。 |
| dist 资产闭包 | 读取 `dist/ASSET-CLOSURE.json`、`art/index.json`、`SHA256SUMS.txt`；逐项 `Get-FileHash SHA256` 复算 | ✅ 6 entries / 6 files / 0 extra；仅 6 个正式 `*-retro.png`；全部 SHA256 对账一致。未找到旧 `lockpick-{rail,knob,workbench}.svg` 或开发绝对路径。 |

## 锚点撤修验红

临时且仅在复查期间把 `renderSlider()` 的：

```ts
const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
```

替换为固定 `const ratio = 0`，再运行 `npm.cmd test -- --run src/ui/components/slider-skin.test.ts`。

结果为预期红：value=1 和 value=2 的锚点断言分别要求 `left:calc(50.0000% - 20px)` 与 `left:calc(100.0000% - 20px)`，实际均为 0%。随后已逐字恢复原式并独立复跑：5/5 通过。

## 收口复核

在首轮复查后的补件中，本复查人重新独立运行 `npm.cmd test -- --run src/ui/components/slider-skin.test.ts`：**6/6 通过**。新增用例实际挂载皮肤 Slider，确认透明原生 range 保有 `tabIndex=0`；键盘改为 `1`、pointer/touch 完成改为 `2` 时，动作通道依次收到 `['1','2']`。

同时复读 `docs/design/game-lockpick/capability-gaps.json`：`GAP-LOCKPICK-02` 已为 `state: "delivered"`，并以本独立复查单作为 ticket/proof。

## 判词

**✅ PASS。**

GAP-LOCKPICK-02 的通用 Slider 皮肤能力、真实轨道/滑钮消费、默认兼容、可访问原生输入、三档位置绑定、reduced-motion、布局审计、dist 资产闭包与锚点撤修验红均已完成。本判词只覆盖该 PUI 能力；游戏 S8 的其他真渲染、自玩和终检门应由相应收口单独裁定。
