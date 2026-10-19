# SIMLIFE-UI-SHELL-01｜独立复查导航

状态：**PASS（独立复查，2026-10-14）**。

## 复查范围

- `life-host-tracked-quest`、`life-host-world-status`、`life-host-resource-actions` 均为只读 LayoutNode 投影；空任务状态安全。
- Host 壳层覆盖 play-field，I/J/C 抽屉互斥与 save/hash/input 合同不回归。
- 深浅主题审计与零写入 materializer plan 均通过；魔王城正式数据不发生 gameplay 漂移。

## 证据入口

- [施工自检](../self-check/SIMLIFE-UI-SHELL-01.md)
- `src/engine/host/life-hud.ts`
- `src/engine/host/life-game-host.ts`
- `src/engine/host/life-host.test.ts`
- `src/engine/host/life-save.test.ts`
- `tools/audits/life-hud-resource-dark.audit.ts`、`tools/audits/life-hud-resource-light.audit.ts`

复查人必须独立复跑、执行上述撤修锚点并记录 verdict；施工人不得填写结论。

## 独立复查结论

**PASS。** 顶层壳现在是全高但 pointer-transparent 的覆盖层；实际 LayoutNode 根显式恢复指针接收，地图空白区不会被 HUD 吞掉，I/J/C 真实按钮仍可打开既有 Drawer。追踪卡、场景/日历状态和资源入口均只消费既有 Host ViewModel 投影，没有新增 World、save、hash 或游戏 JSON 状态。

- 独立复跑：`life-host.test.ts` + `life-game-host.test.ts`，2 files / 48 tests PASS；`tsc --noEmit` PASS。
- 专用 `life-ui-shell.fixture.ts` 直接由 `buildLifeStandardHud` 构造 tracked quest、world status、两个 placeholder 资源与 I/J/C；dark/light 审计均为 overlap/hard contrast/border blockers 0。
- 零写入 materializer 预检：无 conflict，正式四文件的 `filesHash` 与 `currentFilesHash` 均为 `sha256:e838e9b9c6fe9044576f530541ae6416df91c2b6e222aa8a1b793631f66d2cd1`。
- 撤修验红：把 `life-host-tracked-quest-title` 暂改为恒定空态后，Host 壳层回归在 `life-host.test.ts:132` 精确失败（缺少 `Restore the gate`）；恢复权威 tracked 查询后 48 tests PASS。
