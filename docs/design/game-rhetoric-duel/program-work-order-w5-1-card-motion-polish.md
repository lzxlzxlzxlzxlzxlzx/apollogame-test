# 《言弹交锋》W5.1｜文字、卡面与卡牌动效精修施工单

> 施工对象：`game-rhetoric-duel` 现有引擎内版本  
> 关卡归属：W5 视觉表现的纠偏与精修，不进入 W6，不改玩法规则  
> 对齐基准：`doki-design-base` 中 `CardConflictView.tsx`、`card-conflict.css`、`useConflictPresentation.ts` 及 `demo-reference-bible.md`  
> Owner 反馈：文本与卡面观感仍弱；出牌、抽牌动画不够流畅。

## 0. 施工结论与边界

本轮接受施工，但必须按“现有能力重组优先”执行。当前问题首先是实现错误与视觉规格不足，不是玩法缺口：

1. 抽牌动画使用 `index * 90ms + 420ms`，第五张最晚结束于 780ms；而 `deal-opening-hand` / `deal-new-cards` 只有 42 帧，约 700ms，阶段切换会截断末张动画。
2. 出牌飞行被拆为 `card-lift` 与 `card-flight` 两段；两段 tween 都配置为 18 帧，但阶段分别只有 8 帧与 11 帧，永远无法自然结束。
3. 第二段飞行会把卡牌重新放到固定 `x=590`，且起点不来自玩家实际点击的卡位，因此会产生跳点。
4. UI 卡牌与 play-field 飞行卡牌使用两套视觉表达，卡面内容和尺寸不一致；当前还可能同时出现 Canvas 卡牌与 LayoutNode 图标，形成重复视觉。
5. 卡面信息层级过密，正文、来源、风味、禁用原因均挤在窄卡内；核心效果和可操作性不够醒目。

本轮只允许修改表现与表现控制：

- 允许：卡面布局、字体层级、颜色/间距、纯表现投影、动画阶段及时长、渲染身份映射、表现测试与对齐证据。
- 禁止：改卡牌数值、效果语义、抽牌规则、敌人决策、胜负条件、SDK 输入输出、随机序列、simulation snapshot/hash。
- 禁止：新增 `cardId` 特判、裸 `Math.random`、自由 DOM/CSS、React 屏、手写 Canvas 绘制、动画回调写世界。
- 动画只表现已提交结果；跳过、失焦恢复、reduced-motion 后必须落到同一个确定性终态。
- 首轮不新增图片资产。只有在卡面排版完成后仍存在明确资产缺口，才另开美术/资产单。

## 1. 施工文件与冻结区

主要施工面：

- `games/game-rhetoric-duel/ui.ts`
- `games/game-rhetoric-duel/theme.ts`
- `games/game-rhetoric-duel/play-field.ts`
- `games/game-rhetoric-duel/presentation-controller.ts`
- `games/game-rhetoric-duel/presentation-catalog.ts`
- `games/game-rhetoric-duel/game-rhetoric-duel.ts`（只允许表现阶段帧数）
- `games/game-rhetoric-duel/*.test.ts`
- `docs/design/game-rhetoric-duel/self-check/**`
- `docs/design/game-rhetoric-duel/review/**`

冻结区：

- `session.ts`、卡表、敌人规则表、遭遇 fixture、SDK/宿主契约不得修改。
- `src/ui/**`、`ui-audit`、共享渲染器属于 PUI/共享域，本轮不得顺手修改。
- 若发现现有能力确实无法表达，按第 8 节缺口闸处理，不得游戏层手写逃生。

建议新增一个纯表现文件：

- `games/game-rhetoric-duel/card-presentation.ts`

它只保存卡面尺寸、排版 token、卡牌展示文案投影、手牌槽位几何与动画时序纯函数；不得成为第二套规则解释器。

## 2. W5.1-0｜固化基线与复现证据

在改代码前，以固定遭遇 `shi`、固定 seed `7`、1440×900 视口记录以下状态：

1. 开局 ready 全屏。
2. 开局抽牌：第 1 张、第 3 张、第 5 张。
3. 从左至右第 1、第 3、第 5 个卡位各出牌一次。
4. 回合末补牌：首张与末张。
5. 可用卡、压力不足禁用卡、专注不足禁用卡。
6. reduced-motion 开启时的同一流程。

证据写入：

`docs/design/game-rhetoric-duel/self-check/w5-1-shots/baseline/`

同时在 `W5.1-baseline.md` 记录：

- 每张牌的实际矩形；
- 牌堆锚点与命中目标锚点；
- 各阶段起止帧；
- 动画被阶段截断的位置；
- Canvas 飞牌与 UI 重复元素是否同时出现。

不得覆盖既有 W5 截图。

## 3. W5.1-1｜文本层级与信息减负

