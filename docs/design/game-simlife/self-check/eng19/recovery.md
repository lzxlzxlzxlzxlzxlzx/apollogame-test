# SIMLIFE-ENG-19 自证｜Life 对话恢复与移动解锁

## 结论

恢复中的开放对话已由共享确定性运行链重建，坏旧档不会留下无面板的永久移动锁。该单没有改视觉结构、LayoutNode 或素材，因此证据采用真实 host composition 测试而非新增截图；happy-dom 走了正式 `mountLifeGame → WorldUi2D LayoutNode` 首帧、键盘与 pointer 路径。

## 对照单

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| active line 存档不复制脚本 | ✅ | 保存投影无 `DialogueScript/Text/WorldUI2D/DebugTrace`；恢复后从 catalog 重建且 persistent hash 不变 |
| active choice 首帧 | ✅ | 真实 persistent session + mount；第一次 renderer frame 显示 prompt 与两项选择 |
| Tab / Enter / pointer | ✅ | Tab 选第二项、Enter 推进到 `second` terminal line、pointer queued close 销毁 session |
| catalog 无 dialogueId | ✅ | post-restore tick 销毁 reserved entity，host `dialogueActive=false` |
| 缺 State / 未知 current | ✅ | 两种旧档均 fail-closed 清理，随后 queued `life.move.start:right` 使 motion.right=true |
| 跨场景恢复 | ✅ | `LifeContinuousMotion.sceneId` 先对齐持久 `LifePosition.sceneId`；Little Valley mine roundtrip 回归通过 |
| terminal / proximity / held release | ✅ | ENG-18 host/game-simlife 回归包含于 106-test 定向集 |
| trace / no-op | ✅ | rehydrate transition；invalid reject→transition；无 trace 时不创建实体 |
| 撤修验红 | ✅ | 删除唯一 rehydrate 调用后 4 红；恢复后 4 绿 |

## 命令实数

- Life/host/save/Little Valley：10 files / 106 tests passed，exit 0。
- 恢复后的点名验红回归：4 passed / 9 skipped，exit 0。
- ESLint（本单 TS 文件）：exit 0。
- DOCS-REF：PASS，exit 0。
- SYSTEM-GRAPH：PASS，exit 0。
- game-skill-audit：红旗 0，RATCHET PASS，exit 0。
- 全库 tsc：exit 1，仅既有 game-dice/game-theft/game-runner；本单文件零命中。

## 环境与边界

未启动或重启应用服务，未访问 5173，未启动浏览器；没有临时浏览器进程需要关闭。未执行数据库、Git 或 GitHub 操作。未修改 UI/游戏内容/资产，故没有 UI audit 或视觉差异项。
