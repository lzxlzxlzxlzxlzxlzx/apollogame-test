# Review 单 · `SIMLIFE-DEMO-16` 矿洞区域纵切

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-16` |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | **独立复查通过**（`review_eng11`；blocker / major / minor = 0 / 0 / 0） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | `games/game-simlife/little-valley.life.json`、两个既有游戏测试、authoring/capability plan、S4 对齐证据与本台账 |

## 一、做了什么

1. `mine-interior` 继续保持 36×26，但不再复制山谷 layers：ground 为独立矿地/岩壁 RLE（95 runs）、collision 为逐格同构 clear/solid RLE（95 runs）、interaction 为 1 run；每层恰好 936 格。
2. 新矿图用 `mine-ground` / `blocked-ground` 与 `clear` / `solid` 组成外围岩壁、内部断墙/岩块和明确通路；复用既有 tile consumer key，未新增或导入美术。
3. 山谷入口原本提前存在的 `ore-vein` 已移入 `mine-interior`。矿洞新增 `deep-mine-vein` mining zone（仅 `mine`）、真实 ore resource placement（quantity 2）与 `mine-exit`；入口仍由既有 `flag.story.first_harvest_reported` gate 控制。
4. 完整端到端从 fresh session 走现有 input queue：农务→首次收获 milestone→镇长已解锁 dialogue branch→mine gate→连续移动到矿脉→两次真实 resource-gather→depleted→返回出口。流程不直接写 Flag、Inventory 或 ResourceNode。
5. 端到端同时检查 scene/position、相机钳制、Canvas scene projection 与 WorldUI2D 采矿 prompt；UI 继续无 Modal。
6. authoring guide 补充多区域 RLE/warp/resource 组合规则；capability plan 写明矿洞只重组现有 navigation/activity/action/resource-gather/dialogue/milestone 能力。

## 二、复查请逐条核

| # | 核什么 | 独立验证建议 | 施工方自验 |
|---:|---|---|---|
| 1 | 独立地图 | 展开两个 scene 的 ground/collision，确认不相等；mine 三层均 936 格 | PASS |
| 2 | 严格数据语义 | validator/compiler 检查 tile tags、blocked zone、resourceNode、warp/spawn 引用 | PASS |
| 3 | 故事顺序 | fresh 不能入矿；只经真实 harvest→mayor choice 置旗后进入 | PASS |
| 4 | 真实采矿 | 只经 select-target + life.action:mine，ore 0→1→2，remaining 2→0 | PASS |
| 5 | 耗尽行为 | depleted affordance 可见但 disabled，controller 返回空动作 | PASS |
| 6 | 往返安全 | mine `(1,1)`→矿脉 `(24,1)`→exit `(1,1)`→山谷 spawn `(7,13)` | PASS |
| 7 | 表现同步 | active scene、player projection、Camera `(22,9.5)`、WorldUI2D `采矿（E）` 同步 | PASS |
| 8 | 资产边界 | 新字段只移动既有 `art:little-valley:placement:ore-vein`；无路径/URL/新资产 | PASS |

## 三、门禁与证据

- game-simlife + Life package/resource/navigation/action/activity/milestone/talk/dialogue：**14 文件 / 108 测试全绿**。
- ESLint（两个改动测试）PASS；component manifest `194/194` PASS；game-skill-audit / RATCHET PASS；docs-ref guard PASS。
- 真实 capability 子图：112 个注册系统、187 条显式边、23 个共装系统；无 duplicate、dangling 或 cycle，PASS。
- `align-count --game game-simlife --stage S4`：✅ 24 / ⚠ 0 / ❌ 0，退出码 0。
- 全量 `tsc --noEmit` 仍仅被既有 `game-dice` Label size、`game-theft` Label font 与 launcher mount 签名阻断；没有本单文件。此前同现状 `npm run build` 也是相同三类既有阻断。

## 四、撤修验红

- 锚点：`game-simlife.test.ts` 的 `runs farm, mayor gate, mine depletion and safe exit through one queued player session`。
- 撤修：临时删除 `deep-mine-vein.allowedActions` 中唯一 `mine`；山谷 `mine-mouth` 保持不变。
- 结果：点名用例准确 **1 红 / 11 skipped**，失败锚定矿脉 option 从 `enabled:true` 变为 `false`；精确恢复后 **1 绿 / 11 skipped**，最终回归 **14 文件 / 108 测试全绿**。

## 五、真渲染自证

- 用当前代码构建临时单文件产物，在隔离的短生命周期无头 Edge 中执行完整真实 sim 链并恢复到正式 `mount()` 渲染；未启动任何前后端服务，浏览器已关闭，临时源文件与构建已删除。
- `self-check/shots/demo16/` 5 张图覆盖独立矿洞入口、矿脉 E prompt、ore×1、ore×2 + depleted、出口回山谷；页面错误 0。
- 首轮截图暴露矿洞仍大面积复用山谷草地/农田/河流 RLE，已判回并全量改成独立矿地/岩壁地图；第二轮截图无该偏差。

## 六、边界与已知项

- 未改引擎、capability、system、`src/ui/**` 或美术；没有游戏层规则、Canvas/DOM 逃生或直接世界写入。
- 没有执行 Git/GitHub、数据库操作或服务启动/重启。
- 独立复查用 BFS 证明入口 `(1,1)` 到矿脉交互位 `(24,1)` 距离 23，且矿区 10 格全部为 `mine-ground + clear`；ground/collision 阻挡形状逐格同构并均与山谷不同。
- 独立复跑 **14 文件 / 108 测试**，并确认 ESLint、component manifest `194/194`、game-skill-audit / RATCHET、docs-ref guard、真实 23-system 子图、S4 align-count 全部 PASS；5 张截图逐张目视与对齐单一致。
- 独立资产核对：22 个 skinKey 引用、21 个唯一 key，资产索引缺失 0；矿洞只消费既有 mine/ore/scenery key。
- 独立撤修同样删除 `deep-mine-vein.allowedActions` 的唯一 `mine`，纵切锚点准确 **1 红 / 11 skipped**；精确恢复后重新跑满 **14 文件 / 108 测试全绿**。
- 最终结论：**PASS，建议策划验收**；blocker / major / minor = **0 / 0 / 0**。`mine-mouth` 与 `deep-mine-vein` 均恢复 `mine`，无 probe、graph 或 sabotage 临时残留。
