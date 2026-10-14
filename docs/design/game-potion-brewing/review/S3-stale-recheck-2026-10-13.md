# S3 当前骨架新鲜度独立复查（2026-10-13）

- 复查人：Codex `/root/g5_review`，非 S3 施工者。
- 判词：**PASS，仅限当前 S3 编译期骨架**。合法 S3 gate `exit=0`、`gameHash=2b771b62aca79e68`，独立复核时当前内容指纹相同；此前 S3 复查绑定旧 hash 已过期，本单替代旧指纹，不代 Owner 人门或 S4/S5 品质关。

## S3 checklist 核证

1. **范围**：`git status --short --` 核对 S3 领工声明 `requests.md`：`games/game-potion-brewing/`、`src/launcher.tsx`、`src/launcher/game-runner.tsx`、本游戏本地 `public/games/.../pipeline.json` 与 S3 探针证据在声明面。G5 的引擎扩写另有 Owner A 工单和非施工者复查，不混称 S3 擅改；并行项目文件不评价/不还原。未发现本次 S3 新增共享 UI 基座、其它游戏玩法或自由玩法 system。
2. **manifest/样例**：本游戏是获准的编译期 `WorldBlueprint`，不是纯 JSON 卡带；S3 gate 也明确“编译期游戏免 manifest 校验”，未把 TS 蓝图冒称 manifest。原施工记录说明只参考 `game-lockpick/blueprint.ts` 的蓝图组织、`session.ts` 的装载测试、`game211/stage-shell.ts` 的 UI 宿主分层；本复查重新搜索游戏文件中 `lockpick|game211|stage-shell` 均无匹配，蓝图的 add/stir/椭圆棒/锅口无锁具或 game211 玩法继承。
3. **plan/组件消费**：`blueprint.ts:23-34,70-108` 的 `OrderedActionSession`、`AngularGesture`、椭圆 `DropZone`、`Draggable`/`Clickable`、`KeyBinding`、`Effect`/`Resource`/`SelfRule` 均在 `capability-plan.md` §2–§3 有解释责任；游戏屏只读 World 份数与状态，规则在既有能力。`Sprite` 为明确 S4 占位消费槽，不冒称 S5 真资产；`onlyFlag:'never-enabled'` 用于锅外不提交/不搬权威 Transform，锅口 DropZone 仍代发完整材料动作。未见填入后无人解释的规则组件。
4. **真装载/机器新鲜度**：独立运行 `npx vitest run games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts`，**8/8 PASS**；两份互斥 fixture 各经真 `Engine.load` + 2 tick，状态 `active/stepIndex=0`，LayoutNode 校验通过。合法流程板 `evidence.S3.exit=0`，其 `gameHash` 与复查现场 `gameHash()` 均 `2b771b62aca79e68`。真渲染 `public/games/game-potion-brewing/probe/S3-render.png` 可见中央锅、左配方、右材料架，仍是 S4/S5 前的几何/素皮，不错称视觉 1:1。

## 四步对抗实证与告警

- **撤修验红**：Vitest/Vite `enforce:'pre'` 内存变换先断言 `blueprint.ts` 的唯一锚点 `angularGestureCapability, orderedActionSessionCapability, selfRuleCapability, effectApplyCapability,` 命中 **1**，再从蓝图 capability 列表仅移除 `orderedActionSessionCapability`，不写共享文件。`blueprint.test.ts` **4 failed / 1 passed**：两份装载后会话未激活、重复材料不扣份、错误材料不进 failure；恢复正常源码后本游戏两测试文件 **8/8 PASS**。说明装配/空跑断言不是常量绿。
- **真浏览器复现**：独立临时 `http://localhost:5702/?game=game-potion-brewing` + 隔离无头 Edge，逻辑 1440×900 Canvas 实测 `1440×900`、非透明采样 **2416**、根 `#potion-root` 计算背景透明。实际点击五个材料 `data-action` Button，借同一 Vite ESM `Engine.prototype.step` 只读旁听输入：**5 控件 / 5 对应动作**经 `commandsForTick` 进入 Engine.step，材料架 DOM **5 次变化**，console/pageerror **0**。首轮只比状态栏文字仅见 1 次变化，是观察尺不覆盖材料架高亮；改按真正受影响的材料架 DOM 与动作流观察后 5/5，未把首轮假阴性当逻辑错误。浏览器和 5702 临时服务在 `finally` 关闭，事后无监听；未覆盖既有截图。
- **警告复核**：当前 `node tools/ui-audit.mjs games/game-potion-brewing/screen.audit.ts --w 1440 --h 900` 退出 0：重叠 0、硬/软对比警告 0、border-image 问题 0。其“house 主题：否”是静态审计未认出 `screen.ts:7` 从 `apolloBrocade` 派生并为透明宿主去掉 wash/texture，不是默认 SHELL。完整 canvas/宿主 alpha、正式美术/动画仍待后关；S3 截图的深背景来自 launcher，不是游戏根屏。真浏览器 console/pageerror 均为 0，未单独监听 `console.warn`，不据此宣称零浏览器警告；本单不据局部 PASS 声称全库 `scoped-gate` 绿。

## 阶段边界

S3 PASS 仅证明骨架可装载、可渲染、输入能穿透到引擎以及组件接线与计划一致。完整投料/搅拌→结果闭环、真宿主嵌入透明 alpha、S5/S6 素材与演出、S7 SDK 都需各自新鲜证据；Owner 既有人门不由复查人重签。
