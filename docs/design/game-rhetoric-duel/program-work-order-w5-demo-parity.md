# 《言弹交锋》W5｜demo 视觉对齐与正式资产工程单

## 0. 阶段裁决

- 基线分支：`capgap/rhetoric-identity-cards`
- 已复查基线：`a7f28048f5f3921ce18e28230557cd0e3b12dfa7`
- 当前阶段：W2、W3、W4 已完成并独立复查；本单只进入 W5，不提前宣布 W6 或发布完成。
- W4 已证明：规则、输入门、演出阶段、重复提交保护、LayoutNode/CanvasRenderer 分层和终局幂等成立。
- W5 目标：把 W4 的“可读骨架”升级为 `demo-reference-bible.md` 规定的第一视觉交付——**桌面画面、卡面结构、真实素材和演出观感与 demo 对齐**。

本单不重做玩法，不改胜负、费用、牌序、意图结算或 presentation transition 语义。除非测试证明 W4 回归，否则 `session.ts`、`blueprint.ts` 和阶段序列只读不改。

“与 demo 一样”指布局、卡片样式、配色、明暗、动作方向和节拍一致；W2 已批准的原创卡名、石七/罗掌柜/姜教习及其文案继续保留。不得为了视觉对齐把生产内容偷偷换回孙癞子。

---

## 1. 对旧计划的修正

旧 W5 计划只强调“正式素材导入”，现在不足。S4 真渲染显示仍有以下明显差异，全部纳入 W5：

1. 左右信息区仍是厚重黑色卡框，demo 是压在场景上的轻浮层与细分隔线。
2. 中央仍是程序化圆光和紫灰剪影，没有真实背景和全高敌人立绘。
3. 手牌是暗紫小牌 + 外置英文资源 ID；demo 是米黄纸牌、费用圆章、图标区、中文名称/来源/效果/快捷键一体卡面。
4. 操作按钮是大号金色手游按钮；demo 是克制的黑底金边竖排命令。
5. UI 暴露 `cold-question`、`ready`、`card-flight` 等内部 ID/phase；正式画面不得显示调试标识。
6. 390×844 证据只有固定 1440×900 舞台缩成中间窄条，并未实现 demo 的窄屏重排。

因此 W5 的实际范围调整为：**资产消费链 + 正式资产 + 桌面 UI 静态重构 + 卡面同构 + play-field 精修 + 响应式能力裁决**。

---

## 2. 施工纪律与文件归属

### 2.1 程序负责

- `games/game-rhetoric-duel/**` 的 render-only 皮肤消费、UI 数据树、play-field 投影和测试。
- `tools/audits/game-rhetoric-duel*.audit.ts` 的审计场景。
- `docs/design/game-rhetoric-duel/self-check/S5-alignment.md` 和截图证据。

### 2.2 asset-manager 负责

- `public/games/game-rhetoric-duel/art/**` 的图像增/改/导入。
- `public/games/game-rhetoric-duel/art/index.json` 的登记、类型/spec、来源、授权和哈希。
- 游戏美术台账的生成与零孤儿核对。

程序不得自行复制 demo 文件进 `public/`，也不得手填缺 provenance 的索引。先把消费槽接通，再交 asset-manager；asset-manager 不改玩法代码。

### 2.3 共享工作树保护

当前工作树另有 `game-dice` 在途修改。开工、提交前都必须 `git status --short`；只暂存本单的 rhetoric/UI 审计/策划证据文件。禁止 stash、覆盖、格式化或提交任何 `game-dice` 文件。

---

## 3. W5-0｜冻结基准与建立对照场景

1. 固定 `gatekeeper-shi`、seed 7 为桌面对齐局；固定首手和各阶段捕获方式，禁止用不同随机局面对比截图。
2. 将以下 demo 文件及 SHA-256 写进 `S5-alignment.md` 的基准段：
   - `CardConflictView.tsx`
   - `card-conflict.css`
   - `useConflictPresentation.ts`
   - `room-outer.png`
   - `npc-sun-laizi.png`
   - 12 个 `cards/*.svg`
