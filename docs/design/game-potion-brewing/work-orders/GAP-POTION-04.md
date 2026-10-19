# GAP-POTION-04 / G4 · 通用材料拖动预览与回弹

> 历史施工规格，**G4 已于 2026-10-13 按炼药项目范围交付并从公共池释放**；权威当前判词见 [G1–G4 独立复查](../review/G1-G4-scoped-release-2026-10-13.md)。G4 曾由 Owner 单独选 A，非早前“全部 A”答复的外推；正式游戏的消费和视觉验收仍归 S4/S5。

- 施工主体：Codex/root（Owner 特许本地领工锁）；输入壳层与 2D render 共享面，须主程归属/review。暂定 `t2-drag-preview`，并非已注册 API。默认关闭，仅配置预览槽的 Draggable 才出表现影像；材料实体和 G1 判定始终唯一权威，预览不可点击或投放。
- 输入：复用 `PointerInputSource` 的 down/move/up 世界坐标；现有入口尚无 `pointercancel` 监听与活跃 `pointerId` 守卫，A 能力需在 opt-in 路径补 `pointercancel`、`lostpointercapture`、失焦清理，记录单活跃 pointerId 并拒第二指针，不伪称旧能力已具备。渲染用稳定 Sprite.textureKey/Frame/Color 槽。
- 输出：按下 140ms 抬起、拖动影像跟随指针且不动权威 Transform。释放读 G3 同一共享纯命中结果；合法投放影像消隐，锅外固定 280ms ease-out 回起点且不提交。权威结果仍由 `drop-zone` Signal 决定；G4 不向 G1 额外发送玩法动作。
- 边界：不从 URL/alpha 反推 ID，不用游戏级自由 DOM/CSS/Canvas，不以墙钟或裸随机影响规则；预览不入 World 快照/hash/宿主输出。取消、离窗、资源失败、组件卸载清影像。reduced-motion 保留落点/结果反馈但取消大位移。
- 验收：桌面鼠标、真实触控、不同 DPR/画布缩放、两材料并发拒收、按下不动/短距松手、锅外回弹/锅口消隐、pointercancel/离窗/unmount、资源失败 fallback；材料 Transform 与快照/hash 全程不变；默认关闭的旧游戏逐字节回归。锚点撤修验红、无新增系统环告警、非施工者独立复查后才可标 delivered。

