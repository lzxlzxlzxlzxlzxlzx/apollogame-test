# GAL 模板：数据模型与运行时边界（设计稿）

> 状态：提案，未实现。  
> 目标：新建 GAL 时，创作者只填写角色、剧本、分支、演出与资产数据；不写游戏专属运行器、DOM、存档逻辑或音视频接线。  
> 约束：遵守 `docs/design/data-driven-manifesto.md`。本稿定义数据契约和解释器边界，**不是**让每个 GAL 自己写一个框架。
> 参考：本稿吸收了已发行 GAL 安装包中呈现的通用分域（剧本、背景、前景立绘、CG、BGM、语音、视频、菜单与存档预览）；未读取、解包或复用其任何剧情、美术、音频或脚本内容。

> owner 2026-10-09 裁决：通用叙事引擎选 A；首个样例的创作流程先选 B（人工审核静态包）；通用 UI 模板选 A。首版须支持鼠标滚轮上滚逐句回退、下滚逐句前进；跨过选择点后允许重新选择。回到选择前应恢复该存档的剧情状态与随机种子，全局已读和 CG 解锁保留；下滚到选择点仍由玩家确认选项，不能自动重放旧选择。
> owner 2026-10-10 追加裁决：**回滚历史限定最近 512 句**。本稿将“句”落实为玩家可见的叙事步（台词、选择、检定提示、结局各占一步；自动 jump 不占一步）；最多保留 512 个可回退步，到最旧边界继续上滚只提示“已到可回退范围”，不改变剧情状态。这个解释将写入 02B 点名测试；若 owner 对“句”的计数口径另有要求，以新的明确判词为准。

> 系统定位：本稿定义两层系统中的 **GAL 引擎**。与之配套的 AI 写作、资产生成、人工审核与组装流程见 `docs/design/galgame-creation-pipeline.md`；产线可以生成或修改数据，但只能通过本引擎的 schema/validator 进入可运行状态。

## 1. 裁决与范围

### 1.1 裁决

采用引擎能力路线：新增一个通用的 **Narrative Director（叙事导演）** 与 `galgame` 纯数据模板；不在第一个 GAL 内实现专属剧情驱动器。

原因：现有 `t3-dialogue` 已能解释台词、选项、条件和确定性检定；`t3-flow`、`t3-timeline`、资产、语音、存档与 LayoutNode 也已有底座。缺口是把这些能力按视觉小说语义统一编排，而不是再发明单部作品的规则。

### 1.2 非目标

- 不允许游戏数据嵌入 JavaScript、表达式字符串或任意 DOM/CSS。
- 不把游戏定义、玩家进度、渲染 URL 混在同一对象里。
- 不将逐字动画、当前播放音频等表现细节写进确定性剧情状态或快照 hash。
- 首版不承担自由排版编辑器、多人协作或 AI 自动编剧；它们应消费本契约，而非修改解释器语义。

## 2. 四层数据边界

```text
发行内容（静态、版本化）      gal.json + 角色/剧本/资源表
          │ Narrative Director 解释
确定性运行态（每个存档）      当前节点 + Flag/Resource + 导演状态
          │ 投影
表现态（可重建、非确定性）    背景/立绘/BGM/语音/转场/逐字显示
          │ 事件
玩家档案（跨存档持久）        已读、CG/结局/回想解锁、偏好
```

| 层 | 生命周期 | 示例 | 允许写入者 |
|---|---|---|---|
| `GalPackage` | 随游戏发布，版本化 | 角色、章节、节点、背景、CG、分支 | 创作者/构建工具 |
| `StoryRuntime` | 一个存档内 | 当前节点、好感、旗标、已应用的场景状态 | 引擎解释器 |
| `PlayerProfile` | 跨全部存档 | 已读节点、已解锁 CG/结局/回想、偏好 | 引擎解释器/设置界面 |
| `PresentationProjection` | 当前画面，可销毁重建 | 资源已解析 URL、正在播放的语音、打字进度 | 宿主/表现层 |

**硬边界**：`readNodeIds`、画廊解锁和偏好不写回剧本；剧本节点、角色定义和资产 key 不复制进存档；表现层不能反向决定分支结果。

## 3. 顶层发行包

首版采用一个可拆分为多个 JSON 文件的逻辑包。载入器可将它们打包或分文件，但语义相同。

