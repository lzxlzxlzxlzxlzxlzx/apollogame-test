# S6 原型素材接入：资产导入自检

日期：2026-10-13。施工主体：资产专员 `/root/s6_asset_import`。状态：**资产导入自检 PASS；8 PNG 与 7 mask 已登记。运行时接线、真浏览器适配与独立复查未包含在本结论内，非 S6 完成。**

## 授权与范围

Owner 本轮明确回复： “确认使用原型这套素材，我会在控制台通过 S5”。这确认了问题中所指的原型背景与七件 PNG、来源及使用许可。不得把这句回复代填为平台逐行 `approved` 或 Owner 人门。S5 人门由主 agent 核对流程板；本报告不操作流程板。

本单只负责 `library/game-clue-investigation/art/**`、本报告与 `self-check/s6-import-assets.mjs` 作者态导入脚本；不改 manifest、共享代码、原型或其他施工者文件。

## 已完整阅读与判断

已完整阅读：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/design/data-driven-manifesto.md`、`docs/playbooks/index.md`、`game-production.md`、`game-requests.md`、`assets.md`、`art-pipeline.md`、`testing.md`；`.agents/skills/resource-manager/SKILL.md`、`module-art/SKILL.md`、`module-assets/SKILL.md`；`docs/design/asset-pipeline-review.md`、`asset-manifest-and-manager.md`、`art-pipeline-asbuilt-2026-08.md`、`art-replacement-workflow.md`、`docs/workflow/finish/P3D-asset-layer-handoff.md` 与本游戏 `prototype-notes.md`。任务命中资产、美术与测试生产线，使用 resource-manager 的游戏本地 AssetIndex 路径，不加入共享货架。

判断：接受复用 Owner 已确认的定稿图；不需要重新生成美术或游戏专属加载器。真实 PNG 与预烘焙 mask 应同源、同尺寸，阈值沿用原型 150。但存在下列前置限制，不能直接登记后宣称已能运行。

## 八个精确来源与字节核对

全部源文件位于 `docs/design/game-clue-investigation/ui-refs/`。用现有 `scripts/asset-matte.mjs::decodePng` 只读解码；实心计数定义为 alpha ≥ 150，透明计数定义为 alpha = 0。未重写任何 PNG。

| 文件 | 尺寸 | 字节 | 实心像素 | 全透明像素 | 候选 texture key（未登记） |
|---|---:|---:|---:|---:|---|
| rainy-archive-background-ai-v1.png | 1586×992 | 2210521 | 1573312 | 0 | gci/scene/rainy-archive |
| damaged-window-latch-ai-v1.png | 1536×1024 | 1732445 | 386687 | 1166323 | gci/object/lock |
| archive-bookcase-ai-v1.png | 1024×1536 | 2616952 | 1043404 | 492891 | gci/object/shelf |
| stopped-clock-ai-v1.png | 1254×1254 | 2163972 | 979491 | 579706 | gci/object/clock |
| cold-teacup-ai-v1.png | 1374×1145 | 1344097 | 766583 | 790450 | gci/object/cup |
| worn-rug-ai-v1.png | 1536×1024 | 3590216 | 1214271 | 320273 | gci/object/rug |
| wet-footprints-ai-v1.png | 1536×1024 | 1535707 | 252930 | 1269034 | gci/object/prints |
| burned-letter-ai-v1.png | 1207×1303 | 2128430 | 962126 | 587294 | gci/object/letter |

SHA-256（按上表顺序）：

```text
rainy-archive-background-ai-v1.png 88c458c0a7d9c6e897f72afae7cac903cb104fbcc74c80e8750a11c4983849b7
damaged-window-latch-ai-v1.png c25d535b25bfd4a51423fd9cdbe14d3194d78326c3452e85403f5e368e85cb41
archive-bookcase-ai-v1.png 1bd7da0a14bb4ffc51bc4b7a461fbd5bb9bb747dc094bc382fc584bc508736ed
stopped-clock-ai-v1.png b18db9040b02cbdc0ff06f6a7a418777031b532994d494e739f0629203f51d3f
cold-teacup-ai-v1.png b2adb1609b7528eaa8d51caed661259e542b7056f3af8d4ca0c9725a44e01f76
worn-rug-ai-v1.png c854535cb62bb5a97c1ebb09308c27cc21da8ff03e552676ca0fa503df7ad778
wet-footprints-ai-v1.png a93399b9904fe678781e0a592b3dca86c61ef08081f74ec13566321ef55c0808
burned-letter-ai-v1.png 2bcffc67794f8a46a39a1055b02a4582058f5b421197e45e35e841eec865e7c3
```

## 已核对的现有路径与限制

- `scripts/art-paths.mjs::artRoot`：`library/<slug>/` 存在时，目标为 `library/<slug>/art/`；服务 URL 仍为 `/games/<slug>/art/**`。不应另建 public 侧第二份索引。
- `src/assets/import/hit-mask.ts::bakeHitMaskFromPng` 调现有 PNG 解码器，再按 alpha ≥ threshold 生成二值行；`bakeHitMaskFromRgba` 与 `src/engine/protocol/hit-mask.ts::parseHitMaskSpec` 均限制 `width * height <= 1_000_000`、单边 ≤4096。
- 七件源图均约 157 万像素，全部超过 100 万像素上限。不能把原尺寸直接交给 bake，也不能绕过校验、随意把较小 mask 配到原尺寸 texture。
- `src/assets/asset-index.ts::parseAssetIndex` 对 hit-mask 要求 `sourceTextureKey` 指向同索引内 filled texture，且 texture 的 `spec.width/height` 与 mask 精确相等。mask 无 path，只存规则数据。
- 候选 mask key 为 `gci/mask/{lock,shelf,clock,cup,rug,prints,letter}`；候选 spec 为既有闭集 `{version:1,width,height,threshold:150,sourceTextureKey,rows}`。贴图用途为 `sprite`、色彩空间 `srgb`、wrap `clamp`。
- `scripts/art-replace.mjs::resizeImageTo` 是现成面积平均降采样工具，可用于后续把源图归一化到预算内，再从**同一最终 PNG**烘焙 mask。半尺寸是待定方案，不是已实施裁决；原图继续留在设计参考目录。背景无需 mask。
- 原型 CSS 的 `.prop-art` 使用 contain，背景 cover；实际 CSS 物件位置应以 `prototype.dc.html` 为准，不能仅抄 notes 中历史归一化表。原型 alpha 阈值为 `ALPHA_THRESHOLD=150`。
- `scripts/ledger-audit.mjs::auditGame` 当前只找 `public/games/<slug>/art/art-ledger.json`，未使用 artRoot；卡带本地 ledger 后续需显式核对，不能把 CLI 的 missing/跳过当作零孤儿通过。

## 来源记录边界

`prototype-notes.md` 与原型 alt 明确标注“原创 AI 生成”，本次 Owner 确认使用此套图。此次核查的文件未提供原始模型名或原始生成 prompt，故后续 provenance 应如实记录 `design-handoff:prototype.dc.html`、精确源路径、源 SHA-256、实际变换及本次授权，不编造 model/prompt，也不把自产误标 CC0。台账审批状态仍由合法人审处理。

## 前置限制的后续处理

1. 资产专员角色必读清单原引用的 `docs/design/asset-library.md` 曾缺失；主 agent 已补明确现行规范导航，随后本资产专员完整读取。导航引用的 assets/art-pipeline/asbuilt/replacement 四份现行文档已完整读取，未引入新审批豁免或新契约。缺失参考阻塞解除。
2. Owner 后续选择 A 通用资产桥，主 agent 派引擎程序负责共享接缝；游戏接线由主 agent 负责。资产专员不改共享加载器。
3. 主 agent 确认七件生产副本半尺寸归一化；奇数维度四舍五入，最大比例偏差来自 cup，约 0.0873%，不改变逻辑摆放。实际生产图与 mask 使用同一最终像素尺寸。

## 实际导入与验证

- 零写入计划核对源 SHA、目标路径边界、所有祖先非 symlink、同名冲突、15 条索引严格 parse 后，再执行 `--apply`。写入使用 `wx`，不覆盖现有文件；异常只回滚本次创建的精确文件。`--verify` 重读全部生产字节与严格索引通过。
- 背景保持原始字节；七物件使用现有 `resizeImageTo`，不生成新画面。从最终 PNG 经 `bakeHitMaskFromPng` 烘焙 threshold=150。
- 最终 keys 已统一为 `game-clue-investigation/scene/background`、`game-clue-investigation/object/<id>`、`game-clue-investigation/mask/<id>`；上方 gci 候选名未登记、未消费。
- 全部 **2,753,452** 个 mask 像素逐一与最终 PNG 的 alpha ≥ 150 比较一致；7/7 均包含实心和透明反例。每张图 `(0,0)` 为负样本。
- 正式 manifest 建立真实消费槽后，已用既有 `deriveRequirements` / `mergeLedger` 推导并落 `library/game-clue-investigation/art/art-ledger.json`：8 行、8 个真实 Sprite key，按生产 index 补录尺寸、servedPath、localId 与原样 provenance；全部 `filled`，0 行 `approved`。编号 art-01…08 依序为 clock/cup/letter/lock/prints/rug/shelf/background。未伪造原始 model/prompt 或 CC0 许可。
- lock/prints/letter 的 UI 证物复用相同 key，不重复建行。现有推导器不扫描 UI `asset:` 引用，故 UI 引用闭包由游戏定向测试负责，本资产报告不冒称通用推导器已支持它。
- `--verify` 现包含真实 artRoot 台账的 `classifyRow`、`missingProvenanceRows`、Sprite 槽/index/文件绑定与 `mergeLedger` 保号检查。实际退出 0：`rows=8,uniqueKeys=8,orphans=0,missingProvenance=0,fileBindings=8,stableNumbers=true,approvedRows=0`。通用 CLI `auditGame` 仍 `missing:true`，已明确排除该结果，不当作通过证据。

| id | 生产尺寸 | 首个正样本 x,y | 实心/非实心像素 | 生产 SHA-256 |
|---|---|---|---|---|
| lock | 768×512 | 368,88 | 96603 / 296613 | 7c5e4019bcebd2a94ac0f97ca842d1b60d041752d50cf2ac9e6983327ebacf8c |
| shelf | 512×768 | 253,4 | 260328 / 132888 | c7ec3d05fd7d2ed0e3075f1a5a977685e6e7b8fd26ad47b28fb2c4bbdf5b6521 |
| clock | 627×627 | 300,29 | 244837 / 148292 | 5e1d2e52d0535ce9bf2f30492d657af1a605455d64481ad4f9f604eb409f999e |
| cup | 687×573 | 334,54 | 191614 / 202037 | be07627617a1b27c588c865bbd8dd00b9d47bbdecce870e45594ed20564c34f1 |
| rug | 768×512 | 347,6 | 303537 / 89679 | 9e6643a4c3e354fb63fa96415b2b39bdfd931fb89eefde187b6ededc2847a05b |
| prints | 768×512 | 691,18 | 63075 / 330141 | 4f5fb699c959403e26e15ae0cc1db573411b1f1acab593da10afb8b62e8004e6 |
| letter | 604×652 | 285,7 | 240479 / 153329 | 7281cf187ee32e67b0d532c489ddd724e1a69ec8c0a7c337e654473d38605b40 |

复现命令（仓库根）：

```powershell
npx vite-node docs/design/game-clue-investigation/self-check/s6-import-assets.mjs
npx vite-node docs/design/game-clue-investigation/self-check/s6-import-assets.mjs --apply
npx vite-node docs/design/game-clue-investigation/self-check/s6-import-assets.mjs --verify
npx vitest run src/assets/import/hit-mask.test.ts src/assets/asset-index.test.ts
```

实际 plan/apply/verify 均退出 0；两份测试 **38/38 PASS**、退出 0、无告警。首次沙箱内 Vite realpath EPERM（测试未执行）如实保留；经本地命令权限审批后重跑通过，不作为产品失败或假绿。未运行整库 tsc/build，本报告不宣称全库全绿；主 agent 负责合并接线后的门禁与异人复查。

未启动服务，未调用图片生成或远程接口，未执行远程 Git。资产层一致性通过不证明正式游戏命中适配已通过；浏览器的 contain/cover、视口缩放、收录后保持图片与透明洞穿透仍需独立验收。

## 作者态风格说明补录

2026-10-13 经主 agent 确认，仅以 apply_patch 增加台账头 `artStyle.stylePrompt`，不填新 `packId`。文案依据 `brief.md`「初步视觉方向」与 S1-P-01 定稿记录：原创档案调查/现场取证、雨夜书房/档案室、深色现场、亮色描边、纸质档案、高对比证物。此字段是**当前作者风格说明，不是原生成 prompt**；原始生成记录仍明确未保留，不更改 provenance、不代替审美复核。

前后冻结核对：`rows` 起至文件尾原始字节 SHA-256 均为 `35bb6cee481ca393cfe1eaaf5613730061802807f6fcfa361491809baa07a44d`；`index.json` 均为 `90210578a6d5c9ee0292761c5ec57991effb5b27196085fae677da41b0338cdb`；8 张 PNG 的全部 SHA-256 与上表相同。没有重排或改写 rows。

实际命令 `node scripts/game-pipeline.mjs board game-clue-investigation` 退出 0，S6 显示 **台账 8 行 · 锚✓ · 写回 8 · 复核 0**，仍有 GCI-S6-UI-02 缺口锁，未宣称 S6 绿。再次执行上列 `s6-import-assets.mjs --verify` 退出 0：8 行、0 孤儿、0 缺来源、8 绑定、保号通过、approved 0；15 条严格索引及 2,753,452 mask 像素仍一致。
