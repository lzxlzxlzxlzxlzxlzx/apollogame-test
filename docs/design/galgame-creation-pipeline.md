# GAL 创作生产线与审核门（设计稿）

> 状态：提案，未实现。  
> 关联：运行时与数据契约见 `docs/design/galgame-template-data-model.md`。  
> 目标：在 Codex 工作页面中，用户以自然语言提出作品要求；AI 按阶段生成**可审核的结构化创作数据**与资产需求，最终交给 GAL 引擎验证、预览和打包。  
> 红线：写作 AI、图像生成器与工作流编排器均不生成游戏专属 TS/React/DOM 代码；它们只产生数据、提示词、编辑操作和待审资产。

## 1. 系统裁决：两层，不是一锅

```text
┌──────────────────────────────── GAL 创作生产线 ────────────────────────────────┐
│ brief → 写作引擎 → 人工审核 → 资产需求 → 生图待审 → 组装 → 验证/预览请求       │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ 仅输出版本化纯数据与已审核 assetKey
┌───────────────────────────────────────▼────────────────────────────────────────┐
│ GAL 引擎：Narrative Director · 图层投影 · LayoutNode 模板 · 存档 · 校验 · 打包 │
└────────────────────────────────────────────────────────────────────────────────┘
```

| 子系统 | 负责 | 不负责 |
|---|---|---|
| **GAL 引擎** | 解释 `GalPackage`、节点推进、分支、演出投影、UI、存档、回看、验证、Web/桌面打包 | 构思故事、生成图片、替用户决定审美 |
| **GAL 创作生产线** | 需求分解、写作引擎适配、审核门、资产需求、图像生成待审、数据组装与修订记录 | 绕过 schema、直接改运行态、把自由代码写进游戏 |
| **用户** | 每个创作门的方向/审美/内容裁决、资产入库审核、试玩验收 | 手工维护解释器或资源路径 |

这条边界确保未来可替换写作模型、图像模型或编辑器，而不改变已发布 GAL 的运行语义。

## 2. 产线的标准输入与输出

### 2.1 创作 Brief（唯一入口）

```ts
interface GalBrief {
  id: string;
  titleHint?: string;
  locales: string[];
  target: { minutes: number; routes: number; endings: number };
  genre: string[];
  audience: 'all-ages' | 'teen' | 'mature';
  themes: string[];
  prohibitedContent: string[];
  artDirection: { style: string; palette?: string[]; references?: string[] };
  platforms: Array<'web' | 'desktop'>;
  constraints?: string[];
}
```

Brief 不是剧本。它只规定作品边界、目标规模、内容限制与视觉方向，避免模型在后续阶段反复猜测。

### 2.2 阶段化输出信封

任何模型输出都必须进入统一信封，由产线保存版本、验证 schema 并等待审核：

```ts
interface DraftEnvelope<T> {
  kind: DraftKind;
  schemaVersion: number;
  draftId: string;
  basedOn: string[];              // 所依赖的已批准版本 id
  status: 'draft' | 'approved' | 'rejected' | 'superseded';
  summary: string;
  data: T;
  reviewNotes?: string[];
}
```

被拒绝的草稿保留审计记录但不能被组装进 `GalPackage`；被替换的草稿变为 `superseded`，不删除历史。

## 3. 分阶段创作与人工审核门

