# `game-lockpick` 施工单与需求池

## GAP-LOCKPICK-01：离散组合会话能力（P1，阻塞）

**现状**：已实查 registry、随机 / 事件 / 移动 / UI 手册与相关源码。现有能力不能声明式完成隐藏向量生成、单槽更新、exact-match 和唯一终局。

**owner 裁决（2026-09-29）**：**A**，新增通用 `t3-discrete-combination-session`；禁止在 `game-lockpick` 复制组合判定逻辑。

**施工主体 = Codex/root/lockpick_delivery（2026-09-29 本地锁；待 owner 推送）**。本能力碰确定性、快照与跨游戏共享面；先完成协议规格、实现和独立复查（含撤修验红），才可进入游戏 S3。

**写死规格边界**：配置仅为 `slotCount`、`valueCount`、`initialValue` 及具名输入/反馈/终局 Signal；状态仅为 `ready|playing|success|failure`、`target`、`current`、`matchCount`。输入仅闭集 `set(slot,value)` / `give-up`。启动只读写世界 `RandomSeed`；目标与初始向量相同时继续确定性抽取。非法输入及终局后输入拒收；成功和已确认放弃各只能终局一次。不得引入次数、倒计时、错误惩罚、耐久或宿主传入答案/seed。

---

## GAP-LOCKPICK-02：可皮肤化离散 Slider（P1，阻塞 S4/S5/S6/S8）

**owner 裁决（2026-09-29）**：**A**，由 **PUI** 扩写通用 LayoutNode `Slider`；不得在 `game-lockpick` 写原生 range、DOM listener、自由 CSS 或独立动画解释器。

**施工主体 = PUI / Codex-root（2026-09-29 本地锁；待 owner 推送）**。独立复查人不得与施工人相同。

**实查原文**：当前 `SliderProps` 只含 `value/min/max/step/action/label`，`renderSlider()` 只渲染默认 range；catalog 定位为连续数值控件。它能正确接收三档输入，却没有 `trackSkin`、`thumbSkin`、thumb 尺寸或状态变化表现槽。因此把独立木轨/可移动铆栓叠在默认 range 上会产生视觉和真实命中位置漂移，不能重组解决。

**PUI 写死规格**：

1. `SliderProps` 增加可选 `trackSkin?: string`、`thumbSkin?: string`、`thumbSize?: number`、`motionMs?: number`；缺省保持既有默认 Slider 像素和行为不变。
2. `trackSkin` 是固定皮肤，`thumbSkin` 是独立透明图片。原 range 保持唯一真实输入/无障碍语义；视觉 thumb 的位置必须由同一 `value/min/max` 计算，不能由游戏层逐帧写 CSS。
3. `step:1,min:0,max:2` 时键盘、触控、鼠标均吸附三个精确位置；value 改变时仅 render 层在 `motionMs` 内追赶，规则提交不能等待动画。
4. reduced-motion 禁用或缩短视觉缓动，不影响真实输入、焦点或 action arg；皮肤 URL 是已解析的资产 URL，sim 只持 key。
5. 为默认回归、皮肤位置、三档对齐、键盘/触控、reduced-motion、无皮肤兼容和 `validateLayoutNode` 增点名测试；PUI 施工后由独立复查人撤去 `value→thumb position` 绑定，锚点断言必须转红。

**消费承诺**：`game-lockpick` 在能力交付后只传 `trackSkin: game-lockpick/ui/tumbler-rail`、`thumbSkin: game-lockpick/ui/tumbler-knob` 的已解析 URL、`thumbSize` 和 `motionMs:150`。轨道、铆栓和锁舌均已作为独立透明 AI PNG 登记，且不进入规则状态。

---

## GAP-LOCKPICK-03：离散组合会话的随机初始向量（P1）

**owner 裁决（2026-09-30）**：**A**，扩写通用 `t3-discrete-combination-session`，不在游戏层生成或比较初始向量。

**施工主体 = Codex/root（2026-09-30 本地锁；待 owner 推送）**。本项触及确定性、快照和跨游戏共享协议；需独立复查及撤修验红。

