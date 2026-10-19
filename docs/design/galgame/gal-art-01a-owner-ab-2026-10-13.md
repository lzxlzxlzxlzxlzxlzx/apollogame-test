# GAL-ART-01A · S5 剩余缺口一次性 A/B 裁决单（2026-10-13）

这不是 S5/S6 完成申请。已核对定稿 `gal-ui-complete-v2.dc.html`、`src/engine/protocol/galgame.ts`、`src/ui/components/catalog.ts` / `types.ts`、UI/资产/美术生产线手册和 `npx vite-node scripts/dump-capability-catalog.mjs --names`；后者 UI 相关仅列世界锚定能力，具体闭集以 UI catalog 为准。共享工作树有他人在途改动，未为查新而在此树执行 `git pull`/rebase。以下均未先行实现或代裁。

| 决策 | 实查原文与重组失败处 | A · 通用能力/数据合同 | B · GAL 例外/降格 | 推荐 |
| --- | --- | --- | --- | --- |
| 1. V2 ghost 胶囊及悬停态 | 原型 `.ghost{border:1px solid #e4d6aa88;background:#101a36cf;border-radius:21px}`、`:hover{background:#535c91;color:white}`。`ButtonProps` 仅有 `kind/labelColor/shape/skin/...`，无底色、边色与悬停配色数据。`shape:'pill'` 隔离真渲只改变几何轮廓，未出现所需暗底/金线/hover，已撤回。Panel 有静态 `bg/edge/shape/action`，但无同一控件的 closed-set hover 背景态/禁用态，不能完整重组。 | 请 PUI 扩一个通用、可审计的 Button 状态化配色闭集（默认/悬停/按下/禁用，含底与边；GAL 只填数据）。代价：PUI 基座设计、schema、主题/状态测试和独立复查；影响所有 Button 消费者，复用性高。选错会增加通用词表和回归面。 | 授权 GAL 用 Panel 复合热区或批准 ghost 与 V2 不完全 1:1，单游戏记视觉债。代价：少改共享层但多一套按钮语义/禁用/焦点/hover 接线或永久差异；影响 GAL，复用性低。选错会积累交互与可访问性债，且不能无条件签 S5。 | **A**，保留统一 Button 动作与状态语义。 |
| 2. 回想卡场景纹理/锁定剪影、部分 CG 图 | 原型 `memory-grid` 用场景纹理与锁态图；当前 `GallerySpec.memories` 每条仅 `title/entry/unlock`，`gal-ui-read-model.ts` 的 memory 卡只有 `preview:'no-asset'|'locked'`，无素材 key；`MediaCatalog.cg` 每 ID 仅一图。`public/games/gal-template/art/index.json` 现有 8 张 demo 素材仅一张 CG，来源许可仅模板开发、发行未核验。用同一 demo 图复制填满卡片不会产生不同分镜或 1:1。 | 为回想条目增加可选已审核缩略图/锁态素材 key 的数据槽，CG 仍用独立 ID 按节点切镜；经 Owner 批准具体素材及来源许可后由资产专员登记，再做 V2 视觉对齐。代价：GAL 合同、校验/编译、消费和资产审核；影响 GAL 作者/模板，数据驱动复用性高。选错会扩大格式和迁移/兼容面。 | Owner 明确批准“场景素材待入库”与暗卡作为 V2 偏差，保留占位，不假称纹理/多张 CG 已具备。代价：实现少，但 S5 不再是原型 1:1，图库体验降格；影响 GAL 项目，复用性低。选错会使视觉验收基准漂移。 | **A**，但素材审批与发行许可仍独立由 Owner 做，不能以选 A 代替。 |

补充事实：剧情的连续分镜已可用不同 CG ID 逐节点 `show`，剧情页画面/存读档/回滚已有[局部独立 PASS](review/GAL-ART-01A-story-cg-independent.md)。若产品另要求“一组分镜共用一个画廊条目与解锁”，当前单 ID→单图合同没有该语义；这不是本轮已提出的必需验收项，不在本单擅加第三项工程范围。

等待 Owner 对上述 **1、2 各选 A 或 B**。在判词前不改 PUI 基座、协议、资产索引或冻结原型；04B-1 设置能力原有的 PUI 通用实现阻塞仍按既有工单单独处理。选 B 必须明确在 S5 差异单记为 Owner 批准偏差，而不是默降。
