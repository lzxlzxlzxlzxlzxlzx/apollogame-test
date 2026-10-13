# SIMLIFE-ENG-19 Review 单｜恢复中的 Life 对话会话重建 / 防永久移动锁

## 1. 状态与裁决

状态：**✅ 已由非施工人独立验收（2026-10-10）**。

owner 已选择 **A**：恢复后的活动 `LifeDialogueSession` 必须由既有 `t2-life-talk` 在确定性运行链中，使用静态 `LifeDialogueCatalog` 重建非持久化 `DialogueScript`；非法旧快照则清理孤儿会话并解锁。不得把脚本复制进存档，也不得在 LifeHost 写私有强制解锁补丁。

## 2. 声明边界

- 施工主体：BDM程序（锁）。
- 允许：`src/skills/tier2/life-talk.ts`、必要的 `src/engine/host/life-save.ts` 契约说明、对应点名测试，以及本工单文档/自证。
- 禁止：`src/ui/**`、游戏内容 JSON、素材/资产索引、数据库、服务、Git/GitHub、`narrative-director` 与其他无关文件。
- 不新增 capability、system、phase 或游戏私有逻辑。

## 3. 实现语义

1. `t2-life-talk@1.3.0` 每 tick 先核对保留实体 `life:dialogue-session:player`。`LifeDialogueSession.status/dialogueId`、静态 `LifeDialogueCatalog`、`State.fsmId/current` 全部一致时，缺失或陈旧的 `DialogueScript` 从目录重建，缺失 `Text` 同步补回；同 tick 后续 `t3-dialogue` 渲染正确文本。
2. 目录缺失、dialogueId 不存在、State 缺失/FSM 不符/current 未知，或 reserved entity 只剩运行态残片时，销毁整个实体。恢复没有写 storage、没有 host 私有解锁；Host 只因权威 session 消失而自然得到 `dialogueActive=false`。
3. `createPersistentLifeGameSession` 在原子 restore 成功后运行一次正常确定性 tick，保证 run-loop 的立即首帧读取已经拿到重建的脚本、文本和选项。未配置、缺档、兼容性失败不额外 tick。
4. 首 tick 暴露了既有 transient 场景错位：fresh baseline 的 `LifeContinuousMotion.sceneId` 会让 `life-position-sync` 把持久 `LifePosition.sceneId` 拉回出生场景。`resetTransientState` 现先把 motion scene 对齐到持久 position，再清 held/velocity/request；没有扩大存档投影。
5. `PERSISTENT_COMPONENTS` 继续只保存 `LifeDialogueSession + State`，明确排除 `DialogueScript/Text`；rehydrate 前后 `lifeHostPersistentHash` 与保存时 hash 相同。

## 4. trace

- 正常恢复：一条 `transition life:player dialogue runtime=rehydrated ← <dialogueId>:<current>`。
- 非法恢复：一条 `reject ... ← <closed reason>` 加一条 `transition ...→cleared`。
- 单 tick ≤3；没有 `DebugTrace` 时不创建 trace 实体、不拼事件、不改变持久 hash。

## 5. 施工验证

```text
npx vitest run src/skills/tier2/life-talk.test.ts src/skills/tier3/dialogue.test.ts src/engine/host/life-host.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-save.test.ts games/game-simlife
```

结果：**10 files / 106 tests passed**，exit 0。覆盖真实 `createPersistentLifeGameSession` 的 active line/choice、first paint、Tab/Enter/pointer、三类坏旧档、移动恢复、terminal close、脱离 proximity、held release、Little Valley 跨场景恢复。

- 本单文件 ESLint：exit 0。
- `node scripts/docs-ref-guard.mjs`：`DOCS-REF: PASS`，exit 0。
- `npx vite-node scripts/system-graph-audit.mjs t2-life-talk t3-dialogue`：2 systems 可排、零环；全局 119 systems、零重复 id、零悬空显式边，`SYSTEM-GRAPH: PASS`，exit 0。
- `node scripts/game-skill-audit.mjs game-simlife`：未覆盖红旗 0，`RATCHET: PASS`，exit 0；薄游戏目录的“零能力接入”仍是既有静态扫描 warning，能力实际由共享 LifeHost 编译装配。
- 全库 `npx tsc --noEmit --pretty false`：exit 1，仅报既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`；本单文件零命中。
- 未改 LayoutNode，按工单无需 UI audit。未访问/重启 5173，未启动无头浏览器。

## 6. 撤修验红

先以精确锚点确认 `life-talk.ts` 中 rehydrate 调用唯一命中（line 115），再临时删除该调用并运行：

```text
npx vitest run src/skills/tier2/life-talk.test.ts src/engine/host/life-game-host.test.ts -t "rehydrates|clears an invalid|clears malformed"
```

结果精确 **4 failed / 9 skipped**：运行态不重建 2 红、非法游标不清理 2 红。用 `apply_patch` 恢复调用后同一命令 **4 passed / 9 skipped**，exit 0。

## 7. 待复查清单

1. 真实 `createPersistentLifeGameSession` 的 line/choice save→restore→next tick→presenter/input/pointer 全链。
2. 缺 catalog dialogue、缺 State、未知 node 的旧快照必须清理会话，`movementLocked=false`，方向可重新产生 `life.move.start`。
3. 存档投影不含 `DialogueScript`、`Text`、host/render 数据；脚本只从静态目录重建。
4. terminal close、脱离 proximity 推进、held direction release 的 ENG-18 回归。
5. DebugTrace 的 rehydrate/invalid recovery 可重建，关闭时零事件、零权威/hash 污染。
6. 独立复跑、带锚点撤修验红、实证复现与告警阅读。

## 8. 范围与已知外部红

- 修改面仅：`life-talk` 与测试、Life host/save 与测试、game-simlife capability plan/工单/review/self-check、save playbook。
- 未改 `src/ui/**`、游戏 JSON、资产、数据库、服务、`narrative-director`，未执行 Git/GitHub。
- 全库 tsc 的三组既有类型错误不属于本单且未越界修复。
- 本文只是施工导航；复查人必须独立复跑、独立撤修验红并阅读全部告警，不能采信本节自陈。

## 9. 独立复查实证（非施工人，2026-10-10）

- 独立复跑 Life 对话、持久宿主、存档及 Little Valley：**10 files / 106 tests passed**；其中真实持久 line/choice 的即时 presenter、坏 cursor 清理与恢复移动均已由点名断言覆盖。
- 独立复读确认：存档只存 cursor（`LifeDialogueSession + State`）；`DialogueScript/Text` 不落盘。恢复后 `life-talk` 在 `dialogue` 之前从静态 catalog 重建；无效 session 被销毁，宿主没有私有解锁分支。
- 跨场景恢复中 `LifeContinuousMotion.sceneId` 对齐 `LifePosition.sceneId` 的修复已由存档测试证明，避免第一拍 position-sync 把玩家拉回出生场景。
- 独立撤修验红：临时移除 `reconcileRestoredDialogueRuntime` 调用后，点名集精确得到 **4 failed / 9 skipped**（运行态重建、真实存档首帧、坏游标清理均失效）；恢复后 **4 passed / 9 skipped**。恢复后的技能审计无红旗，RATCHET PASS；ESLint、DOCS-REF 与子系统图审计均通过。
