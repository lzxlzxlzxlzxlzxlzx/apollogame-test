# GAL-ENG-07A 独立复查（2026-10-12）

**复查主体：`review_gal_bootstrap`，非施工者。局部判词：PASS；全库门禁：CONCERNS。** 本票只核验受限 Manifest 初始世界装配，不签正式 Web/桌面作品宿主、首作、视觉/音视频或 `replay-save-preview-auto` 整体里程碑。

## 范围与合同核证

- `src/assembly/gal-world.ts:83-102` 先检查两个输入为纯、有限 JSON，拒绝访问器、函数、循环、稀疏数组和不受支持的根字段；只把固定 `f1-resource/f2-flag/w1-random` 传给既有 Manifest 解析器。原先发现的无界 `$repeat.count` 扩张风险已在 `:92-95` 用禁用 `$repeat` 与源实体数上限 1000 收束；点名测试在 `src/assembly/gal-world.test.ts:73-76`。
- `src/assembly/gal-world.ts:97-130` 限制模板及物化实体只用单个 `Resource/Flag/RandomSeed`，拒绝保留 `story/input` 实体名、重复语义 ID、非法数值与非初始 seed；`src/assembly/gal-world.ts:45-79,131` 对所有章节节点的 enter/choice/check/jump 中 Resource/Flag/条件引用进行预检，对需要其他初始组件的 ConditionExpr 显式拒绝，而不是运行时静默当 false。
- `src/assembly/gal-world.ts:133-146` 只挂叙事导演，按稳定实体名序装配，固定新增 StoryRuntime 与 InputQueue，并启动 tick 一次产出入口 NarrativeProjection。首拍会执行入口 enter 效果，这是合同内的有意副作用；`src/assembly/gal-world.test.ts:28-47` 点名断言资源从 1 变 3、旗标变 true，原输入不被改写，随后具名推进到结局。`src/assembly/gal-world.test.ts:91-97` 以现有 GalSliceHost 读取装配结果，未把 UI 宿主或存档移入装配器。

## 独立四步实证

1. **独立复跑**：最终版 `npx vitest run src/assembly/gal-world.test.ts src/assembly/gal-package.test.ts src/skills/tier3/narrative-director.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts` 退出码 0，4 文件、64/64 测试通过。首次普通沙箱对 `node_modules/vitest/dist/spy.js` 报 EPERM，0 测试执行；该次没有被采信，本机正常权限重跑才计通过。
2. **隔离撤修验红**：在独立临时源副本中，先确认唯一锚点 `checkStoryValues(pkg, resourceIds, flagIds);` 命中 1 次，再仅在副本移除该调用。副本原版 4/4 绿，撤修后 1/4 红，点名 `gal-world.test.ts:70` 的“缺失 affection 必须静态报错”断言失败：实际退化成首拍后 `entry did not produce a NarrativeProjection`。这证明交叉预检真被测试咬住。共享源码未做变异；两个临时副本与测试缓存已清理，之后共享最终版重跑 64/64 绿。
3. **实证复现**：初版复查发现 `Resource` 交叉引用未验证及 `$repeat.count` 可无界展开两项问题，施工者分别补 `checkStoryValues` 与禁用 `$repeat` 后，最终版点名测试和上述独立复跑均绿。静态核对 `parseManifest/expandEntities` 原本对 count 直接扩张；07A 入口如今在调用前拒绝。
4. **读告警/门禁**：定向测试只有 512 历史窗口大小的预期 stdout（721111 bytes），没有未处理异常或调度 WARN。独立 `npx tsc --noEmit` 退出码 1，共 14 条诊断，均落在 `games/game-card-reveal`、`games/game-dice`、`games/game-theft`、`src/launcher/game-runner.tsx`，无 07A/GAL 文件诊断；故只签局部 PASS，不称全库绿。

## 范围边界

- 本片不是 GalPackage V1 全条件表达能力的装配器：目前只支持 `always/resource/flag/and/or/not` 初始条件，其他合法 ConditionExpr 在本入口明确拒绝。未来要支持其他叶子，须扩相应初始组件闭集并复查，不可把拒绝静默当 false。
- 没有正式作品 manifest、实际首作内容、真浏览器启动链或桌面打包证据。现有测试说明通用装配接缝成立，不能说明新 GAL 已能发行。

**结论：07A 受限初始世界装配局部 PASS；全库门禁仍 CONCERNS，项目/作品人门未签。**
