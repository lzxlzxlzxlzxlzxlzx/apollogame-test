# S5 新鲜度独立复查 · 2026-10-14

复查人：`/root/records_diagnosis`（非本游戏/UI施工者）。判词：**CONCERNS（可推进，保留标准照及最终视觉审查限制）**。

范围：当前正式卡带的 S5 LayoutNode/可读性/交互与 UI03/04 共享字段影响，不是 DokiWorld 正式输入、出包或 S6/S7/S8整关通过。未修改生产代码、流程板或人门。

正式 manifest SHA256：`0f2ac23cb81e0d7a40fea571c83fbb84b9d370c381834565bd01e04e7768d48a`。

## 阅读与清单

已执行 `node scripts/game-pipeline.mjs checklist game-clue-investigation S5`，逐项核对。阅读本会话 AGENTS、onboarding、生产/需求/测试/复查手册、UI两册、self-check，以及 check-ui/align-check技能；原型、S5/S6对齐与 UI034冻结单只作为导航，不接受自报测试作为复查结果。

本次未执行 Git。范围以正式 JSON 与 `S6-ui034-before.json` 独立深等验证：只移除 `presentation.ui/font/focusTargets/pointerFeedback` 四个表现域后，完整其余 JSON 相等；World/entities、规则、信号、flags/shortcuts、Sprite/mask几何没有借UI修改。无法据此声称覆盖整个共享脏树的改动归属，也不能用它证明历史S4全布局字节未变。

## 独立命令与真实结果

| 命令/检查 | 结果 |
|---|---|
| `npx vitest run src/ui/components games/game-clue-investigation` | 78 files / 591 tests PASS，exit0；含游戏22条及实际LayoutNode零issue |
| `node scripts/game-skill-audit.mjs game-clue-investigation` | AUDIT/RATCHET PASS，无未覆盖红旗/缺失防线 |
| `node scripts/align-count.mjs --game game-clue-investigation --stage S5` | 8绿、2有裁决去向、0红，exit0 |
| `node docs/design/game-clue-investigation/self-check/s6-browser-probe.mjs` | exit0；42实心/透明反例；完整交互、三视口、键鼠触控DPR2及reduced-motion |
| `node tools/ui-audit.mjs docs/design/game-clue-investigation/self-check/s6-reveal.audit.ts --w 1440 --h 900` | idle/flavor/reveal/collected/completed/exit/cancelled × 深/亮，14轮全部exit0 |
| `node docs/design/game-clue-investigation/self-check/s6-visual-map.mjs --fixture` | exit0；原型九态、正式九态加cancelled；真实glyph/位置/裁切/关键帧断言通过 |

14轮逐个读输出：重叠0、硬低对比0、AA告警0、border-image前提0；华丽度3–4。工具静态house识别“否”保留，不伪造为“是”；正式卡带显式apolloOnyx，审计入口的条件主题参数不是运行时缺主题。测试stderr无新产品告警；不据定向绿声称全库绿。

## 抽样重走与目击（超过3条）

1. S5第1/3条：Canvas idle/flavor均 `(0,0,1440,900)`，窄屏 `(0,175,720,450)`，对话没有推移场景。
2. 第4/8条：纸框实际大图/文字/收录按钮清楚可见；Image棕边7px、body行高30.4px；七态深亮四关归零。目击本轮 `S6-03-lock-reveal.png` 与 `S6-00-prototype-reveal.png`，主体几何与顶部裁切一致；原型“原创占位”与正式“现场证物”文案不同，不冒充整页像素相等。
3. 第5/6条：busy重复3物理点击+3Enter后进度1→1、clickable commit31→31；letter/lock/prints三回看不重复计数；完成/取消出口重开后可再次调查。Canvas RGBA收录前后相等，未扣图或染绿。
4. 第7条：触控DPR2、Enter/Escape可达；动画0.24s→reduce0s；真实Tab焦点宽3px/offset3/青色，按钮边2px。印章透明中心、5px红边、900字重；dialog240ms、完成600ms关键帧为真实CSS Animation采样，非注入World。
5. “查看记录”功能已在同一独立会话的现有5173页面真点复现：清单初始可见，重复open仍可见，点清单标题关闭，再open可见。不是死键；但默认已展开与按钮文案造成“没有反应”困惑，这是可发现性CONCERNS，不擅增历史册玩法。

原型与正式截图本轮由独立复跑脚本重新生成，包含6原型、16正式；额外目击开局、证物与完成截图。自证好玩三问有具体答案，固定短场景重玩价值有限、430ms收录为定稿节奏，未以“还行”代替判断。

## 唯一锚点撤修验红与恢复

采用 `review/s5-refresh-revoke.config.ts` 的 Vite内存变换，不写共享 `src/ui/**`：锚点 `p.lineHeight >= 8 && p.lineHeight <= 120` 必须恰好1次，再改为false使行高输出失效。

`npx vitest run src/ui/components/gci-s6-ui03.test.ts --config docs/design/game-clue-investigation/review/s5-refresh-revoke.config.ts`

- stderr：`S5_REVOKE_ANCHOR hits=1`。
- exit1，1 failed / 4 passed；明确缺失 `font-weight:900;line-height:30.4px`，不是未命中修复的假红。
- 解除配置独立重跑同测试：5/5 PASS，单独进程exit0。生产源从未被变更。

## CONCERNS边界与后续归属

- S5机器门“无标准照基准未比对”仍属实：本轮真实截图/几何/关键帧与14审计补证，不等于golden-shot通过，未bless基准。
- S5历史第9/10条明确交S6；当前素材/共享字段已接入，但S6对齐单第13条整体1:1仍红。Owner目击通过不由复查者伪造成逐行资产审批或完整视觉机器绿。
- 历史S4→S5布局冻结缺完整版本基线，不追认“布局从未动”；UI034仅在已批准视觉返修方向内消费数据，不改玩法。最终视效/焦点回BODY、stable disabled与busy快照的区别保留原证据限制。
- 共享HOST-SESSION新options为可选，本次正常预览未传options；本游戏真实旅程重新通过，无UI回归。本报告不替代正式宿主动态素材旅程。

任务级地址5726/5728；浏览器与临时Vite均finally关闭，独立端口检查两者无Listen。根 `.ui-audit-tmp` 已释放；没有拉起整套系统或使用Owner浏览器配置、远程数据库、远程Git、人门。
