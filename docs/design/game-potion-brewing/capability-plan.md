# 《坩埚炼药》S2 能力总览（G1–G4 均已裁 A；独立复查 PASS，Owner 人门已通过）

> 2026-10-12；对应 S1-P-06 定稿原型，逻辑画布 1440×900。S2 已通过，但 G1/G2/G3 尚未交付，机读缺口仍锁 S3。机读目录命令 `npx vite-node scripts/dump-capability-catalog.mjs --names` 在当前沙箱因入口 `realpath EPERM` 失败；以下注册名逐一由 `src/assembly/capability-registry.ts` 和能力源码核对，目录探针须在复查时补跑。未执行 Git 更新，因为 Owner 禁令覆盖 ask-owner 手册的 `git pull` 建议。

## 1. 游戏一句话

DokiWorld 指定本局唯一公开配方；玩家把材料投进透明背景的坩埚、按指定方向搅拌足够圈数，正确完成得到药剂，明确错误立即失败。

## 2. 消费的引擎能力

| capability 注册名 | 用途 | 实查结论 |
|---|---|---|
| `t2-drag-place` | `Draggable` + `DropZone` 拖放时发材料的 `Clickable.action` 信号 | 已有；投放区分支不移动材料。锅外默认会自由落点移动 Transform，故材料 `Draggable.onlyFlag` 必须指向常 false 的固定 Flag；DropZone 路径先于该门，仍可发信号。区命中尚只有矩形，待 G3 |
| `t2-clickable`、`t2-keybind` | 材料投放载体、坩埚确认、Q/E 键盘一圈与 Escape 的具名信号 | 已有；材料实体 `Clickable.onlyFlag` 同指常 false Flag，阻止单击直接投料，但 DropZone 代点明确绕过。材料选择仅改变 UI 选中态；键位门可用 `ConditionExpr`，不得把键盘轨迹伪装成指针 |
| `t2-event-when`、`t3-flow` | 相位标志、入场/终局状态与具名演出触发 | 部分已有；`ConditionExpr` 没有 Signal/arg 叶子，无法解释动态有序配方 |
| `t3-timeline`、`t2-presentation-track`、`t1-tween` | 成功/失败节拍、药液微光和非权威视觉过渡 | 已有表现能力；不能承担规则判定，`TweenTarget` 不含 `Color.tint` |
| `t2-craft-recipe` | 只供对照，不接本局 | 原子消耗/产出而非逐步有序会话，不能拿它伪装配方解释器 |
| `t2-orbit-motion` | 只供对照，不接棒的玩家控制 | 自治旋转，不接连续指针轨迹，也不判方向/整圈 |
| `t2-ordered-action-session`（暂定名） | 宿主给出的 add/stir 步骤、圈数、错误、唯一终局 | **G1：Owner 选 A，待引擎交付；尚未注册** |
| `t2-angular-gesture`（暂定名） | 椭圆单角度棒、连续角差、过滤、圈数、方向信号 | **G2：Owner 选 A，待引擎交付；尚未注册** |
| `t2-drop-zone-shape`（暂定扩写） | 与原型一致的椭圆锅口命中 | **G3：Owner 选 A，待现有 DropZone 扩写；尚未交付** |
| `t2-drag-preview`（暂定名） | 鼠标/触控拖材料时 render-only 跟手影像、锅外 280ms 回弹 | **G4：独立复查发现的新缺口，Owner 另选 A，待引擎交付；尚未注册** |

现有与拟增能力必须按 `docs/playbooks/events-logic.md` 信号入队，不在 handler 中写自由规则。Owner 已对 G1–G3 选择 A，又对独立发现的 G4 单独选择 A；四项暂定名字仍不是已实现 API，机读台账均保持 `accepted`，据各条 `blocks` 阻断后续阶段，真实交付/复查后才可改状态。

## 3. 数据规则与解释责任

| 数据 | 权威含义 | 解释者 |
|---|---|---|
| `contract-v1.md` 的 `ingredients`、`steps` | 唯一公开配方、稳定材料 ID、add 顺序、stir 方向与圈数 | 严格 parser 先验；有序规则交 G1 裁决后的能力，不在游戏层循环解释 |
| 椭圆中心/半轴、抓握域、330° 阈值、0.16 中心死区、129.6° 跳变上限、0.5° 抖动阈值 | 将连续指针采样化为有效方向圈；棒位置只有角度状态 | G2 裁决后的能力；参数是数据，参考 `prototype-notes.md`，正式阈值需真机复测 |
| 材料槽与锅口投放域 | 锅外松手不提交且材料权威 Transform 留在架上；拖动中影像跟手、释放后回弹。有效锅口释放才提交 `brew.add.<ingredientId>` | `Draggable.onlyFlag` 与 `Clickable.onlyFlag` 共用永不激活的门，DropZone 代点绕过门；G3 扩椭圆命中。`Clickable.action` 对每个材料用稳定 ID 生成不同具名信号；不依赖不存在的 `Signal.arg`。跟手/回弹交 G4 已裁的通用表现能力，未交付前现有 `drag-place` 不具备 |
| 每步 `liquidColor`、失败固定紫、清水初态 | 仅展示，不改变 add/stir 对错 | LayoutNode/render 组件与表现轨道；严禁锅身 glow/失败位移 |
| 成品、材料和锅图槽 | render-only；加载失败落本地占位，不改变规则 | `AssetIndex` / `resolveAsset` + `LayoutNode.Image` / `Sprite`；正式资产登记归资产专员 |

状态/事件/命令：`ready → active(stepIndex,turns) → success|failure|cancelled`；玩法输入命令仅稳定具名的 `brew.add.<ingredientId>`、`brew.stir.clockwise`、`brew.stir.counterclockwise`，另有会话外 `requestExit`。G1 只消费声明的玩法动作名，不把其它 UI 信号误判为配方错误。`turn` 只有完整有效圈才形成；半圈与锅外材料释放不是错误命令。最后一步立即锁定；每局唯一终局，宿主只接一次成功 `complete`。

