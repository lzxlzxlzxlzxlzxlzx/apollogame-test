# SIMLIFE-WORLD-VISUAL-SEMANTICS-01 独立复查

日期：2026-10-13  
复查主体：非施工人 `/root/review_world_visual_semantics`  
施工主体：BDM程序  
判词：**PASS**

## 缺陷分级

- Blocker：0
- Major：0
- Minor：0
- 非本单既有告警：见“告警与全量门”章节；不冒充全库门禁已绿。

## 范围与架构结论

独立核对工单、自检、当前代码、Little Valley 迁移、Demon Castle candidate、世界视觉矩阵与正式四文件。实现遵守 Owner 已裁 A：视觉语义落在共享严格 JSON/authoring/render-only 合同，不出现魔王城私有 system/renderer 补丁。

- 严格生成门在 `src/assembly/life-world-visual-semantics.ts:37` 执行 used-ground surface、动态农务表面、warp landmark 与 visual-key/action 等价性检查；Bundle 在 `src/authoring/life-generation-bundle.ts:475` 调用，并在 `:505` 生成两张审阅矩阵。
- host 在 `src/engine/host/life-game-host.ts:82` 从原始包编译只读 `LifeWorldVisualCatalog`；catalog 保存在 host session，不写入 World。
- renderer 在 `src/renderer/life-scene-render.ts:157` 只读选择干/湿土 key，在 `:185` 仅当绑定地标缺失或不可见时置 `fallbackMarker:true`；Canvas 在 `src/renderer/canvas-renderer.ts:347` 抑制非 fallback 的 cyan marker，并在 `:370` 先绘 soil、再绘 crop。
- 行动合法性仍由既有 `LifeActivityContext`/action chain 决定；本单没有新增 action、自动 warp 或由视觉元数据写世界的路径。

## 1. 独立复跑

在 Windows 沙箱内首次启动 Vitest 被 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM` 阻断，未产生测试结果；按允许边界在沙箱外只读重跑，结果：

```text
npm.cmd exec vitest -- run <17 个定向文件>
Test Files  17 passed (17)
Tests       217 passed (217)
exit        0
```

覆盖 schema、compiler、strict world visual gate、Generation Bundle、composer、renderer、shared host、save、Little Valley JSON/asset closure/world interaction/art consumption、asset generation CLI、bundle CLI 与 materializer CLI。其中 `scripts/life-materialize.test.ts` 3/3、`scripts/life-bundle-compose.test.ts` 2/2 均独立通过。

```text
npm.cmd run build
tsc PASS
vite build PASS（778 modules）
exit 0
```

唯一 build warning 是既有 chunk-size 提示；没有类型错误或本单新 warning。

## 2. 临时撤修验红

锚点：`src/assembly/life-world-visual-semantics.ts:49` 中唯一的 `if (!definition.visual?.surface)`；破坏前锚点命中数为 1，临时 marker `SIMLIFE-WVS-REVIEW-SABOTAGE` 命中数为 0。

临时将该分支禁用后独立运行：

```text
npm.cmd exec vitest -- run src/assembly/life-world-visual-semantics.test.ts
1 failed | 2 passed
```

精确转红为 `src/assembly/life-world-visual-semantics.test.ts:38`：期望 `/tileCatalog/soil/visual/surface + surface_missing`，实际只剩 `surface_mismatch`。这证明测试确实咬住“缺 surface 的专门拒绝分支”，不是未命中假绿。

随后恢复原行并复跑 3/3 通过。实现文件 SHA-256 前后均为 `1DA10CCFDBB2CE51F08B264A99E3E3EA94A7B2F7EA09F7740862019411E91CA9`；marker 命中数 0，`git diff --numstat -- src/assembly/life-world-visual-semantics.ts` 无输出，未留下探针代码。

## 3. 实证复现

- 缺 warp landmark：`src/assembly/life-world-visual-semantics.test.ts:31-32` 删除字段后稳定得到 `/scenes/0/warps/0/landmarkPlacementId + warp_landmark_missing`。
- landmark 关系非法：同文件 `:34-35` 将地标移远后得到 `warp_landmark_relation`。
- 缺 surface：同文件 `:37-38` 得到 `/tileCatalog/soil/visual/surface + surface_missing`。
- 非等价 visual key 共享：同文件 `:40-41` 让干土/湿土共 key 后得到 `/visualSemantics/farm/wateredSkinKey + visual_key_action_collision`。
- renderer：`src/renderer/life-scene-render.test.ts:117-130` 证明可见绑定地标令 `fallbackMarker:false`、隐藏后回退为 true，并将 watered plot 投影为 authored `art:test:wet`。
- snapshot authority：`src/assembly/life-world-visual-semantics.test.ts:44-51` 单独改变 farm keys、tile surface 与 landmark id，编译 blueprint 逐值相等；217-test 组同时覆盖 host/save/hash 回归。
- Little Valley 素材边界：`games/game-simlife/asset-slots.test.ts:17-21` 精确保留 `farmable-earth` 与 `watered-soil` 两项 `missing_asset`，23 slots 通过 schema；未把新占位伪装为已批准 AssetIndex 条目。

## 4. 候选、正式文件与素材门

独立运行：

```text
npm.cmd run life-materialize -- docs/design/game-demon-castle/bundle.candidate.json \
  --host docs/design/game-demon-castle/life-host.candidate.json \
  --entry docs/design/game-demon-castle/life-launcher.candidate.json \
  --plan-update --workspace-root <workspace>
