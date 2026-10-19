# 月影魔王城历史施工记录（截至 2026-10-15）

> 历史证据，不是当前施工依据。活动工单见 ../requests.md；旧权限描述以当前 AGENTS.md 为准。旧导航项的 active 状态尚待策划核对。

## SIMLIFE-NAVIGATION-AFFORDANCE-01｜共享 Life Host 场景与出口可发现性

- 状态：🔵 施工中（2026-10-12）
- 施工主体：Codex/root（本地文件锁；Owner 禁令下不执行 Git）
- 复查主体：待独立复查（不得与施工主体相同）
- 范围：共享 Life Host / presenter / renderer、严格 Life schema 与魔王城数据；禁止游戏私有 DOM/TS
- 验收：当前场景名、可见出口标记、近场中文目的地提示、键盘/鼠标显式通行、双向往返与菜单收束稳定；`bare=1` 不得成为 gameplay HUD 的依赖条件

## DEMON-CASTLE-PLAYTEST-01｜建设主线被区域动作词表封死

- 状态：✅ 已修复并完成正式四文件安全更新与只读复验（2026-10-12）
- 发现阶段：正式四文件提升后的 Playtest 前置实证
- 施工主体：Codex/root（2026-10-12 本地锁；Owner 禁令下未作 Git 抢锁/推送）；正式 `games/game-demon-castle/` 仍禁止由 agent 更新

### 事实与复现

主线三节点均以 `life-action/build` 为触发，但当前三个建设点所在区域没有 `build`：

- `world.life.json` 的 `courtyard-town.allowedActions` 为 `[]`，覆盖王座厅与温室；
- `undercrypt-vein.allowedActions` 只有 `mine`，覆盖熔炉；
- 通用 `t2-life-activity` 只有在当前位置某个 zone 的 `allowedActions` 包含 `build` 时才会把建设 affordance 标为可用；否则稳定返回 `zone-disallowed`。

短生命周期实际引擎探针把玩家分别置于三个建设点的合法交互距离后执行真实 capability tick，结果为：

| 建设点 | nearby | 当前 allowedActions | build affordance |
| --- | --- | --- | --- |
| `throne-hall` | true | `[]` | `available:false / zone-disallowed` |
| `greenhouse-ruin` | true | `[]` | `available:false / zone-disallowed` |
| `forge-core` | true | `["mine"]` | `available:false / zone-disallowed` |

因此玩家即使收齐材料也无法完成第一节点，后两节点更不可能解锁。Bundle/compile/确定性与素材闭包全绿没有覆盖“建设 placement 的交互邻域是否存在允许 build 的 zone”。

### 已实查的现有能力

1. capability registry/source：`t2-life-construction` 已提供固定点建设，`t2-life-activity` 已提供按 zone 闭集动作过滤；不缺玩法 capability，也不应新增游戏私有 system。
2. `docs/playbooks/testing.md` 与 `docs/playbooks/self-check.md`：真浏览器试玩必须走主循环；只靠 compile/单测不能代替可玩性目击。
3. `life-materialize --promote`：正式目标不存在时可原子创建；目标存在时只允许四文件逐字完全相同的幂等成功。任何 different 内容必须 fail-closed，现有入口无法安全更新已正式提升的游戏。
4. 直接运行 `node scripts/dump-capability-catalog.mjs` 因脚本当前未加载 TS path alias 而报 `ERR_MODULE_NOT_FOUND @engine/core`；随后以 `src/assembly/capability-registry.gen.ts`、`t2-life-activity`、`t2-life-construction` 与相关测试/文档完成同一实查。该工具故障不改变上述合同事实。
5. 主引擎需求池当前已有 11 个 `REQ-` 标题，超过 10 槽上限；裁决前不新占第 12 槽。若选择 A，应把它作为既有 `REQ-LIFE-FORMAL-PROMOTION` 的返修扩展，而不是另起重复物化器。

### A/B 裁决

#### A｜补通用校验 + 安全正式更新（建议）