## 4. 游戏层代码例外申请（Owner 均选 A，全部不批准）

| 候选例外 | 为什么现有能力表达不了 | 预计规模 | 裁决与债 |
|---|---|---|---|
| G1 游戏级有序步骤解释器 | `t3-flow` 条件不读信号及 arg；`t2-craft-recipe` 无有序多步 | 约 120–220 行 + 测试 | **Owner 选 A；B 例外不批准** |
| G2 游戏级椭圆手势与棒位置代码 | 输入当前仅产生 down/up/终点 drag；`orbit-motion` 自转 | 约 150–250 行 + 测试 | **Owner 选 A；B 例外不批准** |
| G3 游戏级椭圆投放命中代码 | `hitDropZone()` 无椭圆分支 | 约 25–50 行 + 测试 | **Owner 选 A；B 例外不批准** |
| G4 游戏级拖动预览适配器 | `drag-place` 只消费松手 drag；现有 `presentation-track` 不跟实时指针 | 约 80–160 行 + 测试 | **Owner 单独选 A；B 例外不批准** |

游戏层只可在既有边界内写数据装配、严格合同解析/SDK adapter 与纯展示投影；不得借“胶水”之名解释步骤、累积角度、改写拖放命中、手写 DOM/CSS/Canvas 或复制 `.dc.html` 脚本。

## 4.5 美术接入

- 主体槽：坩埚（锅体/前沿分层）、药液、搅拌棒、卷轴、材料各自 `skinKey` 或 `art:`，结算成品瓶为宿主 `imageUrl` 覆盖的 render-only 图片槽；所有都有本地 fallback。
- `ui-refs/cauldron-three-quarter-v2.png` 与 `potion-bottle-v1.png` 目前仅为原型目标，不是已登记生产资产。S5 前由资产专员登记索引并接消费槽；编译期台账推导脚本名待 S5 落定。
- 锅与药液必须分层：发光、颜色和气泡仅由药液槽承载；失败锅静止。

## 4.6 UI 呈现与华丽起手

- 选 `apolloBrocade` house 主题的纹样与字体，`Screen.bg:'transparent'` 且不绘画布背景；需在 S4 真渲染验证主题 wash/texture 不污染 alpha。此处不是新造主题。
- 无主菜单、无选方；台面用 `LayoutNode` `Screen/Panel/Image/Label/ProgressBar/Modal`。已核 `@ui/starters` 的 `buildStarterResult()` 固定含星级、得分和“重来”，与本局“无品质/分数、宿主单次调用”相冲突，故**不直接消费该整屏**；结算以 house 主题的 `Panel/Image/Label/Button/Particles` 闭集数据组装成品瓶富屏，并在 S4 真渲染对原型 1:1。若现有控件仍表达不了，报 PUI，禁手写屏。
- 成熟件：药液 `ProgressBar.shape:'liquid'`（可配置 `fillColor/wave/bubbles`，是否足以表现椭圆口要 S4 对照）；`Particles` 用于药液内与结算；`Modal` 处理取消/结果；`sheen-hover` 仅用于允许发光的 UI，不施于锅。透明背景与焦点/禁用态须经 `check-ui`。

## 4.65 对手 AI

没有敌人、NPC 或 AI 决策；不适用。

## 4.7 准入阶梯

| 规则 | 落级 | 说明 |
|---|---|---|
| 单一宿主配方与步骤、材料份数、展示色 | L0 | 版本化闭集数据；图片纯展示 |
| 拖放提交、键盘信号、相位/表现轨道 | L1 | 现有 `t2-drag-place`、`t2-keybind`、`t3-flow`、`t3-timeline` 等重组 |
| 有序会话 / 椭圆搅拌 / 椭圆投放 | L2 | G1/G2/G3 已获 A 裁决，待通用能力交付；不预写 L3/L4 |
| 材料拖动中跟手与回弹 | L2 | G4 已获 A 裁决，待通用能力交付；现有 renderer 与 `t2-drag-place` 无解释者 |
| 严格合同解析与 SDK 生命周期胶水 | L1 接入边界 | 非玩法解释器；遵守 vendored SDK 与 `contract-v1.md` |

## 5. 确定性与验收边界

- 规则无随机；药液气泡/粒子只能是 render-only 确定式或引擎种子 PRNG，禁裸 `Math.random`。不做联网 lockstep，但输入角度量化、同拍事件顺序、快照和回放须可重现。
- 自测至少覆盖两原型 fixture、重复材料、正确/错误材料、正反方向多圈、无效轨迹/锅外释放、同拍终局锁定、键鼠触、非法合同、preview 空数据、complete accepted/rejected、资源失败。每个新增规则能力按 `DebugTrace` 只记 decision/transition/reject/commit，关闭时真 no-op。
- S4 对原型做结构 1:1；S5/S6 做视觉与演出 1:1。未裁决差异不宣称阶段完成。

## 6. 评审记录

- 提交人：本会话主 agent，2026-10-12。
- 架构判断：接受单配方数据驱动方案；回驳复制原型 JS、手写配方解释器与把无效轨迹当失败。
- Owner A/B 裁决：本会话先答复“全部A”覆盖 G1/G2/G3，后对独立复查发现的 G4 单独答复“A”；四项均走通用能力，游戏层 B 例外不批准。S2 独立复查首轮 `CONCERNS`，修订后第二轮 `PASS`（仅文档/裁决；见 `S2-review.md`）；S2 Owner 人门已在控制台通过。裁决全文与待施工验收见 `requests.md`。
