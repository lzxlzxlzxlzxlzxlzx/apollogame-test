# 月影魔王城 UI 资产导入零写入计划（2026-10-15）

## 范围与审批依据

- Owner 已定稿 `demon-castle-ui-demo.html`，并在 `prototype-approval.md` 明确允许其 UI 皮肤进入正式游戏。
- 仅处理游戏本地美术库 `public/games/game-demon-castle/art/`；不改模拟数据、存档、`src/ui/**` 或 Life Host 实现。
- 已登记且已批准：`panelFrame`、`worldStatusRibbon`；本计划不覆盖或替换它们。

## 槽位预检

| uiSkin 槽位 | 原始候选 | 结论 | 拟消费者 | 可否写入 |
| --- | --- | --- | --- | --- |
| `trackedQuestFrame` | `ui-reference-extracted-kit-v1.png` | 可用，但图集本体不能作为 `Panel.skin`；裁取无文字的左中羊皮追踪框（源像素 `x=27,y=209,w=562,h=197`）后可作独立九宫格皮。 | `life-host-tracked-quest` | 是 |
| `hudChrome` | `ui-moonshadow-hud-chrome-v1.png` | **不可按现合同接线**。它是横跨完整 HUD 的多区骨架；现有消费者 `life-host-resources` 使用 `Panel.skin` 的 `cover`，且该槽没有切片数据，必然裁去端部和月徽。 | `life-host-resources` | 否，保留缺口 |

## 拟写入清单（执行前仍需重验）

1. 从上述已批准的本地原图，以确定性矩形裁取 `tracked-quest-frame.png` 到 `art/ui/`；不使用外部模型或网络字节。
2. 在游戏本地 `art/index.json` 登记 `art:game-demon-castle:ui:tracked-quest-frame`，`usage:'sprite'`、`colorSpace:'srgb'`、`wrap:'clamp'`、透明、线性采样；`provenance` 同时记录原图路径、原图 SHA-256、裁切矩形和产物 SHA-256。
3. 在 `approval-ledger.json` 的既有 `ui-skin-moonshadow-2026-10-15` 批次追加同一条可追溯记录。
4. 仅在候选和正式 descriptor 中追加该已登记 key 与 `trackedQuestFrame` 切片数据；不写 `hudChrome`，直到其消费布局支持画框切片或提供一个独立、单面板的资源条皮。

## 新图标 sheet（候选，非运行时资产）

`exec-23601724-75a5-4411-87b3-442252db4904.png` 是 Owner 要求的资源与入口图标候选。预检为 1536×1024、**透明背景**的六格展示图；但它仍不是六个独立、可各自溯源和绑定消费者的运行时 texture。它只可复制到候选审阅区并等待 Owner 选择后续方向：接受造型后确定性裁为六个透明单件并逐个审阅，或重新生成独立单件。

## Owner 2026-10-15 批准后的确定性裁切与消费者计划

Owner 已在本轮明确回复“原型通过、图标候选通过”。每个图标以整格 512×512 裁切，保留透明边缘，避免为显示尺寸二次烘焙；运行时缩放仍属于随后 Life Host 的 LayoutNode 数据。

| key | 源格 `(x,y,w,h)` | 已锁定的下一消费者 |
| --- | --- | --- |
| `art:game-demon-castle:ui:resource-gold` | `(0,0,512,512)` | 重要资源 HUD：金币数值 pill |
| `art:game-demon-castle:ui:resource-moon-crystal` | `(512,0,512,512)` | 重要资源 HUD：月晶数值 pill |
| `art:game-demon-castle:ui:resource-moonleaf` | `(1024,0,512,512)` | 重要资源 HUD：月叶数值 pill |
| `art:game-demon-castle:ui:entry-quest-scroll` | `(0,512,512,512)` | Life Host 任务入口 `J` |
| `art:game-demon-castle:ui:entry-backpack` | `(512,512,512,512)` | Life Host 背包入口 `I` |
| `art:game-demon-castle:ui:entry-profile` | `(1024,512,512,512)` | Life Host 档案入口 `C` |

这些图标现阶段仅登记为已批准的本地资产及**已锁定的下一消费者**；它们不伪装为当前 `uiSkin` 四槽，也不挪用现有“魔王威仪 / 工匠盟约”档案属性图标。正式 Host 接线工单必须同时消费上述三资源与 J/I/C 六个 key；否则该批次不得声称视觉接入完成。

## 验证

- `parseAssetIndex` 严格解析本地索引；文件与登记哈希一致。
- Life host descriptor 严格校验；`uiSkin` 只包含已经登记的 `art:<artSlug>:ui:*` key。
- 运行现有 `life-ui-skin` 定向测试与游戏资产对账；缺口仍作为记录保留，不以占位 key 伪装完成。
