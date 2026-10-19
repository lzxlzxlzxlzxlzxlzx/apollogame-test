# SIMLIFE-HUD-RESOURCE-01｜独立复查导航

状态：**PASS（独立复查，2026-10-14）**。施工人不得填写 verdict。

## 复查范围

- `surfaces` 为 profile/hud 唯一展示选择，省略兼容 profile-only，非法/空/重复/第五项 HUD 需 fail-closed。
- presenter 只从 Resource 与 LifeRelationshipProjection 读取最新值；HUD 切换和渲染不得改变 snapshot/hash/save 或输入行为。
- 顶栏应只显示被 author 标记的属性，顺序稳定，地点/日期/时段与 I/J/C 保持可用。
- 魔王城 candidate/正式四文件应含 dread 与 gargoyle bond 的 hud surfaces，全部图标仍为 placeholder。

## 施工证据入口

- [施工自检](../self-check/SIMLIFE-HUD-RESOURCE-01.md)
- `src/assembly/life-package.test.ts`
- `src/engine/host/life-host.test.ts`
- `src/authoring/life-profile-review.test.ts`
- `tools/audits/life-hud-resource-dark.audit.ts` 与 `tools/audits/life-hud-resource-light.audit.ts`
- `games/game-demon-castle/life.json`

复查人须独立复跑、撤修验红、读取警告，并将 verdict 和证据补入本文件。

## 独立复查结论

**PASS。** 复查确认 `surfaces` 仅扩写现有 `LifeProfileAttribute` 的只读展示面：`selectLifeHostView` 对 resource/relationship 读取当前权威投影，顶栏未建立第二资源账本；地点、日期和时段来自现有 Scene/Calendar。Demon Castle 的两项 HUD 属性及其 `ui-icon` 均仍保持 placeholder 治理状态。

- 独立复跑：6 files / 86 tests PASS；`npm.cmd exec tsc -- --noEmit` PASS。
- LayoutNode dark/light UI audits：重叠、硬对比、border-image 阻断项均为 0。
- 零写入 `life-materialize --plan-update`：无 conflict，正式四文件组的 `filesHash` 与 `currentFilesHash` 均为 `sha256:e838e9b9c6fe9044576f530541ae6416df91c2b6e222aa8a1b793631f66d2cd1`。
- 撤修验红：将 `life-package-validate.ts` 的 HUD 上限由 `>4` 暂改为 `>5` 后，五项 HUD fixture 在 `life-package.test.ts:129` 精确失败（期望 `$.profile.attributes` 拒绝但收到空数组）；恢复 `>4` 后 14 tests PASS。
- 未将共享脏工作树导致的 scoped-gate/dependency 基线噪声计为本单绿灯；它不影响上述独立定向证据。