| 阶段 | 写作/资产 AI 产物 | 用户必须审核 | 允许进入下一步的条件 |
|---|---|---|---|
| P0 Brief | `GalBrief` | 类型、受众、时长、路线数、内容红线、平台 | Brief 已批准 |
| P1 叙事圣经 | 世界观、主题、角色卡、关系、叙事禁区 | 角色是否成立、世界观与风格 | 每个角色有稳定 id 与视觉需求 |
| P2 路线大纲 | 共通线、分歧、结局，以及大纲确定后的地点列表 | 分支是否改变体验；故事会进入的地方都在地点列表里 | 路线和结局数量符合 Brief |
| P3 剧情图 | 章节、场景、节点骨架、选项、条件、跳转 | 图是否可玩、每条路线是否可达 | 图校验零断链；结局可达 |
| P4 场景节拍 | 每场出场角色、背景、情绪、BGM、CG 候选、演出需求 | 节奏、资源规模与关键情感点 | 资产需求可从节拍完整推导 |
| P5 基础资产 | 角色设定、默认/表情立绘、背景、UI 风格资源 | 角色形象、画面风格、构图 | 用户审核入库，获得 assetKey |
| P6 详细剧本 | 每句台词、选项文本、条件、数值变更、语音标记 | 文笔、角色一致性、分支反馈 | 可编译为 `StoryNode` 数据 |
| P7 高价值资产 | CG、特殊表情、视频/场景动画、语音资源需求；可选回想缩略图与无剧透锁态图 | 是否值得成本、与节拍是否一致；锁态图是否泄露剧情 | 用户逐项审核来源/许可并入库，引用稳定 assetKey |
| P8 组装与静态验证 | `GalPackage` 候选、翻译/资源/路线报告 | 内容完整性 | `gal-validate` 零 error |
| P9 试玩与出包 | 可运行预览、验收剧本、Web/桌面候选包 | 体验、存档、路线、演出 | 所有验收门通过 |

**审核是阻塞门，不是留言板。** P1/P2/P3/P4 改变后，下游草稿均标为 `superseded` 或需重新生成；禁止悄悄把旧 CG、旧台词或旧分支拼回新路线。

## 4. 正确的资产生成顺序

不能在详细剧情成稿前批量生成全部 CG 或动画，否则剧情修改会造成昂贵资产浪费。正确依赖是：

```text
角色卡 + 路线大纲
  → 角色设定 / 立绘 / 背景（P5）
  → 场景节拍锁定关键情感事件（P4）
  → CG / 动画 / 视频需求（P7）
  → 最终台词润色与语音标记（P6，可与 P7 局部并行）
```

| 资源类型 | 最早生成时点 | 生成依据 |
|---|---|---|
| 角色设定、默认立绘、表情 | P2 批准后 | 角色卡 + 美术方向 |
| 通用背景 | P4 批准后 | 场景地点表 |
| CG | P4 节拍锁定后 | 关键事件、出场角色、服装、时间地点、构图说明 |
| 场景动画/过场视频 | P7 | 已批准的场景、CG 或镜头节拍 |
| 语音采样 | P6 台词锁定后 | 角色 id + node id + 最终文本 |

生图结果一律进入既有待审区；未审核图没有 `assetKey`，因此无法被 `GalPackage` 引用。图像提示词、来源、许可、风格锚与审核决定均应由资产台账保存。

## 5. 写作引擎适配器

> 2026-10-16 起，本节的 `WritingEnginePort` 草图不再作为施工依据。创作台按 [gal-authoring-flow-plan.md](galgame/gal-authoring-flow-plan.md) 执行：材料留在目录里，模型用闭集工具自己读取，只提交当前步候选。

未来接入现有 AI 写作项目时，应做一个窄适配器，而不是把其自由文本直接喂给运行时：

```ts
interface WritingEnginePort {
  draftBible(brief: GalBrief): Promise<DraftEnvelope<NarrativeBible>>;
  draftRoutes(bible: NarrativeBible): Promise<DraftEnvelope<RouteOutline>>;
  draftGraph(routes: RouteOutline): Promise<DraftEnvelope<StoryGraphDraft>>;
  draftBeats(graph: StoryGraphDraft): Promise<DraftEnvelope<SceneBeatSheet>>;
  draftScript(beats: SceneBeatSheet): Promise<DraftEnvelope<ScriptDraft>>;
  revise<T>(draft: DraftEnvelope<T>, notes: string[]): Promise<DraftEnvelope<T>>;
}
```

