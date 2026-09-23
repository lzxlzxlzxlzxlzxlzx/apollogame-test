# ZeroCraft 生产线手册总目录（Playbooks · 唯一导航）

> 2026-07-03 立（owner 拍板）· 主程维护。**生产任务开工前，先来这里找对应线手册。**
> 定位：手册 = 「在**本引擎**里做 X，该用哪个基座件、数据长什么样」的**接线图**；
> 与 `wiki/skills/`（行业知识，建新能力才读）、`capability-registry`（机读字典）分层不重复。

## 使用铁律（工作流）

1. **先查后做**：接到任务 → 按下表找到生产线 → 读该线手册 → **手册里查得到的做法必须用基座件**。
2. **查不到先 `git pull` 再查**：旧树查不到新知。**查不到 ≠ 自造**：手册未覆盖 → 去 `docs/workflow/requests.md` 提缺口，走 **⚖ 缺口裁决协议三步**（①实查留原文 → ②摆 A/B 及代价 → ③owner 判·Lead 不自裁；全文见 CLAUDE.md）→ **等裁决，不绕基座**。
3. **手册对产出游戏负全责**：查不到即手册的 bug——提缺口同时就是在修手册；主程裁决后把答案回填对应手册。
4. 交付前自检：跑 `node scripts/game-skill-audit.mjs <game>`（红旗=裸 Math.random/innerHTML/createElement/零能力接入/零测试）；UI 线另跑 `/check-ui`。

## 生产线 → 手册 → 负责角色

> 每条线已配 `/module-*` skill；主 agent=`game-dev`（`.claude/`）。