```

结果 `mode:plan-update`、`writesPerformed:false`、`conflicts:[]`，四道 gate 均在档：`bundle-valid`、`placeholder-assets`、`identity-closed`、`launcher-discovery`。

- candidate canonical hash：`sha256:e58f38ff0da5c706c5adac7013e82c809cffad5460cd882486136c625c78e6ba`
- proposed files hash：`sha256:c2a3982c72071aab8c290fc0a317a1ac0d4ac67805e9a9acd3a2e9199dfc3563`
- confirmation hash：`sha256:160a8c6f06facab77e13d9352577d0d2db5a8a4a3b4909e1c87779cfeb057844`
- current formal files hash：`sha256:14f23f978b556b2368466ec1ce012757449b7f103e962933283b2c8a49f1f44c`

`games/game-demon-castle/{life.json,asset-slots.json,life-host.json,life-launcher.json}` 的 `git status` 无改动，正式 life/slots 中也不存在本单的 `visualSemantics`、`landmarkPlacementId` 或三项 `moon-garden-*` 新 surface key。candidate 共 29 个 slot，`governance.approval` 全部为 `placeholder`；三项新 surface slot 均 `humanApprovalRequired:true`、`licenseRequired:true`。素材未审前不执行 `--update` 的边界成立。

## 告警与全量门

`life-gen-check --packets --plan` 独立返回 `ok:true`、runtime hash `ee8dffe5`，并输出完整 warp/surface matrices。逐条读取 10 个 warning：

- 1 个既有 `Flag` provider warning；
- 2 个既有 compiled `LifePlacement.npcDialogueId` unknown-field warning；
- 7 个可选 capability 子集 `system_dangling` warning。

这些 warning 不来自 world-visual gate，未据此放宽任何 validator，也不改变本单 PASS。

`node scripts/scoped-gate.mjs --run` 判为 FULL，但当前工作树无法解析 `origin/claude/mainbranch`，并混入 51 个跨项目/并发文件；门禁在既有 depcruise 的 32 条跨层违规处以 exit 1 停止。输出中没有新增 `life-world-visual-semantics.ts` 依赖违规；因此这不是本单回归，但也意味着本复查**不宣称仓库级 scoped-gate 全绿**。本单定向测试、tsc/build、strict generation check 和 materializer plan-update 已分别独立通过。

## 最终判定

**PASS。** 工单的共享合同、严格拒绝、renderer fallback/农务表面、review matrices、Little Valley migration、Demon candidate 与素材/正式文件隔离均有独立实证；撤修验红有效且已无残留。没有需要施工方返修的 Blocker/Major/Minor。