**写死规格边界**：将“全槽固定 `initialValue`”升级为闭集初始策略：保留默认 `constant`（兼容既有 `initialValue`），新增 `random`（逐槽消费世界 `RandomSeed`，值域 `0..valueCount-1`）。随机初始向量与隐藏目标均由同一确定性种子序列生成；若二者相同则确定性重抽目标，故开局绝不成功。不得新增宿主 seed / 答案 / 失败路径 / 次数 / 计时字段。需覆盖同 seed、异 seed、快照恢复、初始非终局和 constant 回归。

---

## GAP-LOCKPICK-04：一次性、不透明的状态变换动效（P2）

**实查（2026-09-30）**：`src/ui/components/render.ts` 的预设只有 `fadeIn|slideUp|pop|shake|dealIn|flyIn|fadeOut|popOut`（一次）与 `float|glow|pulse|spin|floatUp|marquee|tick`（循环）；`src/ui/components/server.ts` 的 `apollo-flyIn` 原文为 `from{opacity:0;transform:translate(...)}to{opacity:1;transform:translate(0,0)}`。`float` 仅循环 `translateY`，`shake` 仅循环横移，均不能表达「已存在部件从闭合 transform 平滑变成指定平移+转角终点」。`docs/playbooks/ui.md` 仅列 `layout.rotate` 与 `anim:'spin'`，没有状态驱动 transform transition。故不能用现有闭集准确表达同一锁梁从闭合到开启且全程不改透明度的动效。

**A · 补 PUI 通用缺口（推荐）**：在 LayoutNode 的 Image/Panel 等可变换节点增加闭集 `transformMotion`（例如 `{ from:{x,y,rotate}, to:{x,y,rotate}, ms, easing }`），渲染层保证只用 `transform` / `transition`，不含 `opacity`；游戏只声明锁梁的闭合与开启姿态。代价：扩展共享 UI 解释器、需 PUI 测试、撤修验红和独立复查；影响面是 render-only，不进 sim/hash；通用性为门、抽屉、转轴、机械臂、宝箱等任何状态驱动部件。选错成本：若实现成游戏专用动画，会重复造轮并绕过 LayoutNode 闭集。

**B · 游戏专属例外**：仅为 `game-lockpick` 允许一个锁梁专用 DOM/CSS 动画。代价：违反 UI 铁律、产生不可复用的游戏层解释器与维护债；影响面小但不可数据化；通用性低。选错成本：后续每个机械部件都可能继续复制同类自由实现。

**owner 裁决（2026-09-30）**：**A**，由 PUI 新增通用闭集 `LayoutConstraints.transformFrom`，不得在 `game-lockpick` 写 DOM/CSS 动画。

**施工主体 = PUI / Codex-root（2026-09-30 本地锁；待 owner 推送）**。写死规格：`transformFrom` 仅为二维 `{ x?, y?, rotate?, scale? }` 起始姿态；终点只读取节点已声明的 `layout.x/y/rotate/scale`；`transformMotionMs` 为一次性时长，`transformMotionEasing` 为闭集 `linear|ease-out|ease-in-out`。渲染仅生成由数值派生的 `transform` 关键帧，禁止读写 `opacity`，不进入 sim/hash；`prefers-reduced-motion` 下缩短或禁用。需有 catalog/验证/默认零回归/非透明锚点/锁梁消费/撤修验红与独立复查。

---

## GAP-LOCKPICK-05：单次、非透明的信号灯发光模式（P2）

**实查（2026-10-08）**：`ImageProps.tint` 当前仅有 `pulse?: boolean`；`renderImage()` 的 true 分支固定输出 `apollo-signalPulse ... infinite`。`layout.fx:'flash'` 虽为一次性，但 `apollo-fx-flash` 原文使用 `opacity:0→.7→0`；`transformFrom` 只处理 transform，不能表达滤镜发光。故现有闭集既不能声明「暗红无发光 / 亮绿稳定发光」，也不能声明「状态变化时仅闪一次、全程不改透明度」。