- 做法：给 Generation Bundle 全链增加“建设 placement 的可交互邻域必须存在允许 `build` 的 zone”稳定诊断；扩展既有 owner-only formal promotion，使 owner 能以“旧正式四文件 hash + 新 confirmation hash”双确认执行同目录原子替换，保留备份/回滚与发布后严格复验。随后修正 World 的 courtyard/workshop zone 动作表，重走 World→Bundle gate、独立复查与 owner 正式更新。
- 代价：触及共享 authoring validator/materializer、CLI、测试和文档；属于正确性关键面，需要非施工人独立撤修验红与竞态复查。
- 影响面：所有未来 Life 生成游戏；运行时玩法能力不变，正式更新仍只能由 owner 亲自执行。
- 通用性：高。既防止同类不可达主线进入候选，也补上任何已物化 Life 游戏后续修订所必需的安全更新路径。
- 选错代价：实现面比单游戏修补大；若更新事务设计不严，会有正式目录替换风险，因此必须保持双 hash、原子 swap、回滚与 fail-closed。

#### B｜只修本游戏 + owner 手工移走旧目录后重发

- 做法：只修正魔王城 zone 动作表并重走全部内容 gate；owner 把现有正式目录移到明确备份位置，再用现有 `--promote` 重新创建。
- 代价：代码量小，但需要一次人工目录操作和停窗；该操作必须由 owner 亲自执行。
- 影响面：仅 `game-demon-castle`；不修改共享 validator/materializer。
- 通用性：低。下一个生成游戏仍可能以同样方式通过 Bundle 后才在试玩暴露；每次正式内容更新都要人工搬目录。
- 选错代价：留下验证与更新流程缺口，容易重复漏检或在人工换目录时拿错版本。

**建议 A。** 这不是新增游戏规则，而是现有通用建设 capability 的 authoring 可达性不变量与正式数据生命周期缺口。裁决前不改数据、不重签 gate、不触碰正式目录。

### Owner 裁决（2026-10-12）

Owner 选择 **A**。本单并入既有 `REQ-LIFE-FORMAL-PROMOTION` 作通用返修扩展：先完成并独立复查建设可达性 gate 与 owner-only 安全更新事务，再修正本游戏候选 World、重走 Bundle/M0；agent 不直接更新正式目录。

### 施工与复查结果（2026-10-12）

- strict Bundle/materializer 已增加固定建设点真实 affordance 可达性 gate；缺 build zone、合法距离内不可达、真实 affordance 不可用分别给出稳定错误诊断。
- materializer 已增加 owner-only `plan-update/update`：旧正式四文件组 hash + 新 confirmation hash 双确认、同目录 staging、目录身份守卫、原子 swap、普通故障回滚、外部替换保留与幂等更新均有永久回归。
- 非施工人独立复查最终判定 PASS：Critical 0 / Major 0 / Minor 1；Minor 为测试表达问题，已补为候选三项目逐项锚定及真实 session 直接探针。
- 候选 World 仅把 `courtyard-town` 设为 `["build"]`，把 `undercrypt-vein` 设为 `["mine","build"]`；`courtyard-garden` 与 `moonshadow-forage` 保持原动作。
- 定向终态回归：3 files / 46 tests PASS；ESLint PASS；Vite build 765 modules PASS；全库 tsc 仅命中既有无关游戏/launcher 错误，本单文件零命中。
- 新 confirmation：`sha256:559fb88aa44660ac1d33c15331ad92ffa674a62a897f7669e409e2b5664173f7`；当前正式组：`sha256:801242eb0e9c2445c24241f51172fa0161202d39ee0fcec2742e85080bf9bfa6`；新正式组：`sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`。

owner 已执行受限的正式 `--update`，返回 `writesPerformed:true`、`writtenFiles:4`；agent 随后只读复验得到 `currentFilesHash=sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`、`conflicts:[]`，正式 `life.json` 与候选 canonical 内容一致。最终定向 3 files / 46 tests、ESLint、DOCS-REF 与路线图 11 tests 均通过；本单关闭，下一阶段为共享 Host 可视化 Playtest。

## SIMLIFE-DEMON-PLAYTEST-01｜共享 Life Host 真机试玩验收包

- 状态：🟡 机器准备与独立复查完成；owner 真机目击 pending（2026-10-12）
- 施工主体：Codex/root（生产代码 zero-code）
- 主验收包：`docs/design/game-demon-castle/playtest.md`
- 自动证据：production catalog/shared host 真实 mount、26 项批准素材闭包与完整首章语义路径共 6 files / 35 tests PASS；新增测试 ESLint PASS；Vite build PASS。
- 人门：owner 需在全新隐私窗口按六步路径完成三建设点、素材实显、剧情反馈与刷新恢复，并保存 PT-01～PT-06 截图。owner 未目击前不得关闭本单或通过路线图 owner gate。
