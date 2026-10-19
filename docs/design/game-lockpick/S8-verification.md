# 《机关锁》S8 验证记录（施工中）

本记录只列已实际执行的证据；未获视觉或资产证据的项目不以通过代替。

| 项目 | 结论 | 实际证据 / 说明 |
| --- | --- | --- |
| 规则会话 | ✅ | `games/game-lockpick/session.test.ts` 覆盖三档映射、初始非全中、1,000 次无限尝试、唯一 failure、成功幂等与同 seed 双跑。 |
| SDK 严格 I/O | ✅ | `dokiworld/game-lockpick/tests/contract.test.ts` 覆盖合法枚举、拒绝额外键/错误合同、输出仅 `outcome`。 |
| SDK 生命周期 | ✅ | `tests/sdk-lifecycle.test.mjs` 覆盖 `fnv1a32(instanceId:runId)`、连接初始化、取消不映射 failure。 |
| LayoutNode 与 PUI Slider | ✅ | `tests/screen.test.ts` 校验 3/4/5 滑钮、确认 Modal、终局无输入、错误屏及独立 retro rail/knob 消费；`src/ui/components/slider-skin.test.ts` 覆盖 0/1/2 位置、默认回归、URL/尺寸/时长边界。 |
| reduced-motion | ✅（机械） | `ensureUiKeyframes()` 注入 `prefers-reduced-motion:reduce`，将皮肤 thumb 过渡归零；`panel-action-fade-keyframes.test.ts` 点名断言该规则。仍待 owner 静态包的浏览器偏好实测。 |
| UI 几何和对比 | ✅ | `tools/ui-audit.mjs tools/audits/game-lockpick.audit.ts --w 1440 --h 900` 与 `--w 810 --h 506`：阻断项均为 0，且无 UI audit 浏览器残留。 |
| 独立包 | ✅ | `npm --prefix dokiworld/game-lockpick run typecheck`、`test`（13/13）、`build` 已通过；Vite 仅报告 chunk-size 建议。 |
| 真渲染截图 / S4、S5 对齐单 | ⏳ | 等 owner 启动已构建静态包后，按 `docs/playbooks/self-check.md` 完成截图序列；不将 CLI/UI audit 代替目击。 |
| 美术台账与本地资产闭包 | ✅ | `ledger-audit.mjs game-lockpick --strict` 为 6 行 / 6 消费槽 / 0 孤儿；`asset-reconcile.mjs game-lockpick` PASS；新建 dist 的 `ASSET-CLOSURE.json` 为 6 entries / 6 files / 0 extraFiles，且扫描无 `.svg`。 |
| 独立终检 | ⏳ | 已交独立 reviewer；复查人必须不同于施工人并独立复跑。 |

## 本轮结论

不得宣称 S8 完成。当前代码与包的非视觉验证已经可复跑；视觉、资产和独立复查仍须以真实证据收敛。
