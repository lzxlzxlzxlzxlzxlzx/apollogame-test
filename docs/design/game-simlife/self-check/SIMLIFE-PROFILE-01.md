# SIMLIFE-PROFILE-01｜施工自检

施工主体：BDM程序  
日期：2026-10-14  
结论：施工自检通过；只申请进入独立复查，不代签 review 或 Owner 人门。

## 架构与范围

- 新增可省略、严格闭集的 `LifeGamePackage.profile`；属性只能投影既有 `logic.resources` 或 `relationships`，不接受公式、函数、自由路径、任意实体查询或未知字段。
- compiler 只生成静态 `LifeProfileCatalog`。运行值始终由 presenter 读取 `Resource.current/min/max` 与 `LifeRelationshipProjection`；没有第二份 current、没有新 system、没有改资源/关系写入顺序。
- `LifeHostDescriptor.profilePanel` 仅允许 `enabled/titleLabelKey`。C、点击、Esc 与 I/J/C 互斥只保存在 Host 闭包本地态，不进入 World、snapshot、network hash 或 save。
- UI 仅使用既有 LayoutNode `Drawer/Panel/Image/Label/Badge/ProgressBar/Button` 和 Host asset resolver；没有修改 `src/ui/**`、自由 DOM/CSS 或新增 UI capability。
- `ui-icon` 是通用 AssetSlot kind/fallback；`LifeProfileReview v1` 单向投影 canonical Bundle hash、权威 source、初值/范围、精确 icon consumer 与 placeholder 状态。
- 月影魔王城新增一个无 effect 的 `profile.dread` 资源、复用石像鬼工匠 relationship，并 opt-in profile Panel。建设、剧情、任务和既有资源效果未改变；两张图标仍为 placeholder，未生成图片、未批准素材、未登记 AssetIndex。

## 功能实证

- package 正负例覆盖缺省兼容、作者顺序、错误 tagged union、重复 id/source、坏 resource/NPC 引用、未知字段与非 plain/prototype 输入；compiler 断言 catalog 不含 `current`。
- presenter 点名把 resource 从 4 改为 7、relationship 从 20/known 改为 55/trusted 后立即投影新值；读取前后 World snapshot 相同。
- mounted Host 点名覆盖点击 C 入口、I/J/C 三 Drawer 互斥、Esc 关闭、held movement + E 非阻塞，以及操作前后 snapshot/order/hash/save payload 字节语义相同；dispose 沿用共享 Host 清理合同。
- `LifeProfileReview v1` 覆盖 JSON round-trip、structured-clone 后 canonical hash 稳定、stale hash/伪造行/缺失 consumer 转红；Actors gate 仅在 profile 存在时要求 `profile-review`。
- 魔王城真实 candidate/正式四文件通过 profile review、compile、Host mount、launcher discovery 与完整三建筑主线合同。两个 placeholder icon 的既有闭包 guard 精确报告 `missing_asset`，证明未把未审批素材伪装成 filled。

## 受控物化

- 写前零写入 `--plan-update` 无冲突；confirmation `sha256:6d97e24df6dde5272dcfea53a355f2109148caaec039107089ae2b39f376d1d7`，旧四文件 hash `sha256:e8cff6c501e2f4fded56dce5f08d904e7e34d5ab4d0b128cb243033d83e535ca`。
- 严格 `--update` 已成功写入正式四文件；目标 hash `sha256:a70e8682d1bf085ac0d8dc534d6a7dbece89c6ab18927faadd8d477435743f2d`。
- 写后重跑 `--plan-update`：`writesPerformed:false`、`conflicts:[]`、`currentFilesHash === filesHash === sha256:a70e...`。四文件分别为 life `sha256:6bbd86dc...`、slots `sha256:da569614...`、host `sha256:ec0ecedf...`、launcher `sha256:b16d7551...`。
- 候选 `life-gen-check --profile-review --plan` 返回 `ok:true`，canonical hash `sha256:3b3023477db359d4fd6cf3af35fa0d70bad4460e37abbb0d0ad18611103f7e7c`；既有 Flag provider、npcDialogueId 与 runsBefore/runsAfter dangling 仅为 warning，未由本单新增或放宽。

## 门禁

- 定向 Vitest：12 文件 / 166 tests 全通过；AssetSlot + materializer：2 文件 / 37 tests 全通过。
- UI components：74 文件 / 565 tests 全通过；`validateLayoutNode` 为零 issue。
- dark/light `ui-audit`（1060×760）：两者 overlap 0、hard contrast 0、soft warning 0、border-image 0；短生命周期浏览器均已关闭，未启动整套 ZeroCraft。华丽度提示为非阻断，档案面已消费 Drawer、头像、图标、Badge 与 gauge，且属于既有华丽 Host 的附属面板。
- `tsc --noEmit`、变更 TS/JS 定向 ESLint、`docs-ref-guard`：exit 0。
- `context-budget-guard` 被共享工作树中 `docs/playbooks/ui.md` 的 107 行 / 22244 字符既有在途修改阻断；本单未改该文件。
- 全库 `scoped-gate --run` 因共享工作树 881 个在途文件进入 full，并停在 33 条既有 dependency-cruiser 分层债；其中 Host/Demon 测试跨 `games/` 的边在本单前已存在。本单定向 ESLint、tsc、测试、UI audit、materializer 与 docs guard 均独立全绿，未把全库红灯伪报为通过。

## 撤修验红

临时把 profile resource 投影唯一锚点从 `Resource.current` 改为 `Resource.min`，只跑 `projects authoritative profile values read-only and builds a valid resolved/fallback Drawer`：准确 1 红，差异为期望初值 4、实际 0。恢复 `current` 后同锚点 1 pass。证明测试真实命中权威运行值，而不是只检查静态 catalog 或 UI 文本。

## 交付文件

- schema/compiler/component/save：`src/engine/protocol/life-sim.ts`、`src/engine/protocol/components/life-world.ts`、`src/assembly/life-package-validate.ts`、`src/assembly/life-package-compile.ts`、`src/skills/tier3/life-world.ts`、`src/engine/host/life-save.ts`。
- profile review/generation/assets：`src/authoring/life-profile-review.ts`、`life-generation-gate.ts`、`life-generation-bundle.ts`、`life-bundle-compose.ts`、`src/assets/asset-slot-brief.ts`、`life-art-direction.ts`、`life-visual-references.ts`、`scripts/life-gen-check.ts`、`scripts/ai-gen.mjs`。
- Host/UI：`src/authoring/life-host-descriptor-core.ts`、`src/engine/host/life-presenter.ts`、`life-hud.ts`、`life-input.ts`、`life-game-host.ts`，以及 `tools/audits/life-profile-panel*`。
- 文档/skill：`docs/design/game-simlife/life-json-authoring.md`、`life-generation-sop.md`、`generation-workflow-v1.md`、`.agents/skills/simlife-generation/SKILL.md`。
- 魔王城：`docs/design/game-demon-castle/{actors.patch.json,construction.patch.json,asset-slots.json,bundle.candidate.json,life-host.candidate.json}` 与 `games/game-demon-castle/{life.json,asset-slots.json,life-host.json,life-launcher.json}`。

