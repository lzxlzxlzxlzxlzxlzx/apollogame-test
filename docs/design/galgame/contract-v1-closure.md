# GAL-ENG-01 · `GalPackage` V1 合约闭集补定

> Lead 规格，2026-10-09。适用范围仅为纯数据类型和静态校验；正式 UI、叙事导演、存档、素材导入及桌面发行均不在此单。owner 已为 GAL-GAP-01 选择通用引擎路线 A，本文件补齐该路线内设计稿 §3–§6 未展开的命名类型。GAL 通用模板的 S1-P 原型已另于 `gal-ui-complete-v2.md` 记录 owner 定稿；首个具体样例仍须有自己的原型与人门。

## 1. 顶层与版本

`GalPackage` V1 必须含 `schemaVersion:1`、`id`、`title`、`defaultLocale`、`locales`、`entry`、`ui`、`characters`、`scenes`、`chapters`、`endings`、`gallery`、`media`、`preferences`。各目录即使为空，也必须显式写 `{}`；不得用缺字段表示空目录。所有 `Record` 键均为稳定 ID，内容中的 `id` 如存在必须等于键。

V1 是首个正式 GAL 包格式，目前没有已发行的 V0 GAL 包。`schemaVersion:0` 或其他版本应给出 `$.schemaVersion` 的明确拒绝诊断；不得把虚构 V0 浅拷贝并改版本号，伪装为迁移。未来若有已发布旧包，再以真实旧协议和 fixture 制定迁移。

## 2. 未展开命名类型的首版闭集

```ts
interface GalUiSpec {
  template: 'gal-template';
  titleBackground?: BackgroundId;
  titleBgm?: AudioId;
}

interface EndingSpec {
  title: LocalizedText;
}

type UnlockRule =
  | { kind: 'reach-node'; ref: StoryRef }
  | { kind: 'reach-ending'; ending: EndingId }
  | { kind: 'explicit' };

interface PreferenceDefaults {
  textSpeedMsPerChar: number; // 有限整数，0–500；0 为立即显示
  autoDelayMs: number;        // 有限整数，0–10000
  skipMode: 'read-only' | 'all';
  bgmVolume: number;          // 有限数，0–1
  sfxVolume: number;          // 有限数，0–1
  voiceVolume: number;        // 有限数，0–1
  muted: boolean;
}
```

`GalUiSpec` 只声明通用模板与标题媒体，不冻结 UI 配色、控件位置、主题变体或任意 CSS。正式界面以 owner 定稿的 `.dc.html` 为目标，PUI 再确定可表达的 LayoutNode 数据。`EndingSpec` 首版只需标题；结局的全局解锁身份由结束节点稳定 ID 和 `packageId` 决定。`UnlockRule.explicit` 仅由闭集 `StoryEffect` 的对应 `unlock*` 指令触发，不能在故事数据里放脚本。

## 3. 直接沿用已写明的闭集

- `CharacterSpec`、`SceneSpec`、`MediaCatalog`、`AudioCatalog`、`GallerySpec`、`StoryNode`、`PresentationDelta`、`StoryEffect` 按 `galgame-template-data-model.md` §4–§6 的字段落地，不能以 `Record<string, unknown>` 代替演出或效果。
- `ConditionExpr` 直接引用 `src/engine/protocol/components/logic.ts` 的既有类型，并以 `ConditionExprSchema` 校验；不得新造字符串条件语言。
- `CheckNode.check` 必须含 `attribute` 与 `difficulty`，其 `pass/fail` 各含 `next` 与可选 `effects`；不能只有两条跳转边而缺检定数据。
- `SceneSpec.uiVariant` 首版只允许 `'default'`；通用 UI 模板定稿后才评估增加更多 token。
- `StoryRef` 是唯一节点身份。角色、场景、背景、CG、BGM、SFX、语音、视频、结局、回想及解锁引用都必须在静态校验中定位到相应目录项。
- 包和目录都只能含纯 JSON 值。未知字段、自由 URL、HTML/CSS/函数/表达式字符串不得进入 V1；诊断必须指向作者输入的具体路径。

## 4. 本单验收边界

一份最小有效包至少覆盖两个章节、两名角色、一条 line、一条 choice、一条含检定参数的 check、两个 ending、一个场景、一个背景、一个 CG 和对应 `UnlockRule`。同一 fixture 连续校验结果顺序相同。分别破坏角色、场景、媒体、结局、画廊、演出和效果引用，应得到可定位诊断；恶形输入不应使校验器抛异常。

本单的“校验通过”只表示发行包数据结构与引用有效，不表示运行时已能播放。`Narrative Director`、滚轮回滚及 Profile/Save 行为另立工单。回滚跨选择点与副作用恢复语义仍待该工单规格裁决，不能从 `checkpoint` 字段自行推断。
