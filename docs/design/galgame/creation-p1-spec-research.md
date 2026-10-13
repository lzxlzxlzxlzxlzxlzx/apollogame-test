# GAL 创作产线 P1：P0–P4 草稿合同调研与窄规格建议

> 2026-10-11；**Owner 已裁决 A：采用通用草稿审核合同；本文件仍是规格调研，不是已实现证据**。本文件不修改项目路线图、不创建写作适配器、不实现审核服务。P0–P4 是创作阶段，**不是**游戏 S1–S8，也不等于 `GalPackage` 已可装载。范围依据 `../galgame-creation-pipeline.md`；首个手工静态包的既有 owner B 判词只规定验证顺序。

## 1. 实查结论：能重组什么，不能重组什么

| 需求 | 已有证据与可消费部分 | 缺口与回驳 |
| --- | --- | --- |
| 正式发行包 | `src/engine/protocol/galgame.ts` 是 V1 闭集；`src/assembly/gal-package.ts` 的 `validateGalPackage` 只读校验本地化、引用、媒体 key、可达性和无出口环，并给路径化 issue | 不是 P0–P4 schema/审核门；不能把草稿直接 `parseGalPackage`，也不能把“正式包通过”当人审通过 |
| 剧情解释 | registry 已实名登记 `t3-narrative-director`；`docs/playbooks/events-logic.md` 指明 `StoryRef`、`ConditionExpr`、具名动作 | 属运行时，不保存创作版本、审核记录或上游依赖；不应为草稿新增 sim system |
| 生成/纠错 | `main_entry/generation.py` 对 manifest 做 JSON 提取、校验错误回喂与有界重试；`src/authoring/life-generation-bundle.ts` 示范规范 JSON hash、闭集诊断、受限 patch 与零写入 plan | 两者均非 GAL P0–P4：前者校验 ECS manifest，后者字段/阶段和物化路径绑定 Life；只能借鉴模式，不能复用其协议或宣称已有 GAL 产线 |
| 人工审核 | `main_entry/art_review.py` 有素材 pending→approve/reject 闸，批准后才进 asset index；项目路线图 `main_entry/project_roadmap.py` 有里程碑 owner gate | 素材拒绝会清待审文件，GAL 文字拒稿必须保留历史；项目里程碑不是逐草稿审核。二者不能充当 `DraftEnvelope` 状态机，不能借审核端点绕 owner 门 |
| 外部写作项目 | 全仓对 `WritingEnginePort`、`draftBible`、`DraftEnvelope` 的命中仅在设计稿/旧分析文档，未找到实现接口 | 不得假设模型请求、鉴权、版本语义或返回格式；P1 仅定义候选数据和纯校验，适配器待真实接口另审 |

**判断：接受 P0–P4 的窄创作数据合同与审核语义调研；回驳先写工作台、持久化状态机、跨项目框架或从模型直接产 `GalPackage`。** 正式缺口是“不可变草稿版本 + 已批准上游引用 + 人审决定 + 失效判定”，现有能力仅能提供校验/哈希/审核门的设计先例，不能通过配置重组为同语义。

## 2. 建议的共同信封与身份

以设计稿的 `DraftEnvelope<T>` 为起点，但把**模型候选**与**可信信封**分开：写作端只返回 `T` 候选；可信侧完成 schema 检查、分配 `draftId`、计算内容指纹、记录上游版本，且只有人审动作可改变决定状态。建议 V1 闭集：

```ts
type DraftKind = 'brief' | 'bible' | 'routes' | 'graph' | 'beats';
type Decision = 'draft' | 'approved' | 'rejected' | 'superseded';
interface DraftEnvelope<T> {
  schemaVersion: 1; kind: DraftKind; projectId: string;
  draftId: string; revision: number; basedOn: string[];
  contentHash: string; status: Decision; summary: string; data: T;
  reviewNotes: string[];
}
```