```ts
interface GalPackage {
  schemaVersion: 1;
  id: string;
  title: LocalizedText;
  defaultLocale: string;
  locales: string[];
  entry: StoryRef;                 // 初始章节与节点
  ui: GalUiSpec;
  characters: Record<CharacterId, CharacterSpec>;
  scenes: Record<SceneId, SceneSpec>;
  chapters: Record<ChapterId, ChapterSpec>;
  endings: Record<EndingId, EndingSpec>;
  gallery: GallerySpec;
  media: MediaCatalog;
  preferences: PreferenceDefaults;
}
```

`LocalizedText` 必须是纯查表数据，例如 `{ "zh-CN": "开始", "ja": "はじめる" }`。运行时以现有 `services/i18n` 查表，不在节点内散落另一个翻译系统。

首版未在下文展开的 `GalUiSpec`、`EndingSpec`、`UnlockRule`、`PreferenceDefaults` 的字段闭集与版本策略，见 [GAL-ENG-01 V1 合约补定](galgame/contract-v1-closure.md)；该补定不改变本稿的角色、场景、媒体与节点结构。

## 4. 角色、资源和场景

### 4.1 角色

```ts
interface CharacterSpec {
  id: CharacterId;
  name: LocalizedText;
  portraits: {
    neutral: AssetKey;
    expressions: Record<EmotionId, AssetKey>;
    fallback: 'neutral' | 'silhouette';
  };
  voice?: {
    characterId: string;
    tts?: { lang?: string; voiceHint?: string; rate?: number; pitch?: number; volume?: number };
  };
  defaults?: { side?: 'left' | 'right' | 'center'; visible?: boolean };
}
```

立绘只保留资产 key。`emotion → assetKey` 沿用现有情绪表与缺图降级逻辑；URL 只在表现投影中解析。角色名、台词和可见性必须允许本地化或通过角色 id 取得，不能把显示文本作为逻辑主键。

### 4.2 场景

场景是可继承的视觉默认值，避免每一行台词重复填写背景、音乐和角色站位。

```ts
interface SceneSpec {
  id: SceneId;
  background?: BackgroundId;
  ambience?: { bgm?: AudioId; volume?: number };
  cast?: Record<CharacterId, {
    visible: boolean;
    side?: 'left' | 'right' | 'center';
    zOrder?: number;
    emotion?: EmotionId;
  }>;
  uiVariant?: string;              // 闭集主题/布局令牌，非自由 CSS
}
```

进入场景先应用其默认状态；节点只给 `presentation` 差量。差量未填写即继承，显式 `null` 才清空，例如 `{ background: null }` 表示清除背景。

### 4.3 媒体目录：背景、立绘、CG、音频与视频

GAL 的资源不应只是无语义的文件堆。发行包在逻辑上按以下分域登记；底层仍通过统一资产索引解析 key，不照搬任何特定引擎的归档格式。

```ts
interface MediaCatalog {
  backgrounds: Record<BackgroundId, { image: AssetKey; title?: LocalizedText }>;
  cg: Record<CgId, { image: AssetKey; title: LocalizedText; unlock: UnlockRule }>;
  audio: AudioCatalog;
  video: Record<VideoId, {
    asset: AssetKey;
    poster?: AssetKey;
    skippable: boolean;
    audioPolicy: 'embedded' | 'mute';
  }>;
}
```

`backgrounds` 是场景底图目录；`cg` 是可鉴赏的事件图目录；`video` 用于片头、章节过场或结局影片。`AssetKey` 仍是唯一资源引用，最终 URL、解码器和浏览器/桌面壳差异均不得进入剧本数据。

```ts
interface AudioCatalog {
  bgm: Record<AudioId, { asset: AssetKey; loop: boolean; defaultVolume?: number }>;
  sfx: Record<AudioId, { asset?: AssetKey; synth?: SfxSpec }>;
  voice: Record<VoiceId, { asset?: AssetKey; charId: CharacterId; text?: LocalizedText }>;
}

interface GallerySpec {
  memories: Record<MemoryId, {
    title: LocalizedText; entry: StoryRef; unlock: UnlockRule;
    previewImage?: AssetKey; // 解锁后才投影给 UI 的回想卡缩略图
    lockedImage?: AssetKey;  // 独立审核的无剧透锁态图，未解锁时才投影
  }>;
  music: Record<AudioId, { unlock: UnlockRule }>;
}
```

