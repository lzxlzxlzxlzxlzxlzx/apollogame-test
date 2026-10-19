# SIMLIFE-PROFILE-01｜独立复查导航

施工主体：BDM程序  
复查要求：复查人不得是施工人；本文件只导航，不预写 PASS。

## 必查语义

1. 独立复跑 strict package/compiler、profile review、generation gate、Host/Drawer、Demon contract、launcher discovery 与 materializer；不得采信施工自述。
2. 实查 `LifeProfileCatalog` 只保存静态定义，presenter 的 resource/relationship 当前值分别来自 `Resource` 与 `LifeRelationshipProjection`；确认没有第二份 current、自由表达式或新 Life system。
3. 在 mounted Host 中依次点击/C/I/J/E/Esc，并对拍 World snapshot/order/hash 与 save payload；确认三个 Drawer 互斥且 held movement、互动和对话不被释放或阻塞。
4. 独立撤修唯一锚点并证明转红：推荐把 `life-presenter.ts` 的 resource `value.current` 改成 `value.min`，或把 profile source id 改为不存在；sabotage 必须带点名断言。
5. 重建 `LifeProfileReview v1`，核对 canonical hash、两行 author order、resource/relationship 初值与范围、精确 `ui-icon` slot/pointer，以及 placeholder 未被伪造为 approved/filled。
6. 核对魔王城四文件 materializer 写后 plan 无 drift；确认 `profile.dread` 无 effect，建设/剧情/任务规则未漂移。两张未审批图标必须仍由闭包 guard 报 missing asset，不能登记真实 AssetIndex。
7. 真读 warning/stderr：区分候选既有 compile warnings、共享 dependency-cruiser/context-budget 红灯与本单新增问题；不得因定向测试绿而忽略告警。

## 建议命令

```powershell
npm.cmd exec vitest run -- src/assembly/life-package.test.ts src/assembly/life-package-compile.test.ts src/authoring/life-host-descriptor.test.ts src/assets/life-art-direction.test.ts src/authoring/life-generation-gate.test.ts src/authoring/life-profile-review.test.ts src/authoring/life-generation-bundle.test.ts src/authoring/life-bundle-compose.test.ts src/engine/host/life-host.test.ts src/engine/host/life-game-host.test.ts src/authoring/demon-castle-playtest-contract.test.ts src/launcher/life-launcher-integration.test.ts
npm.cmd exec vitest run -- src/assets/asset-slot-brief.test.ts src/authoring/life-materializer.test.ts
npm.cmd exec tsc -- --noEmit
npm.cmd run life-gen-check -- docs/design/game-demon-castle/bundle.candidate.json --profile-review --plan
npm.cmd run life-materialize -- docs/design/game-demon-castle/bundle.candidate.json --host docs/design/game-demon-castle/life-host.candidate.json --entry docs/design/game-demon-castle/life-launcher.candidate.json --plan-update --workspace-root C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch
node tools/ui-audit.mjs tools/audits/life-profile-panel-dark.audit.ts --w 1060 --h 760
node tools/ui-audit.mjs tools/audits/life-profile-panel-light.audit.ts --w 1060 --h 760
node scripts/docs-ref-guard.mjs
node scripts/context-budget-guard.mjs
```

## 结论栏（由独立复查人填写）

- 复查人：模拟经营策划（非施工者）
- 独立复跑：2026-10-14 独立复跑 package/compiler、profile review、generation gate、Host、Demon contract、launcher、AssetSlot/materializer：14 文件 / 203 tests 通过；`tsc --noEmit`、`life-gen-check --profile-review --plan`、正式四文件 `--plan-update`、dark/light UI audit、docs-ref guard 均通过。正式预检 `conflicts:[]`，且 `currentFilesHash === filesHash === sha256:a70e8682d1bf085ac0d8dc534d6a7dbece89c6ab18927faadd8d477435743f2d`。
- 撤修验红：将 `life-presenter.ts` resource 投影的唯一锚点 `value.current` 改为 `value.min`；“projects authoritative profile values read-only”精确 1 红，期望 4、实际 0。恢复后同一锚点 1 pass。
- 告警裁决：bundle 的 Flag provider、`npcDialogueId` 与 system-dangling 是既有 candidate warning；两个 `ui-icon` 仍为 placeholder，闭包 guard 报 missing asset 是未审批素材的正确降级，未写入 AssetIndex。共享 full scoped gate 的 dependency-cruiser/context-budget 红灯来自并行既有工作树债，本单的定向门禁全绿。dark audit 的 house-theme 提示仅来自隔离 audit fixture，实际 shared Host 继续以 `STARTER_THEME` 挂载；非阻断。
- 最终结论：PASS

