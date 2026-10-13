# `game-potion-brewing` 当前需求与施工入口

> 当前控制面，不是历史日志。完整规格见 `work-orders/`，测试/复查见 `self-check/`、`review/`，已结束过程见 `archive/`。阶段权威为 `pipeline.json` 与项目路线图，本页不代签人门。

## 1. 当前结论

- 当前阶段：项目路线图 S1、S2 已获 Owner 人门；S3–S4 因能力缺口尚未 delivered 而 blocked（以 `docs/projects/game-potion-brewing/project-roadmap.json` 和 `capability-gaps.json` 为准）。
- 当前出口：G1–G4 本体均有定向测试与独立撤修实证；[隔离浏览器接缝](review/G2-G4-browser-engine-integration.md)又独立复跑通过真鼠标/触控、可见预览与有序成功链。但正式游戏尚不存在，全库门禁未绿，复查判词仍为 CONCERNS；四项继续在途，不等于 S3/S4 解锁。
- 最近有效 Owner 判词：2026-10-12，G1/G2/G3 选 A，G4 单独选 A；G1–G4 允许以工单本地施工主体为领工锁，无须先推送。裁决原文与 A/B 实查见 [历史快照](archive/requests-through-s2-2026-10-12.md)；此处不把裁决等同能力交付。
- Owner 于 2026-10-13 明确裁决：并行项目的全库红项不阻碍炼药项目进度。G1–G4 释放改以本项目定向测试、引擎接缝真浏览器和非施工者独立复查为准；全库检查仍如实标红、不伪称通过。正式游戏 S3/S4 验收另行进行，不倒置成通用能力交付的前提。

## 2. 当前有效约束

- 产品边界：[brief.md](brief.md) 与 [contract-v1.md](contract-v1.md) 冻结“一局一份宿主指定公开配方”，玩家直入炼药台；宿主权威持有材料和成品，游戏只返回 success/failure/cancelled，不做配方选择或游戏层规则解释器。
- 输入/输出合同：[contract-v1.md](contract-v1.md) 为 v1 权威；材料 ID 决定具名 add 信号，顺/逆时针有效整圈决定 stir 信号；短弧、锅外释放不提交，也不构成失败。
- 冻结原型/画布/时序：[prototype.dc.html](prototype.dc.html)、[prototype-notes.md](prototype-notes.md) 的 S1-P-06、1440×900 透明三栏；锅身不发光、不移动，失败只令药液浑浊紫色；搅拌棒常驻锅中、单角度沿椭圆轨道、棒端入水遮挡。Owner 定稿与复查见 [S1-P-06-review.md](S1-P-06-review.md)。
- 明确禁止或不采用：可见选方屏、木桌背景、方向按钮、底部拖料提示、右上角两按钮、棒头蓝点、原型自由 DOM/CSS/JS 复制进正式游戏；不得以游戏层输入胶水、自由 Canvas 或第二份命中公式绕 G1–G4 通用能力。

## 3. 当前活动工单

### S2 A 裁决与引擎能力施工规格（2026-10-12）

#### GAP-POTION-01 / G1 · 有序动作会话

- 状态：blocked（公共池 `REQ-POTION-ORDERED-ACTION` 仍为 in-progress；独立复查 CONCERNS，全库门禁未绿）。
- 施工主体：Codex/root，本地领工锁。
- 目标：用数据驱动闭集步骤判 add/stir、立即错误和唯一终局。
- 验收判据：两配方、同拍全序、重复/反向/非玩法动作、确定性快照、trace、撤修验红及独立复查；全库门禁绿后才可释放。
- 允许改动：`t2-ordered-action-session` 通用引擎及必要登记/测试/手册。
- 禁止改动：游戏层自写序列解释器；以点名测试绿冒充全库绿。
- 证据：[施工规格](work-orders/GAP-POTION-01.md) · [自检](self-check/REQ-POTION-ORDERED-ACTION.md) · [独立复查](review/REQ-POTION-ORDERED-ACTION.md)。

#### GAP-POTION-02 / G2 · 椭圆单角度搅拌