- `draftId` 标识**一次不可变内容版本**，同项目全阶段不重复；`revision` 是同一 `kind` 的正整数提交序号，不是发布包 `schemaVersion`。`contentHash` 对 `kind + schemaVersion + projectId + basedOn + data` 规范化 JSON 计算，由可信侧复算，键排序、数组顺序保留；更换上游版本即使正文相同也必须生成新 `draftId`。`summary/reviewNotes/status` 不参与内容 hash，审核决定须由可信侧的追加式事件记录；对外信封里的 `status` 只是这些事件的只读投影，不能由模型自报 approved，也不能原位改内容冒充新版本。
- `basedOn` 是**直接依赖的已批准不可变 draftId**，按 `brief → bible → routes → graph → beats` 逐级只引用紧邻上游一个版本；P0 必为空，P1–P4 必各一个。所有引用必须同 `projectId`、类型正确、无环，且在审批/装配瞬间仍是该阶段的当前批准版。用被引用信封的 hash 再验一次内容，防同 ID 原位篡改；不把自由文本或标题当版本身份。
- 业务稳定 ID 与 `draftId` 分离：P1 分配 `characterId/locationId`；P2 分配 `routeId/forkId/endingId`；P3 分配 `chapterId/nodeId/optionId`（节点身份是 `StoryRef`，节点 Record 内不再写 `id`）；P4 分配 `beatId` 并锚定 `StoryRef`。修文案/排序不改这些 ID；分支意义真正替换则创建新 ID，旧 ID 不再复用。**发布后的** `chapterId/nodeId` 变更必须另有迁移/拒旧档裁决，不能借草稿修订静默改名。
- 设计稿原 `basedOn:string[]`、四种 `status` 保留；“已失效”不是第五种可随意写入的决定状态，而是由依赖链计算的 `eligibility: current | stale | blocked` 只读投影。如此历史 approved 可保留审计事实，同时 stale 绝不可进入下一门或 P8 组装。

## 3. P0–P4 各阶段闭集（作者可填的字符串不是可执行表达式）

以下是字段集合建议，不是已实现 TypeScript。每层拒绝未知字段、非 JSON/非有限数、重复或空 ID、跨项目引用；限制数组/文本大小在施工规格中给确定上限，避免无界模型输出。展示文字均为纯文本，不含 HTML/代码；本地化在 P6/P8 补齐，P0 的 `locales` 决定最终必需语言。

| 阶段 | `data` 的闭集建议 | 阶段纯校验与人审重点 |
| --- | --- | --- |
| P0 `GalBrief` | `id,titleHint?,defaultLocale,locales[],target{minutes,routes,endings},genre[],audience(all-ages\|teen\|mature),themes[],prohibitedContent[],artDirection{style,palette[],referenceIds[]},platforms(web\|desktop)[],constraints[]` | 唯一 locale、default 包含于 locales；目标为有限正整数且路线/结局非零，平台非空；人审受众、禁区、规模。`referenceIds` 是待审参考工件 ID，不是运行时 URL/assetKey |
| P1 `NarrativeBible` | `briefId,world{premise,rules[]},locations{id,name,description}[],characters{id,name,role,motivation,traits[],arc,visualNeed{silhouette,costume,expressions[]}}[],relationships{from,to,kind(ally\|rival\|family\|romance\|other),note}[],canonRules[],narrativeProhibitions[]` | `briefId` 等于 P0 `data.id`；角色/地点稳定 ID 唯一，关系两端存在；prohibitions 不得缩窄 P0 禁区；视觉需求只描述，不声称有批准素材 |
| P2 `RouteOutline` | `bibleId,routes{id,leadCharacterId?,premise,milestoneIds[],endingIds[]}[],forks{id,sourceMilestoneId,options{id,targetMilestoneId,intent}[]}[],milestones{id,summary}[],endings{id,routeId,outcome,conditionIntent?}[]` | 与 Brief 路线/结局目标数量对账，角色/路线/里程碑/结局引用闭合，fork option ID 局部唯一；`conditionIntent` 是待 P3/P6 落为闭集条件的创作说明，**不可编译、不可当可达性证明** |
| P3 `StoryGraphDraft` | `routesDraftId,entry:StoryRef,chapters:{[chapterId]:{title,start:nodeId,sceneId?,nodes:{[nodeId]: GraphNode}}},sceneSlots{id,locationId}[]`；`GraphNode` 仅 `line-slot{next}`, `choice{options{id,next}}`, `check{pass,fail,checkIntent}`, `jump{then,otherwise?}`, `ending{endingId}`，各可有 `routeId?` 与 `milestoneId?`；所有边为 `StoryRef` | 复用 `StoryRef` 身份/图遍历思想，检查 entry、章节 start、跨章边、choice option、ending/route 引用、从 entry 的**结构可达性**与无出口强连通环。`checkIntent` 不是 `ConditionExpr` 或正式 `CheckNode.check`；不得声称条件分支已实际可达，P6/P8 必转换和再验 |
| P4 `SceneBeatSheet` | `graphDraftId,beats:{[beatId]:{anchor:StoryRef,sceneSlotId,castIds[],mood,dramaticPurpose,backgroundNeedId?,bgmNeedId?,cgNeedId?,presentationNeeds:{transition?(cut\|fade\|wipe\|dissolve),motions[]},order}}`，需求目录 `mediaNeeds{id,kind(background\|bgm\|cg),brief}[]` | beat ID 唯一、锚点指向可达节点；同一锚点允许多个节拍，但 `(anchor,order)` 不得重复且 `order` 为非负整数。cast 来自 P1，sceneSlot 来自 P3，需求 ID 闭合；每个必需场景有节拍覆盖。这里只产**资产需求 ID**，没有正式 `assetKey`、URL、视频/语音采样或 `PresentationDelta` 假值 |