- 输出必须符合每阶段 schema；不合格输出由修复回路处理，不能直接落盘为正式作品数据。
- 写作引擎只看到当前阶段所需的已批准上游数据，避免后续草稿污染角色/路线真相。
- 剧本中的逻辑必须转为 `ConditionExpr`、`StoryEffect`、`StoryRef` 等闭集结构；自然语言“好感增加一些”不能进入正式包。
- 每次生成均记录输入版本、模型/提示词标识、时间与人工修改，以便审计和回退。

## 6. 从草稿到引擎数据的组装规则

```text
批准的角色卡          → GalPackage.characters
批准的场景节拍        → scenes + PresentationDelta
批准的剧情图/详细剧本 → chapters + StoryNode
审核资产的 assetKey   → MediaCatalog
批准的结局/解锁规则   → endings + gallery
```

组装器必须是确定性纯函数。它只能读取 `approved` 草稿与已审核资产；遇到缺翻译、缺资源、ID 重复、节点断链或无效条件时失败并给出定位，而不能猜测补值。

## 7. Codex 工作页的未来创作体验

> 2026-10-16 的可点击原型和步骤顺序以 [gal-authoring-flow-plan.md](galgame/gal-authoring-flow-plan.md) 为准。下面的看板草图保留作背景。

工作页应呈现“阶段看板”，而不是一个无限长聊天框：

```text
Brief → 叙事圣经 → 路线图 → 剧情图 → 场景节拍 → 基础资产
      → 详细剧本 → CG/演出 → 校验 → 试玩 → 发布
```

每格至少显示：当前批准版本、待审草稿、依赖关系、缺失资产/翻译、校验结果和可执行的下一步动作。用户可以在任一审核门写修改意见，系统只重生成受影响的下游阶段。

生成图片时，Codex 生图能力只接收经批准的角色/场景/CG 规格；生成结果直接呈现给用户审核，再进资产台账。它不应自行把图片写入正式资源索引。

## 8. 与 GAL 引擎的契约

| 生产线交付 | 引擎消费 | 引擎返回给生产线 |
|---|---|---|
| 已批准的 `GalPackage` | 运行、预览、存档、打包 | schema/reference/可达性错误 |
| 已审核 assetKey | 媒体投影与资产加载 | 缺失/不兼容资源报告 |
| 验收剧本 | 自动化/人工试玩 | 节点轨迹、截图、失败定位 |
| 新版本草稿 | 增量验证与迁移检查 | 旧档兼容性/迁移需求 |

引擎不能调用写作模型；生产线不能直接改引擎世界。两者只通过版本化的数据包、校验报告和可重放的验收结果通信。

## 9. 首个 Sample 的范围

首个由产线生成的 Sample 用于验证闭环，不追求长篇：

- 10–20 分钟；2 名核心角色；2 个背景；每人 3 个表情；
- 共通线 + 2 个有区别的选择；2 个结局；1 张 CG；1 段 BGM；
- 标题、剧情、系统菜单、手动存读档、继续；
- 由完整 P0–P9 流程产生，且无游戏专属代码。

它通过后，才扩展回看、自动/已读跳过、画廊、回想、视频、全语音和多路线长篇作品。

## 10. 实施顺序

1. 锁定 `galgame-template-data-model.md` 的运行时 schema 与本稿 P0–P4 的草稿 schema。
2. 先制作通用 GAL UI 的 `.dc.html` 原型，记录页面状态与交互，不将原型代码带入运行时。
3. 实现最小 `t3-narrative-director`、`gal-validate` 和剧情/标题页模板。
4. 实现生产线的 DraftEnvelope、审核状态与确定性组装器。
5. 创作台按 [gal-authoring-flow-plan.md](galgame/gal-authoring-flow-plan.md) 接模型工具，先跑已有的 P0–P4，不把整包塞进上下文。
6. 接资产待审与 Codex 生图，跑 P5/P7。
7. 用首个 Sample 走完 P0–P9，再扩展完整系统菜单与桌面发布。

没有已批准的上游数据或用户审核判词时，产线必须停在对应门前；不得由模型擅自跳门补全。
