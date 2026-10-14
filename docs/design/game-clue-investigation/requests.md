# `game-clue-investigation` 当前需求与施工入口

> 当前控制面；历史施工与 A/B 原文已移入 archive，不作为当前锁。

## 1. 当前结论

- 当前阶段：S1–S5 Owner 历史签核保留；S6 正式真图已接入，机器证据按新版本刷新。
- 当前出口：正式 PNG 真浏览器独立复跑通过；S3 mask 点击机器门已返修通过，独立复查与后续阶段证据继续刷新。
- 最近有效 Owner 判词：2026-10-14 UI-03选A统一补通用字段；浅纸底小标题改深青色并以≥4.5验收、同步原型。UI-02遮罩保留0.9；不代签S6。

## 2. 当前有效约束

- 游戏=纯数据卡带；世界规则与 S4 交互动作保持不变。
- 输入输出以 `dokiworld-contract-v1.md` 为设计合同；SDK parser/打包归后续阶段。
- `prototype.dc.html` 为定稿视觉真相，1440×900 等比舞台；档案条不推动场景；正式实现禁复制原型 DOM/CSS。
- 正式 PNG、alpha 实形实拍、框皮/材质及来源许可/审美逐张审批属 S6；本轮不能冒称完整视觉 1:1。
- 禁代签 Owner 人门、远程 Git/数据库写入、自行拉起整套系统；UI/共享引擎专职域不在本单修改范围。
- S2 `j1-state` → S4 selected-object Resource 的实现偏差保留原 CONCERNS，不静默消除。

## 3. 当前活动工单

### GCI-S6-ART-BRIDGE-01 · 原型真图与不规则 PNG 接入

- 状态：in-progress（补原型视觉对齐、台账路径识别与阶段独立复查）
- 施工主体：通用桥＝引擎程序聊天 `01a1244a-4f76-7990-9f46-5fe33cea4c42`；游戏接线＝本聊天下 `/root/s6_formal_integration`；资产导入/台账＝`/root/s6_asset_import`，异人复查另派。
- 目标：背景及七件 PNG 正式显示、同源 alpha 命中及反馈，收录后保持原图。
- 验收判据：透明/实心反例、多视口缩放、contain/cover、键鼠触控、缺图错绑拒收、异人四步复查。
- 允许改动：游戏 manifest、游戏定向测试/self-check/review、library/game-clue-investigation/art；共享桥由引擎程序独占领锁。补 asset-library.md 现行规范导航，不定义新规范。
- 禁止改动：除本次授权纸底小标题深青修正以外的原型、他人锁定文件、Owner 人门；禁止矩形热区回退及游戏自写命中。
- 当前视觉返修：`/root/s6_formal_integration` 负责证物裁切、框皮和按钮的现有 LayoutNode 数据对齐；真能力缺口须先提交实查与 A/B，不擅改共享 UI。
- 证据：`self-check/S6-alignment.md`、`review/S6-assets-import.md`；S5 历史指纹 `ca2c25d386490316`，正式接图指纹 `12157d544b66554b`。

## 4. 阻塞与待 Owner 裁决

- GCI-S6-UI-04共享字段已独立局部PASS，见 `review/GCI-S6-UI-04-independent.md`；UI03/04正式消费冻结`0f2ac23c…7768d48a`，自证22/22、42命中、14审计及关键帧通过，已送异人游戏复查，非整关通过。导航 `self-check/S6-ui034-formal-freeze.md`。
- UI02正式批次独立行为局部PASS，见 `review/S6-ui02-formal-independent.md`；最终正式14轮审计、焦点回BODY和其余视觉差异仍保留，非S6整关完成。

- GCI-S6-UI-03共享局部独立PASS，见 `review/GCI-S6-UI-03-independent.md`；游戏消费已随UI04冻结，世界/场景/PNG几何保持不变，等待异人正式游戏复查；整页1:1总项仍红，不以局部断言代替总验收。
- 视觉裁决已解：浅纸底眉题改深青≥4.5，游戏接线者先同步原型再复验；历史1.05失败保留于 `self-check/S6-ui02-candidate-status.md`，不能直接改成PASS。

- GCI-S6-UI-02共享字段已独立PASS，见 `review/GCI-S6-UI-02.md`；游戏数据消费与完整九态验收仍进行中。禁止任意CSS和假Modal，遮罩保留0.9。

- 通用桥功能局部 PASS、整单 CONCERNS，见 `review/REQ-GCI-CART-ART-BRIDGE.md`。正式接图/8行台账已落，独立真实浏览器通过不等于阶段门通过。
- S3 mask 点击探针已独立通过（`review/REQ-GCI-MASK-CLICK-PROBE.md`）；阶段门仍因游戏指纹变化待刷新，S4/S5旧证据不冒充新版本。
- library 台账路径误报已修并独立复查 PASS，见 `review/REQ-GCI-LEDGER-READPATH.md`；真实8行/0孤儿/0复核，无public第二台账。
- 全库 depcruise 32 条其他项目错误；本游戏5条导入违规已清，不宣称全库绿。
- S6 原型证物裁切与旧框皮/演出两项差异进入返修，见 `self-check/S6-alignment.md`；现有能力可表达的偏差直接修，不能表达的再提裁决。S5 历史 CONCERNS 保留，素材逐行复核未代签。

## 5. 证据索引

| 主题 | 权威文件 |
|---|---|
| 立项/能力计划 | `brief.md` / `capability-plan.md` |
| 原型与冻结说明 | `prototype.dc.html` / `prototype-notes.md` |
| S2 偏差复查 | `review/S2-stale-independent-2026-10-13.md` |
| S3 点击/渲染 | `review/REQ-S3CLICK-independent.md` / `review/REQ-S3CART-RENDER-independent.md` |
| S4 本游戏复查 | `review/S4-preliminary-independent-2026-10-13.md` |
| S4 通用桥/反馈/走查 | `review/REQ-GCI-CART-UI-BRIDGE.md` / `review/REQ-GCI-POINTER-PROJECTION.md` / `review/REQ-CART-UIWALK-ADAPTER.md` |
| S4/S5 对齐 | `self-check/S4-alignment.md` / `self-check/S5-alignment.md` |
| S6 正式 PNG / 台账 | `self-check/S6-alignment.md` / `review/S6-assets-import.md` |
| S6 正式独立复查 | `review/S6-formal-independent.md`（含历史失败与按钮局部隔离浏览器PASS；非最终阶段通过） |
| 共享探针 / 台账返修 | `review/REQ-GCI-MASK-CLICK-PROBE.md` / `review/REQ-GCI-LEDGER-READPATH.md` |

## 6. 归档入口

- `archive/requests-through-S4-2026-10-13.md`：原 S1–S4 工单、A/B 原文、旧进度与 S5 初始领工范围；仅供追溯。