P3 的 `line-slot/checkIntent` 与 P4 的视觉需求是刻意的**作者态**，不是未校验的游戏语法。若 P1 就强迫写正式 `ConditionExpr/StoryEffect` 和 `GalPackage` 节点，会把详细剧本 P6、素材审批 P5/P7 的未来责任倒灌到提纲阶段；若永远只保留 intent 字符串，又无法装配。故 P6 必有显式、受测的闭集转换，P8 再用 `validateGalPackage`；不能让 intent 字符串直接进发布包。

## 4. 审批/拒稿/失效状态机与下游矩阵

单版 `draft → approved | rejected`；同阶段**新候选获批准**时旧版投影为 `superseded`，新候选未批准前旧版仍是当前 approved。状态变化只能由带版本、审核人、理由的追加式可信事件推导，不原位改信封正文；`rejected` 与 `superseded` 为终态、留存审计，不可改回 draft。批准需要本版纯校验通过、基于当前 approved 上游、明确人审者和判词；拒稿需要理由，不能由模型/定时器代签。内容编辑永远创建新版本。若要撤销已批准内容，须另立显式 owner 撤销动作与理由，不能把旧版偷偷改为 rejected。

| 事件 | P0 Brief | P1 Bible | P2 Routes | P3 Graph | P4 Beats |
| --- | --- | --- | --- | --- | --- |
| 某一新候选被拒，旧批准版仍在 | 不变 | 不变 | 不变 | 不变 | 不变 |
| P0 新版批准 / 当前批准版撤销 | 新 current | stale | stale | stale | stale |
| P1 新版批准 / 当前批准版撤销 | 不变 | 新 current | stale | stale | stale |
| P2 新版批准 / 当前批准版撤销 | 不变 | 不变 | 新 current | stale | stale |
| P3 新版批准 / 当前批准版撤销 | 不变 | 不变 | 不变 | 新 current | stale |
| P4 新版批准 / 当前批准版撤销 | 不变 | 不变 | 不变 | 不变 | 新 current/无 P0–P4 下游 |

矩阵为 V1 **保守整阶段失效**，不做尚无证据的角色级/场景级增量追踪。`stale` 的历史审核结论仍可读，但不可作为新草稿的 `basedOn`，不可装配；重生下游的新版本逐级基于当前批准版再审。旧版在 P5–P9 的资产候选/剧本/装配依赖同理失效或重新评估，绝不能自动复用旧 CG/台词；但本票不实现其物化/清理规则。状态演算是纯读模型，不对资产或项目控制台做级联删除。

## 5. 纯校验顺序与点名测试建议

校验纯函数返回 `{ok, issues:[{path,code,severity,message}]}`，诊断按 path/code 稳定排序；不读时钟、随机、数据库、网络，不改输入。顺序为：有限 JSON/大小与 schemaVersion → 本阶段闭集 → ID/本地引用 → `basedOn` 的类型、同项目、批准、hash 与 current → P3 图/结局覆盖或 P4 节拍覆盖。坏输入必须给定位路径而非抛模糊异常；`warning`（如结构可达但条件仍未证明）不得伪称为正式可玩。

建议点名测试：

