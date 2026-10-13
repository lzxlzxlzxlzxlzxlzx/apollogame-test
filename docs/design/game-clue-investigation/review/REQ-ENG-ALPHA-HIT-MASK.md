# REQ-ENG-ALPHA-HIT-MASK · 施工自检与独立复查导航

状态：**施工自检完成，等待非施工者独立复查；未签 PASS，不解锁游戏 S3。**

## 变更边界

- `src/assets/asset-index.ts` / `src/engine/protocol/hit-mask.ts`：新增纯数据 `hit-mask` 索引类型，`version=1`、逻辑尺寸、阈值、源 texture、逐行二值位均严格校验；filled mask 无 `path`，源 texture 必须 filled 且声明相同原生尺寸。渲染资源管理器不注册 mask。
- `src/assets/import/hit-mask.ts`：作者态 PNG alpha 烘焙，`alpha >= threshold` 转二值行；运行时点击能力不 import 解码器、URL 或 Canvas。
- `src/assembly/manifest-core.ts`：`parseManifest` / `parseManifestAsync` 的 `assetIndex` 选项按 key 绑定已校验 mask；作者内联 mask 拒绝；缺失或不匹配保留 key 但不绑定，运行时 fail-closed。
- `src/engine/protocol/sprite-layout.ts` / `src/renderer/renderable.ts`：把既有 Sprite 纯布局提到协议层，渲染器保持原导出；mask 命中与绘制共用锚点、`cover/contain` 投影。
- `src/skills/tier2/clickable.ts`：无 mask 的旧 AABB 与 zOrder/id 裁决保留；有 mask 时按已逆投影世界坐标、缩放和二值位判断，透明位拒收；缺/坏/源贴图不符拒收且 opt-in `DebugTrace.reject`。v1 对非零旋转 fail-closed，不引入非正确舍入 trig。
- `docs/playbooks/events-logic.md`、`docs/playbooks/assets.md`：作者态接线与限制。

## 施工者复跑证据（2026-10-12）

- 定向 Vitest：6 files / **93 tests PASS**，含旧 AABB、实心/透明、缺失/坏版本/尺寸、contain 留白与缩放、zOrder、mouse/touch/keybind 同名 Signal、重复快照、严格 World trace、渲染布局、资产索引与 manifest 绑定。
- ESLint（本单代码文件）：**PASS**。DOCS-REF：**PASS**。`npx vite build`：**PASS**；仅报现有大 chunk 警告。
- `npx tsc --noEmit`：**FAIL（本单零命中）**；现有 game-card-reveal / game-dice / game-theft / launcher 类型错误。
- `sim-dom-fence`：**FAIL（本单零命中）**；现有 `src/skills/tier3/narrative-director.ts` 1 条。`depcruise`：**FAIL（本单零命中）**；现有 Life 相关 28 条跨层/游戏逃逸。
- 全库 Vitest：**6271 过、23 败、14 files 败**；不能宣称全库绿。已点名复跑 `declaration-audit.test.ts`：其两项红为 `narrative-director` / `life-relationship` 新相位与 SCC，`clickable` 未进入差异。其余全库红需复查人独立归因，不能由本单自陈覆盖。
- 撤修验红：先以 `rg -n -F "mask.rows[my][mx] === '1'" src/skills/tier2/clickable.ts` 确认唯一锚点在 165 行；临时翻成 `!== '1'`，执行 `npx vitest run src/skills/tier2/clickable.test.ts -t "实心接收" --reporter=dot`，**精确 1 failed / 12 skipped**（实心命中断言红）；恢复 `===` 后同例 **1 passed / 12 skipped**。最终源已恢复。

## 请独立复查

1. 自己复跑上述定向测试与索引/manifest/渲染/严格模式案例，检查是否有「missing mask 退回矩形」或 `cover/contain` 映射偏差。
2. 自己做带唯一锚点断言的撤修验红，并检查 DebugTrace 与 snapshot/hash 路径；Review 单不是证据。
3. 读全库红项和构建告警，判断本单是否引入新的系统图软环或跨层依赖。未复查前状态保持 in-progress。

限制：没有改任何 `games/game-clue-investigation/**` 正式代码；未做 Git/GitHub、服务启动或 Owner 人门操作。
