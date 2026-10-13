# REQ-POTION-DRAG-PREVIEW / G4 施工自检

> 2026-10-13。施工者证据，不代替独立复查、正式游戏 S4 真浏览器目击或全库门禁。

- 通用接缝：`PointerInputSource({move:true,onPointerSample})` 把入 Command 的同一量化世界坐标只读交给宿主；callback 异常只警告、不吞权威输入。`DragPreviewLayer({entityIds})` 是显式 opt-in 的宿主本地状态，复用 G3 `findDraggableAt/findDropZoneAt/canDropZoneEmit`；仅 `phase:'drag'`、命中锅口且权威材料具有 Clickable、区载体未占用时才消隐，短距 `up` 不假报投放。`CanvasRenderer({dragPreview})` 复用 Sprite/Frame 解析、Color alpha 与 Shape 占位；无预览参数的旧路径不变。
- 行为：按下 140ms 表现抬起、移动跟手；无效释放 280ms ease-out 回源点，有效释放 120ms 消隐；cancel、blur、源实体移除和 renderer.destroy 清影像，dispose 后不再重启。reduced-motion 自动匹配系统偏好或显式配置，取消抬起/长回弹但保留短反馈。预览从不写 World/Signal/权威 Transform，也不入快照/hash。
- 当前点名自测：`npx vitest run src/renderer/drag-preview.test.ts src/runtime/drag-preview.test.ts src/net/host/queued-input.test.ts src/skills/tier2/drop-zone-hit.test.ts --pool=forks --maxWorkers=1 --minWorkers=1`，19/19 PASS；缺图占位、真实 Sprite drawImage、默认关闭、销毁、DPR/触控动作 callback/故障隔离、无 Clickable/区占用回弹及 World/hash 不变均有断言。
- 待证：非施工者独立锚点撤修；真鼠标/触控和不同 DPR 的正式游戏可见链；全库门禁。任一缺口未闭合，不释放公共池或改机读缺口为 delivered。