### 3.1 桌面端最低可读性

以 1440×900 为验收视口，建立明确层级：

| 内容 | 目标视觉字号 | 规则 |
|---|---:|---|
| 屏幕标题 | 26–30px | 金色、最高层级之一 |
| 敌人姓名 | 30–34px | 不得被副标题抢层级 |
| 当前意图标题 | 20–22px | 与意图正文分层 |
| 目标/意图正文 | 15–17px | 行高至少 1.45 |
| 资源名称与数值 | 14–17px | 数值必须比标签醒目 |
| 按钮文本 | 15–17px | 高对比，不使用弱化灰 |
| 卡牌名称 | 15–16px | 粗体，最多两行 |
| 卡牌效果 | 12–13px | 比来源、风味明显更强 |
| 来源/风味 | 11–12px | 只用于次要信息，不承载操作关键字 |

任何交互关键文本不得小于 12px。禁止用 `xs` 承载卡牌效果、按钮、资源值或当前意图。

### 3.2 信息所有权

- 左侧信息区拥有：回合、规则目标、最近行动/敌人意图。
- 右侧敌人区拥有：姓名、身份副题、进度条、数值。
- 同一句胜利目标不得左右重复全文。右侧如需提示，只保留短标签，不再复述段落。
- “当前意图”只能有一个视觉主位置；日志只能记录已经发生的动作，不能与当前意图竞争。
- 不显示内部 phase、cardId、fixtureId、seed 等调试词。

### 3.3 资源与命令区

- 压力、专注的标签和值分列，数值用金色/白色高对比。
- 命令按钮高度不少于 44px，默认、悬停、按下、禁用四态清楚。
- “结束回合”必须是主按钮；次级命令降层级但仍可读。
- 卡牌禁用原因优先出现在卡牌内固定的禁用带，不用额外一行把卡高继续撑大。

## 4. W5.1-2｜卡面重排

### 4.1 统一卡面规格

创建单一 `RhetoricCardVisualSpec`，UI 手牌与飞行卡牌都从它读取；禁止两份魔数继续漂移。

桌面态建议值：

- 卡宽 136–140px；卡高 238–248px。
- 手牌区域必要时扩至约 900px，但不得压住左侧资源区与右侧命令区。
- 6 张牌时仍必须完整可见；空间不足时由纯函数统一降宽，最小不得低于 124px。
- 卡间距 8–12px。
- 边框保持 demo 的双线/金墨语法，但通过现有 `Panel`、主题 token 表达。
- 图像区占卡高 36%–40%，不得只剩窄条图标。
- 费用徽章 24–28px，热键徽章 18–22px。

卡内只保留四个信息带：

1. 费用与热键；
2. 卡图；
3. 名称与来源；
4. 核心效果与最多两行风味。

禁用原因采用覆盖式底部带或替换风味区，不再新增第五、六段正文。

### 4.2 文案投影

卡表原始内容不变，允许增加纯展示投影，把机械文案压缩为稳定语法，例如：

- `进度 +1 · 压力 −1`
- `进度 +4`
- `获得 1 专注`

约束：

- 展示投影必须由闭集效果数据生成，不能按 `cardId` 写文案。
- 同一种 effect 永远生成同一种标点、顺序和颜色规则。
- 来源只显示一行，超长文本使用已有省略能力；完整文本保留在可访问描述中。
- 风味最多两行；不得挤压核心效果。

### 4.3 手牌交互

- 可用卡维持高对比；禁用卡整体降饱和但核心效果仍可读。
- 悬停只做轻微抬升/高光，目标约 3–6px；不得使用夸张翻转或自写 CSS 3D。
- 点击后立即进入 busy 视觉；原卡位从飞行开始隐藏，但其他手牌在 impact 之前不得突然重排。
- 卡面 builder 必须可复用，飞行卡必须是“完整卡”，不能退化为一个图标或低保真替身。

## 5. W5.1-3｜抽牌动画重做

### 5.1 时序基准

demo 基准：单张 450ms，间隔 60ms，近似 `cubic-bezier(.2,.75,.25,1)`；5 张最后一张在 690ms 完成。

当前阶段预算约 700ms，因此必须满足：

`lastDelay + duration <= phaseDuration - 1 frame`

实现为纯函数：

`computeDealTiming(drawnCount, phaseMs) -> { durationMs, staggerMs, totalMs }`

规则：

- 首选 `duration=450ms`、`stagger=60ms`。
- 如果抽牌数增加导致超预算，只压缩 stagger，不截断 duration。
- stagger 有合理下限；若仍超预算，则显式增加纯表现 phase 帧数并补测试。
- 延迟按“本次新抽牌的 ordinal”计算，禁止按整手牌 index 计算。

### 5.2 现有能力组合

