# SIMLIFE-QUEST-PANEL-01｜独立复查导航

施工主体：BDM程序  
复查要求：复查人不得是施工人；本文件只导航，不预写 PASS。

## 必查语义

1. 独立复跑 descriptor、presenter/HUD/input、mounted Host、Demon contract 与 launcher discovery；不得采信施工自述。
2. 从 `LifeQuestCatalog + LifeQuestProjection` 实查 `questItems`，确认 UI 没有重判 condition/flag，也没有另造任务状态。
3. 点击另一条任务的“追踪”，同时对拍 World snapshot/order/hash、persistent hash 与 save payload，确认只改 Host 本地偏好。
4. 独立撤修至少一个唯一锚点并证明转红：推荐破坏 `priority desc` 稳定序、把 tracked id 写入 World，或让 J 清空 held movement；sabotage 必须有命中断言。
5. 真读 stderr/审计输出：dark/light UI audit 必须重叠 0、硬低对比 0、警告 0；区分既有 dependency-cruiser 基线债与本单新增边。
6. 核对魔王城只有 Host descriptor opt-in，现有任务 JSON、素材索引与审批状态没有因本单漂移。

## 建议命令

```powershell
npm.cmd exec vitest run -- --pool=threads --poolOptions.threads.singleThread src/authoring/life-host-descriptor.test.ts src/engine/host/life-host.test.ts src/engine/host/life-game-host.test.ts src/authoring/demon-castle-playtest-contract.test.ts src/launcher/life-launcher-integration.test.ts
npm.cmd exec tsc -- --noEmit
node tools/ui-audit.mjs tools/audits/life-quest-panel-dark.audit.ts --mount root --w 1060 --h 760
node tools/ui-audit.mjs tools/audits/life-quest-panel-light.audit.ts --mount root --w 1060 --h 760
node scripts/context-budget-guard.mjs
node scripts/docs-ref-guard.mjs
```

## 结论栏（由独立复查人填写）

- 复查人：模拟经营策划（非施工者）
- 独立复跑：2026-10-14 复跑 5 文件 / 76 tests，`tsc --noEmit`、dark/light UI audit、context 与 docs guards 全部通过；两份 audit 均为 overlap 0、contrast hard/soft/border 0。
- 撤修验红：将 `life-presenter.ts` 的唯一锚点 `b.priority - a.priority` 反转为升序；`life-host.test.ts` 的“stable priority order”断言精确失败（期望 `quest.high`，实际 `quest.low`）。恢复后同文件 28/28 通过。
- 告警裁决：本轮审计无新增告警；未改动 World、quest JSON、资产索引或审批状态，任务追踪仅存 Host 闭包本地状态。
- 最终结论：PASS
