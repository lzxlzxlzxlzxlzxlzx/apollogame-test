# GAL-PLAN-01：能力映射与首批施工规格

> 状态：owner 已于 2026-10-09 裁决 §3 路线与 §4 已确认规则，并于 2026-10-10 裁决回滚历史限定最近 512 句。GAL-ENG-01 合同、GAL-ENG-02A 前进内核与 GAL-ENG-02B 回滚均已有定向独立复查；下一单 GAL-ENG-03A 聚焦跨存档 GAL 档案。全库门禁仍有非 GAL 类型错误，不能宣称整体交付。
>
> 结论：接受「通用 GAL 引擎 + 数据创作产线」方向；拒绝以某个 GAL 的专属 TS/React/DOM 代码或独立存档协议先行。现有 `t3-dialogue` 足以承载台词、选项、条件与确定性检定，但不足以解释完整 GAL 包、场景继承与跨档案叙事语义。

## 1. 本次阅读与实查证据

已完整阅读：

- `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`；
- `docs/design/data-driven-manifesto.md`、`docs/design/capability-plan-template.md`；
- `docs/design/galgame-template-data-model.md`、`docs/design/galgame-creation-pipeline.md`；
- `docs/playbooks/pick-list.md`、`events-logic.md`、`base-lib.md`、`randomness.md`；
- `docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`save-platform.md`、`assets.md`、`art-pipeline.md`、`audio.md`、`testing.md`、`self-check.md`、`review-gates.md`、`game-flow-questions.md`；
- `wiki/skills/index.md`（据此只读了本任务需要的 UI / 存档 / 测试 / 资源相关入口；尚未进入任何 capability 的实现）。

实查的机读实现与结论：

| 实查项 | 证据 | 结论 |
|---|---|---|
| 对话图 | `src/skills/tier3/dialogue.ts`：`t3-dialogue@1.1.0`，`DialogueScript` 支持 line / choice / check、`requires`、资源效果、Flag、`RandomSeed` 检定及 `DialogueChoiceResult` | 已覆盖 GAL 节点的对话核心；不可假装已覆盖章节/场景/画廊语义 |
| 流程与确定性演出 | `src/skills/tier3/flow.ts` 的 `t3-flow`，`src/skills/tier3/timeline.ts` 的 `t3-timeline` | 流程状态与 tick cue 可重组；二者不会维护角色图层、场景继承或 package cursor |
| 剧情 UI | `src/ui/components/bindings.ts` 的 `DialogueSource` / `resolveDialogue`，`src/ui/starters/story-starter.ts` 的 `buildStoryStarter` | 已有纯 LayoutNode 的台词框、选项、立绘起手屏；不能替代标题、档案、画廊、回想等完整 GAL 壳 |
| 存档 | `src/services/storage/save-system.ts`（WorldSnapshot + hash/order）及 `src/services/save/envelope.ts`（schema + checksum + migrations） | 权威快照与版本化 blob 已覆盖；GAL metadata/profile 只能作为它们的消费者，不能另写 localStorage 协议 |
| 局外偏好 | `src/services/persist/local-store.ts` | 小型偏好可安全消费；跨存档、可迁移的 `PlayerProfile` 不应退化为无 schema 的单 KV |
| 语音与资产 | `src/services/voice/*`、`src/services/audio/*`、`src/assets/game-art-load.ts`、`src/assembly/resolve-art-refs.ts` | VoicePort、音频端口、AssetKey / 本地索引路线可消费；剧本不持 URL 或浏览器 API |
| 生产线和数据来源 | `src/studio/library-model.ts` 有库版本模型；全库无 `DraftEnvelope`、`GalPackage`、`gal-validate` 或 narrative director 实现（全文检索） | 审核草稿 / 确定性装配是未覆盖的通用能力，不应塞进 runtime 或某一作品 |

`src/assembly/capability-registry.gen.ts` 已注册 `t3-dialogue`、`t3-flow`、`t3-timeline`；因此这三项是实名可消费能力，不是设计稿中的假设。

## 2. 需求逐项裁决

| 需求 | 现状判断 | 可用重组 / 缺口证据 | 结论 |
|---|---|---|---|
| `GalPackage`、版本化 schema、静态校验 | 真缺口 | 现有 manifest validator 校验 ECS 蓝图，不校验 `StoryRef`、本地化覆盖、剧情可达性、解锁一致性或媒体域 | 需新增通用 GAL contract / validator；不可由单游戏 helper 代替 |
| 叙事导演：台词、选择、检定 | 已覆盖，直接消费 | `t3-dialogue` 已提供闭集节点、条件与种子检定 | 复用；GAL schema 在适配层映射或被新导演消费，禁止复制一份 dialogue runner |
| 叙事导演：章节、场景继承、cast、背景/BGM/CG/转场、一次 enter effect、可重建投影 | 真缺口 | flow 只转状态，timeline 只在 tick 发四种 cue；均没有 `StoryRuntime`、层模型或 presentation delta 解释 | 需通用 `t3-narrative-director`；不得在游戏层编排一套 narrator |
| 读取投影到 UI | 部分覆盖 | `DialogueSource` + `resolveDialogue` 已完成结构投影和三件 VN 控件 | 继续消费；增加 NarrativeProjection 的数据源适配是导演能力的组成，不新造 React UI |
| 存档、预览、历史、已读、自动/快进 | 部分覆盖 | SaveSystem / SavePort 已解决快照、完整性与迁移；timeline 已有确定性 skip；不存在 History、read tracking、slot metadata 或 replay isolation | 快照与迁移复用；其余必须作为通用 GAL 服务/能力，不能混进 `WorldSnapshot` 或自由 localStorage |
| 标题、对话、设置、档案、回想、画廊 UI | 部分覆盖 | `buildStoryStarter` 可作剧情主屏的起点；无可复用 gal menu/save/gallery/replay 模板 | PUI 所有权的缺口，待 PUI 以 LayoutNode 闭集补齐；本计划不准碰 `src/ui/**` |
| 资产、BGM、语音、TTS | 已覆盖基础路径 | AssetKey / `loadGameArtInto`、VoicePort、SynthAudioPort / SynthMusicPort 均在册 | 直接消费；视频播放、外部媒体格式策略仍属产品裁决，不能在剧本内写 URL |
| `DraftEnvelope`、审核状态、确定性装配 | 真缺口 | 现有 LibraryMeta 不提供草稿依赖、审批状态、supersede 审计或只读 approved 装配器 | 应作为创作工作台/服务面独立能力；不属于 narrator runtime |

## 3. 缺口 A/B 裁决单（owner 决定；Lead 只给建议）

### GAL-GAP-01：通用叙事导演与 package validator（P0，阻塞 S2 / 首个 sample）

- **A：引擎能力**：新增版本化 GAL contract、纯 validator 和 `t3-narrative-director`，以 `StoryRuntime` 与只读 `NarrativeProjection` 解释 `GalPackage`。
  - 代价：修改跨游戏 `src/engine` / `src/skills` / `src/assembly` 面，需要确定性、snapshot、迁移、trace 和独立复查。
  - 影响：所有未来 GAL、乙游剧情、分支叙事作品复用同一语义；可让 AI 只填数据。
  - 选错的代价：接口太宽会冻结未证实的编辑器需求，故首票只做明确的最小闭环。
- **B：某 GAL 自有 narrator**：在游戏目录写状态机、存档字段和演出接线。
  - 代价：立即违反数据驱动宣言，后续每部作品复制语义且无法可靠迁移。
  - 通用性：无；会把本应可审计的解释器散成游戏代码。
- **owner 判词：A。** 首张工单限于纯数据合约与校验器。

### GAL-GAP-02：审核草稿与确定性装配（P1，阻塞 AI 产线，不阻塞最小手填 sample）

- **A：工作台通用能力**：实现 `DraftEnvelope`、审批状态、依赖失效图、只读 approved 装配器与审计记录。
  - 代价：新增 studio/service 数据模型和测试；需定义草稿存储边界。
  - 通用性：可供非 GAL 的结构化创作流程复用。
- **B：首个 sample 仅手写已批准 package**：暂不接写作模型与审核看板，直接用静态 `GalPackage` 验证 runtime。
  - 代价：不能声称具备 AI 创作产线；以后仍要补 A。
  - 通用性：避免过早冻结创作流程，但只适合作为验证期。
- **owner 判词：首个样例先 B，后续再建设 A。** P0–P4 的审批先用文档工件完成；未经批准的数据仍不得进入 sample package。

### GAL-GAP-03：GAL 模板 UI（P1，阻塞完整产品 UI，不阻塞 contract / director）

- **A：PUI 扩展通用 `gal-template`**：在 `src/ui/**` 以 LayoutNode starter / 闭集控件补标题、存读档、历史、设置、画廊与回想容器。
  - 代价：PUI 排期与 UI audit；需要已定稿 S1-P 原型来锁屏幕状态与互动。
  - 通用性：所有 GAL 复用。
- **B：每个 GAL 拼自己的屏**：即便仍用 LayoutNode，也会重复存档和画廊语义。
  - 代价：模板目标落空，体验与行为漂移。
  - 通用性：低。
- **owner 判词：A，交 PUI；不得由本单或游戏侧改 UI 基座。**

## 4. 规范裁决与剩余问题

| 事项 | 已确认规范 | 剩余问题 |
|---|---|---|
| 回滚 / 改选 | 上滚回退、下滚前进；跨选择点允许改选。选择前恢复存档内剧情状态、效果执行记录与随机种子；全局已读/CG 解锁保留。最近 512 个玩家可见叙事步，越过最旧边界只提示不移动 | 与自动/快进冲突仍留待 Director/UI 联合规格；02B 不开启自动/快进 |
| 富文本 | 首版仅 `LocalizedText` 纯文本，不开放任意 HTML/Markdown | 后续若要富文本，再定闭集 token |
| 解锁分域 | `PlayerProfile` 全局解锁；以 package ID + stable content ID 命名空间隔离 | 路线/难度分域留后续显式 scope |
| node ID 与拆分 | 按章节拆分；`chapterId/nodeId` 发布后稳定且永不复用，跨章节用 `StoryRef`，重命名须迁移 | 无 |
| 资产生产顺序 | P2 后角色基础资产；P4 后背景/CG；P6 台词锁定后语音 | 无 |

## 5. 第一张可施工代码工单：GAL-ENG-01（仅在 GAL-GAP-01 选择 A 后）

**标题：** `GAL-ENG-01` — versioned `GalPackage` contract + pure validator core。

**施工主体：** 主程（🔴 跨游戏、确定性、存档和新增 system 前置面）；领工时按仓库规则先在正式工单抢锁。此文不抢锁。

**允许范围：**

- 新增引擎侧、无 UI 依赖的 GAL contract 类型、schema normalizer 与 validator；
- validator 只读输入并返回结构化 diagnostics，至少覆盖 entry/reference、唯一 option ID、可达性、死节点、locale、媒体 asset key、ending/unlock 与明确的图循环诊断；
- 为最小 package fixture 写点名 unit tests；若协议落入 snapshot，补确定性与旧版本拒绝/迁移测试；
- 将已接受能力登记入 registry 与相应 playbook 一行。

**明确不做：**不创建 Runtime system、`NarrativeProjection`、LayoutNode、React/DOM、gallery/profile UI、DraftEnvelope、资产导入、实际音视频播放、服务启动、数据库或 Git 操作。

**不变量：**

1. `GalPackage` 是纯数据，禁止 URL、函数、表达式字符串、DOM/CSS/浏览器 API。
2. 每个引用必须可定位失败；validator 不猜测补值，不静默跳节点。
3. 同一 package 输入的 diagnostics 顺序稳定；验证本身不读墙钟、不读随机、不写持久化。
4. `nodeId` 不双写，逻辑身份仅为 `StoryRef{chapterId,nodeId}`。
5. 尚未实现的 runtime 字段不能以“validator 通过”伪装为已经可播放。

**验收用例：**

- 最小双章节 package：line → choice → check → 两 ending，所有引用、locales、asset keys 正确时无 error；
- 缺 entry / 跨章节 `next` / 无效 ending / 重复 option ID / 缺 locale / 不存在 asset key 分别给出稳定路径诊断；
- 至少一条不可达节点与一条无退出强连通环必被点名；显式许可的回环仅警告且保留路径；
- 同一 fixture 连跑两次得到逐项相同 diagnostics；
- 旧 schema 具备迁移则正常化，否则以明确原因拒绝，绝不静默改写 node ID。

**回归范围与责任域：**

| 面 | 责任 | 回归 |
|---|---|---|
| contract / validator / registry | 主程 | 新增 unit tests、registry guard、capability catalog、确定性断言 |
| `src/ui/**` 与 gal-template | PUI | 本工单禁止触碰；后续独立 A/B 与 UI audit |
| 资产入库 / AssetIndex | PA / asset-manager | 本工单只验证注入的 resolver，不写 assets/index.json |
| 声音 / VoicePort | PE + 音频线 | 本工单仅保留 ID，实际播放另单 |
| 存档服务 | 主程 | 未改变服务；后续 StoryRuntime / Profile 单独设计、迁移和破坏性复查 |
| 创作台 / AI 写作 | Studio / 产线 owner | GAL-GAP-02 选择 A 后另立单 |
| 发布 | game-publisher | 不在本工单范围 |

## 6. 进入实现前仍缺的门

1. GAL-GAP-01 已获 owner 选择 A；本单仍须通过独立复查。
2. 滚轮输入、跨选择点改选和最近 512 句上限均已定；GAL-ENG-02B 须写明可恢复状态边界与快照/实体次序、历史裁剪、边界提示。自动/快进尚未接入时不得静默并发，需在后续联合作业前定冲突规则。
3. 具体首个 Sample 的 S1 立项与 S1-P `.dc.html` 原型必须由 owner 真机定稿；没有它，禁止进入 S2 / UI / 游戏实现。
4. GAL-ENG-01 若获准，施工者需先抢锁；完成后由非施工者按复查四步独立复跑、撤修验红、实证复现并读告警。
