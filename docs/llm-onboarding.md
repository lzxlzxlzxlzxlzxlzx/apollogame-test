# ZeroCraft 引擎 · LLM / 新游戏接入手册（唯一入口）

> 2026-07-02 立 · 主程维护。任何「教 LLM / 新 session / 新协作者接引擎」的问题从本文件出发。
> 本文件只做**索引 + 协议**，不手抄数字表——手抄表必漂移（"26 原子"曾在 11 处漂移成教训）。

## 0. 数字口径铁律（防漂移）

文档不抄数字，一律指向**机读单一真相**：

| 要什么 | 去哪读 |
|---|---|
| capability 总数与清单 | `src/assembly/capability-registry.ts`（ALL_CAPABILITIES）；LLM 用 `buildCapabilityCatalog()` 自动导出（零 prompt 维护）；登记后 `npm run gen:registry` |
| 原子清单 | `src/skills/atoms/index.ts`（快照 2026-09-09：33 核心 + 1 扩展 string-variable；过期以代码为准） |
| UI 控件闭集 | `src/ui/components/catalog.ts` UI_CATALOG（34 控件，与 ComponentType 等长，测试钉死） |
| 游戏清单与状态 | `src/launcher.tsx` GAMES |
| 某游戏能力接入体检 | `node scripts/game-skill-audit.mjs [game]`（红旗=裸随机/手写DOM/零能力/零测试） |

## 1. 引擎一页模型

```
Manifest(纯 JSON) ──parseManifest──▶ WorldBlueprint ──engine.load──▶ World ──tick──▶ 确定性状态
```

- **代码 = 引擎 + capability 词汇表**（只有引擎团队增改）；**游戏 = 数据**。宪法：`docs/design/data-driven-manifesto.md`。
- manifest 形态 `{ capabilities: string[], entities: { 实体id: { 组件名: 数据 } } }`——纯 JSON 可表达，**塞不进函数**。
- 校验链：`validate-manifest`（number/boolean 硬校验 + assetKey 防编造）→ `validate-references`（信号/id/模板/图跳转断链体检）。
- 确定性：一切随机走 `RandomSeed` + `nextRandom` 种子 PRNG；ZeroCraftBench 双跑同 hash 钉死可回放。

## 2. LLM 产一个游戏的五步路径

1. **开工前**：交能力总览 capability-plan（模板 `docs/design/capability-plan-template.md`），Lead 过审才动工（CLAUDE.md 铁律）。
2. **拿词汇表**：`buildCapabilityCatalog()`（zerocraft.py 生成管线自动注入 `{CAPABILITY_CATALOG}` 占位符）。
3. **写 manifest 纯 JSON**：可抄样例 = zerocraft.py `PRESET_BLUEPRINTS`、registry 各能力 describe.examples。
4. **UI/HUD 用 LayoutNode 数据**（34 控件闭集）：先读 `docs/design/ui-playbook.md`；活范例 = game-i（UI Gallery）。**⭐ 华丽起手（华丽度=第一要素·别从空白搭朴素屏）**：① `mountUI` 起手传 house 主题（`STARTER_THEME`/apollo-toon·apollo-kit onyx/brocade·非缺省 SHELL·非自写皮）；② 主菜单/结算直接 import `@ui/starters` 起手包；③ 按游戏「有什么」逛 game-i 挑成熟件（`faceArt`/`LevelPath`/`Particles`/`sheen-hover`/`Label.format`/`shape`/3D UI…·货架表 `docs/playbooks/ui.md`「华丽起手」）。朴素默认 UI = 缺陷（PUI 复查可打回）。
5. **验证**：parseManifest 零 error → `npm run bench`（五轴 ≥70·含确定性双跑）→ launcher 透视器人验。

**红线**（audit 硬红旗，出货不豁免）：游戏层禁写自由代码 / 禁手写 DOM / 禁裸 `Math.random`；数据表必须有现成解释器消费（禁"虚胖数据"——填了文案没有效果比没数据更糟）；零测试不出货。

**过程编排**：五步是"怎么做"，**做到哪一步/门过没过**由每游戏的八阶段生产流程板管
（`docs/playbooks/game-production.md`·状态从工件推导·机器门+人门双验）——一个会话只领一个非绿阶段，
禁止一口气跑完全程（防上下文漂移·owner 2026-07-10 拍板）。

## 3. 分层阅读协议（token 价签）

| 层 | 何时读 | 内容 | 约 token |
|---|---|---|---|
| **T0 必读** | 每个新 session | CLAUDE.md（自动注入）→ 宪法 manifesto → 本文件 | ~10k |
| **T1 做游戏加读** | 动手前 | capability-plan-template + ui-playbook + `wiki/skills/index.md`（索引后按需单读，每篇 ~1k） | ~15k |
| **T2 深参考** | 按需 | `engine-llm-readiness-review-2026-07-02.md`（三游戏体检+竞争力判定）· ai-data-editor（编辑器架构）· weak-llm-thesis-redteam（命题红队） | 按需 |
| ⛔ **历史层勿读** | 仅考古 | apollo-engine-overview-for-planner · engine-assessment-and-roadmap · wiki/apollo-project-brief · wiki/atom-skill-periodic-table · wiki/architecture.md · modular-game-framework（均已挂过期头） | — |

全库教材全读一遍 ≈ **200k token**（打满一个上下文窗）；按本协议 T0+T1 ≈ **25k**。

## 4. 游戏现况一览（治理态 · 2026-07-02）

| 游戏 | 一句话 | 治理态 |
|---|---|---|
| game-g 翻命扑克 | 回合制三路 deck-builder，掌机 cartridge 出货线 | **出口①** |
| game-d 骰途 | 骰子 roguelike（原 ARPG 已推倒重写） | **出口②** · 数据驱动整改中（requests.md REQ-GAMED） |
| game-e 小丑牌 | Balatro-like；计分核+68 张数据小丑=**最佳正面教材**；1163 行手写 React=**反面教材勿模仿** | sample |
| game-i UI Gallery | LayoutNode 纯数据展示台 | sample · UI 活范例 |
| game-f 自走棋 | — | **owner 冻结勿动** |
| game-z 盒庭 | P3D 3D 渲染线底座 | sample·基建 |

（game-h/j/k/m 与 block-blast-mini 已删除（owner 2026-07-16 清库）；**game-q/x/t 已删除**（owner
2026-08-03 REQ-RETRO 拍板；d/f 同批一度删除·owner 同日改判还原为上表原状态）；再提到 q/x/t 即过期信号。
**B 位 2026-07-17 重启为全新项目（雀宴·日式麻将）**（立项档 `docs/design/game-b/`·与已删旧作无关）。**A 位 2026-07-17 重启为全新项目**（立项档 `docs/design/game-a/`·与已删旧作无关——早于该日期的 game-a 提法均属旧作·旧作信息已依 owner 令全库抹除）。**C 位 2026-07-17 重启为全新项目（六人德州扑克）**（立项档 `docs/design/game-c/`·与已删旧作无关——早于该日期的 game-c 提法均属旧作·旧作痕迹已依 owner 令抹除，引擎注释仅存 REQ-C-001~004 归档工单号作能力出处）。装示例按钮装的是 zerocraft 内嵌 preset·与已删内置无关。）

## 5. 归档纪律

1. 新增「教引擎」类文档前先查本索引——能并入就不开新文件。
2. 文档里出现具体数字（能力数/测试数/游戏数）必须带日期，或改为指向 §0 机读真相。
3. 过期文档不删，挂三行过期头指回本文件（考古价值保留、误导性拆除）。
