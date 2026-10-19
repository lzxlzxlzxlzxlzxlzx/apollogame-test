# S5 / S7 新鲜度独立复查 · 2026-10-14

复查人：`/root/s3cart_render_review`，未施工本轮 HUD/清单返修。按 `checklist S5`、`checklist S7` 与 `check-ui` 四关执行。**S5 判词：CONCERNS（可推进）**；**S7 预览卡带评分：16/24，全维 2，PREMIUM:YES 仅为本地 2D 预览评分卡口径**。本报告不代签 Owner 人门，不覆盖 S6 整页 1:1 FAIL、无 blessed golden 标准照、S2 CONCERNS 或未来 DokiWorlds 任意动态图像的表现。

## 独立执行与告警

| 检查 | 实际结果 |
|---|---|
| `node scripts/game-pipeline.mjs checklist game-clue-investigation S5` / `S7` | exit0；逐项核证。开工 board 中 S5 复查过期、S7 旧 15/24 过期。 |
| `npx vitest run src/ui/components games/game-clue-investigation --maxWorkers=1 --minWorkers=1` | 初次普通沙箱 `realpath node_modules/vitest/dist/spy.js EPERM`、78 unhandled errors、0 tests，**不计通过**；隔离重跑 exit0，**78 files / 591 tests PASS**。 |
| `Get-Content -Raw .../manifest.json \| npx vite-node scripts/manifest-check.mjs --art-index .../art/index.json` | exit0，`ok=true`、`inferredCapabilities=false`、真 Engine load + 2 tick、`warnings=[]`。第一次误用文件位置参数导致“空输入”，未计结果。 |
| `node scripts/game-skill-audit.mjs game-clue-investigation` | exit0，`AUDIT: PASS`、`RATCHET: PASS`，零红旗/缺失防线。 |
| `node scripts/align-count.mjs --game game-clue-investigation --stage S5` | exit0，8绿、2条有去向警告、0红；旧 S5 自证只作抽查导航。 |
| `node tools/ui-audit.mjs .../self-check/s6-reveal.audit.ts --w 1440 --h 900` | 七态 `idle/flavor/reveal/collected/completed/exit/cancelled` × 深/亮，**14/14 exit0**；每态重叠0、硬对比0、AA警告0、border-image前提0。审计的非阻断告警保留：华丽件 idle/cancelled 0、其他态 glass 1，静态 house 检出“否”；真实运行截图并非灰默认皮，manifest 显式消费 house 主题，不能把静态检出当运行时缺皮，也不能隐去该低命中提示。 |
| `Get-Content -Raw .../manifest.json \| npx vite-node scripts/bench-manifest.mjs --art-index .../art/index.json` | exit0，五轴 **95/100**、阈值70，Load 15/15、Determinism 20/20、Visual 25/25；Structure 15/20 的唯一 notes 为“缺：相机”，已读，不冒称满分。 |

## 真浏览器目击与 S5 清单

只读健康检查 Owner 已运行 `http://127.0.0.1:5173/` 返回 200；本人用任务级隔离无头 Edge 打开 `http://127.0.0.1:5173/?game=lib:game-clue-investigation&s3Probe=1`，只拦 `/api/library` 与 manifest 的只读响应为本仓真实文件，未启服务/改账号/写远程。复查脚本 `review/s5-s7-ui-refresh-probe.mjs` 产 `review/shots/S5-S7-refresh-2026-10-14/{idle,ledger-collapsed,ledger-reopened,reveal,collected,completed}.png` 六张当轮图；脚本 `finally` 关闭浏览器。`consoleErrors=0`，真点清单标题关、查看记录再开，键盘 Enter 打开窗锁与脚印证物并收录到完成，界面不是失败页或启动器。

三项本轮返修逐项实测：