- 状态：blocked（公共池 `REQ-POTION-ANGULAR-GESTURE` 仍 in-progress；隔离浏览器鼠标/触控已证，正式游戏手势与全库门禁未闭合）。
- 施工主体：Codex/root，本地领工锁。
- 目标：量化指针轨迹驱动棒的唯一角度，并输出顺/逆时针有效整圈信号。
- 验收判据：真鼠标/触控、跨 0°、折返抵消、短弧/死区/跳变、连续圈数、键盘等价、快照同轨、trace 和独立撤修验红。
- 允许改动：通用输入/确定性能力及必要接缝、测试和手册。
- 禁止改动：用 rAF/墙钟/自由 callback 判权威圈数，或复制原型 JS 至游戏层。
- 证据：[施工规格](work-orders/GAP-POTION-02.md) · [自检](self-check/REQ-POTION-ANGULAR-GESTURE.md) · [独立复查](review/REQ-POTION-ANGULAR-GESTURE.md)。

#### GAP-POTION-03 / G3 · DropZone 可选椭圆命中

- 状态：blocked（公共池 `REQ-POTION-ELLIPSE-DROPZONE` 仍 in-progress；隔离浏览器拒收/投放已证，正式游戏输入链与全库门禁未闭合）。
- 施工主体：Codex/root，本地领工锁。
- 目标：在不改变矩形默认行为的前提下给 DropZone 增显式椭圆命中，并抽共享纯判定供 G4 只读消费。
- 验收判据：椭圆端点/四角、缩放/负 scale/重叠区、旧矩形零回归、真实材料投放链与独立复查。
- 允许改动：现有拖放能力的可选字段、共享判定、测试与手册。
- 禁止改动：改变既有 AABB 缺省或让预览自行提交玩法 Signal。
- 证据：[施工规格](work-orders/GAP-POTION-03.md) · [自检](self-check/REQ-POTION-ELLIPSE-DROPZONE.md) · [独立复查](review/REQ-POTION-ELLIPSE-DROPZONE.md)。

### S2 新缺口 G4 · 材料拖动预览与回弹（Owner 选择 A）

#### GAP-POTION-04 / G4 · 通用 render-only 拖动预览

- 状态：blocked（公共池 `REQ-POTION-DRAG-PREVIEW` 仍 in-progress；隔离浏览器可见拖影已证，正式游戏鼠标/触控与全库门禁未闭合）。
- 施工主体：Codex/root，本地领工锁。
- 目标：材料跟手影像、锅外 280ms 回弹与合法投放消隐，不移动权威材料、不改变规则。
- 验收判据：鼠标/触控、缩放、并发拒收、取消/失焦/unmount/资源失败/reduced-motion、快照/hash 不变、旧游戏默认关闭回归及独立复查。
- 允许改动：可选的通用输入与 2D 表现接缝，G3 共享命中只读复用。
- 禁止改动：游戏层自由 DOM/CSS/Canvas、第二份投放命中公式、预览直接发 add Signal。
- 证据：[施工规格](work-orders/GAP-POTION-04.md) · [自检](self-check/REQ-POTION-DRAG-PREVIEW.md) · [独立复查](review/REQ-POTION-DRAG-PREVIEW.md)。

## 4. 阻塞与待 owner 裁决

- Owner A/B 待裁决：无；四项均已选 A。
- 交付阻塞：全库 TypeScript 与 depcruise 被其他项目当前错误阻断；容量守卫本轮又因 `game-simlife/requests.md` 并发增长转红。隔离浏览器引擎链 PASS，但 G1–G4 正式游戏真手势与完整可玩链尚未目击，独立结论仍为 CONCERNS。四条 `capability-gaps.json` 仍为 `accepted`，不得提前改 `delivered`。

## 5. 证据索引

| 主题 | 权威文件 |
|---|---|
| 立项与单配方边界 | [brief.md](brief.md) |
| 能力计划与机读缺口 | [capability-plan.md](capability-plan.md) · [capability-gaps.json](capability-gaps.json) |
| 宿主输入输出 | [contract-v1.md](contract-v1.md) |
| 定稿原型与复查 | [prototype.dc.html](prototype.dc.html) · [prototype-notes.md](prototype-notes.md) · [S1-P-06-review.md](S1-P-06-review.md) |
| S2 独立复查 | [S2-review.md](S2-review.md) |
| G1/G2 施工与复查 | [self-check/](self-check/) · [review/](review/) |
| 阶段状态 | `docs/projects/game-potion-brewing/project-roadmap.json`；正式游戏建立后以 `pipeline.json` 为准 |

## 6. 归档入口

- [archive/README.md](archive/README.md)：历史文件目录；归档不是当前施工依据。

