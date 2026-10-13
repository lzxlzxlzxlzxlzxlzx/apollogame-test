# Review 单 · `SIMLIFE-ENG-12A` 通用确定性 NPC 日程

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-ENG-12A`（owner 裁决 **A**） |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | ✅ 已独立验收（2026-10-09） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | Life protocol/schema/compiler/validator/calendar/NPC schedule capability/注册与定序；activity/talk/renderer；Little Valley JSON/HUD/输入/存档/测试/文档/自证 |

## 一、实现摘要

1. `calendar.slots + initialSlot` 为严格、稳定、至少两项的日内时段数据；旧 package 不声明时保持原编译实体与按日语义。
2. 新增 `life.advance-time`：推进到下一 slot；末 slot 回卷时推进 day/season 并回到 `initialSlot`。既有 `life.advance-day` 继续直接推进一天，并在有 slots 时重置到 `initialSlot`。
3. NPC placement 可选完整 schedule；validator 要求每 slot 恰好一次、目标 scene 存在、整数坐标界内且非 blocked、`visible` / `interactive` 都是布尔值。
4. compiler 为 scheduled NPC 生成 `LifeActor(kind:npc)`、初始 `LifePlacement` / `Transform` / `LifePosition` 与可快照 `LifeNpcSchedule`。运行时先按稳定 entity id 投影 placement，再在 Commit 收束 NPC Transform/LifePosition；显式晚于同相位 Transform RMW 系统，真实 strict 子图无环。
5. renderer 只看动态 `visible`；activity/talk 同时要求 `visible !== false && interactive !== false`，两维保持独立。
6. Little Valley 的镇长与商贩各有两段对话，在清晨/午后于 `(20,8)` / `(22,8)` 互换；原首次收获汇报门与矿洞故事链未改。HUD 新增时段 Badge 和可点击 `T：消磨时光`，N 保持。
7. slot/calendar/schedule cursor/placement/position 均进入 snapshot/hash；Little Valley autosave signature 纳入 `LifeNpcSchedule` 与 `LifePlacement`，午后恢复不漂移。

## 二、请独立逐条复核

| # | 核什么 | 建议复跑 | 施工方结果 |
|---:|---|---|---|
| 1 | legacy byte-compatible 分支 | `life-package-compile.test.ts` 的 legacy calendar/entities 断言 | 无 slots/schedule 时无新 capability/keybind/字段 |
| 2 | 严格数据门 | `life-package.test.ts` schedule 用例 | 缺 slot、重复 slot、未知 scene、非法布尔/未知字段、无 authored slots 均拒绝 |
| 3 | calendar 语义 | `life-calendar.test.ts` | morning→afternoon 不换日；afternoon→morning 换日/季；advance-day 回 morning |
| 4 | 同拍投影与定序 | `life-npc-schedule.test.ts` + `declaration-audit.test.ts` | placement 先供 activity/talk，Commit 同拍同步 NPC Transform/LifePosition；strict 无软环 |
| 5 | visible / interactive 分离 | `life-activity.test.ts`、`life-talk.test.ts`、`life-scene-render.test.ts` | 隐藏不渲染；任一交互门关闭均不进入 nearby/talk |
| 6 | 确定性 / hash / trace | `life-npc-schedule.test.ts` | 倒序无关、两世界 hash 相同；cursor 改变 hash；单次迁移 trace 为 decision/transition/commit 共 3 条 |
| 7 | 小山谷完整链 | `game-simlife.test.ts` | T 更新时段并交换两 NPC；原 farm→mayor→mine 路径继续通过 |
| 8 | 存档/autosave | `save.test.ts` | slot 投影触发一次保存；恢复 cursor 与 mayor 午后位置 |
| 9 | UI / 真交互渲染 | UI audit + `self-check/shots/eng12a` | 0 overlap / 0 contrast failure or warning / 0 border-image；真实键盘链完成移动、T、E，三帧页面错误 0；镇长/商贩可辨识、prompt 与对话可读 |
| 10 | 撤修验红 | 临时把 Little Valley 午后 mayor x 从 22 改 21，跑 `maps T to advance-time` | 锚点准确 1 红 / 16 skipped；恢复后最终集合全绿 |

## 三、验证证据

- 最终定向回归：**16 文件 / 126 测试全绿**，覆盖 validator/compiler/registry/component map/declaration audit/system graph/calendar/schedule/activity/talk/renderer/game/save/UI interaction。
- ESLint：本工单修改的 17 个生产 TS 文件 **PASS（0 warning）**。
- registry generator `--check`：**同步 135 条**；component manifest：**196/196 PASS**。
- `game-skill-audit game-simlife`：**AUDIT PASS / RATCHET PASS**；`docs-ref-guard` PASS。
- `align-count --game game-simlife --stage S4`：**✅36 / ⚠0 / ❌0**。
- UI audit 1060×760：重叠 0、硬对比失败 0、3–4.5 警告 0、border-image 问题 0；短生命周期 Edge 已关闭，`.ui-audit-tmp` 已清理。
- 真交互渲染返修：临时 IIFE 将仓内既有 mayor/farmer SVG 内联给同一 `AssetManager`，隔离 Edge 在 `file://` 下通过真实 W/A/S/D、T、E 键完成路径。`01-morning-mayor-talk.png` 显示酒红礼帽镇长与“交谈·梅尔镇长”；按 T 后 `02-afternoon-old-spot-merchant.png` 同点变为蓝衣草帽商贩与“交谈·商贩莱娜”，自动断言 old mayor option 消失；绕行至新点后真实 E 打开 `03-afternoon-mayor-dialogue.png` 的镇长对话。页面错误 0；浏览器与临时构建均已清理。