1. `library/game-clue-investigation/manifest.json:202,309,399,689` 的四个 HUD 面板，浏览器 computed border 均 `1px rgb(139,118,82)`，`backdropFilter=none`；与定稿原型棕边无玻璃方向一致。
2. `:225` 的 `case-heading-brass-rule` 为 `5×124px`、`rgb(216,174,98)`；idle 图目击标题左黄铜条。
3. `:423` 的 `ledger-title` computed background 与 border 都 `rgba(0,0,0,0)`，仍是真 Button、`records.close` 动作可点；可见三个 pending bullet `•`（`:453,531,609`），清单收起/再开截图及实际交互均通过。标题 computed `borderTopWidth=1px`，但颜色全透明，故结论为**无可见框**，不谎称 border-width 为0。

对 `S5-alignment.md` 至少抽样第1/2/3/4/5/6/8条：idle 场景、清单、reveal纸框、collected、completed、按钮路径与截图当轮复现；好玩三问有具体而非“还行”答案。LayoutNode纯数据树、`action` 具名信号、78文件内 `validateLayoutNode` 零 issue；本轮三项仅表现数据，不见游戏层自由 DOM 逃生。曾有 S5 布局返修，缺完整 S4 字节基线，故不追认“历史从未移动布局”。

## 唯一锚点撤修验红

复查脚本 `--revoke-brass` 只在隔离浏览器的**内存只读 manifest fixture** 中递归查 `case-heading-brass-rule`；先断言唯一命中且原宽5，再将该布局宽置0，绝不改生产文件。stderr `S5_S7_REVOKE_ANCHOR hits=1`；同一真实浏览器探针 **exit1**，报 `S7_BRASS_RULE` 且测得宽0、高124。取消开关，完整六截图旅程 **exit0**，黄铜条恢复宽5。绿色基线先成立、真红与恢复均实跑，不以测试未命中充数。

## S7 八维 2D 线评分（本地预览）

| 维 | 分 | 证据与上限 |
|---|---:|---|
| 艺术方向 | 2 | 当轮 idle/reveal/completed 三屏雨夜木质、青黑与暖铜纸档案一致；仍有S6整页差异，不给3。 |
| 主角面 | 2 | 当轮窗锁真实纹理PNG及现场七物件可辨；`art/art-ledger.json` 8行均 `approved`、design-handoff provenance，不把预览图推定为宿主未来素材。 |
| 世界密度 | 2 | idle 图有雨窗/后墙、书架桌面、前景地毯/物件三层，无大片裸色；单场景与叠放融合仍有限。 |
| 材质 | 2 | 四 HUD 面板成体系描边与渐变、纸面棕厚边及完成金环；非纯色 flat，但S6局部差异未清。 |
| 渲染管线 | 2 | idle→reveal→completed 当轮图有场景压暗/模糊与证物聚焦，非全屏等亮；0.9 scrim为既有授权偏差。 |
| VFX | 2 | 已见证物入场、收录态与完成星形/外环视觉反馈，当轮三屏有清晰区别；星形柔光仍缺、忙期焦点与稳定disabled非等价，不给3。 |
| UI美术 | 2 | 本轮三项原型差异已实修：棕边无玻璃、5px铜条、无可见标题框+圆点；题字/主题/按钮非默认灰，14轮审计无阻断。华丽计数警告及S6其它差异限制3。 |
| 性能证据 | 2 | 本人独立 bench 95/100（含确定性满分）和真浏览器零错误，满足手册“bench/像素断言/帧时”任一；无帧时分布与 blessed golden，不给3。 |

**VISUAL: 16/24 · PREMIUM: YES**，仅按评分卡“全维≥2”的闭集定义。它不等于 S6 正式 1:1 对齐、Golden 回归、DokiWorld 交付、S7 Owner signoff 或全库门禁全绿。S5 保留 **CONCERNS**：无标准照基准警告，S4→S5历史布局字节基线不足，S6正式整页仍 FAIL；上述证据可推进，但不可冒称视觉全收敛。