首轮不得扩引擎，使用 LayoutNode 现有闭集动画组合：

- 外层透明 wrapper：`flyIn`，方向从右，距离由牌堆中心到目标卡位中心计算；
- 内层卡面：`dealIn`，与外层同 duration、同 delay；
- 牌堆锚点与卡位几何由纯函数计算，不读 DOM，不写世界；
- reduced-motion 时两个 wrapper 都直接显示终态。

牌堆在右下，与手牌纵坐标接近；“横向 flyIn + 内层 dealIn”的组合足以先达到连续、可解释的 deck-to-hand 运动。禁止为了完全复制 demo 而注入自由 CSS keyframe。

### 5.3 稳定视觉身份

不能继续用当前 hand index 直接充当所有节点身份。新增纯函数：

`projectHandVisuals(beforeHand, afterHand)`

输出至少包含：

- `visualId`
- `cardId`
- `previousIndex`
- `nextIndex`
- `status: kept | drawn | played`
- `drawOrdinal`

要求：

- 未变化的牌跨阶段保留同一 `visualId`，不因左移而重播入场动画。
- 同名重复牌使用确定性的“cardId + occurrence”多重集匹配。
- 只有 `drawn` 节点播放抽牌动画。
- 该身份只存在于 presentation controller，不进入 simulation、snapshot 或 hash。

## 6. W5.1-4｜出牌动画重做

### 6.1 单一飞行所有权

移除当前“两段未完成 tween + 固定坐标重置”的实现。整段卡牌飞行只允许一个表现层拥有：

- 推荐由 LayoutNode overlay 渲染完整卡面；play-field 继续负责敌人、受击、飘字和背景。
- 如果采用 LayoutNode 飞牌，则删除/停用 play-field 的飞行卡实体和重复 `flight-icon`。
- 禁止同时保留 Canvas 低保真飞牌与 UI 图标。

### 6.2 阶段与时长

将卡牌位移归并为一个连续 `card-flight`：

- 总时长目标 300–320ms；
- 命中在飞行结束后触发；
- 不再用 8 帧 lift + 11 帧 flight 去截断两个 18 帧 tween；
- 如保留 lift，lift 只能作为同一动画内部前 40–60ms 的轻微抬升，不能触发第二次挂载或坐标重置。

表现阶段允许调整，但 simulation 提交点、busy 门和规则顺序不得改变。

### 6.3 真实起点与目标

新增纯函数：

`computeCardFlightGeometry(handLayout, playedIndex, targetAnchor)`

要求：

- 起点是本次实际点击卡牌的中心，不允许固定 `x=612`。
- 第 1、3、5 张牌的起点必须明显不同并与其屏幕卡位一致。
- 目标为中央交锋区的稳定锚点，不跟随敌人立绘尺寸抖动。
- 从起点到目标的 x/y 位移连续、单调或沿固定弧线；阶段切换时不得反向跳帧。

利用现有 LayoutNode 的嵌套动画组合表达二维运动：

- 外层 wrapper 负责 y 方向 `flyIn`；
- 内层 wrapper 负责 x 方向 `flyIn`；
- 最内层渲染与手牌相同的完整卡面；
- 所有层共享同一 duration、delay 与稳定 ID。

最终卡可轻微放大和旋转，但若现有闭集无法无冲突表达，宁可先保持 1:1 完整卡面，也不得写自由 CSS/DOM。

### 6.4 手牌重排时机

- `card-flight`：原卡位隐藏，其他卡仍停在原位。
- `impact`：规则结果已经提交，手牌才收拢；收拢不得让飞牌重新出现。
- `opponent-response`：卡面飞行动画已结束，只保留敌人反馈、资源/进度变化。
- busy 期间任何点击、双击、键盘并发仍只提交一次。

## 7. 自动化测试清单

在原有 53 项回归全部保持通过的基础上补齐：

### 7.1 卡面与文本

- 10 张卡均由同一 builder 输出费用、名称、来源、效果、风味、热键。
- 核心效果和按钮不使用 `xs`。
- 禁用原因替换固定区域，不增加卡面总高度。
- 6 张牌时矩形互不重叠且全部位于手牌面板。
- UI tree ID 唯一，`validateLayoutNode` 零 issue。

### 7.2 抽牌

- 1、3、5、6 张抽牌的 `totalMs` 均不超过 phase budget。
- 5 张时目标为 450ms + 4×60ms = 690ms。
- 延迟按 drawn ordinal，而不是 afterHand index。
- 手牌中已有牌不重播 `dealIn`。
- 两张相同 `cardId` 时，多重集匹配仍稳定。
- reduced-motion 立即终态，无残留 busy。

### 7.3 出牌

