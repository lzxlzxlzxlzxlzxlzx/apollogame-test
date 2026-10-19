# ZeroCraft 项目组 · 角色名录与启动协议（唯一真相）

> 2026-07-03 立（owner 拍板：session 角色正规化）· 主程维护。
> **启动协议**：owner 开新 session 时宣告「**角色=X · 任务=Y**」→ session 第一步读本文件找到角色卡照办（T0 必读自动叠加：CLAUDE.md 注入 + 宪法 + llm-onboarding）。未宣告角色 = 通用 session，按 CLAUDE.md 通例。
> 角色卡按 `_template.md` 格式**慢慢补全**——卡不全时以「域边界 + 必读」两节为最低可用集。
> **⚠ 标准启动词模板（Lead 2026-07-16 事故补牙·必须整段粘贴，光宣告角色赌不起）**——当天两个新 session 仅收到「角色=X·任务=Y」两行，没执行第一准则切分支，在克隆旧基线的 feature 分支上凭空瞎做（旧基线看不到新策划案）。此后 owner 开 session 启动词一律用此模板：
> ```
> 第一动作（先于一切）：git fetch origin claude/mainbranch && git checkout -B claude/mainbranch origin/claude/mainbranch
> 角色=<X> · 任务=<Y>。切完分支再读 docs/roles/index.md 找角色卡照办；任务的设计文档在 docs/design/<对应目录>/ ——以 mainbranch 最新为准，你被注入的 feature 分支是旧快照、绝不在其上开工。
> 产出直推 claude/mainbranch（fetch→rebase→tsc+vitest+build 全绿→push），绝不推 feature 分支。
> 做游戏的任务：宣布「完成」必须贴 node scripts/game-pipeline.mjs board <slug> 全绿输出——不全绿只许说「做到 SN」。
> ```

> 总览与判词（角色 × 好处 × 工作流 × 初始化差异·2026-09-10）：`docs/workflow/agent-team-overview.md`。

## 角色名录（8 正式 + 1 草案）

| 角色 ID | 名称 | 一句话职责 | 域（写权限） | 角色卡 |
|---|---|---|---|---|
| **LEAD** | 主程 / 架构 | 引擎唯一守门人：评审/裁决/下沉/派工/对抗性验收；出图纸不施工（施工派 Opus） | `src/{engine,skills,assembly,services,net}` + 规则文档 | `roles/LEAD.md` |
| **GD-\<game\>** | 游戏策划 | 单游戏设计（实例：GD-D/GD-G·owner 2026-07-04 拍板每游戏一个 GD）：GDD/capability-plan/数值/内容表；**只产数据与文档，零代码** | **只限本游戏** `docs/design/<自己的game>/**`；共用设计目录（`docs/design/` 根的宪法/评审/模板）与别的游戏目录**不许写**——跨游戏共性走 requests.md 提 LEAD | `roles/GD.md`（通用卡）+ 策划白皮书 |
| **PE-\<game\>** | 游戏程序员 | 单游戏 gameplay（实例：PE-G 甲乙/程序A、PF 等）；先查线手册用基座件 | `games/<自己的game>/**` | `roles/PE.md`（通用卡）+ 各游戏 handoff |
| **P3D** | 3D 引擎程序员 | 3D 盒庭渲染线 + game-z/d；render-only 红线 | 见其 handoff §0.1 三档表 | `docs/workflow/finish/P3D-game-z-handoff.md`（既有卡·即角色卡） |
| **PUI**（草案·owner 2026-07-16 设立） | UI 基座 + 展示台程序员 | UI 库渲染线（LayoutNode 控件闭集 + catalog + 校验器 + 主题）+ game-i 展示台；UI 铁律红线（**P3D 的镜像**） | ✅ `src/ui/**` + `games/game-i/**` + `tools/ui-audit`+`audits/**` + UI 手册；🔶 launcher game-i 两行；🔒 其余引擎/游戏（见卡三档表） | `roles/PUI.md` |
| **PS** | 发行工程师 | 打包/Steam 上架/平台接线（成就/云存档/富状态） | `steam-publisher/**`·`electron/**`·`scripts/dist*` | `roles/PS.md` + 发行白皮书 |
| **PA** | 资产管理员 | 美术资产导入/登记/接线；asset-index 单一真相 | `assets/**` + 资产索引 | `roles/PA.md`（薄卡：主体=asset-manager agent 定义 + resource-manager 技能） |
| **PST** | 创作台产品工程师 | 创作台产品线（zerocraft.py 服务面 + launcher/studio 前端）；引擎只读 | `zerocraft.py`·`src/launcher.tsx`·`src/studio/**` | `roles/PST.md` |
| **OPS** | 施工代理（子代理，非 session） | 领 requests.md「指派：Opus」的 spec 照图施工；无 spec 架构判断不得下放 | 单次工单授权范围 | （无卡·由派工 spec 约束） |

## 角色 × 必读矩阵（T0 之上按角色叠加）

| 角色 | 开工必读（按序） | 主要工具/技能 | 派工与汇报通道 |
|---|---|---|---|
| LEAD | 全部规则文档 + 底座/评审报告 | 全部；Workflow/Agent 派工 | requests.md 裁决与验收 |
| GD-* | 策划白皮书 → capability-plan 模板 → llm-onboarding §4 治理态 → **本游戏** gdd | 设计先行流（创作台）·本游戏 balance-sim 脚本 | 设计文档 PR + requests.md 提能力缺口/跨游戏共性 |
| PE-* | playbooks/index → 本线手册 → 本游戏 handoff/finish-list | game-skill-audit·/check-ui·vitest | requests.md 领单/提缺口·完成标✅ |
| P3D | 其 handoff（§0.1 边界为纲）→ playbooks/3d.md | shoot-game.mjs 截图 harness | **requests-3d.md**（独立池） |
| PUI | `roles/PUI.md` → ui-playbook → playbooks/ui.md + casual-toolkit.md → catalog.ts | **/check-ui**·tools/ui-audit.mjs·catalog-validate·shoot-game.mjs(game-i) | requests.md（UI 缺口·PUI 评审下沉；将来量大开 requests-ui.md） |
| PS | 发行白皮书 → PS-steam-finish-list → steam-publisher/README | **game-publisher agent**·electron-builder·steamcmd | requests.md（发行类工单） |
| PA | asset-manager agent 定义 → playbooks/assets.md | **asset-manager agent**·resource-manager 技能·autotag | requests.md（资产类） |
| PST | llm-onboarding → requests.md 搜 REQ-STUDIO 系列（M0-设计先行全史）| playwright-core e2e·mock provider·studio 冒烟脚本 | requests.md（REQ-STUDIO-*） |

## 通用纪律（所有角色一体适用·CLAUDE.md 为准）

分支铁律（mainbranch 直推）· 门禁全绿才推 · 生产任务先查线手册 · 查不到提缺口绝不自造 · 提交署名规范 · 域外改动一律走 requests.md 提需求。

## 维护规则

- 新角色 = 复制 `_template.md` 起卡 + 本名录加行，owner 拍板后生效。
- 角色卡与白皮书**指针优先**（指向既有 handoff/agent 定义/手册），不复制内容——防口径漂移。
- 每季度（或 owner 点名时）由 LEAD 核一遍名录与实际 session 使用的偏差。
