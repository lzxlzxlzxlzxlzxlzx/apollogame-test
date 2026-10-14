# S5 独立复查 · 2026-10-13

复查人：`/root/s5_independent_review`，非施工者。首轮 **FAIL**；返修后正式结论 **CONCERNS（可送 S5 Owner UI 终审，非最终视觉 1:1）**，已于2026-10-13T10:20:51.623Z经合法 CLI 落账，gameHash `ca2c25d386490316`。完整 diff 基线缺失与 S6 原型视觉差异仍需明示。不代签 Owner 人门。

## 阅读与范围

已完整阅读 AGENTS、llm-onboarding、data-driven-manifesto，playbooks 的 index/game-production/game-requests/game-flow-questions/review-gates/testing/self-check/ui/rendering-fx/events-logic/randomness/assets/art-pipeline，ui-playbook，check-ui/align-check 技能，以及本游戏 capability-plan、prototype-notes、s4-ui-map、requests 和 S5-alignment。

接受现成 LayoutNode/纯数据 UI 精修路线，不接受以 S5 自评代替 S6 正式素材及最终 1:1 验收。共享树 `git diff --stat` 为多项目并行修改，不能全部归因于本游戏施工；library manifest 无 Git 跟踪且无 S5 前完整快照，因此不能声称完整 diff 证明“只改 presentation.ui”。以下以当前数据、S4 映射与保留截图、独立测试核实。

## 首轮独立输出（gameHash bde56849ff833da9）

- `npx vitest run src/ui/components games/game-clue-investigation src/assets/host-visual-bridge.test.ts src/skills/tier2/clickable.test.ts --reporter=dot`：exit 0，72 文件 / 560 测试通过。首次沙箱 realpath EPERM，0 tests，不计作有效结果；受控本地重跑有效。
- `Get-Content library/game-clue-investigation/manifest.json -Raw | npx vite-node scripts/manifest-check.mjs`：exit 0，parse/load/2 tick，`warnings:[]`；同样先发生沙箱 EPERM，重跑后才记通过。
- `npx vite-node scripts/acceptance-run.mjs --game game-clue-investigation`：exit 0，5/5 GD 剧本、67 检查点。普通物件不推进、可选不推进、首次/重复收录、完成/取消与重开均通过。
- `node scripts/game-skill-audit.mjs game-clue-investigation`：零红旗、RATCHET PASS；读到无正式美术台账警告，S6 尚未完成，不能称审计全绿。
- `node docs/design/game-clue-investigation/self-check/s4-browser-probe.mjs --s5`：独立 exit 0；6 原型图+16 正式图，开局/普通调查 Canvas 都为 (0,0,1440,900)，窄屏为 (0,175,720,450)；键鼠触控、完成/取消重开再调查通过；动效普通 0.24s / reduce 0s；浏览器错误零。访问 localhost:5720，临时浏览器与 Vite 由 finally 关闭。
- reveal 深色 `ui-audit`：exit 0，重叠0、硬低对比0、AA告警0、border-image前提0。首次工具在清理 `.ui-audit-tmp` 时 EPERM exit 1，未采信；第二轮成功。华丽件5（shape1/fx1/glass3），house 判定“否”是工具只从皮图 DOM 推断，manifest 的主题显式为 apolloOnyx。

## 已复现问题

1. **S5 冻结布局违规（阻断）**：独立目击 `self-check/shots/S4-02-flavor.png` 与新 `S5-02-flavor.png`，继续调查按钮从约 x1151/宽210/高58 移为 x1251/宽130/高48，hero 改 ghost 同时降低显著性。`S4-03-lock-reveal.png` 与 `S5-03-lock-reveal.png` 的收录按钮约225宽→165、影像槽710→690，内 padding 也改变。S5 checklist 明文“只换皮不动布局”，不是 S6 材质欠项。要求恢复已批准 S4 控件锚点/几何，保留合法配色/字体/材质精修后重审。
2. **完整 diff 基线缺失（限制）**：没有 S5 前 manifest 原文可供逐字比较；当前只可验证现有世界合同与截图/映射，不能把施工口述当作已证明世界字节未变。
3. **尚未最终视觉 1:1（非本轮新缺陷）**：当前仍灰盒、证物影像占位、house 深色外框/金切角按钮；与原型实图/纸框不同。S5-alignment 第9–10条明确去向 S6，不能借本次复查批准偏离原型。

## 前置 S2 撤修验红与落账

只在内存复制的 capability-gaps 数组中破坏，未改共享文件：唯一锚点 `GCI-S2-01 && state=delivered` 命中1；真实 `evalCapabilityGaps` 基线 ok。改为 open 后返回 warn，真实 `blockingGaps(...,'S3')` 精确返回 GCI-S2-01 一条。断言命令 exit 0，确认已变色而非没改到。