**owner 裁决（2026-10-08）**：**A**，扩写通用 PUI `Image.tint`；不得在 `game-lockpick` 写专用 CSS、DOM listener 或动画解释器。

**施工主体 = PUI / Codex-root（2026-10-08 本地锁；待 owner 推送）**。

**写死规格**：保留 `kind:'signal'` 与 `progress:0..1`；增加闭集 `emission?: 'off'|'steady'|'once'|'loop'`，不新增布尔旗标。`off` 只保留色滤镜、无 `drop-shadow`；`steady` 带固定 alpha 轮廓 `drop-shadow`；`once` 仅运行一遍同一 alpha 轮廓发光关键帧；`loop` 保持现有循环行为。兼容遗留 `pulse:true` 等同 `loop`。关键帧只可改 `filter/drop-shadow`，禁止 `opacity`、`box-shadow` 和 `transform`；reduced-motion 下 `once/loop` 时长归零。游戏通过 render-only 的稳定 stage id 重播 `once`，外围灯只声明 `off|steady`，不显示单槽答案或文字 matchCount。需覆盖四模式、旧 pulse 回归、无透明度/矩形阴影、reduced-motion、校验/catalog、机关锁消费、撤修验红与独立复查。

**交付（2026-10-08）**：`Image.tint.emission` 已按四态闭集进入 types / renderer / catalog / validator；`game-i` 有独立中性灯芯活范例。机关锁中央灯以 aggregate stage id 重播 `once`，外围匿名刻度只用 `off|steady`。独立复查与锚点撤修验红见 `review/GAP-LOCKPICK-05-independent-review.md`。无专用 DOM/CSS 或玩法层组合判定。

---

## GAP-LOCKPICK-06：可感知的单次色相过渡（P2）

**实查（2026-10-08）**：已交付的 `once` 只在相同的 `--signal-core` 下改变 `drop-shadow` 半径；中央 52px 灯芯被黄铜灯座包围时，玩家难以分辨这一微小差异。现有 `once` 不能表达“暖金起点 → 新的目标红/绿 → 稳态”的色相过渡；游戏层不能读取前态后手写 CSS。

**owner 裁决（2026-10-08）**：**A**，扩写通用 `Image.tint` 的既有 `once` 语义；不得新增游戏专属颜色、DOM 或动画解释器。

**施工主体 = PUI / Codex-root（2026-10-08 本地锁；待 owner 推送）**。

**写死规格**：`once` 固定为一次 `warm-gold → target signal colour → target steady glow` 的 filter-only 过渡，时长 420ms；`off`、`steady`、`loop` 语义和遗留 `pulse:true` 保持不变。起点与目标均由通用 renderer 从中性图片/`progress` 推导，游戏只声明 `emission:'once'`。关键帧继续禁止 `opacity`、`box-shadow`、`transform`；reduced-motion 归零。需覆盖色相起点、目标终态、默认/loop 回归、机关锁消费、撤修验红与独立复查。

**交付（2026-10-08）**：通用 `once` 已改为 `apollo-signalIgnition`，由暖金点火色过渡到 progress 派生目标色并稳定；旧 `apollo-signalPulse` 只保留给 `loop` 与遗留 `pulse:true`。局部更新下 aggregate stage 变更会替换灯芯节点并重新播放。独立复查、撤修验红和两种视口审计见 `review/GAP-LOCKPICK-06-independent-review.md`。

---

## GAP-LOCKPICK-07：连续状态的通用 transform 衔接（P2）

**实查（2026-10-08）**：已有 `layout.transformFrom` 只在节点创建时从固定起点播一次；`mountUI.update()` 对 layout 变化会 `outerHTML` 替换节点，故不能令同一棘轮从上一档平滑旋转到下一档。`layout.rotate` 只有静态终态。机关锁需要“正确数量变化→继电器棘轮转一档”，且游戏层不得保存前一渲染姿态或操作 DOM。

