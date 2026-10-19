# GCI 共享能力需求 · 结案归档

> 2026-10-16，Owner 选择 A：将单项共享能力的独立 PASS 与全库门禁分开记账，释放以下三条公共需求槽位。结案范围仅限各条共享引擎/验收能力；全库 scoped-gate 仍因 33 条域外 depcruise 错误失败，GCI 的 S2 复查、S3/S4 机器证也仍按当前流程板显示过期。本归档不声称全库门禁或游戏阶段通过。

## REQ-GCI-CART-UI-BRIDGE · 卡带 UI/会话宿主桥

原公共池范围：

- 原 UI 范围与证据见 `docs/design/game-clue-investigation/review/REQ-GCI-CART-UI-BRIDGE.md`、`GCI-S6-UI-02.md`、`GCI-S6-UI-03-independent.md`、`GCI-S6-UI-04-independent.md`；闭集 `presentation`、LayoutNode、house 主题、只读绑定和在线/内联同路径保持不变。无新字段卡带及 Canvas/指针旧行为不漂，World/hash 不进表现数据。
- S7 续单 `docs/design/game-clue-investigation/requests.md` 的 GCI-S7-HOST-SESSION-01，Owner 选 A：只改共享卡带运行核/必要资产接缝。HostVisualSession 在探针/正式 World 首次命中前绑定；动态 mask 不进本地索引/World/hash；失败、stop、unmount 清理。施工自检 20/20、撤修验红、TS/build PASS；异人独立复查 PASS（含异常清理实证），见 `self-check/GCI-S7-HOST-SESSION-01.md` 与 `review/GCI-S7-HOST-SESSION-01-independent.md`。
- 终局端口只给值拷贝/订阅，禁泄露可写 World、组件引用或玩法解释器；正式结果仍由世界态派生，SDK 投递归游戏薄 adapter。禁止改游戏 manifest、`src/ui/**`、Owner 人门或 H2 桌面壳。

结案证据：共享 UI bridge 与 S7 HostVisualSession 分别有非施工者局部 PASS；HostVisualSession 当前冻结源文件哈希与独立复查记录一致。全库门禁另记，不作为本能力失败；不代签 GCI S4/S7/S8 或 Owner 人门。见 `docs/design/game-clue-investigation/review/REQ-GCI-CART-UI-BRIDGE.md`、`docs/design/game-clue-investigation/review/GCI-S7-HOST-SESSION-01-independent.md`。

## REQ-GCI-POINTER-PROJECTION · 同源 2D 实形热点反馈投影

原公共池范围：

- 来源 `docs/design/game-clue-investigation/requests.md` 的 GCI-S4-POINTER-02；只改共享 Clickable 纯命中复用、卡带 opt-in 只读 pointer hover/press 表现投影及点名测试。游戏 manifest/验收由提需方消费，绝不改 sim 规则、放宽 mask fail-closed 或代签 S4 人门。
- pointermove/down 表现命中与 Clickable 消费同一 hit-mask、Sprite cover/contain、zOrder/id 及 onlyFlag 门；无效/缺失 mask 仍不命中。表现默认关闭、闭集样式与限额，不能将 hover/press 写入 World/hash。
- 验收包括定向单测、真实浏览器透明像素/重叠 zOrder/缩放/清理、异人四步复查。

结案证据：独立复跑 42/42、真浏览器连续 5 轮各 7 项和触屏 pressed 通过；透明像素锚点撤修验红。Owner 允许将域外全库 gate 单独记录；本结案不代表 GCI S4 或全库门禁通过。见 `docs/design/game-clue-investigation/review/REQ-GCI-POINTER-PROJECTION.md`。

## REQ-CART-UIWALK-ADAPTER · S4 真界面走查覆盖数据卡带

原公共池范围：

- 修复通用走查器只认 `GameRunner.__zcProbe`、导致数据卡带 0/91 假绿的问题；增加共享卡带 dev-only 只读动作口，按 `presentation.focusTargets`/LayoutNode 执行真实 DOM 或 Canvas 手势；缺口/不支持显式诊断，0/N 不可假绿。
- 禁止直接注入 Signal；不代签 GCI S4 或 Owner 人门。

结案证据：非施工者独立定向复跑 70/70；GCI 5 剧本 42/42 真 Canvas/DOM 手势、49 个 waitUntil 不入分母、18 个世界断言明示未核；`cart-presentation-browser` 7/7；负例、卸载和唯一锚点撤修验红通过。Owner 允许将域外全库 gate 单独记录；本结案不代表 GCI S4 或全库门禁通过。见 `docs/design/game-clue-investigation/review/REQ-CART-UIWALK-ADAPTER.md`。
