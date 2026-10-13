# GAL-ENG-02B 施工自验 / 独立复查导航

> 2026-10-10，施工者：Codex/root。**状态：待非施工者独立复查**；本文不是独立复查结论。Git/GitHub、数据库写入和服务启动均未由 agent 执行。

## 范围和裁决

- Owner 已定最近 512 个玩家可见节点；`line/choice/check/ending` 计步，`jump` 同拍自动落到下一个可见节点，不占历史席位。到窗口最旧处返回 `history-limit` 且不动状态。
- 复用 `InputQueue`、`StoryRuntime`、Resource/Flag、`RandomSeed` 和世界快照；不以异步正式存档槽或只具前向能力的 World delta 冒充逆向历史。没有调用 `World.restore` 做逐句回滚，所以实体创建序不会被回滚重排；世界完整快照恢复测试显式保留 `snapshotOrder()`。
- 新增 `NarrativeHistory` 会话组件，存包 ID/静态包指纹、窗口游标、窗口最旧 enter 账本基线及各可见步增量，并只抓剧情域的 StoryRuntime、投影、Resource/Flag/RandomSeed。静态 `GalPackage`、外部 `PlayerProfile`、输入队列、媒体对象均不进入每步记录。`exportNarrativeHistory` / `importNarrativeHistory` 是未来版本化 GAL 存档控制器接线边界；旧档缺历史时从载入点重新开窗，不写现有 SaveSystem。
- 触及 `src/skills/tier3/narrative-director.ts`、对应测试、`src/assembly/component-map.ts`、生成的组件全集/能力注册表，以及 `docs/playbooks/pick-list.md`；未触碰 PUI、游戏、资产或正式存档服务。

## 自验证据

- 定向套件：`npx vitest run src/skills/tier3/narrative-director.test.ts src/assembly/gal-package.test.ts src/assembly/system-graph.test.ts src/assembly/capability-registry.gen.test.ts`，最终退出 0，**46/46**；覆盖跨 choice 改选/旧未来截断、enter/effect 与种子恢复、全局假档案保留、World snapshot 续跑、坏版/坏包/坏引用导入拒绝、hard checkpoint、同拍双输入、自动模式拒绝、trace 和 512/513 裁剪。
- 512 可见步实测 `NarrativeHistory` 的 UTF-8 JSON 为 **721,111 bytes**；测试断言 `<1,000,000 bytes`，第 513 步淘汰第 1 条。改成“enter 基线 + 每步增量”后，不再每条复制完整随全局游玩增长的 enter 账本；历史序列化不含 `GalPackage`/`chapters`。
- `node scripts/build-component-map.mjs --check`：组件全集一致；`npx vite-node scripts/gen-capability-registry.mjs --check`：注册表同步；`npx vite-node scripts/system-graph-audit.mjs t3-narrative-director`：PASS，无共装环/悬空边。图单测 stderr 中的 `[L,P]` 环是该单测故意构造的告警，不是 Director 共装图告警。
- `npx tsc --noEmit --pretty false`：退出 1；最后一次输出的诊断在 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/engine/host/life-game-host.test.ts`、`src/launcher/game-runner.tsx`，无 GAL 新增诊断。`life-game-host.test.ts` 是本轮后段新出现的非 GAL 类型错误；未跨域改它。故**不能宣称全库门禁绿或项目交付**。
- 施工者撤修验红：把常量 `NARRATIVE_HISTORY_LIMIT` 的锚点临时改为 `1`，定向执行 `-t "rolls across a choice"` 退出 1，确切红在预期的 `['line','choice','check']` 仅剩 `['check']`；随后通过 `apply_patch` 恢复 512 并复跑。这不是非施工者复查。

## 非施工者复查要求

1. 独立复跑定向套件、组件全集/注册表守卫、真实系统图与 `tsc`，逐项读 stderr，确认非 GAL 既有红灯边界。
2. 带锚点隔离撤修验红：至少撤 `512` 淘汰守卫、`choice-unconfirmed` 拒绝或 enter 增量恢复之一；确认点名测试实际转红，然后恢复原样。勿在共享工作树留下 mutant。
3. 实证核查从 choice 改选后旧未来不可恢复、同 seed 检定重走结果相同、旧档重新开窗、包不匹配拒绝；检查 trace 每系统每 tick ≤3、关闭时零事件。
4. 检查 `NarrativeHistory` 只保存会话剧情域、512 窗口及跨长篇 enter 账本内存阶，确认未来正式存档控制器需另票接入而本票没有擅写持久化。

**交接门：** 非施工者签完独立 Review 前，本票只能称“局部施工自验完成”，不能称“独立复查通过”。

## 非施工者独立复查（2026-10-10，GAL 策划）

**判词：GAL-ENG-02B 范围内 PASS；全库门禁 CONCERNS。** 独立复跑最终 47/47 定向测试通过；组件全集 `--check`、能力注册表 `--check`、真实 `t3-narrative-director` 系统图均退出 0。测试中的 `[L,P]` 环告警来自故意构造环的 system-graph 单测；真实 Director 子图无环。全库 `tsc --noEmit --pretty false` 退出 1，诊断只指向非 GAL 的 `game-dice/dice-window.ts`、`game-theft/ui.ts`、`launcher/game-runner.tsx`；未据此宣称整体门禁绿。

- 实证复现并退回过一项 P1：原导入只校验 cursor 的 ref，不校验已载入 World 的资源值。把快照恢复后的 `affection.current` 改成 77，原 `importNarrativeHistory` 错误返回 `true`；施工者修正后，非施工者用同一对抗测试独立复跑转绿。现导入对当前 StoryRuntime（排除交互回执）、NarrativeProjection、全部 Resource/Flag/RandomSeed 逐项对拍；不一致拒绝，不覆盖载入状态。新增测试覆盖这五类偏差和正常导入。
- 独立撤修验红：先断言源码 `export const NARRATIVE_HISTORY_LIMIT = 512;` 和测试导入锚点各唯一命中，再复制隔离的 source/test 副本，仅在副本把上限改成 1 并指向副本实现。点名 `rolls across a choice` 测试退出 1，实际从预期 `['line','choice','check']` 变为 `['check']`；真实源码未改，三个临时副本已删除。
- 512/513 淘汰、最旧边界 `history-limit`、跨 choice 改选截断旧未来、种子与效果恢复、旧档缺历史新开窗、坏包/坏版/坏引用/当前点不匹配导入拒绝、同拍双输入与 trace 均由最终点名断言覆盖。历史仅保存剧情域状态，不含静态包或全局 Profile；512 条测试实测 721,111 bytes。正式存档控制器与滚轮 UI 接线仍属后续工单，不在本票宣称完成。

本复查没有执行 Git/GitHub、数据库写入或应用服务启动。上述 PASS 仅表示 02B 的局部能力通过独立复查；全库门禁红灯与后续接线仍未完成。
