# SIMLIFE-WARP-FOOTPRINT-01 独立复查

日期：2026-10-13  
施工主体：BDM程序  
复查主体：模拟经营策划（非施工人）  
判词：**PASS（2026-10-13）**

## 必查范围

1. 独立核对 authoring validator、compiler、runtime schema、activity 与 navigation 是否共同实现同一 footprint 合同。
2. 独立复跑定向 tests、tsc、相关 eslint、build 与 context guard，完整读取 warning。
3. 临时将 activity footprint 判断撤回为 `at` 点判断，先断言锚点唯一命中，再证明 2×2 非锚点格用例转红；恢复后复跑全绿并确认无探针残留。
4. 核对未知 placement、跨场景、`at` 越界、非法类型均以精确 path/code 拒绝且不回退。
5. 核对 `landmarkPlacementId` 仍为 render/review-only；只改它不能改变 interaction footprint。
6. 核对魔王城四个建筑绑定 warp 的 candidate 与正式 `life.json` 一致，正式四文件 canonical hash 无 drift。
7. 已完成，无 Blocker/Major/Minor。

## 独立实证

- 静态核对：`interactionPlacementId` 是 authoring 的独立字段；严格校验拒绝未知、跨场景、越界及非法类型。编译后的 `LifeWarp.x/y/width/height` 是唯一的运行时范围；`landmarkPlacementId` 仍不进入运行时组件。
- 行为核对：activity 与 navigation 都按同一个半开 footprint 判断。2×2 的四格显示同一 E affordance 并允许显式 warp；相邻外格拒绝；无该字段的 legacy warp 仍为 `at` 处 1×1。
- 魔王城核对：森林拱门、地下入口、森林返程拱门和工坊返程楼梯均绑定自身 2×2 placement；正式包的森林入口 `at=(18,6)` 已在 footprint 内。
- 独立测试：`npm.cmd exec vitest run` 点名 8 文件，**84/84 PASS**；`tsc --noEmit`、点名 ESLint 与 `context-budget-guard` 均 PASS；`npm.cmd run build` PASS。构建唯一警告是既有的大 chunk（>500 kB）提示，非本单错误。
- 撤修验红：先确认 activity footprint 锚点唯一命中；临时把第 216 行改回单点 `warp.x === position.x && warp.y === position.y` 后，`life-activity.test.ts` 精确在 `2,1` 失败（期望 `['gate']`，实际 `[]`）。恢复 footprint 判断后 11/11 PASS，且 diff 无探针残留。
- 正式物化复核：只读 `life-materialize --plan-update` 返回 `writesPerformed:false`、`conflicts:[]`，`currentFilesHash == filesHash == sha256:b60b324da7f816843930309fcd1bf7a505bcb7f99c88ae19be75a4e0ac7e94ef`；四个正式文件的哈希与 candidate plan 一致。

