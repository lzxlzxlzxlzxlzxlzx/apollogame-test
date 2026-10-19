# ZeroCraft 多 Agent 团队总览（2026-09-10 · owner 三问：有哪些角色 / 多 agent 好处 / 工作流清不清晰 / 初始化差异）

> 定位：**一页看懂这个项目怎么用多个 agent 造引擎和游戏**。角色的唯一真相仍是 `docs/roles/index.md`，本文只做总览与判词，不复制角色卡内容（指针优先·防口径漂移）。
> 每条判词都有仓库里的事故或守卫作证据，可 grep 复核。

## 1. 角色名录（8 正式 + 1 草案 + 1 子代理）

| 角色 | 名称 | 干什么 | 写权限 | 真相源 |
|---|---|---|---|---|
| LEAD | 主程 / 架构 | 引擎唯一守门人：评「该不该做」、裁缺口 A/B、下沉通用能力、派工、对抗性验收。最高档 session 出图纸不施工 | `src/{engine,skills,assembly,services,net}` + 规则文档 | `roles/LEAD.md` |
| GD-〈game〉 | 游戏策划 | 每游戏一个：GDD / capability-plan / 数值表 / 验收剧本。**零代码** | 只限 `docs/design/<game>/**` | `roles/GD.md` + 策划白皮书 |
| PE-〈game〉 | 游戏程序员 | 每游戏的 gameplay 接线：先查线手册用基座件，查不到提缺口不自造 | `games/<game>/**` | `roles/PE.md` + 各游戏 handoff |
| P3D | 3D 引擎程序员 | 3D 盒庭渲染线 + game-z；render-only 红线；独立需求池 | `src/renderer/three-*` + 3D 组件（handoff §0.1 三档表） | `finish/P3D-game-z-handoff.md` |
| PUI（草案） | UI 基座程序员 | LayoutNode 控件闭集 / catalog / 校验器 / 主题 + game-i 展示台；UI 铁律守门（P3D 镜像） | `src/ui/**` + `games/game-i/**` + UI 审计工具与手册 | `roles/PUI.md` |
| PS | 发行工程师 | 打包 / Electron / Steam 上架 / 成就·云存档·富状态接线 | `steam-publisher/**` · `electron/**` · `scripts/dist*` | `roles/PS.md` + 发行白皮书 |
| PA | 资产管理员 | 美术资产导入 / 登记 / 接线；`assets/index.json` 单一真相 | `assets/**` + 资产索引 | `roles/PA.md`（主体 = asset-manager agent） |
| PST | 创作台产品工程师 | 创作台产品线（`zerocraft.py` 服务面 + launcher / studio 前端）；引擎只读 | `zerocraft.py` · `src/launcher.tsx` · `src/studio/**` | `roles/PST.md` |
| OPS | 施工代理（子代理） | 领 requests.md「指派：Opus」的写死 spec 照图施工；无 spec 的架构判断不下放 | 单次工单授权范围 | 工单 spec |

机器侧定义：`.claude/agents/asset-manager`（PA 主体）· `.claude/agents/game-publisher`（PS 主体）· 技能 `check-ui`（UI 交付自检）· `resource-manager`（资产 vendor 登记）。

## 2. 多 agent 的好处（收益来自分离，不来自并行）

| 好处 | 机制 | 仓库证据 |
|---|---|---|
| **复查人 ≠ 施工人才有真复查** | 换一双眼睛独立复跑、撤修验红 | CLAUDE.md「2026-08-06 一轮五处错，无一处读出来、全是跑出来」；game108 复盘：剧本照实现写，35 条断言零命中 |
| **域边界让越界改坏成为结构上不可能** | 写权限按角色切；游戏层禁 system，缺口只能走 requests.md 下沉 | conveyor-queue：game102 撞墙 → 提缺口 → 引擎件（而非游戏层手写） |
| **上下文预算** | 每角色只读自己那份真相源 | `context-budget-guard`（手册 ≤100 行 / requests 10 硬槽）——一个 session 读不完全库 |
| **档位与成本** | 主 session 最高档只做判断；机械活派 low/medium 子代理 | CLAUDE.md effort 档位表；底层库四件（dice / inventory / rate-limit / 成就）派子代理 |

**代价（同样有记录）**：双头同单（→ 抢锁律）· 交接口径漂移（→ SESSION-HANDOFF 改指针表）· 没有产出物的活没人干（→ 慢车道红三周，见 §3）。

## 3. 工作流：结构清晰，执行靠记忆

**一条线六步，每步有产物，产物即状态：**

