# `game-card-reveal` 当前需求与维护入口

> 本文件只保留仍有效的产品约束、交付状态和后续入口。2026-10-12 以前的完整 P1–P5、S3–S8、缺口施工过程和逐轮回执已原样归档至 [`archive/requests-full-history-2026-10-12.md`](archive/requests-full-history-2026-10-12.md)，不得把归档中的旧“待办”重新当作当前任务。

## 1. 当前结论

- S1-P 原型已由 owner 于 2026-10-09 冻结；S2–S6 已实现并完成独立复查，S6 owner 视觉人门已通过。
- S7 独立评分为 **13/24，非 premium**；owner 接受当前演出并批准进入联调和打包。该结论不是 premium 认证。
- S8 可移植包、调用说明、资产闭包、假宿主、独立 HTTP 和真实 DokiWorld 本地安装联调均已通过。
- DokiWorld 本地安装位置曾验证为 `frontend/public/apps/game-card-reveal/`；本项目没有执行线上发布。
- 当前没有未完成的游戏实现工单。上线前只需由宿主使用真实生产 HTTPS 卡面域验证可访问性与 CORS。
- 任何新的画面、布局或动画节奏变更，都必须先改 HTML 原型并重新取得 owner 定稿，再改正式实现。

## 2. 冻结产品合同

### 2.1 App 职责

- 本 App 只负责抽卡揭示演出，不决定抽到什么卡，不修改卡牌数据，也不承担奖励结算。
- 宿主传入 **1–5 张**已确定卡牌，顺序即展示顺序；每张卡只提供合同允许的身份字段和 HTTPS 卡面 URL。
- 宿主卡面只用于渲染。URL 不得进入模拟状态、快照或输出；单张加载失败时只把该张降级为包内 fallback，并保持原顺序。
- 本地包装或 fallback 等关键包内资产不可用时，请求退出，不得伪造成功。

### 2.2 输出与生命周期

- 自然播放到真实 P5 终态后输出 `viewed / natural`。
- 跳过也必须先落到同一个真实 P5 终态，再输出 `viewed / skipped`。
- preview 永不 `complete`；主动退出属于 cancelled，不得伪造 viewed。
- `accepted` 后永久锁定一次完成；pending 禁止并发提交；rejected、异常或 timeout 只允许重发同一份冻结输出。
- 宿主负责幂等、权威结算以及完成后的页面流转。

### 2.3 运行时外观

- 主舞台为纯透明合成层，不添加不透明背景。
- 实际 App 不显示底部对话框、按钮条或其他可见 chrome：`bottomBarH=0`，DOM 中无运行时 action/control/stage 节点。
- 保留不可见键盘兜底：`Space` / `Enter` 跳过或重试同一结果，`Esc` 请求退出；宿主负责外部控制界面。

## 3. 冻结演出 P2–P5

### P2 · 卡包环绕与聚焦

- 多个纸片卡包围成圆环旋转，总时长约 2 秒。
- 卡包为约 2:3 的长方形软包装视觉，使用同一种正面包装；不使用复杂 3D 软体结构。
- 最终聚焦其中一个卡包并无缝进入 P3。

### P3 · 快速撕顶与抽出

- 没有 Seal、封条卷或锯齿拉链动画。
- 卡包顶部约 15% 沿浅而自然的不规则弧线一次性快速撕开，顶片作为完整实体飞走；包体不能在撕开过程中再次从右向左消失。
- 余下包体向屏幕下方退场。
- 卡组位于包体图层下方：卡牌上部从包口后方露出，下部被前景包体遮住，形成真正“从包里抽出”的效果。

### P4 · 逐张揭示

- 支持 1–5 张卡，严格按宿主顺序。
- 第一张在中心露出并短暂停留/轻摇，然后向右飞出；它离开后，原本位于其下的下一张自然显现。
- 已飞出的卡必须连同旋转包围盒完全离开 1440×900 透明画布，不得在右边缘残留角片。
- 不销毁、不换 id、不重建卡牌；P4 与 P5 使用同一批实体。

### P5 · 全部展示

- 将同一批卡牌召回并按 1–5 张自适应排列。
- 终态必须稳定、完整可读，且是 natural 与 skipped 两条路径共同的完成门。

## 4. 已交付通用能力

### GAP-CARD-REVEAL-01 · `t2-presentation-track`

