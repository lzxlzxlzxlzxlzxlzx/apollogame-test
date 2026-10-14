# S6 坩埚与药剂瓶素材批准记录

2026-10-13，本会话 Owner 对以下两个**明确指名的** S1-P 原型 AI 生成 PNG 候选选择 A：批准正式用于 `game-potion-brewing`，确认其来源与许可可用于本项目、无异议。此批准不扩大到其他素材、共享资产货架、通用再分发许可或 DokiWorld 宿主图片。Owner 同时选择按已定稿的 `31-transparent-success.png` 放大成功结算框；界面施工由游戏程序侧负责。

| 稳定 key | 原型源文件 | 原始 SHA-256 | 正式本地文件 |
|---|---|---|---|
| `potion/cauldron` | `ui-refs/cauldron-three-quarter-v2.png` | `2b20e0bcdef0de4ed4ba927c9ed46e5ed4646f2d70d73fe79380e5c894beceaf` | `public/games/game-potion-brewing/art/textures/cauldron-three-quarter-v2.png` |
| `potion/result-bottle` | `ui-refs/potion-bottle-v1.png` | `5f005d805a795113c985b110e1c360bc7f0093facd1fdba661a4a9cf14fa9aa3` | `public/games/game-potion-brewing/art/textures/potion-bottle-v1.png` |

两图原型引用和 AI 生成属性见 [`prototype-notes.md`](prototype-notes.md)；本地正式登记见 `public/games/game-potion-brewing/art/index.json`。原生成模型、原始提示词、具体生成日期在现有设计档中无可靠记录，因此不填造；登记采取已批准设计稿交接路径，而非伪装为 `scripts/ai-gen.mjs` 的 pending 审核记录。两图均为 PNG RGBA，按 `sprite` / `srgb` 登记。正式资产存于游戏本地库，不并入共享 `assets/index.json`。

台账 `art-ledger.json` 仅在正式游戏存在真实 `skinKey` 消费槽且可替换时推导/登记；不能为了有图先造无槽台账行。