3. 保留 S4 alignment 原文，不回写成 W5 结果；新建 S5 对齐单。
4. 建立同视口对照：ApolloGame 桌面基准 1440×900；demo 在同一内容安全区截图。用户原 2432×1151 截图只作观感参考，播放器 chrome 不进入比对。

**出口**：相同玩法快照能稳定捕获 `ready/card-flight/impact/enemy-intent/result`，不会因随机牌序漂移。

---

## 4. W5-1｜打通唯一正式资产消费链

### 4.1 皮肤 key 统一

将 render-only key 统一为游戏命名空间，避免 `skin.card.*` 与索引 alias 两套真相：

| 内容 | key |
| --- | --- |
| 旧巷背景 | `game-rhetoric-duel/background/old-alley` |
| 药铺背景 | `game-rhetoric-duel/background/apothecary` |
| 讲堂背景 | `game-rhetoric-duel/background/lecture-hall` |
| 石七立绘 | `game-rhetoric-duel/opponent/shi` |
| 罗掌柜立绘 | `game-rhetoric-duel/opponent/luo` |
| 姜教习立绘 | `game-rhetoric-duel/opponent/jiang` |
| 十张卡图 | `game-rhetoric-duel/card/<cardId>` |
| 通用牌背 | `game-rhetoric-duel/card/back` |

这些 key 只影响 renderSkin/skinMap，不进入 World、状态 hash、牌序或胜负。`catalogVersion` 仍为 1；宿主仍只引用 `cardId`，不传皮肤 key。

### 4.2 装载方式

1. 复用 `createArtAssets()` + `loadGameArtInto()` 给 `CanvasRenderer` 提供按 key 的 Sprite。
2. 复用 `loadGameArtOverrides('game-rhetoric-duel')` 给 LayoutNode 卡图提供 `{skinKey: URL}`。
3. `mountHost.sceneBgSkin.imageUrl` 必须来自上述 override；没有索引、加载失败或资源缺失时继续显示程序化古铜墨回退。
4. `buildRhetoricDuelUI` 新增只读 render-skin 参数；卡图取 `skinMap[card.skinKey]`，无值才用程序化后备。禁止把 URL 写回 config/session/snapshot。
5. 资产异步就绪后只触发 render 更新，不重新开局、不重建 session、不重播入场。

### 4.3 测试

- 索引存在时：背景、立绘、十张卡按 key 命中。
- 索引不存在、404、坏 JSON、单图失败时：全部或单槽回退且不抛，不永久 busy。
- 换索引同 key 路径后，刷新立即换图；证明消费端未读死路径。
- 加载前后 session snapshot 与 hash 不变。

**出口**：运行时只有一条 `index → skinMap/AssetManager → 消费槽` 路径，硬编码 data URI 仅作为明确回退，不再作为正式卡图。

---

## 5. W5-2｜正式资产批次（由 asset-manager 执行）

### 5.1 第一批：必须先完成的纵切

1. 石七透明全身立绘 1 张：构图占位参照孙癞子 941×1672，肩臂轮廓清楚，人物底部允许出画；不是孙癞子换名。
2. 雨后旧巷背景 1 张：16:9，左侧可承载文字、中央偏右可放人物、右上保留指标负空间；明暗结构参照 demo 演武场。
3. 十张原创言弹卡图：透明 SVG/PNG，单色古铜线描，160×160 安全构图，按 `demo-reference-bible.md §5` 的语义映射制作。
4. 通用牌背 1 张：深墨斜纹、细双金线；不含文字。

第一批经真渲染确认构图后，才进入第二批，避免一次生成六张大图后发现锚位全错。

### 5.2 第二批

- 罗掌柜透明立绘 + 药铺背景。
- 姜教习透明立绘 + 讲堂背景。

### 5.3 资产规格