S2 已经合法 CLI review CONCERNS（2026-10-13T09:43:42.184Z，gameHash bde56849ff833da9，gapsHash 1c0d4f3cac362aff）。计划 j1-state 与当前 selected-object Resource 的既有偏差保留；未冒称该文档偏差消失。

## S5 独立撤修验红

临时审计入口只 `structuredClone` 当前 manifest，在内存中查 `id=evidence-lock-title` 唯一锚点，断言命中1且基色严格为 `{custom:'#372A1E'}`，再把色改为与纸面相同的 `#D2C098`。真实 `tools/ui-audit.mjs` 从基线 exit0 转为 exit1，精确报告 `evidence-lock-title` / `破损窗锁` / ratio=1 / 硬失败1。没有通过关闭审计或改预期造红。共享 manifest 从未被破坏；临时审计入口已删除；随后七态深亮正常入口全部 exit0。

## 返修复验（gameHash ca2c25d386490316）

- 继续调查恢复 `(x1151,y817,w210,h58)`；证物收录 `225×58`、返回 `180×52`、影像槽宽710、纸内 padding8/gap14，完成出口恢复220×62 hero。独立重跑新增真实稳定态/包围盒断言的专属浏览器旅程 exit0，重读并目击新 S5-02/03/04/05/07 截图；主舞台/主要锚点未漂移，材质边框产生1px差不是重排版。首轮布局阻断已修复。
- 返修冻结版再次独立 manifest-check exit0 warnings[]，游戏2文件9测试 exit0；没有替施工者修改实现。
- 七态 idle/flavor/reveal/collected/completed/exit/cancelled × apolloOnyx/daylight 共14轮真实 UI 审计串行执行，退出码均0；每轮重叠、硬低对比、AA告警、border-image前提问题均0。只有 Modal 根标注意图覆盖；普通面板无全局豁免。华丽件3–5，主题检测限制同前。
- 独立补充时间采样探针访问 localhost:5721：证物刚出现时 translateY20.488，300ms后为 identity，动画 finished/currentTime240，900ms与1900ms仍identity；不存在每tick重挂使入场永不结束。纸面稳定 rect=(343,244.5,754,444)。临时探针已删除，浏览器/Vite均关闭。
- 独立再次运行 `s4-browser-probe.mjs --s5` exit0，6+16图、键鼠触控、两个终局出口与重开再操作、稳定矩形、reduce=0s 均通过。`focusAfterModalEscape={id:'',tag:'BODY'}` 是当前宿主关闭后的既有焦点回退事实，非声称已回到原触发物；键盘继续 Escape/进入退出确认仍可达。
- `align-count --game game-clue-investigation --stage S5` exit0：8绿、2黄有去向、0红。抽样重走普通档案、线索收录、终局重开及两条降格；好玩三问有具体答案，无“还行”式空结论。
- S2 最新合法 CONCERNS 于2026-10-13T10:01:58.559Z，绑定上述新 gameHash 与 gapsHash1c0d4f3cac362aff；不要求重签既有 Owner 门。

## 结论边界

S4 前置补充内存撤修：唯一锚点 `effect-lock-count/Effect/onSignal=clue.collect.lock/value=1` 命中1，原 manifest 通过真实 `runScenario` 执行 GD 第2剧本；只在副本把 value 改0，同一剧本在 step5/9/12 的 required-collected 断言由 expected1 变 actual0、真实结果 FAIL。再跑未改原数据恢复 PASS。临时 Vitest wrapper exit0（断言绿→红→绿）；第一版 wrapper误读 JSONC parser 的 scenario字段导致自身基线失败，不采信，修为实际 value字段后才计有效。共享 manifest 未改，临时测试已删除。

S5 的 LayoutNode纪律、四关可读性与交互、此次发现的几何回归均已有独立实证。由于原始全量 diff 基线缺失，且 S6 正式图/框皮/最终时序视觉仍未交付，最终采用 **CONCERNS** 而非无条件 PASS。本结论允许送 Owner 验本轮 UI，不批准素材来源/许可/审美，也不把灰盒当真实 PNG；S6 后必须再做完整同画布关键帧终验。全库门禁未在本复查冒称全绿。

最终重读 board：S1–S4 人门既有批准保留，S2 CONCERNS、S3/S4 PASS 均新鲜；S5 gate exit0@10:19:29.645Z，review CONCERNS，Owner待审。S6未完成。独立 DOCS-REF exit0（48文档399引用）；5720/5721无监听。没有执行远程Git、远程数据库、整套系统启动或任何人门审批。

S5 机器门告警边界：纯数据卡带免游戏代码审计；尚无标准照/golden 基准，机器门未作标准照比对。14轮真实 UI 审计与同画布22图是补充实证，不等于 golden PASS；复查者未执行 bless，也不能替 Owner 建立获批基准。