- 1、3、5 号卡位计算出不同起点。
- 飞行开始点等于被点击牌中心，结束点等于交锋锚点。
- 飞行全程只有一个完整卡实体；Canvas flight 与 `flight-icon` 不得重复存在。
- presentation phase 在动画总时长前不会前进。
- impact 前其他手牌不重排；impact 后正确收拢。
- 双击、鼠标+键盘并发、失焦恢复仍只提交一次。
- 去掉 busy 门时既有对抗测试必须准确变红。

### 7.4 规则不变证明

- 相同 seed、相同输入的最终 snapshot/hash 与本轮施工前一致。
- 三敌人的公开 session 胜负路径不变。
- 不新增 `cardId` 条件分支，不新增随机调用，不改变 SDK contract。

## 8. 能力缺口闸

先完成第 5、6 节的现有能力组合原型与测试。只有真实渲染证明 LayoutNode 嵌套动画仍无法避免 transform 冲突，才算缺口。

届时必须在 `requests.md` 留下实查原文，并交 owner 裁决：

### A｜补通用能力（推荐）

为 LayoutNode/PUI 增加通用、闭集、render-only 的多通道 transform track 或对称 `flyFrom`：

- 输入为闭集锚点、位移、scale、rotate、opacity、duration、easing；
- 不接 simulation，不执行回调写世界；
- 可复用于抽牌、出牌、奖励飞入、物品拾取；
- 归 PUI/共享域，必须由对应角色施工并独立复查。

代价：扩大共享 UI 契约与测试面，但能得到真正的任意锚点到锚点动画。

### B｜游戏层手写插值/DOM/CSS

代价：形成游戏专属动画解释器、破坏 LayoutNode 铁律、难以审计 reduced-motion 与失焦恢复、后续游戏无法复用。

推荐裁决：A。B 默认标记 `wontfix`，除非 owner 明确改写架构边界。程序不得自行选择并实现任一路。

## 9. 真渲染验收

静态截图不足以证明流畅度。必须提供时间序列：

### 抽牌序列

- 0ms、150ms、300ms、450ms、690ms；
- 至少包含第一张与最后一张；
- 能看出从右下牌堆方向进入、依次落位、末张完整结束。

### 出牌序列

- 0ms、80ms、160ms、240ms、320ms；
- 分别从第 1、第 3、第 5 卡位出牌；
- 每组都能看出真实起点、完整卡面、连续轨迹、中央命中。

证据目录：

`docs/design/game-rhetoric-duel/self-check/w5-1-shots/final/`

生成两张接触表：

- `deal-sequence-contact-sheet.png`
- `play-sequence-contact-sheet.png`

并在 `S5.1-alignment.md` 逐条对照 demo 与本施工单，禁止只写“观感更好”。

## 10. 门禁与独立复查

施工人完成后必须依次通过：

1. 游戏 scoped tests，原有回归 + 本轮新增全部通过。
2. TypeScript 检查。
3. 生产构建（不得自动拉起服务）。
4. UI audit：ready、disabled、card-flight、impact 四态均为 0 issue。
5. `game-skill-audit` 无新增红旗。
6. `align-check`：❌=0；每条 ⚠ 有明确 W5.1/PUI 去向。
7. 独立复查人复跑以上证据，施工人不得自审结案。

复查人必须做三组 sabotage：

- 把 stagger 改回 90ms，确认“动画不超预算”测试变红；
- 把飞行起点改回固定坐标，确认第 1/3/5 卡位几何测试变红；
- 删除稳定 visual identity，确认重复牌/已有牌重播测试变红。

只有恢复修复后全绿，才可判 W5.1 PASS。

注意：既有 W5 若仍缺 `scoped-gate` 真实退出码或独立 `review/W5-demo-parity.md`，必须与本轮一并补齐；不能用 W5.1 的局部通过替代 W5 原关卡出口。

## 11. 程序回报格式

程序完成后一次性回报：

1. 实际修改文件清单与每个文件职责。
2. 文字/卡面前后对比图。
3. 两张动画接触表及对应录屏路径（如有）。
4. 全部测试、TypeScript、构建、UI audit、skill audit、align-check 的命令、退出码与摘要。
5. snapshot/hash 不变的证明。
6. 独立复查人与 sabotage 结果。
7. 仍存在的 ⚠ 及明确去向。

不得以“代码已写完”“截图看起来可以”代替上述出口。不得进入 W6 音频、发布或 SDK 扩展。

## 12. Owner 本机操作禁令

- 程序 agent 不得执行任何 Git/GitHub 命令；需要提交、rebase、push 时，只能按仓库 `AGENTS.md` 的强制交接格式把命令交给 owner。
- 程序 agent 不得启动或重启前后端；若现有 5173 不可用，只能把启动命令、端口、停止命令交给 owner。
- 不涉及数据库；任何可能写数据库的脚本一律不得执行。

