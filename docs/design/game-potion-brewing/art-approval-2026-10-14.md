# S6 原型原创材料图批准记录

2026-10-14，Owner 在本会话的 A/B 裁决中选择 A：批准将已定稿 S1-P-06 `prototype.dc.html` 内的五个原创内联 SVG 材料图用作 `game-potion-brewing` 正式美术候选，来源为本项目原型、仅限本项目使用。此裁决还允许以现有闭集 UI 能力制作卷轴卷边和木架横档；它不批准其他项目复用，也不等同于美术平台逐行“☑ 复核通过”。

原型文件 SHA-256：`899e7d57c8e69971c25aff204fa89f620339950cde9940bb86bc2353d1ed0894`。以下五图逐个从原型的 `icons` 对象抽取，仅增加独立 SVG 文件所需的 `xmlns`、`width` 和 `height`；路径绘图内容保持不变。

| 稳定 key | 原型符号 | 本地文件 |
|---|---|---|
| `potion/ingredient/moon-herb` | `moon` | `public/games/game-potion-brewing/art/textures/ingredient-moon-herb.svg` |
| `potion/ingredient/silver-leaf` | `silver` | `public/games/game-potion-brewing/art/textures/ingredient-silver-leaf.svg` |
| `potion/ingredient/red-berry` | `red` | `public/games/game-potion-brewing/art/textures/ingredient-red-berry.svg` |
| `potion/ingredient/pepper-seed` | `pepper` | `public/games/game-potion-brewing/art/textures/ingredient-pepper-seed.svg` |
| `potion/ingredient/dawn-petal` | `dawn` | `public/games/game-potion-brewing/art/textures/ingredient-dawn-petal.svg` |

五项均按 `texture`、`sprite`、`srgb` 登记进游戏本地 AssetIndex，并有 `ingredient:<id>` 的 Sprite 真实消费槽。台账行 `art-03` 至 `art-07` 保持 `filled`，待 Owner 在美术平台逐行复核，agent 不代签。
