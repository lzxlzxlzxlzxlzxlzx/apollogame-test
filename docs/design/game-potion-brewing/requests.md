# `game-potion-brewing` 当前需求与施工入口

> 本页只保留当前约束、活动阶段和证据索引；历史判词见 `archive/`，阶段权威为流程板与项目路线图。不得用本页代签 Owner 人门。

## 当前结论

- S1-P-06 原型已由 Owner 定稿，2026-10-14 的 S1-P-07 无限取料与 S1-P-08 棒身全段可抓/移除 Q/E 和局内重开/单小云朵变更也已由 Owner 确认；S2 能力计划与宿主合同已过 Owner 人门；正式游戏 S3、S4、S5 历史三门已通过。旧指纹 `35b6fc9128549795` 的证据仅代表改版前版本，不能代替新指纹门禁。S6 对齐单已重新收敛；通用棒身握持经异人 [独立复查](review/REQ-POTION-ROD-GRAB-01.md) PASS 并从公共池释放。S6 整体终复查及 Owner 美术平台逐行 ☑ 仍待；DokiWorld v1 SDK 入口已有便携构建与假宿主成功/失败/拒收/预览实测，真实部署联调属 S7，不代签人门。
- G1–G4 通用引擎能力已按 Owner 2026-10-13 裁决的**炼药项目范围**释放，独立复查见 [G1–G4 项目范围释放](review/G1-G4-scoped-release-2026-10-13.md)。S4 材料份数缺口经 Owner 选择 A 后由 G5 通用步骤完成信号解决；[G5 独立复查](review/GAP-POTION-05.md) 判项目范围 PASS，`capability-gaps.json` 五项均为 `delivered`，公共池对应五票均已移除。此结论不代替正式游戏 S4/S8 门；全库 scoped-gate 仍被并行 Life 项目 32 条依赖违规阻断，不宣称全库门绿。
- `/api/games` 的多段 slug 漏列已在本地源码修复并经非施工者复查 PASS；当前运行中的 Python API 尚需由 Owner 重启加载，详见 [POTION-LIST-01 复查](review/POTION-LIST-01.md)。

## 当前有效约束

- [brief.md](brief.md) 与 [contract-v1.md](contract-v1.md) 冻结“一局一份宿主指定公开配方”，玩家直入炼药台；宿主权威持有材料和成品，游戏只返回 success/failure/cancelled。
- 材料 ID 形成具名 add 信号；顺/逆时针有效整圈形成 stir 信号；短弧、锅外释放不提交且不误判失败。步骤和失败由 G1 有序会话解释，游戏层不另写规则机。
- [prototype.dc.html](prototype.dc.html)、[prototype-notes.md](prototype-notes.md) 的 S1-P-06 + Owner 确认的 S1-P-07 局部变更是 1440×900 透明三栏基准：锅身不发光、不移动，初始清水，投料/搅拌只改变汤色/汤中特效，失败为浑浊紫色；搅拌棒常驻、单角度沿椭圆轨道且棒端入水；材料无限取用且不显示份数。历史定稿证据见 [S1-P-06-review.md](S1-P-06-review.md)。
- 禁止可见选方屏、木桌背景、方向按钮、底部拖料提示、右上角两按钮、棒头蓝点；不得复制原型自由 DOM/CSS/JS 进正式游戏，不得手写第二套投放命中或拖动预览。
- 2026-10-14 Owner 已确认新版 `prototype.dc.html` 的无限取料方案；正式游戏移除份数显示、资源扣减与耗尽禁用，重复投料仍由 G1 有序步骤判定。S1-P-07 变更记录见 [prototype-notes.md](prototype-notes.md)。

S4 已通过三门；施工与验收历史见 [S4 对齐单](self-check/S4-alignment.md) 和 [新指纹复查](review/S4-S5-stale-recheck-2026-10-13.md)。

## S5 领工声明（2026-10-13）

- 启动词：在已通过 S4 的固定 1440×900 三栏结构上精修配方卷轴、材料架、步骤/状态与结果屏的 UI 观感；不改冻结布局或玩法权威。施工主体：Codex/root。代码基线：S4 已通过指纹 `2b771b62aca79e68`；共享工作树保留他人全部改动。
- 边界：`games/game-potion-brewing/screen.ts` 与定向 UI 测试/审计、`docs/design/game-potion-brewing/self-check/S5-alignment.md` 和当轮截图、必要的短时隔离浏览器探针、本页及项目路线图的真实证据。共享 `src/ui/**`、引擎、正式资产索引和其他游戏不属本单。
- 设计稿已真渲染目击：[29-transparent-fixed-recipe.png](ui-refs/29-transparent-fixed-recipe.png)、[30-purple-static-failure.png](ui-refs/30-purple-static-failure.png)、[31-transparent-success.png](ui-refs/31-transparent-success.png)；S4 现状对照为 `self-check/shots/S4-01-start.png`。S5 仅消费现有 LayoutNode/house 主题表达，AI 坩埚/瓶正式素材仍须确认来源与 Owner 审批后走 S6 资产线。

