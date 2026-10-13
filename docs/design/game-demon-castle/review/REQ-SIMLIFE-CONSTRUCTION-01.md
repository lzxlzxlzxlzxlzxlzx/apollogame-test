# REQ-SIMLIFE-CONSTRUCTION-01 Review 单｜Life 数据驱动建设项目

日期：2026-10-12  
施工人：Codex/root  
复查人：非施工人独立复查  
状态：**独立复查 PASS**

## 做了什么

1. `LifeGamePackage` 新增严格、可选的 `constructionProjects[]`，`LifeAction` 增加 `build`；validator/compiler/registry/component map 全链接通。
2. 新 capability `t2-life-construction` 在 Commit 复检近邻、placement、project/access 与全部材料，成功原子扣料并写一次 completed，失败统一覆写标准 `LifeActionResult` 且零进展写入。
3. activity、Quest/关系、renderer、Life save、presenter、素材闭包与生成 packet 复用既有合同；没有游戏私有运行时代码、真实素材或外部调用。

## 复查导航（Review 单不是证据，请复查人自行重跑）

| # | 核验点 | 独立核验方式 |
|---|---|---|
| 1 | 数据合同严格闭集 | 读 `life-sim.ts` 与 `life-package-validate.ts`；向 project/material 注入重复 id、未知引用、非正整数、非 building/interactable、URL skin、自由 callback，确认逐 path 拒绝 |
| 2 | 成功原子语义 | 跑 `life-construction.test.ts` 两个 anchor；确认完整材料同时扣除、completed 只写一次、placement identity 不变 |
| 3 | 所有拒绝零写 | 独立复跑 locked/missing-materials/missing-selection/non-nearby/repeat；在动作前后比较 Inventory 与 Project |
| 4 | 标准剧情接缝 | 确认 construction 在同 Commit 排于 affordance 后、relationship/quest 前；成功 build 才让标准 `life-action` trigger 生效，拒绝不生效 |
| 5 | 存档/渲染即时一致 | 完成→save→fresh world restore，restore 后不 tick 直接 `collectLifeSceneRender`，应取 completed skin；package fingerprint 不随 completed 改变 |
| 6 | 素材闭包 | 复跑 `asset-slot-guard.test.ts` 与 generation bundle 测试；确认 placement initial 与 project completed 两个 consumer pointer 同时收集 |
| 7 | 确定性/trace | 同输入双跑比较 authority hash；开 trace 应仅三条 success 或一条 reject，关 trace hash 不变 |
| 8 | 调度图/注册表 | 独立跑点名 system graph、registry check、component manifest/universe/map tests；完整读取 stderr/warning |
| 9 | 撤修验红 | 先断言唯一锚点命中：分别撤掉 `completed:true` 与 `invRemove(...material.count)`；两个 anchor 应各自单红，随后恢复并复绿 |
| 10 | 边界 | 确认未改 `games/game-demon-castle/**` 运行时，未出现脚本/计时器/自由摆放/拆除/随机 id/游戏文案或游戏专属分支 |

## 建议独立命令

```text
npx vitest run src/skills/tier2/life-construction.test.ts src/assembly/life-package.test.ts src/skills/tier2/life-activity.test.ts src/skills/tier2/life-action.test.ts src/skills/tier2/life-quest.test.ts src/skills/tier2/life-relationship.test.ts src/engine/host/life-save.test.ts src/renderer/life-scene-render.test.ts --reporter=dot
npx vitest run scripts/asset-slot-guard.test.ts src/authoring/life-generation-bundle.test.ts --reporter=dot
npm run gen:registry -- --check
node scripts/component-manifest-guard.mjs --check
npx vitest run scripts/build-component-map.test.mjs scripts/component-manifest-guard.test.mjs src/assembly/capability-registry.gen.test.ts src/assembly/component-map.test.ts --reporter=dot
npx vite-node scripts/system-graph-audit.mjs t2-life-activity t2-life-action t2-life-construction t2-life-relationship t2-life-quest
```

## 最可能出错的三处

1. `life-construction` 与 affordance/relationship/quest 同处 Commit；显式总序必须真的消掉本子集 SCC，不能只靠字典序平局。
2. Life save 只能投影 `completed`，静态材料/access/皮肤必须从 fresh baseline 合并；若把整项目写进进展档，会让旧内容覆盖新包定义。
3. renderer 必须纯读 `LifeConstructionProject.completed` 选择皮肤，不能改 `LifePlacement.skinKey`；否则 placement identity、package fingerprint 与 restore 合同会漂移。

## 施工人自证位置

- `docs/design/game-demon-castle/self-check/REQ-SIMLIFE-CONSTRUCTION-01.md`
- `src/skills/tier2/life-construction.test.ts`
- 施工人已完成两条唯一 anchor 撤修验红；具体输出只作导航，不可替代复查人独立实跑。

## 独立复查判词

