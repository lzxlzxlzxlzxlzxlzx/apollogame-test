# game111 · 文档索引

> ⭐ **先读 `gdd.md`（策划案总纲）。** 其余是分册，按需翻。
>
> ⚠ **当前方向**：白天种菜 · 夜里作物成精回来偷菜 · 回合制卡牌夜战 × 东方妖怪 RPG。
> `framework.md` / `capability-plan.md` / `impl-notes.md` 是**转向前的「AI 活世界」口径**，
> 代码已落地但**待策划案定稿后重审重写**——别拿它们当现行设计。

| 文档 | 性质 | 状态 |
|---|---|---|
| `concept-source.md` | 外部参考素材（米哈游 AI 生态团队技术方案）忠实归档。**不是本仓设计决定** | ✅ 完成 |
| `framework.md` | 把素材抽象炼化成本仓可落地的基础框架设定 + 4 项缺口 A/B | ✅ **owner 2026-09-12 已裁：①②③=A · ④=B** |
| `capability-plan.md` | 能力总览（模板 `docs/design/capability-plan-template.md`） | ✅ **Lead 2026-09-12 有条件通过**（两条条件写死在 §6·复查门按它核） |
| `requests.md` | game111 的需求单（三条引擎缺口） | ✅ **三件全交**（2026-09-12·已晋升引擎池并推送·等独立复查） |
| `impl-notes.md` | 框架层施工笔记：已交付清单 · 与 plan 的三处偏差 · 撞出的引擎缺口 · 配平教训 | ✅ 2026-09-14 |
| `monster-prototypes.md` | 蔬菜妖怪原型研究（山海经够不够·真正的原型在哪·呼名机制） | ✅ 2026-09-15 |
| `plant-monsters-world.md` | 世界植物妖怪总集（两大家族的分野·各洲素材·三条现成机制·RPG 分工） | ✅ 2026-09-15 |
| `fusion-system.md` | 融合体系（防缝合判据 · 功能轴 · 六槽语法 · 嫁接约束）。**§2 胡番洋三系已废**，见下行 | 🔶 部分作废 |
| `core-loop.md` | **核心循环与心流**（一句话 · 七个决策的还账 · 黄昏枢纽 · 三个失败模式判据） | ✅ 2026-09-15 |
| `card-fusion.md` | **战斗卡牌化怎么融合**（田即牌桌 · 三个牌库来源 · 名字就是卡 · 四方案取舍） | ✅ 2026-09-17 |
| `market-report.md` | **市场调研报告**（22 款 Steam 实例分四层 · 五条规律 · **12 个核心玩法方向** · 三套推荐组合） | ✅ 2026-09-15 |
| `benchmarks.md` | **对标研究**（Dave the Diver / Rune Factory / Atomicrops / **Farmagia 失败复盘**） | ✅ 2026-09-15 |
| `sect-taxonomy.md` | **蔬果成精派系归类**（八派 × 六味 × 修为四阶 · 39 种首批名册 · 图标认植物铁律） | ✅ 2026-09-15 · **现行分类以此为准** |
| **`gdd.md`** | ⭐ **策划案总纲**——七份分册收成一份能从头读到尾的。**先读这份**（§11 决策台账三色分明） | ✅ 2026-09-20 |

**当前进度**：引擎侧三件已全部落地并推送，游戏层可以开工了。

| 引擎需求 | 交付物 | 状态 |
|---|---|---|
| `REQ-111-ENG-01` LLM 决策端口 | `src/engine/protocol/agent.ts`（契约）+ `src/services/npc-agent/`（Null 桩 + Http 骨架） | ✅ 已交 |
| `REQ-111-ENG-02` 异步收齐门 | `src/skills/tier2/intent-barrier{,-core}.ts` = `t2-intent-barrier` | ✅ 已交 |
| `REQ-111-ENG-03` 记忆 | `src/skills/tier2/memory{,-core}.ts` = `t2-memory` | ✅ 已交 |

**下一步（游戏层·归 🟢 本游戏 PE）**：写 `gdd.md`「NPC AI」详设章 → 摆四张 L0 数据表
（`INTENT_VERBS` / `MEMORY_TAGS` / `NPC_CARDS` / `TURN_PHASES`）→ 按 `capability-plan.md` §2.3
的三条硬口径接线。**别在游戏层重造那三件**。
> 引擎池对应条目：`REQ-111-AINPC`（端口 + 门·捆绑）· `REQ-111-MEMORY`（记忆）。两条均等独立复查（复查人 ≠ 施工人）。
