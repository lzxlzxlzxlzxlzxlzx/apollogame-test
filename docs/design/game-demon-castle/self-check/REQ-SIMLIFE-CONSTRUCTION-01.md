# REQ-SIMLIFE-CONSTRUCTION-01 施工自检

日期：2026-10-12  
施工人：Codex/root  
结论：施工语义与点名门禁通过；等待非施工人独立复查。

## 实现边界

- 新增通用 `LifeGamePackage.constructionProjects[]` 与 `LifeAction.build`，没有月影魔王城 id、材料名、文案或游戏分支。
- 新增 `t2-life-construction`：固定 placement、一次性完成、Commit 原子扣料；失败覆盖标准 `LifeActionResult` 为稳定闭集 reason，零状态/背包写入。
- `t2-life-activity` 投影 build affordance；Quest/关系继续消费标准 `life-action(build,targetId)`。
- `LifeConstructionProject.completed` 进入 snapshot/hash 与 Life save 进展投影；renderer 只读选择初始/完成皮肤，placement static identity 不变。
- 初始 placement skin 与 `completedSkinKey` 同时进入素材闭包；未登记真实图片、未调用网络/API、未修改 `games/game-demon-castle/**` 运行时。

## 点名绿证据

- Life 主回归：8 files / 69 tests passed（construction/package/activity/action/quest/relationship/save/renderer）。
- 资产与生成：3 files / 18 tests passed（asset-slot guard、generation bundle、construction）。
- 组件与 registry：4 files / 25 tests passed（component manifest、component universe、component map、lazy registry）。
- `npm run gen:registry -- --check`：140 条同步。
- `node scripts/component-manifest-guard.mjs --check`：206/206 PASS。
- `npx vite-node scripts/system-graph-audit.mjs t2-life-activity t2-life-action t2-life-construction t2-life-relationship t2-life-quest`：无重复、无悬空边、子集无环，PASS；测试输出未出现 construction 定序 warning。
- 改动 TS 文件 ESLint：exit 0、零 warning。

## 失败路径与确定性

- 成功：完成位 true；木材 4→1、石材 2→0；placement 数据逐字段不变；渲染完成皮肤；Quest flag 与关系值只在成功后变化。
- 锁定、材料不足、缺选择、非近邻、重复 build：标准稳定 reason；项目/背包不写；失败不触发 Quest/关系。
- DebugTrace 成功路径恰为 decision/transition/commit 三条；拒绝路径一条 reject；无 trace 的 authority hash 与开 trace 相同。
- LifeHostSaveAdapter 往返后 completed=true，restore 返回后无需额外 tick 即投影完成皮肤。

## 撤修验红

1. 将唯一完成写入临时改为 `completed:false`，只跑 `completion write anchor`：exit 1，精确失败 `expected false to be true`；同回合恢复。
2. 将唯一材料扣除临时改为扣 0，只跑 `material deduction anchor`：exit 1，精确失败 `wood expected 1 received 4`；同回合恢复。
3. 恢复后 construction 点名 8/8、相关 Life 69/69、资产/生成 18/18 重新全绿；无 sabotage marker 或临时文件残留。

## 已读但不冒充绿灯的存量红

- 全量 `tsc --noEmit` 仍被 `game-card-reveal`、`game-dice`、`game-theft` 与 launcher 的既有类型错误阻塞；输出未命中本单文件。
- 全量 Vitest 中本单 construction 与相关 Life 测试通过；存量红包括 art-ledger、declaration 旧基线漂移、pipeline board、game211/game-g golden、game-i dialogue、缺 Python 等。本单引入的 component manifest / universe 漂移已修复并点名复绿；declaration phase 基线只登记了 `life-construction`，未替他人追认 narrative/relationship 存量漂移。
- `tsconfig.sim.json` / sim-dom-fence 被既有 `narrative-director.ts` 路径解析/DOM 问题阻塞；skill-shape 被既有 narrative/risk/life-quest 超线阻塞，输出未点名新 `life-construction.ts`。
- `scripts/scoped-gate.mjs --run` 会执行 Git 差异探测，受 Owner 禁止 agent 执行任何 Git 操作约束，未运行；以上为不依赖 Git 的真实替代证据。
