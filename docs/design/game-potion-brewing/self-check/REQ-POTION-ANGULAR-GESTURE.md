# REQ-POTION-ANGULAR-GESTURE · G2 施工自检

施工主体：Codex/root；Owner 准许本地工单主体领工。**当前仅局部自检，独立复查与完整门禁未完成，不释放公共池工单或改缺口 delivered。**

## 实现边界

- 新增通用 `t2-angular-gesture`：椭圆中心/半轴、抓取容差、死区、最大跳变、抖动与 330° 圈阈值全为配置。唯一位置状态为整数毫度角；`Transform.x/y` 每拍由角度用固定 CORDIC 算术派生，sim 不调用运行时 `sin/cos/atan2`。
- 连续指针由 `PointerInputSource({move:true})` opt-in：逆投影入 tick 队列，携带 pointerId、拒第二触点，处理 pointercancel/lostpointercapture/blur；缺省旧拖拽路径保持不变。合成 drag 的 release 终点仍参与最后一段角差。
- 同 tick 至多发一圈具名方向 Signal；绑定 `OrderedActionSession` 时同次握持在步骤推进后拒额外采样，未达圈的短弧不发 Signal。键盘 Q/E 继续走 `t2-keybind` 相同 Signal。DebugTrace opt-in，每 system 每 tick 至多三条。
- 仅实现引擎能力；G3/G4 及正式游戏 play-field 未施工，入水遮挡留给后续渲染/游戏阶段。真实鼠标/触控可见性尚无正式游戏可目击。

## 已跑证据与待独立核点

| 检查 | 实际结果 |
|---|---|
| G2 语义与宿主指针 | `angular-gesture.test.ts` 8/8、`queued-input.test.ts` 4/4 PASS；包含跨零点、正反抵消、连续两圈、短弧、死区、跳变、松手末采样、多触点、缩放与键盘等价 |
| G1 邻接回归 | G1 专测此前 10/10 PASS，G2 与 G1 联装用例在 G2 测试内通过 |
| 组件/注册 | 组件全集已重生至 231、基线 208；懒注册 `--check` 142 条同步 |
| 定序 | `system-graph-audit.mjs` G2+G1+keybind+clickable+drag-place+effect-apply 子集 7 系统 PASS，无环 |
| 静态检查 | G2 相关五 TS 文件 ESLint exit 0；全库 tsc 仅报 card-reveal/dice/theft/launcher 既有/并行错误，G2 文件零命中；`tsconfig.sim` 被 `narrative-director.ts` 缺 `@net/determinism.js` 阻断 |

独立复查请特别核：① 指针队列顺序、pointercancel 与多指互斥；② CORDIC 椭圆投影与跨 ±180° 方向；③ 同拍发圈/步骤锁定；④ 配置/运行态快照；⑤ opt-in 对旧拖拽逐字节行为；⑥ 带锚点的隔离撤修验红。读取 stderr，不只看退出码。