**owner 裁决（2026-10-08）**：用户确认采用 Lead 推荐的“继电器传动 + 机械棘轮盘”方案，即选择 **A：补通用 PUI 连续 transform 过渡**；不得在 `game-lockpick` 写专用 DOM/CSS 或保存渲染前态。

**施工主体 = PUI / Codex-root（2026-10-08 本地锁；待 owner 推送）**。

**写死规格**：新增 `layout.transformTransition?: {ms?:number,easing?:'linear'|'ease-out'|'ease-in-out'}`。它只在同 id、同 type、props 与除 `x/y/rotate/scale` 外 layout 均相同的 `mountUI.update()` 中保留 DOM 并替换 style，让浏览器从当前 transform 连续追至新 transform；初始 render 直接为终态。任何其他字段变化仍走既有安全替换。时长限定 0..2000，reduced-motion 归零；不改 opacity，不增加游戏状态。需覆盖 rotate 追赶、非 transform 仍重建、validator/catalog、game-i 活范例、机关锁 aggregate 棘轮、撤修验红与独立复查。

---

## 给实现 Agent 的完整施工单

### 0. 开工纪律

1. 完整阅读根 `AGENTS.md`、数据驱动宣言、`docs/llm-onboarding.md`、本目录全部文档。
2. 阅读 UI / events / movement / randomness / audio / assets / art 对应 playbook 与 skill。
3. 禁止执行任何 Git / GitHub 命令；需要 Git 时按 AGENTS 强制交接格式把命令交给 owner。
4. 禁止启动 / 重启前后端；只可使用 owner 已启动的服务做只读验收。
5. 先复核 `GAP-LOCKPICK-01`，取得 owner 的 A/B 原文；未取得不得进入玩法实现。
6. 不得添加操作次数、倒计时、错误惩罚、耐久、技能值或额外宿主输入。

### 1. S2 裁决落盘

owner 选 A：

- 将 gap 路由保持 `engine`，按抢锁与归属规则交主程。
- 主程提交 capability spec：配置 schema、组件、系统 phase / runsBefore / runsAfter、快照、trace、错误语义和注册表 id。
- 独立复查必须含撤修验红，尤其验证“目标不等于初始值”“终局只提交一次”“终局输入被拒绝”。

owner 选 B：

- 将 gap 改为明确的 game exception，写清债务、仅本游戏可用的边界和未来迁移触发条件。
- 游戏 session 仍须确定性、可测试、可快照，禁止 UI 持有规则真相。

两路都必须把 `capability-gaps.json` 改成非 open 且带真实 ticket / proof 后，才能进入 S3。

### 2. S3 规则实现

实现一个与 UI 无关的会话层：

- 配置表：`easy→3`、`normal→4`、`hard→5`，三档值均为 3。
- 状态：ready / playing / success / failure；target、current、matchCount。
- 初始 current 全为 1；目标由 `RandomSeed` 生成，若全 1 则确定性继续抽取。
- 接收闭集 `set(slot,value)`；严格拒绝越界、非整数、重复终局输入。
- 每次有效移动即时重算 matchCount 并发反馈 Signal。
- matchCount 满值自动成功；只有 `give-up` 进入 failure。
- 不创建 moves / attempts / timer / durability 等失败资源。
- 按日志基准补 opt-in DebugTrace；只读 trace 可重建生成、移动、反馈、终局原因。

先写 `acceptance-scenarios.md` 对应测试，再实现到全绿。必须包含 hard 1,000 次尝试仍不失败的回归锁。

### 3. S4 可玩 UI

- 新建 `games/game-lockpick/**`，所有屏幕由 LayoutNode 生成。
- 使用 `apolloOnyx` house 主题与成熟组件，不从空白主题起手。
- 1440×900 逻辑画布，响应式验证 810×506。
- 机关盘中央放 3–5 个 `Slider(min=0,max=2,step=1)`；每个 action 只发送槽位和值，不直接改 session。
- 若现有 Slider 的拖拽 / 触控三档吸附不能满足，立即按缺口协议报 PUI；不得写原生 range、DOM listener 或自由 CSS 逃生。
- 总体反馈只投影色阶、亮度、脉冲和音效；不得渲染 matchCount 文本或单槽正确标记。
- 放弃按钮打开 Modal；只有 Modal 的确认动作发送 `give-up`。
- 终局后 disable 全部输入；SDK 完成前保留短演出。
- 键盘焦点、触控目标、对比度与 reduced-motion 必须可用。