- 状态：**delivered / 独立复查 PASS**。
- 用途：以声明式数据表达多实体、多段并行动画，以及暂停、恢复、重播和跳过落统一终态。
- 本游戏不得另建专属 presentation controller。
- 证据：[`capability-plan.md`](capability-plan.md)、[`review/GAP-CARD-REVEAL-01.md`](review/GAP-CARD-REVEAL-01.md)。

### GAP-CARD-REVEAL-02 · 通用 Sprite 目标尺寸与 fit

- 状态：**delivered / 独立复查 PASS**。
- 用途：Sprite 可选目标尺寸及 `cover | contain`；旧消费者不填时保持原生尺寸。
- 卡面使用固定目标框与 `cover`，不在游戏层做临时 canvas 裁图或第二套图片加载器。
- 证据：[`review/GAP-CARD-REVEAL-02.md`](review/GAP-CARD-REVEAL-02.md)。

## 5. 资产与打包约束

- 包装正式消费槽：`pack.front`、`pack.tearTop`、`pack.tearBody`。
- `pack.back` 是 owner 已批准的库存资产，当前冻结流程没有背面可见帧，因此不伪造消费槽。
- 卡牌资产包括包内 fallback 与 1–5 张 preview；正式宿主 HTTPS 卡面不打进包。
- `assets/index.json` / 游戏本地资产索引是单一真相；所有可见本地资产必须有真实消费槽并进入闭包。
- dist 根直接包含 `index.html`、唯一 `manifest.json`、调用说明、bundle、便携资产目录、`ASSET-CLOSURE.json` 和 `SHA256SUMS.txt`；不得使用 `app.manifest.json`，不得多包一层目录。
- 当前身份协议为 schemaVersion 3、`dokiworld.app` protocolVersion 2；输入/输出合同以 vendored SDK、manifest 与调用说明为准。
- 生产 HTTPS 卡面成功加载仍取决于宿主 URL 可用性和 CORS；包内 fallback 成功不等于生产 CDN 已验证。

## 6. 明确取消或不采用

- **ScreenFx 彗星揭幕转场：取消。** `screen-fx-comet-prototype.*` 只作历史设计证据，不能作为当前施工依据；重启需求必须重新立项。
- 复杂 3D 软包装、动态软体材质：不采用。
- 两种卡包、翻面展示：不采用；`pack.back` 当前不消费。
- Seal、封条卷、锯齿撕条：不采用。
- 稀有度爆发、随机重抽、卡牌结果生成：不属于本 App。
- 底部对话框、可见控制条：已移除，不得恢复。
- 用不透明背景填充透明区域以提高“世界密度”：不采用，透明合成是产品要求。

## 7. 现行证据索引

| 主题 | 现行文件 |
|---|---|
| 项目立项与边界 | [`brief.md`](brief.md) |
| 能力消费与缺口裁决 | [`capability-plan.md`](capability-plan.md)、[`capability-gaps.json`](capability-gaps.json) |
| owner 冻结原型 | [`prototype.dc.html`](prototype.dc.html)、[`prototype-notes.md`](prototype-notes.md) |
| S3–S6 独立复查 | [`review/S3.md`](review/S3.md)、[`review/S4.md`](review/S4.md)、[`review/S5.md`](review/S5.md)、[`review/S6.md`](review/S6.md) |
| S7 品质评分 | [`review/S7-scorecard.md`](review/S7-scorecard.md) |
| S8 打包、联调与最终 chrome 修订 | [`review/S8.md`](review/S8.md) |
| 对齐证据 | [`self-check/S4-alignment.md`](self-check/S4-alignment.md)、[`self-check/S5-alignment.md`](self-check/S5-alignment.md)、[`self-check/S6-alignment.md`](self-check/S6-alignment.md)、[`self-check/S8-alignment.md`](self-check/S8-alignment.md) |
| 完整历史工单 | [`archive/requests-full-history-2026-10-12.md`](archive/requests-full-history-2026-10-12.md) |

## 8. 重新开工规则

1. 先确认需求是否改变冻结原型、合同或资产槽。
2. 视觉/交互/时序变化：先修改 `prototype.dc.html`，由 owner 真机目击并重新定稿。
3. 合同、DokiWorld、manifest、打包变化：重新核对当前 vendored SDK 与 DokiWorld 分册，不能沿用归档中的旧命令或旧数字。
4. 能力表达不了时，按缺口协议实查并交 owner A/B 裁决；不得在游戏层添加自由解释器、DOM/CSS、裸 canvas 或专属动画控制器。
5. 复查以各阶段 review/self-check 的真实门禁为准；归档中的施工者自述不是新的通过证据。