- 背景：texture，`usage: background`（若 schema 无 background 则按现有合法 usage），`colorSpace: srgb`、`wrap: clamp`。
- 立绘/卡图/牌背：texture，`usage: sprite`、`colorSpace: srgb`、`wrap: clamp`；立绘和图标必须保留真实 alpha。
- 每条索引记录必须有 source、license、provenance.sha256；若直接复用 demo 源资产，必须写 owner 授权依据与 originalPath。
- AI 生成图先进入待审区，批准后才登记；拒绝稿不得进入正式 index。
- 不登记未被上述 key 消费的额外姿态、粒子或装饰图。

**出口**：16 个正式消费槽（3 背景 + 3 立绘 + 10 卡图）和 1 个牌背均有可加载条目；ledger/index 零孤儿。

---

## 6. W5-3｜桌面 UI 静态画面对齐

只改 LayoutNode 数据和现有主题令牌，不写 React、自由 DOM 或 CSS。

### 6.1 左上交锋区

- 位置仍按 demo：左 4%、上 7%、宽 38%、高 50%。
- 去掉当前完整黑框、圆角玻璃卡感；改成 bare 流式组 + 局部透明暗幕，标题下只保留 1px 金色分隔线。
- 标题改为细金色 serif/CJK 标题，禁止当前超大粗刷字占据两行高度。
- 正式模式删除“开发预览”徽记；只允许 `?debug=1` 时出现。
- 意图显示自然语言标题、台词与影响，不再展示 `cold-question` 等内部 ID。
- 日志最多显示最近三条，格式为中文结果摘要；无日志时显示“选择手牌，展开交锋”。

### 6.2 右上敌人区

- 位置：右 3%、上 6%、宽 21%。
- 去掉完整封闭卡框，保留文字阴影/局部暗幕、名称、身份、目标、金色进度横条。
- 名称显示对手名，遭遇标题不得冒充对手名。
- 删除正式画面里的 `ready/card-flight` phase 徽记；phase 只进入 debug/evidence API。

### 6.3 底部牌桌

- 使用从透明到深墨的底部渐变；不再是一整块带金框的大面板。
- 左栏约 13%：压力横条、专注三个圆点、牌库/弃牌统计。
- 中栏：手牌贴底、间距约 10px；5–6 张均不挤压文字。
- 右栏约 14%：小牌库 + “结束回合”“退出”黑底金边竖排按钮。
- `跳过演出` 仅 busy 时出现为次级小按钮，不得比结束回合更醒目。

### 6.4 文案净化

- `progress` → `进度`，`pressure` → `压力`，`focus` → `专注`。
- 正负号使用中文可读格式：`进度 +3，压力 −1`。
- 不得在正式 UI 显示 cardId、intentId、phase、资源内部 ID 或调试英文。

**出口**：不加载正式图片时，几何和信息层级也已接近 demo；正式图片只替换内容，不负责挽救布局。

---

## 7. W5-4｜卡面一比一同构

当前“暗紫 PlayingCard + 外置三行 Label”必须替换。可用 LayoutNode 的 `Panel + Image/PlayingCard art + Label` 闭集组合，不申请自由卡牌 DOM。

每张牌必须在同一纸牌边界内包含：

1. 左上 23×23 费用圆章；
2. 上部约 33% 的透明图标区与底分隔线；
3. 中文卡名；
4. 来源行：v1 所有预设目录卡统一显示“言弹”，不伪造能力/证据条件；
5. 中文效果摘要；
6. 卡面文案；
7. 右下 `1–6` 快捷键角标。

视觉要求：

- 纸面为米黄 `light` 方向，双古铜细框、5px 小圆角、外投影 + 内旧纸晕染。
- hover 只上移约 3px；不做夸张翻面或 3D 放大。
- 不可用牌保持完整可读，使用降饱和/暗化并显示“专注不足”等原因；不能只灰掉且无说明。
- 打出后原位置隐藏，其他牌正确收拢；飞行投影必须使用同一张卡的图标、费用、名称和效果，不再只显示一个大汉字。
- 牌库小牌背使用正式牌背 key；加载失败回退斜纹程序牌背。

增加卡面结构测试，逐张断言：费用、名称、来源、中文效果、文案、图 key、快捷键、禁用原因齐全；禁止 cardId 特判。

