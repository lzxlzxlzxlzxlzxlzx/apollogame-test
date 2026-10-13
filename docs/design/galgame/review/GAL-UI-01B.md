# GAL-UI-01B 非施工者独立复查

> 2026-10-10，复查者 Codex/review_gal_04b。复查范围仅 `src/services/gal-ui/gal-ui-read-model.ts` 与同伴测试；本单未制作正式 LayoutNode 屏，C2a/C4 仍待 owner 裁决。未执行 Git/GitHub、数据库修改或应用服务启动。

**局部判词：PASS；全库判词：CONCERNS。** 初审发现并实证复现首页 Continue 无恢复点仍可用；施工者修复后独立复验通过。此判词只针对 01B 只读模型与现有 repeat 绑定消费，不代表纵切片可玩、UI 1:1 或全库门禁绿。

## 四步核证

1. **独立复跑。** 修复后 `npx vitest run` 点名 `gal-ui-read-model.test.ts`、`gal-profile.test.ts`、`gal-manual-save.test.ts`、`narrative-director.test.ts`、`ui/components/bindings.test.ts`：**5 文件 64/64，退出 0**；01B 同伴测试 **6/6**。测试使用内存/纯数据，无真实 DB 或应用服务。`npx tsc --noEmit --pretty false` **退出 1**，诊断在 `games/game-dice/dice-window{,.test}.ts`、`games/game-simlife/art-consumption.test.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 01B/GAL 诊断。
2. **隔离撤修验红。** 只复制 read-model 源与同伴测试到精确命名的临时 probe 文件，测试 import 指向 probe；先断言共享源码 `canContinue: hasActiveResume || byNumber.size > 0` 和 probe 中替换后的 `canContinue: true` 锚点各命中 **1**。预告“enables Continue only for an active resume point or an actual save”应红；实测 **1 failed/5 skipped，退出 1**，无恢复点场景预期 `false` 却收到 `true`。临时 probe 已在解析绝对路径核对后删除，未原地破坏共享源码。
3. **实证复现与修复复测。** 设计映射 `gal-ui-layoutnode-map.md:31` 要求“Continue 无可恢复点禁用”；初版 read-model 固定 `home.canContinue: true`。隔离对抗输入为 entry `a/intro` 投影、干净 Profile、`manualSlots: []`，实测错误返回 `true`（探针 **1 failed/5 skipped，退出 1**）。施工者补必填 `hasActiveResume:boolean` 后，新正式测试点名覆盖无恢复点、仅活动恢复点、仅真实手动档、仅跨槽已读记录和非法输入；复查 **6/6** 且上述撤修转红。没有从 Profile 已读推断恢复点。
4. **stderr/边界。** 有效定向测试没有系统图或 UI 运行时警告；Director 512 历史的 stdout 是测试观测值。`tsc` 非 GAL 红灯单独记 CONCERNS。`resolveBindings` 真正展开 choice repeat，并在测试中核对 `narrative.choose` 的稳定 `actionArg:id`、布尔 disabled 与节点唯一 id；read-model 没有 DOM、World 写入、资产 URL 或回调。`GAL_UI_SLOTS_PER_PAGE=12` 为页容量，测试覆盖 1/12/13/25 号与跨包隔离、空槽禁读及 `no-preview` 诚实缺图。没有修改 PUI 独占 `src/ui/**`，也不把未裁决 C2a/C4 冒称已完成。
