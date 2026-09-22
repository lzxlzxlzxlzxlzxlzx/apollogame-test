# game104《世界猫牌馆》· 首批打样风格包（猫 / 犬两套）· 描述稿

> **用途**：owner 2026-08-26「猫咪 + 小狗两套设计·出一套描述我先让 claude code 打个样」。
> 本稿 = 两个可直接 paste 进 `scripts/style-packs.json` 的风格包条目 + 依据 + 一处待 owner 拍的决策。
> **依据**：`docs/design/genre-focus-2026-08.md` §八 美术 gap——**A 风格带躲开写实上限**（选文生图最稳的
> 扁平/版画/剪纸带，不追写实精致）+ **把「世界牌戏的地域风格化」变成 feature**（花札猫浮世绘 / 犬×地域民艺）
> + **D 立刻打样对表**（首批 20 张按风格包跑一轮 → S7 评分卡 + owner 对标杆·gap 用眼睛量）。
> **红线**：这是 art-platform（PA 域）配置，本稿是 PUI 出的**描述稿**·非擅改 `style-packs.json`——
> 要落条目 / 出 20 张 S6 台账底稿，说一声即办（或交 claude code 打样）。

---

## 一、为什么是「猫 + 犬」两套、且各绑一种世界牌戏

`genre-focus §七` 差异性②：**收集的是「世界牌戏图鉴」**——每个可收集主题绑一种真实传统牌戏，集一只=解一种玩法+一段文化。
系列量产序（§配方）= **猫 → 犬 → 妖怪**。故两套 = 首作猫主题（首发标尺）+ 犬主题（第二季·验证「换主题=换风格包+换台账」的边际成本）。
风格上**故意拉开**（§八A「风格多样性是图鉴的卖点·同时降低单一风格内的一致性压力」）：

| 主题 | 世界牌戏 | 风格带（都在文生图最稳区） | 一句话调性 |
|---|---|---|---|
| **猫** | 日本**花札**（Hanafuda·12 月花牌） | 浮世绘木版画·平涂硬边 | 雅·留白·和纸金箔 |
| **犬** | 墨西哥**Lotería**（民俗图卡牌戏·**待 owner 确认**·见§四） | 民艺剪纸·塔拉韦拉陶·暖高饱和 | 暖·热闹·节庆花边 |

两带都是**扁平/版画/剪纸**——避开写实天花板；且木版 vs 剪纸在观感上一眼可分，图鉴翻页有「换了一个世界」的爽感。

---

## 二、猫 · 风格包 `hanafuda-ukiyoe`（花札浮世绘）

**锚**：浮世绘木版画里的猫——平涂色块、粗墨边、和纸底纹、花札母题（满月/松/梅/丹顶鹤/短册），金箔点缀，构图留白。
主体是**被画进版画的猫**（招财猫气质但非塑料摆件），不是写实猫。

| 色 | hex | decimal | 角色 |
|---|---|---|---|
| 藍墨底 | `#191b26` | 1645350 | 卡底/夜色（深靛墨） |
| 朱 vermilion | `#d83a2e` | 14170670 | 主强调（花札朱·印章红） |
| 金 gold | `#e0b03a` | 14725178 | 金箔/边饰/稀有度 |
| 生成 washi | `#f4ead2` | 16050898 | 和纸留白/浅底 |
| 松緑 pine | `#3c6b48` | 3959624 | 植物/次强调 |
| 桜 sakura | `#e5a3ad` | 15049645 | 柔粉点缀（梅/樱） |
| 縹 hanada | `#2f5d86` | 3104134 | 冷蓝（水/天/夜） |
| 墨 outline | `#201d1a` | 2104602 | 轮廓墨线 |

```json
"hanafuda-ukiyoe": {
  "packId": "hanafuda-ukiyoe",
  "name": "花札浮世绘",
  "promptZh": "日本浮世绘木版画风格的猫，平涂色块，粗墨轮廓线，和纸纹理底，花札花牌母题（满月松树梅花丹顶鹤短册），金箔点缀，留白构图，雅致，扁平版画上色，非写实",
  "promptEn": "ukiyo-e Japanese woodblock print of a cat, flat color areas, bold sumi ink outlines, washi paper texture background, hanafuda flower-card motifs (full moon, pine, plum blossom, red-crowned crane, tanzaku), gold-leaf accents, negative-space composition, elegant, flat woodblock shading, non-photorealistic",
  "palette": [1645350, 14170670, 14725178, 16050898, 3959624, 15049645, 3104134, 2104602],
  "negative": {
    "zh": "写实照片，3D 渲染，塑料光泽，杂乱背景，喷绘渐变，低对比，现代服饰",
    "en": "photorealistic, 3d render, plastic gloss, cluttered background, airbrushed gradient, low contrast, modern clothing"
  },
  "post": { "paletteSnap": true },
  "params": { "provider": "qwen", "model": "wanx2.1-t2i-turbo", "seed": 1780 }
}
```

