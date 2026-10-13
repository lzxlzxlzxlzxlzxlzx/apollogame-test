# SIMLIFE-ENG-21 自证｜通用 2D 相机安全区跟随 + 地图边界钳制

日期：2026-10-10  
施工主体：BDM程序

## 结论

- `l5-camera@1.1.0` 新增闭集 `followDeadZone:{left,right,top,bottom}` 数据合同；四边均为有限屏幕比例 `0 <= value < 0.5`。通用 manifest 递归 schema 校验其形状/必填字段/类型/范围，Life package 在可信边界上把未知字段也 fail-closed。
- `t2-camera-follow@1.1.0` 保留原 AABB 中点、`followOffset` 与 fit zoom 口径。省略安全区时仍逐 tick 精确居中；声明安全区时以新 zoom 对应的世界可视尺寸计算边界，焦点在区内则保持原 Camera 轴，越界只修正对应轴并恰好落到该边，最后才执行 Bounds 钳制。
- Bounds 是最终权威：地图边缘相机保持在合法中心，玩家/多目标焦点可以继续靠近屏幕边，系统不回写或回拉任何目标 Transform；小于视口的地图仍按原语义居中。
- Little Valley 的唯一 JSON package 声明 28×19 视口和四边 0.3 安全区。真实连续移动回归覆盖出生边界钳制、区内保持、越界卷动、右侧地图边缘；`movement.speed:0.3`、碰撞、warp 与互动链未改变。
- `Camera`/`DebugTrace` 继续排除确定性 hash，Life save 继续排除 Camera；responsive cover、玩家/格高亮与 WorldUI2D 仍只消费同一个 renderer-private effective view，未修改 renderer，未回写 World/Camera。
- DebugTrace 仅在显式挂载时记录安全区越界的逐轴 decision、Bounds 实际钳制轴与 Camera commit；区内但焦点偏离中心的被抑制移动记一条 reject，并按最近同类事件去重，连续静止与正中心无事 tick 均为 0 新事件。无 trace 时不构造日志字符串、不创建状态，单 system/tick 最多三条。
- 未新增 system、phase、游戏专属解释器或 renderer/host 补丁；未触碰 UI、资产、数据库、服务、Git/GitHub。

## 验证实证

- 相机原子/纯能力、manifest schema/registry、Life schema/compiler/raw package、Little Valley、Life renderer、Canvas responsive viewport、WorldUI2D、save/host、warp/navigation、determinism 与 DebugTrace：**19 files / 202 tests passed**。
- 本单涉及的 13 个 TypeScript 文件 ESLint：exit 0，零 warning。
- `vite build`：**754 modules transformed**，构建成功；仅保留项目既有 chunk-size 建议告警。
- `node scripts/docs-ref-guard.mjs`：扫描 46 个 Markdown、390 路径，`DOCS-REF: PASS`。
- `vite-node scripts/system-graph-audit.mjs t2-camera-follow t2-life-continuous-motion t2-life-navigation`：全局 119 systems / 216 显式边、零重复 id、零悬空边；相关子集 5 systems 无环，`SYSTEM-GRAPH: PASS`。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 0，`RATCHET: PASS`；“零能力接入”为既有薄宿主静态扫描黄项，实际 package 经共享 compiler/registry 装配能力。
- `npm run build` 的 TypeScript 阶段仍只被既有 `game-dice`、`game-theft` 与 `src/launcher/game-runner.tsx` 类型错误阻断；输出未命中本单文件；随后独立执行 `vite build` 成功。

## 语义覆盖

1. 纯能力：省略兼容、区内保持、左/右/上/下四边、单轴、对角逐轴、Bounds 末置、四角、地图小于视口。
2. 组合兼容：多目标 AABB 中点、`followOffsetX/Y`、动态 fit zoom 均先于安全区；测试证明 zoom 后的安全边世界距离参与修正。
3. Authoring：Life `deadZone` 可省略；声明时必须四边齐全、有限且落在 `[0,0.5)`，unknown/missing/type/range 均有稳定 JSON path；compiler 隔离复制对象，省略时 Camera 输出形状保持原样。
4. 实际游戏：Little Valley 连续 `life.move.start/stop` 路径从相机 hold 进入 scroll，再抵达 `Bounds.maxX - viewportW/2 = 22`；玩家 Transform 仍可到地图右缘附近且未被相机回拉。
5. 表现/状态：现有 responsive cover、highlight、WorldUI2D 同投影回归及 snapshot/hash/save/warp/host 回归全部通过。

## 撤修验红

- 锚点 `const deadZone = cam.followDeadZone;` 在 `camera-follow.ts` 精确命中 1 处。
- 临时改为 `const deadZone = undefined;` 后，点名用例 `holds inside the zone and resolves diagonal overflow independently per axis` 精确 **1 failed / 18 skipped**：区内焦点把 Camera 从 `(0,0)` 错误拉到 `(20,-10)`。
- 用 `apply_patch` 精确恢复后，同一点名用例 **1 passed / 18 skipped**；review 发现并返修 trace 心跳、跨多相机去重与无 trace 热路径分配，并把 save 回归的旧移动 tick 路径同步为当前 0.3 速度的已验证路线后，最终完整定向回归 **19 files / 202 tests passed**。未遗留 sabotage marker 或临时文件。