## S6 领工声明（2026-10-13）

- 启动词：接续已通过人门的 S5，按定稿 S1-P-06 完成锅/药液/材料/结果的美术、动效和音效；素材审批与结算框尺寸裁决只由 Owner 作出。施工主体：Codex/root。代码基线：S5 人门通过时游戏指纹 `35b6fc9128549795`；不清理共享工作树的他人改动。
- 边界：本游戏 `games/game-potion-brewing/` 的表现数据/测试、经明确审批后才可碰本地正式资产索引与 `public/games/game-potion-brewing/art/`；S6 自证、截图、审计及本页/路线图真实状态。共享 `src/ui/**`、引擎和其他游戏不属本单。
- 设计稿目击基准：[29 主屏](ui-refs/29-transparent-fixed-recipe.png)、[30 紫汤失败](ui-refs/30-purple-static-failure.png)、[31 成功结算](ui-refs/31-transparent-success.png)；当前真渲染对照为 `self-check/shots/S6-01-start.png`、`S6-05-success.png`。Owner 已选择 A 批准两张原型 AI PNG 正式用于本项目，并选择 A 按原型放大成功框，范围见 [锅/瓶批准记录](art-approval-2026-10-13.md)；随后选择 A 批准五张原型原创 SVG 及卷边/横档闭集装饰，见 [材料批准记录](art-approval-2026-10-14.md)。七张图均登记/消费；美术平台逐行 ☑ 仍待 Owner 本人。
- 本轮 Sprite 单图平滑采样按 Owner A 施工，缺省仍为最近邻；非施工者 [独立复查](review/POTION-SMOOTH-UNLIMITED-2026-10-14.md) 对引擎与无限取料定向 PASS，公共池 `REQ-POTION-SPRITE-SMOOTH-01` 已释放。此局部 PASS 不等于 S6 视觉 1:1 或 Owner 人门。

## 证据索引

| 主题 | 权威文件 |
|---|---|
| S1 定稿原型 | [prototype.dc.html](prototype.dc.html) · [prototype-notes.md](prototype-notes.md) · [S1-P-06-review.md](S1-P-06-review.md) |
| S2 能力与合同 | [capability-plan.md](capability-plan.md) · [capability-gaps.json](capability-gaps.json) · [contract-v1.md](contract-v1.md) · [S2-review.md](S2-review.md) |
| G1–G4 历史施工规格 | [work-orders/](work-orders/) · [archive/](archive/) |
| G1–G4 释放 | [review/G1-G4-scoped-release-2026-10-13.md](review/G1-G4-scoped-release-2026-10-13.md) |
| G5 材料份数能力释放 | [work-orders/GAP-POTION-05.md](work-orders/GAP-POTION-05.md) · [review/GAP-POTION-05.md](review/GAP-POTION-05.md) |
| S3 骨架 | [self-check/S3-skeleton-2026-10-13.md](self-check/S3-skeleton-2026-10-13.md) · [review/S3-skeleton-2026-10-13.md](review/S3-skeleton-2026-10-13.md) |
| S4 玩法与结构 | [self-check/S4-alignment.md](self-check/S4-alignment.md) · [review/S4-S5-stale-recheck-2026-10-13.md](review/S4-S5-stale-recheck-2026-10-13.md) · `public/games/game-potion-brewing/pipeline.json`（三门均通过） |
| S5 UI 换皮 | [self-check/S5-alignment.md](self-check/S5-alignment.md) · [review/S5-independent-2026-10-13.md](review/S5-independent-2026-10-13.md) · `public/games/game-potion-brewing/pipeline.json`（三门已通过） |
| S6 美术/音效/演出在途 | [self-check/S6-alignment.md](self-check/S6-alignment.md) · [锅/瓶批准](art-approval-2026-10-13.md) · [材料批准](art-approval-2026-10-14.md) · `public/games/game-potion-brewing/art/`（七图 filled，平台逐行 ☑ 待 Owner） |
| 列表漏列修复 | [review/POTION-LIST-01.md](review/POTION-LIST-01.md) |
| 阶段状态 | `docs/projects/game-potion-brewing/project-roadmap.json`；正式游戏建立后由流程 CLI 写 `pipeline.json` |