---

## 三、犬 · 风格包 `loteria-folk`（墨西哥民艺剪纸）

**锚**：墨西哥 Lotería 图卡 / papel picado 剪纸 / 塔拉韦拉陶彩里的狗——大色块平涂、装饰性花边框、暖高饱和、
黑或深棕粗描边、节庆感。主体是**民艺卡里的狗**（El Perro 那张图卡的气质），欢快、辨识度高。

| 色 | hex | decimal | 角色 |
|---|---|---|---|
| 暖生成底 | `#fbf3e0` | 16511968 | 卡底/浅底（暖奶油） |
| 陶朱 rojo | `#d1462f` | 13714991 | 主强调（陶红） |
| 万寿菊 marigold | `#f2b031` | 15904817 | 金黄（花/边饰/稀有度） |
| 塔拉韦拉蓝 | `#2a9db5` | 2792885 | 冷强调（陶蓝） |
| 仙人掌绿 | `#4f9a52` | 5216850 | 植物/次强调 |
| 品红 magenta | `#d6417f` | 14041471 | 节庆粉点缀 |
| 深棕描边 | `#3a2418` | 3810328 | 轮廓线 |
| 天蓝 sky | `#6fb7d8` | 7321560 | 浅蓝/天空 |

```json
"loteria-folk": {
  "packId": "loteria-folk",
  "name": "墨西哥民艺剪纸",
  "promptZh": "墨西哥民俗图卡 Lotería 与剪纸 papel picado 风格的狗，大色块平涂，装饰性花边框，暖高饱和配色，深棕粗描边，塔拉韦拉陶彩，节庆欢快，扁平民艺上色，非写实",
  "promptEn": "Mexican Lotería folk card and papel picado paper-cut style dog, bold flat color blocks, decorative scalloped border, warm saturated palette, dark brown thick outlines, talavera ceramic colors, festive and cheerful, flat folk-art shading, non-photorealistic",
  "palette": [16511968, 13714991, 15904817, 2792885, 5216850, 14041471, 3810328, 7321560],
  "negative": {
    "zh": "写实照片，3D 渲染，暗沉，噪点，杂乱背景，喷绘渐变，冷灰调",
    "en": "photorealistic, 3d render, dark and muddy, noisy, cluttered background, airbrushed gradient, cold grey tone"
  },
  "post": { "paletteSnap": true },
  "params": { "provider": "qwen", "model": "wanx2.1-t2i-turbo", "seed": 1781 }
}
```

---

## 四、⚖ 一处待 owner 拍（不替你定）

**犬主题绑哪种世界牌戏 = 犬风格包的地域锚**。我按「图鉴要一个真实牌戏 + 风格要跟花札拉开 + 文生图稳」
选了 **Lotería（墨西哥民艺剪纸）**——它本身就是一副传统图卡牌戏（贴「世界牌戏图鉴」骨架）、风格与浮世绘一眼可分、
剪纸/民艺是文生图稳区。**但这是提案**：若你想犬主题走别的地域（如**英式 Whist/斗牛犬×维多利亚版画**、
**苏格兰牧羊犬×凯尔特结绘**、**中式细犬×年画剪纸**），换 promptZh/En + palette 即可，结构不动。**你定 region，我改锚。**

---

## 五、打样对表怎么跑（§八D）

1. 两条目 paste 进 `scripts/style-packs.json`（PA 域·或 claude code 代落）。
2. 首批 **各 10 张**（猫 花札12月里选 10 花 × 招牌猫 / 犬 Lotería 图卡里选 10 × 招牌犬）出 S6 台账 prompt 底稿——
   **说一声我把 20 张的台账底稿（逐卡 prompt + 期望构图）补上**。
3. 工坊点生成 → S7 评分卡（premium 线）+ **owner 亲眼对标杆**（Neko Atsume / Cats & Soup 的「同一画师感」）。
4. gap 由「担心」变「一次打样的实测数」——达标则风格包锁为系列标尺；A/C 不达标才升 §八B（头部 20 只人工精修）。

## 六、给 UI 皮的映射提示（打样过关后接）

风格包定的是**卡面**；UI 壳（牌桌/收集册/HUD）要**同源**才不违和。过关后我（PUI）按 palette 落两套 house `UITheme`：
- 猫 → 藍墨底 `bg` + 朱/金强调 + 和纸 `panelTexture` + `cnbrush`（毛笔 CJK）标题 + `Panel.shadow` 硬边浮空克制用（雅）。
- 犬 → 暖生成底 + 陶朱/万寿菊强调 + 剪纸花边（`shape`/`edge`）+ `cnround`（卡通粗圆黑）+ 厚 `buttonSkins` + `wobble`/`pop` juice（热闹）。

（这一步等打样锁样后再做·此稿先只交卡面风格包描述。）