1. 同一 P0–P4 链校验两次诊断和规范 hash 逐项相同，输入对象键重排 hash 不变、数组重排或 `basedOn` 换版 hash 改变，输入不被修改。
2. 每阶段未知字段、坏 enum、NaN/函数、重复/空 ID、跨项目或缺失 `basedOn`、被篡改 hash 分别拒绝且路径稳定；P0 无上游、P1–P4 正好一个正确上游。
3. 仅当前 approved 可推进；模型伪造 `status:'approved'`、未验证直接批准、重复批准/拒稿、拒稿不写理由、终态回改均拒；候选拒绝不使旧批准链失效。
4. P0/P1/P2/P3 任一新版获批准后按矩阵精确判下游 stale，旧记录仍可查但装配门拒绝；只改未批准候选不触发失效。撤销已批准版无替代时所有依赖 blocked。
5. P1 关系悬空、P2 结局路线错配、P3 跨章断链/不可达结局/无出口环/重复 option、P4 beat 锚点或 cast/需求错引分别给路径；P3 条件 intent 不得被报告为运行可达性通过。
6. 有效 P0–P4 仍**不能**调用 P8 组装：缺 P5/P6/P7 批准资产/详细台词应明确 `not_ready`；只有正式 `GalPackage` 候选才交 `validateGalPackage`，并点名拒缺语言、资源 key、真实 `ConditionExpr/StoryEffect` 断链。

## 6. 端口与正式包边界

- `WritingEnginePort` 暂是设计稿接口，不是现有服务。未来适配器仅接收当前 approved 上游的最小只读切片 + 阶段 schema/允许 ID；返回**未信任的阶段 `data` 候选或受限修订**，不返回可信 `DraftEnvelope`、不批准自己、不调用 `World`、不写 `GalPackage`。模型/提示词版本、输入 draftId/hash、输出 hash、人工修订由可信编排层审计；真实写作项目的传输/鉴权/流式协议须等源码或合同到手后另审。
- P0–P4 输出不属于 `src/engine/protocol/galgame.ts`。`GalPackage` 仍是正式发行合同，业务 ID 在装配时映射到 `characters/scenes/chapters/endings/gallery/media` 的 Record 键；`line-slot/checkIntent/mediaNeedId` 不得漏进 V1。P6 填完整台词/条件/效果，P5/P7 给已审核 assetKey 后，P8 纯装配才可构造包并调用 `validateGalPackage`。当前正式包没有单独 `packageVersion` 字段，手动槽以包内容指纹比对（`src/services/gal-save/gal-manual-save.ts`）；`draftId`/`revision` 不能冒充存档兼容版本。发布后的稳定 ID/包变更必须另做兼容性报告或明确拒旧档。
- 本文件没有批准一个新通用 system、数据库表、API 或控制台写入。若 Lead 接受本候选，下一步是把审核数据合同、实现归属、审计存储与人门接口写成独立施工票，经 owner A/B 后再实现。

## 7. 真缺口的 A/B（建议，不代 owner 裁决）

**A · 通用创作产线能力（推荐）**：在 authoring/service 面实现不可变版本、闭集 P0–P4 校验、当前批准版索引、人审判词与依赖失效纯投影；不进 sim/runtime、不预设外部写作协议。代价是跨项目共享合同与审计存储需要严格迁移/并发/权限设计和独立复查；收益是第二部 GAL 及其他分阶段生成能复用。选错的代价是过早冻结太宽的工作流，所以首票只含上述最小数据/纯函数，不含 UI、模型适配或 P5–P9。

**B · 首作专属文档/脚本链**：P0–P4 只以该作品文件和人工表记录版本，由首作流程手工判断失效。初期成本低、不冻结通用 API；但无法保证另一作品同语义、审核可追溯和 stale 不能装配，未来转 A 时要迁移已有 draftId/判词，首作脚本不得写运行逻辑或绕人门。既有“先人工审核静态包”的 owner B 裁决只授权首作验证顺序，**不自动裁定本缺口选择 B**。

Owner 已选择 A 的**最小通用合同**，但本研究稿本身不授予跨域或无边界施工；正式首票范围见 `requests.md` 的 `GAL-PIPE-01A`。手工创作静态 `GalPackage` 仍可先行，不能宣称 P1 产线已存在。

## 8. Lead 架构复核（2026-10-11）

**有条件接受调研；Owner 随后明确选择 A。** 实查结论足以排除以正式包校验器、素材待审服务或项目控制台替代逐草稿审核门；首作手工静态包的既有 B 判词只决定验证顺序。上述规格已补上两项必须进施工票的边界：`basedOn` 参与可信内容指纹，审核状态从追加式可信事件投影而非由模型填写。正式 `GAL-PIPE-01A` 只授权纯合同、校验和审核 reducer；可信存储/并发/权限另票设计。外部写作项目接口未到手，不设计其传输和鉴权。