**PASS（Blocker 0 / Major 0 / Minor 0），建议策划验收。**

### 独立实证

- 架构/边界：独立复读协议、validator/compiler、activity/action、Commit、Quest/关系、renderer、Life save、素材引用收集与注册表。`constructionProjects[]` 保持闭集；`build` 只由当前近邻、未完成项目投影。Commit 还要求同 target 的当前 build affordance **恰有一条**，缺失/重复稳定拒绝 `invalid-target`，不可用 affordance 稳定映射 `locked` / `missing-materials`，随后仍复检 access 与完整材料表。成功路径复制背包后完整扣料，再按显式 Commit 总序写 completed，Quest/关系仅消费成功的标准 `LifeActionResult`。
- 主回归：`npx vitest run src/skills/tier2/life-construction.test.ts src/assembly/life-package.test.ts src/skills/tier2/life-activity.test.ts src/skills/tier2/life-action.test.ts src/skills/tier2/life-quest.test.ts src/skills/tier2/life-relationship.test.ts src/engine/host/life-save.test.ts src/renderer/life-scene-render.test.ts --reporter=dot` → exit 0，**8 files / 69 tests**。
- 素材/生成：独立复读 `scripts/lib/life-visual-references.ts`、`scripts/asset-slot-guard.ts` 与测试，引用遍历已拆为无副作用纯 helper，CLI 入口仍直接执行 `main()`；`npx vitest run scripts/asset-slot-guard.test.ts src/authoring/life-generation-bundle.test.ts --reporter=dot` → exit 0，**2 files / 10 tests**，其中 helper 点名 1/1；`npx vite-node scripts/asset-slot-guard.ts game-simlife` → exit 0，`ASSET-SLOT: PASS game=game-simlife slots=21 consumers=23 approved=0 placeholders=21`。初始与完成皮肤 consumer pointer 均在档，三个相关文件 ESLint exit 0。
- 注册/组件：`npm run gen:registry -- --check` → exit 0，**140 条同步**；`node scripts/component-manifest-guard.mjs --check` → exit 0，**206/206**；component map/universe/lazy registry 点名集 → exit 0，**4 files / 25 tests**。
- 路线图：JSON 解析与 `life-construction-capability` 定向断言确认 `status=review`、`gates.review=pass`；`python -m unittest main_entry.test_project_roadmap -v` → exit 0，**11 tests**（解释器仅输出自身 real-location 环境提示，所有合同用例均 `ok`）。
- 调度图：`npx vite-node scripts/system-graph-audit.mjs t2-life-activity t2-life-action t2-life-construction t2-life-relationship t2-life-quest` → exit 0；6-system 子图无重复 id、悬空边或 SCC warning，`life-affordance → life-construction → life-relationship → life-quest` 的承重顺序成立。
- 静态门：相关手写 TS 的 ESLint → exit 0、零 warning；`node scripts/docs-ref-guard.mjs` → exit 0，46 个文档、394 条路径，`DOCS-REF: PASS`。

### 独立撤修验红

1. 先断言完成写锚点 `world.addComponent(pair.entityId, { ...pair.value, completed: true } as LifeConstructionProject);` 命中数 1、marker 0；临时改成 `completed:false` 后只跑 `completion write anchor`，exit 1，**1 failed / 7 skipped**，精确红于 `expected false to be true`；同回合用 `apply_patch` 恢复。
2. 再断言扣料锚点 `invRemove(nextInventory, material.itemId, material.count)` 命中数 1、marker 0；临时改成扣 0 后只跑 `material deduction anchor`，exit 1，**1 failed / 7 skipped**，精确红于木材 `expected 1, received 4`；同回合恢复。
3. 终态两锚点各命中 1，两个独立 sabotage marker 均为 0；恢复后主回归 69/69、素材/生成 10/10、组件 25/25 及 system graph 全绿，无复查临时文件残留。

### warning / 已知无关红判读

- 首轮 ESLint 把两个 `.gen.ts` 一并点名时仅提示“匹配 ignore pattern”；最终对手写范围复跑为零 warning，不是实现告警。
- `npx tsc --noEmit --pretty false` 的非零仅命中 `game-card-reveal`、`game-dice`、`game-theft` 与 `src/launcher/game-runner.tsx` 的既有类型红；零命中本单文件。
- declaration audit 的存量差异仅为 `narrative-director`、`life-relationship` 相位/SCC 基线；实际与期望均含 `life-construction`，本单点名 registry/子图均绿。
- context budget 的非零是既有 `docs/design/galgame/requests.md`、`docs/design/game-card-reveal/requests.md` 超额及 `docs/playbooks/ui.md` 109 行；本工单池为 10/10、24970/25000，未由本次复查扩写。
- 未执行会调用 Git 的 scoped gate；未执行任何 Git/GitHub、数据库、服务、真实素材或外部 API 操作。代码检索确认不存在 `games/game-demon-castle/**` 运行时特例。