CG、回想与音乐室是独立目录，不是埋在某一行台词里的无名副作用。`UnlockRule` 首版仅可由“到达节点/获得结局/明确 unlock 指令”三类闭集触发。
回想的两个图像 key 均可省略，旧包保持无图占位；严格校验要求它们是可解析的非 URL 资产 key。锁定卡不得投影 `previewImage` 或已解锁标题；`lockedImage` 必须经独立的无剧透素材审核，不能把剧情缩略图伪装成锁态图。CG 分镜仍由不同 CG ID 按剧情节点切换，本字段不新增分镜组或共享解锁语义。

### 4.4 图层模型

叙事导演维护一个固定层顺序，表现层只渲染投影，不能从 DOM 状态反推剧情：

```text
背景 → 环境/视频 → 角色立绘（按 zOrder） → CG → 转场/特效 → 对话框与选择 → 系统菜单
```

- 背景、视频、CG 都是互斥的主要视觉层；显式清空才移除。
- 角色层是按 `CharacterId` 键控的集合，同一角色不会因多次节点投影重复生成。
- 对话框、菜单、回看与存读档属于 UI 层，必须继续走 LayoutNode，不与场景画面混成自由 DOM。
- 任何淡入、淡出、位移、震动和擦除只从闭集 token 选择；解释器再把 token 转成既有 Timeline、tween 或 render-only 表现。

## 5. 剧本图

### 5.1 章节与引用

```ts
type StoryRef = { chapterId: ChapterId; nodeId: NodeId };

interface ChapterSpec {
  id: ChapterId;
  title: LocalizedText;
  start: NodeId;
  scene?: SceneId;
  nodes: Record<NodeId, StoryNode>;
}
```

剧情是有向图，不是链表。节点有稳定 `nodeId`，边通过 `next` 或选择项 `next` 表示；图天然支持分支、汇合、回环及跨章节跳转。所有目标均在构建期校验。

### 5.2 节点闭集

```ts
type StoryNode =
  | LineNode
  | ChoiceNode
  | CheckNode
  | JumpNode
  | EndingNode;

interface NodeBase {
  id?: never;                     // id 是 nodes Record 的 key，禁止双真相
  presentation?: PresentationDelta;
  enter?: StoryEffect[];          // 进入一次；需幂等记录，见 §6
  checkpoint?: 'auto' | 'none' | 'hard';
}

interface LineNode extends NodeBase {
  kind: 'line';
  speaker?: CharacterId;
  text: LocalizedText;
  voice?: VoiceId;
  next: StoryRef | null;
}

interface ChoiceNode extends NodeBase {
  kind: 'choice';
  prompt?: LocalizedText;
  options: Array<{
    id: string;
    text: LocalizedText;
    when?: ConditionExpr;
    effects?: StoryEffect[];
    next: StoryRef;
  }>;
}

interface CheckNode extends NodeBase {
  kind: 'check';
  prompt?: LocalizedText;
  check: { attribute: ResourceId; difficulty: number; dice?: number; bonusFrom?: ResourceId; bonusDiv?: number };
  pass: { effects?: StoryEffect[]; next: StoryRef };
  fail: { effects?: StoryEffect[]; next: StoryRef };
}

interface JumpNode extends NodeBase {
  kind: 'jump';
  when?: ConditionExpr;
  then: StoryRef;
  otherwise?: StoryRef;
}

interface EndingNode extends NodeBase {
  kind: 'ending';
  ending: EndingId;
  text?: LocalizedText;
}
```

`ConditionExpr` 复用引擎现有条件闭集；数值写入复用 Resource、旗标复用 Flag；检定复用世界 `RandomSeed`。禁止为 GAL 自造条件语法、概率函数或字符串求值。

### 5.3 演出差量

```ts
interface PresentationDelta {
  scene?: SceneId | null;
  background?: BackgroundId | null;
  cast?: Record<CharacterId, {
    visible?: boolean;
    side?: 'left' | 'right' | 'center';
    zOrder?: number;
    emotion?: EmotionId;
    motion?: 'none' | 'enter-left' | 'enter-right' | 'leave-left' | 'leave-right' | 'shake' | 'focus';
  }>;
  cg?: { show?: CgId; hide?: boolean };
  bgm?: { play?: AudioId; stop?: boolean; fadeTicks?: number };
  sfx?: AudioId[];
  video?: { play: VideoId; wait: boolean } | { stop: true };
  transition?: 'cut' | 'fade' | 'wipe' | 'dissolve';
}
```

这里是受控词表：背景、站位、表情、CG、音乐、视频和转场是最小集合。它将由叙事导演翻译成现有 Timeline、LayoutNode、资产及音频端口调用；游戏数据不直接调用浏览器 API。逐句 TTS 可由 `LineNode.voice` 引用音源，缺采样时宿主可按角色 TTS 配置降级。

