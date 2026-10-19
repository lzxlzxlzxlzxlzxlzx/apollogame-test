# SIMLIFE-UI-SHELL-01｜施工自检

## 结论

共享 Life Host 已将顶栏改为覆盖 play-field 的 LayoutNode 壳层：左侧仅投影当前 tracked quest，中央 `world-status` 投影 Scene/Calendar，右侧 `resource-actions` 复用既有 profile HUD 投影与 I/J/C。所有 Drawer 仍为已有共享实现；无 World、save、hash 或资产写入。

## 证据

- `npm.cmd exec vitest run src/engine/host/life-host.test.ts src/engine/host/life-game-host.test.ts`：2 files / 48 tests PASS（含全高 HUD 点击穿透与 I/J/C 真实指针入口）。
- `npx tsc --noEmit`：PASS。
- `node tools/ui-audit.mjs tools/audits/life-hud-resource-dark.audit.ts` 与 light：专用 `life-ui-shell.fixture.ts` 覆盖 tracked quest、world status、placeholder 资源和 I/J/C；重叠、硬对比、border-image 阻断均为 0。
- `life-materialize --plan-update`：零写入、`conflicts: []`，当前正式四文件组 hash 为 `sha256:e838e9b9c6fe9044576f530541ae6416df91c2b6e222aa8a1b793631f66d2cd1`。

## 撤修锚点

暂将 `life-host-tracked-quest-title` 的 `tracked` 查询替换为恒定空态，新增的 host 壳层测试应失去 `Restore the gate` 断言而精确失败；恢复查询后重跑定向测试。
