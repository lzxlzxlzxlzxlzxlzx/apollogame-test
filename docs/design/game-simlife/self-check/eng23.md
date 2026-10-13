# SIMLIFE-ENG-23 自证｜连续移动与非阻塞邻近对话

日期：2026-10-10  
施工主体：BDM程序

## 结论

本单把对话会话的范围生命周期收回共享确定性模拟层，并移除宿主旧的“对话锁移动”策略。Little Valley 以严格 JSON 显式选择 `interaction.dialogueSessionPolicy: "proximity"`；旧包省略时由 compiler 明确落成 `persistent`。本单没有改 LayoutNode 结构、主题、画布投影、美术或 renderer，因此没有新增视觉截图；真实 `mountLifeGame → WorldUi2D LayoutNode` 的键盘/鼠标/首帧行为由 happy-dom 集成测试覆盖。没有启动服务或浏览器。

## 对照单

| # | ENG23 承诺 | 结论 | 证据 / 说明 |
| --- | --- | --- | --- |
| 1 | Up+Left held 后 E/repeat 不改 held state，不发 stop | ✅ | `life-host.test.ts` 纯 reducer 点名顺序；Little Valley DOM adapter + 真实 World/Velocity 回归 |
| 2 | 对话期间继续自由移动 | ✅ | Little Valley 真实连续移动中开启对话；对角 `LifeContinuousMotion` 与 `Velocity` 保持，宿主 mount 回归证明 pointer close 不释放 held direction |
| 3 | 离开 NPC/object interactionRange 同 tick/下一 tick 关闭 | ✅ | `t2-life-talk@1.4.0` 在 `dialogue` 前读取同 tick `LifeActivityContext.nearbyPlacementIds`，越界销毁权威 session |
| 4 | package 默认与 placement override 同源 | ✅ | strict validator/compiler + package range/placement override 点名测试；不复制距离算法 |
| 5 | 离开后 held state 继续、回到范围可重开 | ✅ | Little Valley 从镇长处持续对角离开、session 自动关闭、反向回到范围、重新 talk 并走到 terminal close |
| 6 | choice / terminal / Tab / Enter / pointer 不退 | ✅ | generic host active-choice restore 与 pointer close；Little Valley controller terminal 回归 |
| 7 | aliases / repeat / blur / visibility 不退 | ✅ | reducer、DOM adapter、world-interaction 与 Little Valley 完整回归 |
| 8 | 旧包兼容默认 persistent | ✅ | compiler 明确生成 `sessionPolicy:'persistent'`；legacy session 离开范围仍保留 |
| 9 | 新策略下旧活动游标恢复 fail-safe | ✅ | 近处 cursor 正常重建；持久位置改为远处后首个 post-restore tick 清理 session，不写 host/UI 私态 |
| 10 | 确定性 / hash / save | ✅ | 相同 proximity run 得到相同 snapshot hash；save 仍只存 `LifeDialogueSession + State`，静态 policy 来自 fresh baseline |
| 11 | DebugTrace | ✅ | 越界记录 bounded `decision(target-out-of-range) → transition(open→cleared)`；无 trace 时不创建或写入调试状态 |
| 12 | 数据驱动边界 | ✅ | 新字段为闭集 `persistent|proximity`；没有新 system/phase、游戏层解释器、DOM 世界写或 renderer 改动 |

## 验证实证

- Life 全链定向回归：施工阶段 **27 files / 215 tests passed**；独立复查按终态工作树复跑为 **27 files / 218 tests passed**。
- 本单相关 TypeScript ESLint：exit 0，零 warning。
- `DOCS-REF: PASS`；component manifest **205/205 PASS**。
- system graph：全局 **119 systems**、零重复 id、零悬空显式边；相关 5 capability / 8 systems 子图无环，`SYSTEM-GRAPH: PASS`。
- `game-skill-audit game-simlife`：未覆盖红旗 0，`RATCHET: PASS`；薄宿主“零能力接入”仍是既有静态扫描黄项。
- `align-count --game game-simlife --stage S4`：**✅ 60 / ⚠ 0 / ❌ 0**，exit 0。
- 全库 `tsc --noEmit` / `npm run build` 仍被既有 `game-dice`、`game-theft`、`src/launcher/game-runner.tsx` 与 ENG22 `art-consumption.test.ts` 类型错误阻断；输出未命中 ENG23 文件。

## 撤修验红

锚点 `if (sessionPolicy === 'proximity')` 在 `life-talk.ts` 精确命中 1 处。临时改为恒假后，点名的“proximity 越界关闭”和“placement override 范围”用例精确 **2 failed / 6 skipped**，均因权威 session 未销毁而红；恢复锚点后同两项 **2 passed / 6 skipped**。`ENG23 sabotage` / `false && sessionPolicy` marker 为 0，未遗留临时改动。

## 环境与边界

未启动或重启应用服务，未访问数据库，未执行 Git/GitHub。未修改 `src/ui/**`、`src/renderer/canvas-renderer.ts` 或资产目录。由于本单无布局/主题/素材变化，且生产 build 被上述无关类型红阻断，没有生成伪称“当前构建”的新截图；既有 S4 对齐单仍由 `align-count` 确认收敛。