## 6. 规则效果、进度与幂等

```ts
type StoryEffect =
  | { kind: 'resource'; id: ResourceId; op: 'add' | 'set'; value: number }
  | { kind: 'flag'; id: FlagId; value: boolean }
  | { kind: 'unlockCg'; id: CgId }
  | { kind: 'unlockMemory'; id: MemoryId }
  | { kind: 'unlockMusic'; id: AudioId };
```

- `ChoiceNode.effects` 仅在确认选择时执行一次。
- `NodeBase.enter` 在首次进入该存档中的节点时执行一次；执行记录属于 `StoryRuntime.enteredNodeIds`。回滚跨越该节点时，执行记录与同一存档的剧情状态一起恢复，重新推进时仍只能触发一次。
- `unlock*` 写入 `PlayerProfile`，应为集合幂等操作；读取既有解锁不改变游戏分支。
- `checkpoint:'hard'` 不能阻止玩家跨选择点回退与改选；它只可表示需要保留的恢复锚点，具体缓存/裁剪策略由 Narrative Director 规格定义，不能替代正式存档。

## 7. 运行时、存档与玩家档案

```ts
interface StoryRuntime {
  packageId: string;
  packageVersion: string;
  current: StoryRef;
  presentation: ResolvedPresentation;
  enteredNodeIds: string[];
  // Flag / Resource / RandomSeed / 导演状态随现有 WorldSnapshot 保存。
}

interface GalSaveMeta {
  slot: string;
  chapterTitle: string;
  nodeId: string;
  savedAt: number;                // 由宿主提供，不由 sim 读取墙钟
  preview?: SavePreview;
  kind: 'manual' | 'quick' | 'auto';
}

interface SavePreview {
  // 保存时由表现层捕获的缩略图；绝非剧情或存档恢复的权威来源。
  mimeType: 'image/webp' | 'image/png';
  data: string;
  width: number;
  height: number;
}

interface PlayerProfile {
  schemaVersion: 1;
  readNodeIds: string[];
  unlockedCgIds: string[];
  unlockedEndingIds: string[];
  unlockedMemoryIds: string[];
  unlockedMusicIds: string[];
  preferences: {
    locale?: string;
    textSpeed: number;
    autoDelayMs: number;
    skipMode: 'read-only' | 'all';
    bgmVolume: number;
    sfxVolume: number;
    voiceVolume: number;
    muted: boolean;
  };
}
```

保存时使用现有 `SaveSystem` 的世界快照与迁移机制，另以 `GalSaveMeta` 供存档界面显示。`SavePreview` 是“继续游戏/存档槽”的体验数据，损坏或不存在时只退化为默认占位，绝不可阻塞读取权威快照。玩家档案走版本化 codec/`SavePort`，不能假设浏览器 `localStorage` 可用。

“已读”语义定为：玩家已完成阅读该节点、并到达可推进状态后才写入档案；不要在节点初次投影时标记，否则快速跳过或加载会污染已读数据。

## 8. 标准模板页面与行为

模板必须作为纯 LayoutNode 数据组合提供以下屏幕：

| 页面/行为 | 读写 | 初版状态 |
|---|---|---|
| 标题、继续、新游戏、章节选择 | 读存档/档案，发具名 action | 新建模板 |
| 剧情主屏 | 读 `PresentationProjection`，发 advance/choose | 复用现有 dialog/choiceList/portrait/story starter |
| 系统菜单与设置 | 读写 `PlayerProfile.preferences` | 新建模板 |
| 手动/快速/自动存读档 | 读写 `SaveSystem` | 新建模板 |
| 文本回看 | 读运行期/存档内的 `HistoryEntry[]`，只读 | 新增通用能力 |
| 自动/已读跳过 | 只发推进 action；已读判定读 `PlayerProfile` | 新增通用能力 |
| 滚轮逐句回滚/推进 | 上滚回退、下滚前进；跨选择点恢复剧情状态并允许改选，全局已读/解锁保留 | 新增通用能力 |
| CG、结局、音乐、回想 | 只读 `PlayerProfile`，回想启动隔离运行态 | 新增通用能力 |
| 片头、过场、结局影片 | 读 `PresentationProjection.video`，只发跳过 action | 复用 Video 控件，新增导演接线 |

回想必须启动隔离的 replay runtime：禁止覆写正在进行的存档、禁止在回想中保存；其结束后回到启动它的菜单。这与正常游戏运行态是两个容器。