**出口**：S4 对齐单第 20 条转为 ✅，十张卡逐张截图核对无裁切、无英文内部字段。

---

## 8. W5-5｜play-field 与演出观感精修

### 8.1 背景与人物

- 真背景 cover 全屏并叠 demo 同构的左暗幕、径向暗角与底部压暗；不得让背景抢过文字。
- 真立绘锚在画面约 41%–74% 区间，高度约 93% 场高，保留肩臂轮廓；不得与右上指标列相交。
- Sprite 加载成功时隐藏 `opponent-head/body/mark/sash/haze` 等几何占位；失败时才显示完整剪影回退。禁止真图和紫灰人体同时叠加。
- 立绘保持原色或轻微环境统一，不使用当前紫色实心 tint 盖住人物。

### 8.2 飞牌与反馈

- 飞牌中心落点约舞台 `(38%,31%)`，scale 1.12、rotate −5°；与手牌卡面内容一致。
- 进度飘字使用金色，压力使用危险色；数值来自 `resourceDelta`，不能从文案解析。
- 敌人行动/受击/回应继续沿用 W4 已复查阶段，只调整视觉幅度到 demo：左移 16px、右移 9px/轻旋、上移 3px。
- 删除无来源的大面积常驻圆光；若需环境分离，只保留低 alpha 径向暗幕。
- 粒子只能作为轻微环境点缀，不能用 sparkle 覆盖整屏来冒充质感。

### 8.3 终局

- 最后冲击播完后，左下出现约 38% 宽的结果区；保留背景和人物。
- 结果面板改为 demo 的细金线、标题、说明、唯一主出口，不显示与本游戏无关的重型通用奖杯/彩纸。
- 内部出口仍为“返回游戏库”；不得添加奖励、掉落或剧情继续逻辑。

**出口**：正式图片加载成功和失败两条路径的阶段序列、规则快照完全一致。

---

## 9. W5-6｜共享 UI 两项接缝

### 9.1 已裁决：live region

`W4-UI-ARIA-001` 已由 owner 选择路线 A。交 PUI 为 Label 增加闭集 `live: 'polite' | 'assertive'`，完成共享渲染/校验测试后，本游戏只在 `rhetoric-semantic-live` 消费 `polite`。施工人和复查人不得相同。

### 9.2 待 owner 裁决：响应式布局

实查：

- `mountHost` 只支持固定 `fieldW × fieldH` 后按 `min(containerW/fieldW, containerH/fieldH)` 等比缩放。
- LayoutNode 只有 `maxWidth` 封顶，没有 breakpoint、viewport/aspect 条件或 layout variant。
- `ui-find 响应式` 无命中；390×844 真截图证明现有能力不能重排五区和底部手牌。

#### 路线 A｜PUI 增加声明式布局 variant（推荐）

由 PUI 增加一个闭集、通用的响应式选择能力，例如根树声明 `desktop/portrait` 两个 LayoutNode variant，由 mount/render 层按受控 breakpoint/aspect 选择；游戏只提供两棵纯数据树，不读 DOM、不写 CSS。

- 代价：修改共享 UI 类型、校验器、渲染/挂载与测试，需要 PUI 施工和独立复查。
- 影响面：字段可选，既有游戏逐字保持原行为。
- 通用性：所有横屏游戏嵌入手机竖屏都可复用。
- 选错代价：设计过宽会变成自由媒体查询逃生，因此只允许闭集 profile/条件和纯 LayoutNode variant。

#### 路线 B｜本游戏 render-only viewport 分支例外

允许 `game-rhetoric-duel.ts` 用 ResizeObserver/viewport aspect 选择 `buildDesktopUI()` 或 `buildPortraitUI()`，两棵树仍是 LayoutNode，但 breakpoint 逻辑留在游戏 TS。

- 代价：实现较快，但需登记游戏层例外债务和专门测试。
- 影响面：只改本游戏；其他固定舞台游戏继续各写一遍。
- 通用性：无。
- 选错代价：响应式逻辑会在游戏目录复制，未来仍需迁回 PUI。