### 4. S5 美术与音频

正式资产需求：

- 1 张 1440×900 机关室 / 工作台背景。
- 1 套可九宫 / 可拉伸机关盘底板。
- 1 套滑轨、滑钮、三档刻度装饰（不得把可变文字烘进图）。
- 1 枚中心反馈灯底座与发光遮罩。
- 1 套锁舌 / 锁芯开启状态图或可分层部件。
- 少量成功火花 / 金粉粒子贴图（能用现有闭集粒子则优先复用）。
- 调节、反馈档位、成功、放弃、确认 / 取消 SfxSpec。

任何 AI 生成资产先出美术规格与消费槽，再由 asset-manager 导入、登记 `assets/index.json`、填写 spec 与 provenance；禁止孤儿资产。音频走 SynthAudioPort，不散写 AudioContext。

### 5. S6 表现时序

- 滑钮吸附 120–180ms；规则在松手提交时立即更新，动画只追赶已提交状态。
- 指示灯反馈 180–260ms，颜色与脉冲同步。
- 成功：最后滑钮提交与反馈同时起动，锁舌 / 盘面演出 0.8–1.2s，随后 complete。
- 放弃：确认后盘面熄暗 / 回锁 0.5–0.8s，随后 complete。
- 动画不得制造输入次数、不得延迟胜负判定、不得在失焦恢复时重复 complete。
- reduced-motion 只缩短表现，不改变规则顺序。

### 6. S7 SDK、manifest 与调用说明

- 使用 vendored 最新 `dokiworlds-app-sdk`，`createAppClient({ appId:'game-lockpick', targetOrigin:'*' })`。
- 严格解析 `doki.game.lockpick-input@1`；业务数据只有 difficulty。
- 用 `fnv1a32(instanceId + ':' + runId)` 产生内部 seed；测试可直接注入固定 seed。
- 严格输出 `doki.game.lockpick-result@1`，data 只有 outcome。
- 只在 success 或已确认 give-up 时调用 complete；dispose / requestExit 绝不转 failure。
- `manifest.json` 必须含 schemaVersion、id、version、entry、context、locales、runtime input / outputs / modules。
- 按引擎现有自动流程生成 / 更新调用说明文档。
- 构建后运行 SDK contract、manifest、documentation closure、asset closure；验证部署子路径。

### 7. S8 必跑验证与交付证据

- 单元：难度映射、目标生成、值域、即时反馈、无限尝试、唯一失败路径、终局幂等、非法输入。
- 确定性：同 seed 双跑逐字段一致；异 seed 点名不同；快照恢复后继续输入一致。
- SDK：严格输入、严格输出、empty preview、complete accepted / rejected、dispose 不失败。
- UI：三种滑钮数 × 1440×900 / 810×506 截图；键鼠触控；reduced-motion；确认框。
- 资产：索引、消费槽、闭包、断网 dist。
- 执行 game-skill-audit、UI audit、align-check、scoped gate；以退出码为准，不得用管道吞码。
- 独立复查人不得与施工人相同；至少对核心终局门和严格 SDK 输出做撤修验红。

### 8. 明确禁止的“顺手优化”

- 不得加入失败次数、有限尝试、倒计时、评分、星级或排行榜。
- 不得把提示改为“具体第几枚正确”。
- 不得让宿主传答案、seed、图片或奖励。
- 不得把关闭 / 退出当失败。
- 不得以动画回调决定规则结果。
- 不得用 `Math.random`、React 屏、自由 DOM/CSS、绝对路径资产或远程必需资源。
- 不得在卡带里复制引擎已有 hash、PRNG、音频或输入桥。