## 四、告警与边界

- 全库 `tsc --noEmit` 仍被既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts` 与 `src/launcher/game-runner.tsx` 的 LayoutNode/mount 类型错误阻断；最终输出中没有本工单文件。
- `scripts/scoped-gate.mjs --run` 未执行，因为它内部调用 Git，而 owner 规则禁止 agent 执行任何 Git 命令；已手工执行不含 Git 的对应测试、注册、清单、系统图、lint、游戏审计、UI 审计与自证。
- 未改 `src/ui/**`、`pipeline.json`；未执行 Git/GitHub、未修改数据库、未启动应用服务。

## 五、独立复查重点

1. `life-calendar` 为使 slot 边界在同 tick 先于 navigation/activity 可见，现显式位于 `life-input` 后、`life-navigation` 前；全库超集 SCC 基线因此有意识纳入 `life-calendar`，真实 Little Valley strict 子图不抛且无告警。请重点判断此输入定序是否符合语义。
2. NPC Transform/LifePosition 同步拆到 Commit，避免与玩家 motion 的 Update RMW 形成真实环；interaction/render 的同拍权威投影是 `LifePlacement`。请核是否接受这条双阶段投影边界。
3. Little Valley 两 NPC 当前只在同一场景两坐标互换，符合首版“瞬时 relocation、不伪装路线动画”；跨 scene 能力由 validator/compiler/capability 测试覆盖，样例未额外造室内场景。

## 六、独立复查结论（2026-10-09）

- 复查人：本会话策划，非施工主体 BDM程序。独立复跑了 NPC 日程的定向集合 **16 文件 / 126 测试**；可见角色素材调整后，又复跑 Little Valley JSON、世界交互与 Life scene renderer 的 **4 文件 / 47 测试**，均全绿。
- 独立撤修：将 Little Valley 镇长午后 schedule 的 x 坐标从 `22` 暂改为 `21`；`maps T to advance-time` 锚点准确 1 红，期望 22、实际 21。已精确恢复。
- 目视复核 `self-check/shots/eng12a/`：清晨旧点为梅尔镇长且提示可交谈；按 T 后同点为商贩莱娜；午后新点可重新与镇长对话。NPC 身份、时段和互动提示可辨识。
- 结论：**PASS**。日程为通用、确定性、可快照的 Life capability；Little Valley 仅以 JSON 填写时段位置与可见/互动属性，符合模型产出数据、引擎解释数据的边界。