推荐路线 A。owner 裁决前，程序先完成 W5 桌面、资产和卡面，不得自行走 B，也不得用自由 CSS/DOM 偷做移动端。

---

## 10. W5-7｜验证、对齐与独立复查

### 10.1 自动测试

必须新增或更新：

- 资产 index parse/register/skinMap 优先/失败回退测试；
- 十张卡面字段和无 cardId 特判测试；
- 正式模式不出现内部 ID/phase/开发徽记测试；
- 真图加载不改变 snapshot/hash 测试；
- Sprite 命中时几何 fallback 隐藏、图片失败时 fallback 恢复测试；
- 原 38 项游戏测试全部继续通过。

### 10.2 真渲染证据

按 `demo-reference-bible.md` 重新捕获 D01–D14。W5 至少必须完成桌面 D01–D14；移动 M01–M03 取决于 W5-6 路线裁决，不得拿固定舞台缩略图冒充响应式通过。

另外保存三组对照：

1. demo vs ApolloGame ready 同视口并排图；
2. 50% 透明叠图；
3. 差分图，标出仍未对齐区域。

`S5-alignment.md` 每项只有三种结论：`✅`、`❌`、`⚠ owner 已裁决去向`。桌面 demo 对齐相关的 `❌` 必须归零；素材缺失不得降为 ⚠。

### 10.3 门禁

依次执行并记录退出码：

```text
game-rhetoric-duel 定向测试
LayoutNode validate 测试
TypeScript noEmit
生产构建
game-rhetoric-duel UI audit（桌面深色）
资产 index / ledger audit --strict
game-skill-audit game-rhetoric-duel
scoped-gate --run
align-check / align-count
```

必须阅读 stderr；绿灯但出现 topology、contrast、fallback 或孤儿告警仍需处置。

### 10.4 独立复查

复查人必须独立复跑，并至少完成三次带锚点撤修验红：

1. 撤掉 `skinMap[skinKey]` 优先，确认“换图即生效”测试变红；
2. 撤掉一张卡的来源/快捷键行，确认卡面完整性测试变红；
3. 让真图与 fallback 同时可见，确认 play-field 可见性测试或截图断言变红。

恢复后三项重新通过，隔离复查树干净，才能判 W5 PASS。

---

## 11. 提交拆分与汇报格式

建议拆成可独立审查的提交：

1. `refactor(rhetoric-duel): wire namespaced render skins`
2. `feat(rhetoric-duel): align desktop duel UI and card faces`
3. `assets(rhetoric-duel): add approved duel art and ledger`
4. `feat(rhetoric-duel): align play-field art and terminal presentation`
5. PUI 独立提交：live region；响应式 variant 仅在 owner 选 A 后另单施工。
6. `test(rhetoric-duel): add W5 visual and asset evidence`

每次提交只暂存本单文件。推送前按仓库规则 fetch/rebase；若共享工作树有他人在途文件阻碍 rebase，禁止 stash，改用干净 worktree/clone 完成整合和门禁。

汇报必须包含：分支、SHA、资产索引条目数、真实加载截图、D01–D14 证据目录、各命令退出码、stderr 告警裁决和独立复查结论。

---

## 12. W5 出口与禁止事项

### W5 PASS 必须同时满足

- 桌面版在真实背景/立绘/十张卡图下达到 demo 的五区构图和卡面结构；
- 三名敌人和三张背景全部通过正式 key 可替换；
- 真图/失败回退均可完成对局且不改变规则状态；
- 正式画面零内部 ID、零调试 phase、零英文资源名；
- 资产 index/ledger 零孤儿；UI audit、game audit、scoped gate 和桌面对齐检查均为 0；
- 独立复查 PASS。

### 未完成以下任一项不得进入 W6

- 卡片仍为暗紫占位或外置英文效果；
- 中央仍只有几何剪影；
- 背景仍只有程序纹样；
- 正式资产没有 provenance/台账；
- demo 对比仅凭肉眼、没有叠图/差分；
- 以 Glow/粒子遮掩空白素材；
- 为赶移动端自行写 React、DOM、CSS media query 或游戏层未裁决 breakpoint。
