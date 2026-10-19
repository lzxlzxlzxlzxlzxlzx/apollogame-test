# SIMLIFE-HUD-RESOURCE-01｜施工自检

## 范围与结论

已实现 `LifeProfileAttribute.surfaces`：省略为 `['profile']`，严格拒绝空数组、未知/重复 surface，并在 package validator 拒绝超过四项 HUD 投影。Host 顶栏只从 presenter 的 Profile 投影读取地点、Calendar 日期/时段以及按 author order 的 HUD 属性；没有第二账本或 World 写入。

## 机器证据

- `npm.cmd exec vitest run src/assembly/life-package.test.ts src/assembly/life-package-compile.test.ts src/engine/host/life-host.test.ts src/authoring/life-profile-review.test.ts src/authoring/life-bundle-compose.test.ts src/authoring/demon-castle-playtest-contract.test.ts`：6 files / 86 tests PASS。
- `npx tsc --noEmit`：PASS。
- `node tools/ui-audit.mjs tools/audits/life-hud-resource-dark.audit.ts` 与 `...light.audit.ts`：重叠、硬性对比和 border-image 阻断项均为 0。
- 物化前 `--plan-update`：无 conflict；以 confirmation `sha256:a75500e21b5b0ca13b6fd73d90e25ee7f702b200f610475c7ab29a632d9bbf09` 和 current hash `sha256:a70e8682d1bf085ac0d8dc534d6a7dbece89c6ab18927faadd8d477435743f2d` 执行 update。写后复跑 plan：`currentFilesHash` 与 `filesHash` 同为 `sha256:e838e9b9c6fe9044576f530541ae6416df91c2b6e222aa8a1b793631f66d2cd1`，无 conflict。

## 撤修验红

将 `src/assembly/life-package-validate.ts` 的 HUD 上限从 `>4` 暂改为 `>5` 后，`src/assembly/life-package.test.ts` 精确失败：五项 HUD fixture 不再产生 `$.profile.attributes` range diagnostic。恢复 `>4` 后定向回归全绿。

## 已知非本单门禁噪声

`node scripts/scoped-gate.mjs --run` 因共享脏工作树使用缺失基线 `origin/claude/mainbranch`，把 901 个非本单文件归入 full；其 depcruise 随后报告 33 条既存跨层规则，未进入本单编译/定向测试范围。该结果不能作为本单失败或通过的证据，留给独立复查按当前工作树判定。