| 生产线 | 手册 | 基座核心 | 负责角色/agent |
|---|---|---|---|
| **游戏生产总线（八阶段流程板）** | `playbooks/game-production.md` | 生产流程板 pipeline.json · 每步三门（机器+复查+人）· `scripts/game-pipeline.mjs` | **全员（任何新游戏/续做先看板）**；判官=Lead |
| **流程验收问题层（每步答 YES 才过）** | `playbooks/game-flow-questions.md` | 八阶段的**验收问题层**·**T2 闭环竖切**（验收剧本 conformance 机器证「环跑通」）为第一强制门 | **全员（防「门绿但环不闭」）**；判官=Lead |
| **超休闲/休闲工具箱（速查·2D+3D 汇总）** | `playbooks/casual-toolkit.md` | 按「你要做什么」汇 Juice/3D UI/卡通观感/手感/物理玩具/世界 UI · 活范例=game-i | **做休闲/超休闲游戏先看**（UI 细则→ui.md·3D 细则→3d.md） |
| **按玩法选件（决策树一页）** | `playbooks/pick-list.md` | 玩法→基座件实名速查（卡牌/三消/波次/剧情…）·查不到走 capgap CLI | **全员（新游戏/新玩法开工第一站·8/4 评审 Q1 件）** |
| **自证环节（自玩自审·对照策划）** | `playbooks/self-check.md` | 真渲染自玩 + 截图序列 + 策划对齐单（零未解释偏差才送复查门） | **全员（宣称 S4/S5 完成前强制）**；抽查=复查门 |
| **复查门（三门制·每关另一双眼睛）** | `playbooks/review-gates.md` | checklist→对抗核证→review 落账 · S7=八维评分卡（任一维 0=红） | **复查 session（复查人≠施工人）**；裁=Lead |
| UI / HUD / 菜单 | `docs/design/ui-playbook.md`（先读）+ `playbooks/ui.md`（接线图） | LayoutNode 34 控件闭集 · mountUI 信号 · Label.font 艺术字 18 款(OFL 内嵌) · 色库三态填充(令牌/预设/custom·非裸 hex) · 异形按钮 8 形 + 贴图皮 + 按压反馈 | 各游戏 PE；活范例=game-i |
| 渲染与特效（2D） | `playbooks/rendering-fx.md` | Sprite/Color/Frame/Gauge · EffectKind 闭集 · 主题令牌 | 各游戏 PE |
| 3D（盒庭线） | `playbooks/3d.md` | Mesh3D/Transform3D/Camera3D/Light3D/Post3D/Vfx3D/Model3D… | **P3D 独占域**；逐特性消费活范例=`game-i/three3d.ts` |
| 运动与寻路 | `playbooks/movement-pathfinding.md` | motion/tween/steering/grid-move(hex A*)/pathfind | 各游戏 PE |
| 事件与逻辑链 | `playbooks/events-logic.md` | event-when/condition/effect-apply/flow/keybind 信号铁律 | 各游戏 PE |
| 战斗 | `playbooks/combat.md` | hitbox/mortal/stats/over-time/aggro/dice 族/opposedRoll | 甲（game-g 战斗核先例） |
| 对手/敌人 AI | `playbooks/opponent-ai.md` | behavior-tree/event-when+flow 相位门/State 心态机/Effect.chance 种子骰/aggro；AI 设定必填（§4.65） | 各游戏 PE；正样例=game108 大师 v5 / game-a BT |
| 卡牌 | `playbooks/cards.md` | card-pile/card-play/poker-hand(wild)/card-scoring | 各游戏 PE；正样例=game-e 计分核 |
| **底层功能库与共享件** | `playbooks/base-lib.md` | `@engine/math` · `byId/sortedIds` · 事件总线 · 随机派生 · 数据糖 · event-log/persist/牌码 | **全员（先查后写·手写同形=红旗）** |
| 随机与确定性 | `playbooks/randomness.md` | RandomSeed/nextRandom/seededShuffle · **裸 Math.random=红线** | 全员必读（最短的一本） |
| 资产 | `playbooks/assets.md` | art:检索/AssetManifest/asset-index | **asset-manager agent** / resource-manager 技能 |
| **美术管线（配美术/换皮）** | `playbooks/art-pipeline.md` | 美术平台+台账 art-NN+风格包+批量生成/写回（终态档=唯一权威） | 全员（做游戏必读）；平台=PST |
| 音频 | `playbooks/audio.md` | SynthAudioPort/SfxSpec（声音=数据） | 各游戏 PE；正样例=game-g |
| 存档与平台 | `playbooks/save-platform.md` | storage/platform-hooks（云存档/成就） | 各游戏 PE；发布=**game-publisher agent** |
| **DokiWorld 出包** | `playbooks/dokiworld-pack.md` | 产物→DokiWorld App（manifest/SDK/自包含 dist） | 出包前必读 |
| ~~外部引擎交付（DokiWorld 卡带）~~ | `playbooks/dokiworld-export.md` | **已退役 2026-08-13**——旧协议桥形态·对方不再收 | 用上一行的出包线 |
| 平台角色卡桥（外部数据→席位） | `playbooks/character-card.md` | `services/character-card`（normalizeCharacterCard/toSeatCard/isCardUsable）· 媒体取优 · 成年硬闸 · passthrough 对账 | 各游戏 PE（a/b/c 接卡）；桥=引擎 services |
| **测试与验收** | `playbooks/testing.md` | vitest·registry-guard·ZeroCraftBench·数值 sim·e2e·smoke·game-skill-audit | **全员（交付前必过）**；验收纪律=Lead |
| **视觉验收/出货门** | `playbooks/visual-scorecard.md` | 8 维 0-3 分·premium=全维≥2·证据台账·反捷径工艺律 | 判官=Lead/P3D；PS 出货内门（TGS 吸收·owner 2026-07-06 批） |

> **宿主壳层公共件**（别手写·REQ-SHELL 三件）：`engine/host`（`mountHost` 骨架 + `createRunLoop` 运行环）·`assets/game-art-load`·`services/persist`（局外小态/本地榜）。
> 上表「基座核心」只是路标——**能力实名与数据样例一律以 `capability-registry` 的 describe/examples 为准**（机读真相，`buildCapabilityCatalog()` 可导出），手册不手抄字段表。

## 与其他体系的关系（谁先谁后）

```
T0 必读        CLAUDE.md → 宪法 manifesto → docs/llm-onboarding.md
开工前         本目录 → 对应线手册（+UI 线加读 ui-playbook）
新游戏立项     docs/design/capability-plan-template.md（能力总览过审才动工）
建新能力(引擎) wiki/skills/index.md（行业知识）→ registry 注册规范
交付前         game-skill-audit + /check-ui + 门禁
```

## 手册维护规则

- 每本 ≤100 行（owner 2026-08-07 由 80 放宽·机器卡在 baseline）、索引式（做 X → 能力实名 → 样例指针 → 红线 → 查不到怎么办），不抄数字表（口径漂移教训见 llm-onboarding §0）。
- 新能力下沉落地时，**同一提交里回填对应手册一行**——手册与 registry 同步是下沉工作的一部分。
- 手册答不上的问题在 requests.md 出现 ≥2 次 → 该线手册记 bug 待重写。
