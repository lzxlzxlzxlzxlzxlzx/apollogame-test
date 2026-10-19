# 角色仓库手册（Character Library）

> 做 X：维护 `characters/<id>/` 作者侧角色档案。引擎按目录顺序生成列表和百科页。
> 机读真相：`src/services/character-library/catalog.ts` 的 `inspectCharacter`。展示页只消费它的结果。
> 层级：工作台只读页。不进模拟，不进 `assets/index.json`，不进平台角色卡桥（`character-card.md`）。
> AI：编辑角色档案前完整读本文件。工坊系统词只提醒不要在游戏 manifest 里改这里。

## ① 目录即排版

`catalog.json` 的 `entries` 从上到下，就是详情页角色区从上到下。第一条在最上面。
`name` 只用于列表卡片和返回栏，不插入正文。引擎不翻译标题，不按文件名重排。
`costumes` 是可选数组。每一套时装有 `id`、`name` 和自己的 `entries`，显示在同一角色页里，不另开角色卡片。时装 `id` 与角色文件夹名同一套写法。

| 字段 | 页面上 |
|---|---|
| `title` | 块标题，原文 |
| `file` 或 `text` | 标题下面的内容。两条只能有一条 |
| `description` | 内容下方的说明。图片时就是图注 |

`file` 的扩展名决定画法，不另填种类：

- 图片：`png` `jpg` `jpeg` `webp` `gif`
- 文本文件：`txt` `md`（UTF-8，保留换行）
- 其他扩展名：整份角色拒绝打开

## ② 文件怎么写

文件夹名就是角色 `id`，只许小写英文、数字，以及用单个 `-` 分隔（`mechanic`）。
根上必须有 `name`、`group`、`entries`。`costumes` 和 `relations` 可选。`group` 是 `characters/groups.json` 里的分组 id，每个角色必须属于一个分组。关系是 `{ "to": "另一个角色id", "relation": "关系名" }`，只登记一次；对方页面会看到同一条三元组。不能指向自己，也不能指向仓库里没有的角色。

`name`、`title`、`description` 去掉首尾空白后必须非空。`text` 去掉首尾空白后也必须非空。`entries` 至少一条。
`file` 是本文件夹内的相对路径，用 `/`，不能以 `/` 开头，不能含 `..`、反斜杠或空段。同一个 `file` 只能登记一次。`title` 可以重复。

除 `catalog.json` 外，该文件夹里每个文件（含子目录）都必须被恰好一条 `file` 登记。未登记的文件、或指向不存在的文件，整份角色打不开。文本文件正文去掉空白后为空，同样拒绝。

仓库根 `characters/` 放 `groups.json` 和各角色文件夹。角色资源不要放在根上。分组表只登记 `{ "id", "name" }`，id 用小写连字符。新建游戏分组时先加表，再把角色的 `group` 指过去。

## ③ 列表页

卡片按分组表的顺序分栏，栏名是分组的 `name`。卡片标题 = 角色 `name`。封面 = 第一套时装的第一张图；没有时装图时，用角色 `entries` 里的第一张图。摘要 = 角色区第一条行内 `text`；没有行内正文时，用角色区第一条的 `description`。
详情页在角色区之后显示关系网：`角色名 — 关系 — 角色名`。点另一个角色就打开那一页。
校验失败的角色进「打不开」区并显示原因，不渲染百科正文。

## ④ AI 编辑步骤

1. 先读本文件，再改 `characters/`。
2. 新角色：先确认 `groups.json` 里有目标分组，再建 `characters/<id>/`，写入 `group`。交工时文件和目录必须对齐。
3. 登记：在 `entries` 加一条。`title` 写页面栏目标题，`description` 写给读者看的说明。数组位置就是页面位置。
4. 改正文：改 `text`，或改已登记的 `.txt` / `.md`。不要另存一份未登记的稿。
5. 换图：覆盖原路径，或改 `file` 并删掉不再登记的旧文件。
6. 改显示名只改 `name`。不要用改文件夹名来改显示名；改 `id` 等于换一个角色。
7. 改完用 `inspectCharacter` 的测试确认。未登记文件、悬空路径、空说明都不能过。

不要把角色图写进 `assets/index.json`、游戏 `art:` 槽或 manifest，除非那个游戏已经单独做了投影。不要手写第二份页面布局。不要把未获授权的商业角色成图当作可出货资产放进仓库。

## ⑤ 示例

`characters/mechanic/catalog.json` 里，角色区写机械师本人，`costumes` 里「锁芯」的 `entries` 第一张是 `suo-xin/poster.jpg`。详情页先排角色区，再在同一页列出时装；点中「锁芯」后，才按该套 `entries` 从上到下显示海报。
