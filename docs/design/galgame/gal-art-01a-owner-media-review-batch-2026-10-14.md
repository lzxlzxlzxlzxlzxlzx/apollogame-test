# GAL-ART-01A · 终图与素材 Owner 审核包（2026-10-14）

状态：**只读审核包；未登记、导入、替换、批准或物化任何素材。** 本包把现有模板图与缺失的首作内容图分开，不能以“当前可显示”代替来源、许可、审美或发行批准。

## 已核对的事实

- V2 定稿只批准 1440×900 的模板目标与当前 demo 复用方向；它不批准首作角色、场景、CG 或外部分发。见 [V2 定稿](gal-ui-complete-v2.md) 与 [S5 差异单](gal-art-01a-s5-diff.md)。
- 本地 `public/games/gal-template/art/index.json` 有 8 个 `filled` PNG；`filled` 只代表本地文件可解析。所有条目均写明“模板开发已授权、外部分发权未核验”。
- UI 五件只经 `GAL_UI_ART_KEYS` 映射为 LayoutNode 皮肤；内容三件仅由显式 `contentUrls` 和包内 asset key 消费。消费路径可缺失回退，未审图不会被自动上画面。
- 回想缩略图、锁态剪影与 CG 02–06 **没有候选文件、URL、来源或许可证据**；现有 demo 图不得复制填充这些槽位。

## 现有候选逐件清单

| 候选文件 / 稳定 key | 当前真实消费槽 | V2 对位与证据 | 来源 / 许可现状 | Owner 需要确认 |
| --- | --- | --- | --- | --- |
| `textures/ui/dialogue-panel-concept-v1.png` / `tex/gal-dialogue-panel` | `GalUiArt.dialogue` → `gal-story-dialogue-backdrop` 皮肤；动态姓名/台词不烘焙 | V2 对话框；[S5 差异单](gal-art-01a-s5-diff.md)“V2 对话”行 | Codex built-in imagegen、设计交接；模板开发已授权，外部分发未核验 | 保持模板开发使用，还是提供/确认可外部分发的许可依据。 |
| `textures/ui/panel-frame-v1.png` / `tex/gal-system-frame` | `GalUiArt.systemFrame` → 设置、存读档、回想、CG、确认框 | V2 系统框与确认窗；[S5 差异单](gal-art-01a-s5-diff.md)“V2 设置/确认窗/画廊”行 | 同上 | 同上；该图不包含首作剧情内容。 |
| `textures/ui/button-default-v1.png` / `tex/gal-button-default` | `GalUiArt.button` → 菜单、页签、操作与确认 Button 皮肤 | V2 六键菜单、页签、确认按钮；[S6 对齐单](self-check/S6-alignment.md)按钮行仍待整体验收 | 同上 | 同上；文字和状态仍由运行时闭集绘制。 |
| `textures/ui/save-slot-compact-v2.png` / `tex/gal-save-slot` | `GalUiArt.slot` → 4×3 槽卡 `Panel` 皮肤，缩略图/元数据另叠 | V2 存读档；[S5 差异单](gal-art-01a-s5-diff.md)“V2 存读档”行 | 同上 | 同上；原型与实渲均让底部元数据靠近花饰，不能未经原型重定稿任意改构图。 |
| `textures/ui/moonstone-knob-v1.png` / `tex/gal-slider-knob` | `GalUiArt.sliderKnob` → 设置 `Slider.thumbSkin` | V2 设置滑杆；[S5 差异单](gal-art-01a-s5-diff.md)“V2 设置”行 | 同上 | 同上。 |
| `textures/demo/moonlit-backdrop-v2.png` / `tex/gal-demo-backdrop` | 包 `media.backgrounds[*].image`、`ui.titleBackground`、当前场景背景、设置背景、回想夹具可选预览 | V2 首页/对话/设置的演示月夜场景；[S5 差异单](gal-art-01a-s5-diff.md)首页与设置行 | Codex built-in imagegen；明确标为 demo placeholder、无首作故事批准、外部分发未核验 | 是否仅继续作为模板演示；**不得**把它审批为首作正式场景，除非另给剧情与许可裁决。 |
| `textures/demo/demo-portrait-v2.png` / `tex/gal-demo-portrait` | 包 `CharacterSpec.portraits` → NarrativeProjection cast → `gal-story-portrait` | V2 对话演示立绘；[S5 对齐单](self-check/S5-alignment.md)第 1 行 | Codex built-in imagegen；明确标为 demo placeholder、无首作角色批准、外部分发未核验 | 是否仅继续作为模板演示；首作须另审角色与发行范围。 |
| `textures/demo/demo-cg-v2.png` / `tex/gal-demo-cg` | `media.cg[*].image` → 剧情 CG / 已解锁画廊 CG / 当前 CG 存档预览 | V2 演示 CG 与 [剧情 CG 局部复查](review/GAL-ART-01A-story-cg-independent.md) | Codex built-in imagegen；明确标为 demo placeholder、无首作 CG 批准、外部分发未核验 | 是否仅继续作为模板演示；不得扩充为 CG 02–06 的候选。 |

## 缺失候选：不可虚构的审核队列

下列槽位已能消费，但没有待审候选，不能请求“批准全部”：

| 需要的内容 | 已有消费槽 | 当前证据 | Owner 可选决定 |
| --- | --- | --- | --- |
| 回想 01–06 横向缩略图 | `GallerySpec.memories[*].previewImage`；解锁后才投影 | [候选清单](gal-art-01a-media-candidates-2026-10-13.md)仅有规格，无文件/来源 | A. 保持诚实占位，直到逐件候选提交；B. 指定可审候选的来源或授权生成方向。 |
| 锁定态剪影/纹样 | `GallerySpec.memories[*].lockedImage`；仅锁定时投影 | 无文件/来源；不得泄漏未解锁内容 | A. 保持当前暗卡锁态；B. 提供一件可复用、无剧透候选及许可。 |
| CG 02–06 | `MediaCatalog.cg[id].image`；剧情、画廊与存档共用同一已审 key | 无文件/来源；现有 CG 01 demo 不能替代 | A. 保持缺图/不创建条目；B. 对每个 CG 提交剧情对位、候选与许可。 |
| 首作正式背景与角色立绘 | `media.backgrounds[*].image`、`CharacterSpec.portraits` | 仅有 demo 背景/立绘，均已明确非首作 | A. 模板继续使用 demo；B. 首作立项时逐件另审。 |

## 请 Owner 合批回答的精确项

1. 对上表八件本地模板图，确认其范围是“仅模板开发/内部 Web 预览”，还是为每件提供可外部分发/首作使用的来源与许可决定；没有后一项时，发行仍必须拒绝。
2. 对四类缺失候选，分别选“保持诚实占位”或“提交/授权生成可审候选”。若选择后者，请给每类一个具体方向或附件；没有候选就不登记 asset key。
3. 若你希望把任一 demo 内容图升级为首作内容，请逐件明确：目标槽位、剧情关系、审美批准、来源/许可与发行范围。否则它们继续仅作模板夹具。

本包不要求、也不允许 Owner 一次性批准未列出的图片；收到逐件判词后，再由资产专职按索引、来源和许可流程处理，GAL 侧只接已审核 key。
