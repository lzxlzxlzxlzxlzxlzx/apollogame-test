# S4 新指纹独立复查（S5 换皮后）

复查人：`/root/s5_prior_review`，不是 S4/S5 施工者或 GD 剧本作者。判词：**PASS，仅限 S4 玩法和结构**。当前 `gameHash=35b6fc9128549795`；Owner 既有 S4 人门由流程板显示为已过，本复查没有代签。

## 独立实证

- 按 `game-pipeline.mjs checklist game-potion-brewing S4` 核对范围、GD 作者、五种闭环、截图及失败路径。`acceptance/01`–`05` 首行均为 `// author: GD /root/potion_s4_gd`，不同于游戏接线者。`npx vite-node scripts/acceptance-run.mjs --game game-potion-brewing` 退出 0：**5/5 场景、12/9/4/5/12 检查点**，含两配方、错料立即失败、反向整圈失败、重复材料逐份扣减。`npx vitest run games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts` 退出 0：**8/8**。
- 在内存中改写浏览器探针导入和输出路径（锚点各恰好命中一次），未改任何仓库文件；短时 Vite 仅占 `http://localhost:5716/?game=game-potion-brewing`，隔离无头浏览器完成 **12 帧、0 page/console error**，临时截图在 `C:\Users\24652\AppData\Local\Temp\potion-s4-stale-review-27424\`。独立目击开局、成功、失败帧；实操包括锅外无害/锅内投料、耗尽禁投、顺逆圈成功与错料失败、两种终局重开、退出确认、鼠标和 CDP 真触屏投料及搅拌。浏览器与测试 Vite 已关闭，5716 无监听。
- 锚定 `blueprint.ts` 唯一 `stock-decrement:0` 且 `Effect.value === -1`，仅对内存蓝图把值改为 `0`；同一真实 Engine 输入 `brew.add.moon-herb`，基线库存 **2→1**、步骤 **0→1**，破坏后库存 **2→2** 而步骤仍 **0→1**，故 `05` 的库存断言会转红。基线同输入重复运行的 `Engine.hash()` 均为 `62f6aba2`，破坏后为 `1d7fd08b`。没有写共享源码或篡改正式测试。

## 截图时效及告警

- `self-check/S4-alignment.md` 的仓库内 `shots/S4-*.png` 是 **S5 换皮前** S4 结构自证，不能当作当前皮肤截图；当前 `shots/S5-*.png` 与本次临时 12 帧是换皮后画面。两批 1440×900 开局帧相比，左配方、中锅、右材料架、底部状态的锚位与尺寸未漂移，改变的是配色/纹样；成功/失败出口、重开及退出也由当前浏览器再证。旧截图保留为历史基线，而非“当前 24 张同皮截图”。
- S4 机器门在此指纹退出 0，报告 8/8、5/5、自证 24 图。通用 UI 走查可驱动率 **12%** 仅说明 3/25 个剧本 signal 可由 DOM 单点直接驱动，不代表玩家路径通过率；本次独立 Canvas/触屏手势弥补该探针覆盖边界。未把绿色退出码等同于零告警。
- S4 对齐单 #1–7 的玩法/结构结论经现指纹实证仍成立；#8 正式坩埚/材料/药剂瓶和视觉演出 1:1 仍是 **⚠ S6 素材审批/原型差异复核**，`self-check/S5-alignment.md` #7–8 也如实列出瓶图与结算框差异。S4 PASS 不宣称 S5/S6 全部完成。

结论：S5 外观换皮未造成 S4 配方判定、投料/搅拌、库存、失败冻结或终局出口回归；当前指纹 S4 独立复查 **PASS**。