```
需求 → ① LEAD 评「该不该做」（重组回驳 / 缺口摆 A·B → owner 判）
     → ② 进 requests.md · 写死 spec · 标「指派」
     → ③ 施工方抢锁（第一动作改「施工主体」并推一次 = 锁）
     → ④ 施工（带 trace）· scoped-gate 全绿 · 推 mainbranch
     → ⑤ 交 Review 单 → 复查人独立复跑 + 撤修验红
     → ⑥ 过 → 同提交删工单条目
```

**不清晰的三处（仓库自己暴露的）**：

- **规则住在文字里不住在工具里**。抢锁、复查分离、禁预告、收工律，每条都是事故后加的——说明前一版没被机器守住。新 session 漏读一条就重演（实证：同一 session 一轮犯两次禁预告）。
- **同一纪律三处口径**：CLAUDE.md / roles/index / 各线手册各抄一遍。
- **没有产出物的步骤会消失**：每日巡检、慢车道定时跑、季度核名录都只在文档里。实证：P1a 严格视图上线后 flow/timeline 漏报 reads，冻结的 game-f 30 例红了三周无人知（2026-09-10 测试评审才抓到）。

**把规则从文字挪进机器的三步（建议）**：
1. 本文 §3 的六步图放进 `docs/workflow/` 首页，每状态写「产物 / 谁能推进」。
2. 锁与复查分离做成守卫：requests 条目「施工主体」与 Review 单「复查人」是机读字段，脚本判同一人即红。
3. 定时活挂 Routine：慢车道 `slow-lane-guard.mjs`、巡检、红旗棘轮各一条 cron。

## 4. 各角色初始化差异

**共用 T0（自动叠加）**：SessionStart 钩子强切 `claude/mainbranch`（**唯一机器执行的一步**·仅全新启动）· CLAUDE.md 注入 · 宪法 + `llm-onboarding.md` · owner 粘贴启动词模板「角色=X · 任务=Y」→ 去 `roles/index.md` 找卡。

| 角色 | 第一份增量必读 | 专属工具 | 交付前自检 / 红线 | 通道 |
|---|---|---|---|---|
| LEAD | 两份底座评审报告 | 全部 agent/技能 · Workflow 派工 | 最高档非 owner 明示不写代码 | requests.md 裁决/验收 |
| GD | 策划白皮书 → plan 模板 → 本游戏 GDD | 创作台设计面 · balance-sim | 零代码；plan 未过审不许 PE 写 system | 设计文档 + 提缺口 |
| PE | `playbooks/index.md` 定位线手册 → handoff → GDD+plan | game-skill-audit · /check-ui · shoot-game | 五红旗（裸 random / innerHTML / createElement / 零能力 / 零测试） | requests.md 领单 |
| P3D | 宪法 → CLAUDE.md → SESSION-HANDOFF → requests → 渲染知识库 → handoff | shoot-game 截图 harness | render-only；边界三档表 | requests-3d.md |
| PUI | ui-playbook → playbooks/ui → catalog.ts / types.ts 闭集 | /check-ui · ui-audit · catalog-validate | 禁手写 React 屏 / 自由 DOM | requests.md UI 缺口 |
| PS | 发行白皮书 → Steam finish-list → publisher README | game-publisher agent · electron-builder · steamcmd · mock-steam | `?steammock=1` 平台冒烟 | requests.md 发行类 |
| PA | PA 资产 handoff → asset-manager 定义 → assets 手册 | asset-manager · resource-manager · 导入端点 | index.json 唯一真相 · 无孤儿 key | requests.md 资产类 |
| PST | llm-onboarding → `git log --grep=REQ-STUDIO` → studio 代码 | playwright e2e · mock provider · 冒烟脚本 | 引擎封锁三层 | requests.md REQ-STUDIO |
| OPS | 只有工单 spec | 单次授权 | 无 spec 不判架构 | 工单 |

**差异的本质**：初始化装进上下文的是三样东西的不同组合——真相源（评审报告 / 线手册 / catalog 闭集 / git 历史）、守门工具（每角色一个专属自检）、写权限（靠文档约定而非机器隔离）。

**三处不齐**：
- P3D 卡是最早的 handoff 直接当角色卡：必读第三步指向已改成指针表的 SESSION-HANDOFF，第五步的渲染知识库自己写着「3D 章节还没写」。→ 按 `_template.md` 重整一次。
- PUI 仍草案态（CLAUDE.md 例外条未转正）。
- 除切分支外无任何角色专属的机器初始化。→ 让 SessionStart 钩子读启动词「角色=X」后直接打印该卡路径 + 必读清单，把「找卡」也挪进机器。

## 5. 一句话

多 agent 让**分工**清晰了；**工作流**要清晰，还差把每一步的守门从 CLAUDE.md 的文字挪进脚本和 Routine。
