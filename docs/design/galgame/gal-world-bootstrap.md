# GAL-ENG-07A · 纯数据初始世界装配（局部切片）

2026-10-12。仍属通用 GAL 引擎/模板，不是首个作品，也不是 AI 产线或正式 Web/桌面入口。

## 架构判断

`GalPackage` V1 已冻结为剧情、角色、媒体及分支目录，不包含初始 Resource/Flag/RandomSeed。Narrative Director 对缺失的效果目标、检定资源和随机种子会拒收；现有 Manifest 已能表达这些组件。因此复用 Manifest 的实体/模板结构作为伴随数据，不给 V1 包追加字段，也不在游戏层手写初始化逻辑。

`createGalWorld` 只接受伴随 Manifest 的 `schema`、`templates`、`entities`；两个输入均须为有限、无访问器/函数/稀疏数组的纯 JSON。伴随数据至多 1000 个源实体、禁用无界 `$repeat`。内部指定现有 `f1-resource`、`f2-flag`、`w1-random` provider 做结构校验，但不挂载它们的其他系统。每个实体只能有一个 Resource、Flag 或 RandomSeed；资源/旗标 ID 必须各自唯一，必须恰有一个初始种子且 `sequence=0`。装配前遍历全剧情图，核对 enter、选项、检定和 jump 的资源/旗标引用；当前仅解释 Resource/Flag/always/and-or-not 条件，其他条件明确拒绝装配。`story` 和 `input` 是保留实体，分别由装配器建立静态包+运行态、输入队列；挂载的唯一行为系统为 Narrative Director。首次 tick 生成入场投影与进入效果。伴随文件不能自带 `capabilities` 或自由系统。

本片明确未做：正式作品入口、资产 URL 解析/媒体播放、自动化生成伴随文件、首作 S1/S1-P/S2 人门。当前 GAL 包支持的 ConditionExpr 比本片三类初始组件更广；未来如作品确需其他状态类型，先核对现有 Manifest/引擎能力再按缺口协议裁决，不在首作私有 TS 中补解释器。

## 自证与门禁

- `src/assembly/gal-world.test.ts`：初始效果、投影、前进、既有 UI 宿主接缝、Manifest 模板、保留实体、重复 ID、非法种子、非 JSON、缺效果目标与附带 capability 拒收，定向 4/4 PASS。
- GAL 包+装配+Narrative Director 最终版定向 39/39 PASS；`docs-ref-guard` PASS。
- 全库 `npx tsc --noEmit --pretty false` 仍被非 GAL 的 `game-card-reveal`、`game-dice`、`game-theft`、launcher 类型诊断阻断；本片最初测试遗漏 `RawInputData.source` 已修，再跑后本片无类型诊断。
- 非施工者独立复查在 `review/GAL-ENG-07A-independent.md` 签本片**局部 PASS**：包、装配、导演、GAL UI 宿主相邻 64/64 PASS，唯一锚点撤修 1/4 转红；全库类型门禁仍为非 GAL 14 条诊断，故不签正式作品或整项里程碑。