## 9. 必须新增的引擎能力

| 能力 | 复用现有基础 | 新增语义 |
|---|---|---|
| `t3-narrative-director` | dialogue、flow、timeline、ConditionExpr、Resource/Flag | 解释 `GalPackage`、场景继承、节点/演出/世界状态的原子推进 |
| `NarrativeProjection` | `resolveDialogue`、LayoutNode | 以 DI 输出背景、角色队列、当前文本/选项、CG 与可见 UI 状态 |
| `NarrativeLayerComposer` | 资产索引、Video、Timeline、2D render | 固定图层顺序、角色 zOrder、视频/CG 互斥规则与表现重建 |
| `NarrativeHistory` | save/world snapshot | 有界回看条目、稳定节点标识、说话人/本地化文本快照 |
| `GalProfile` | SavePort、codec、i18n | 已读、收藏/画廊解锁、偏好、跨存档迁移 |
| `GalSaveController` | SaveSystem、存储端口 | 自动/快速/手动槽策略、可显示元数据、加载后的演出重建 |
| `gal-template` | `@ui/starters`、UI 主题 | 主菜单、剧情屏、设置、存读档、画廊、回想等纯数据 LayoutNode 组合 |
| `gal-validate` | manifest/reference 校验 | 节点引用、可达性、死节点、资源/翻译/语音缺失、结局与解锁一致性 |

`t3-narrative-director` 是新的通用解释器，故必须由引擎侧实现、记录 trace，并声明确定性读写/定序；其他能力不能以游戏专属 helper 形式偷渡。

## 10. 机器校验不变量

构建期必须至少检查：

1. `entry`、所有 `next`、场景、角色、背景、CG、音频、视频和结局引用存在。
2. 每个节点从 entry 可达；每个 `EndingNode` 可达；不可达项报错而不是静默保留。
3. 所有 choice option 都有唯一 id，且目标有效；永远不可满足的 `when` 报警。
4. 每个 `LocalizedText` 覆盖 `locales`，允许明确声明 fallback，但不能默默缺字。
5. 每个角色的默认/引用表情可解析为资产 key 或合法剪影降级。
6. `PresentationDelta` 仅用闭集 token；背景、CG、音频和视频所引用的 asset key 均可在资产索引中解析。
7. 图中不存在无用户退出条件的强制循环；允许显式标记的剧情回环，但必须能追踪。
8. 同一固定 seed、同一输入序列的 `StoryRuntime + WorldSnapshot` hash 相同。
9. 升级包版本后，旧 `StoryRuntime` 和 `PlayerProfile` 要么有迁移、要么拒绝加载并给可定位原因；不得静默跳节点。

## 11. 推荐落地顺序

1. 先锁本稿 schema，并做 JSON schema/运行时 validator 的只读原型。
2. 实现 `t3-narrative-director` 的最小闭环：line、choice、check、scene inheritance、资源/旗标、存档恢复。
3. 把现有剧情 starter 改为消费 `NarrativeProjection`，删除新 GAL 所需的 TS 剧本/世界接线。
4. 加演出差量、语音、CG 解锁与 `GalProfile`。
5. 加历史、自动/跳过、存读档 UI、画廊/回想。
6. 交付一个 10 分钟、至少两角色、一次检定、两结局、CG 与存读档全闭环的纯数据 Sample；它同时是模板的对抗性验收基准。

## 12. 开工前待定项

以下不是游戏专属细节。已裁决项以文首 owner 判词为准；未裁决项须在对应能力施工前定案：

- 已定：首版支持滚轮逐句回滚/推进，跨选择点允许改选；回到选择前须恢复剧情状态、效果执行记录和随机种子，全局已读/解锁保留。owner 2026-10-10 定最近 512 个玩家可见叙事步；超出上限的旧步被裁剪，到边界继续上滚只给明确提示，不跨越裁剪边界、不重放已丢弃路径。
- 音乐/语音的资产格式与浏览器外的降级要求；TTS 只作预览还是可出货。
- 已定：首版节点文本为纯 `LocalizedText`，不开放富文本或 HTML。
- 已定：画廊解锁写全局 `PlayerProfile`，以 `packageId + stableContentId` 隔离；路线/难度分域延后。
- 已定：按章节拆文件，逻辑引用使用跨章节 `StoryRef`；发布后的 `chapterId/nodeId` 稳定且永不复用，重命名须提供迁移表。

在这些项目定案前，禁止先写某个 GAL 的专属 narrator、存档菜单、回看面板或剧情状态机。
