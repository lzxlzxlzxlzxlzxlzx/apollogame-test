# GAL-UI-04B reduced-motion consumer 独立复查（2026-10-14）

判词：**本消费增量局部 PASS**（PUI teardown 返修后的第二轮独立复验）。复查者与施工者不同。第一轮真实双 GAL host 卸载时曾发现残留属性并判 CONCERNS；PUI 专职返修及另一复查人局部 PASS 后，本轮同一对抗路径转绿。不得据此将完整设置、S5/S6 或 Owner 人门标为 PASS/done。

## 事实与独立复跑

- 控制台 `ui-settings-confirmations` 仍 `active`、三门 `pending/pending/required`。施工自证见 `self-check/GAL-UI-04B-reduced-motion-consumer-2026-10-14.md`。
- 返修后独立重跑 `npx vitest run src/services/gal-profile/gal-profile.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts`：2 文件 **60/60 PASS**。`npx tsc --noEmit --pretty false`：退出 **0**、无诊断。首次沙箱 Vitest `node_modules/vitest/dist/spy.js realpath EPERM`，同一只读测试在允许的隔离执行中成功；非产品失败。
- 返修后独立重跑 `node src/services/gal-ui/verify-gal-reduced-motion-live.mjs`：短时隔离 Edge 退出 **0**。该脚本经 file URL 的临时 bundle 验默认、作品开启、恢复默认、OS reduce、OS+作品四态；`finally` 关闭浏览器并删除临时目录。首次沙箱 Edge 启动失败；隔离执行成功，未拉起整套 ZeroCraft。
- 暗/亮设置页 `ui-audit` 各退出 **0**：重叠、硬对比失败、border-image 失败均为 0。亮页标题 `gal-settings-title` 对比 3.57 为既有非阻断警告；暗页华丽件命中低且未识别 house 主题，也不能冒称完整 S5 视觉验收。
- 静态核查：`gal-profile.ts` V6→V7 补 `reducedMotion:false`，设置成功才更新宿主 Profile；`gal-ui-slice-host.ts` 的 `mountUI` 与 `update` 均传只读作品 policy；`gal.settings.reset` 复用原子 Profile 重置，不写 World/hash。PUI 的 OS 并集和作品投影属已独立复查的基座能力。

## 撤修验红与真实反例

可复跑脚本：`docs/design/galgame/review/verify-gal-motion-consumer-mutation.mjs`。它只在 `src/services/gal-ui` 创建唯一 UUID 的临时 host/test 副本，断言作品 policy 锚点恰好命中 **2** 次、测试 import 锚点恰好 **1** 次，并在 `finally` 精确删除两副本；未改生产代码。临时副本基线 **1 PASS**；只把两处 `{ reducedMotion: this.profile.preferences.reducedMotion }` 撤成 `{}` 后，原行为测试 **1 assertion FAIL**（`expected false to be true`），不是编译/路径红；恢复原代码后生产测试再次 **60/60 PASS**。临时文件清理后 `rg --files` 无 UUID 副本。

脚本另追加一个仅在临时测试副本中的对抗用例：左、右两个 `GalSliceHost` 都真实 `attach`，分别启用作品 reduced motion，左关闭后右仍保持启用，随后依次 `detach`，断言两个容器都不残留 `data-apollo-reduced-motion`。第一轮此用例确实在右容器得到 `AssertionError: expected true to be false`，揭示原施工测试 `gal-ui-slice-host.test.ts:74-89` 的“第二容器”只是裸 `div`，没有第二个 mount。PUI 返修后本轮重跑该同一用例 **1 PASS**；作品 policy 撤修仍为基线 **1 PASS → 变异 1 assertion FAIL**，生产定向测试复绿 **60/60**。PUI 返修的独立证据见 `review/GAL-UI-04B-PUI-motion-teardown-2026-10-14-independent.md`，其中唯一锚点移除清理语句后用例转红；本报告未把 PUI 施工或复查冒充本人完成。

## 处理边界

PUI teardown 缺口已按共享域修复并独立局部复查，GAL 未直接操作 PUI DOM 属性绕过。此 **PASS 仅覆盖 reduced-motion 消费增量**；设置里程碑仍含其他消费者及 V2 S5/S6 视觉演出差异，路线图 Owner 门仍只能由 Owner 本人处理。短时 Edge 和临时 UUID 测试副本均由各自 `finally` 关闭/删除；未触碰日常浏览器配置、远程数据库或整套 ZeroCraft。
