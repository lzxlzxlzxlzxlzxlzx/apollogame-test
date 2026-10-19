# GAP-CARD-REVEAL-02 · 通用 2D Sprite 目标尺寸与 fit

## 需求与裁决

Owner 已选 A：将等比目标框适配下沉到共享 `l1-sprite`，不允许 `game-card-reveal` 创建运行时裁图或临时纹理。

## 实际改动

- `src/engine/protocol/components/render.ts`：`Sprite` 增加可选 `width`、`height`、`fit`。
- `src/skills/atoms/sprite/index.ts`：登记闭集 schema 与字段组合约束。三个字段全省略时沿用原生 source rect；任一出现则三者必须齐全，宽高为有限正数，fit 仅为 `cover|contain`。
- `src/renderer/renderable.ts`：新增无副作用 `planSpriteDraw`，用已解析的整图或 atlas Frame source rect 计算裁源及目标矩形。
- `src/renderer/canvas-renderer.ts`：普通 Sprite 绘制消费 draw plan；Life 预览规则与其 `planLifeVisualDraw` 路径未改。
- `src/renderer/renderable.test.ts`、`src/assembly/validate-manifest.test.ts`：精确几何与装载拒绝测试。
- `docs/playbooks/rendering-fx.md`：补标准消费方式和 render-only 边界。

## 兼容性与边界

- 未填写新增字段时，source/destination 与旧 `drawImage(image,sx,sy,sw,sh,dx,dy,sw,sh)` 参数逐项相同。
- `cover` 居中裁源并填满目标框；`contain` 完整显示源图、在目标框内居中，未画区域保持透明。
- anchor 先作用于最终目标框；contain 图像再在该框内居中。
- Frame 已解析后的 source rect 是唯一输入，算法不会越 atlas frame 采样。
- 此能力只生成 renderer-local draw plan：不创建 Canvas/纹理、不读取 URL、不写 World、不新增 system。`Sprite` 既有数据仍沿现有快照/hash 口径保存；没有擅自变更全局 `NON_DETERMINISTIC`。
- 无系统判定路径，因此不写 `DebugTrace`；该工具只用于可从 World 状态重建原因的 sim system。

## 验证证据

| 命令 | 结果 |
|---|---|
| `npx vitest run src/renderer/renderable.test.ts src/renderer/canvas-renderer.viewport.test.ts src/assembly/validate-manifest.test.ts` | exit 0，3 files / 37 tests passed |
| `npx eslint src/engine/protocol/components/render.ts src/skills/atoms/sprite/index.ts src/renderer/renderable.ts src/renderer/renderable.test.ts src/renderer/canvas-renderer.ts src/assembly/validate-manifest.test.ts` | exit 0 |
| `npx tsc --noEmit` | exit 1：仅 `game-dice`、`game-simlife`、`game-theft`、`launcher` 既有并行错误；本改动文件无诊断 |
| `npm run build` | exit 1：同一 `tsc` 既有并行错误，未进入 Vite build |

首次在 sandbox 中运行 Vitest/Vite-node 时遇到已安装包 `realpath` 的 EPERM；在获准的隔离外测试环境复跑，Vitest 已获得上述真实结果。

## 撤修验红

临时把 `planSpriteDraw` 的 cover 横向裁源宽度从 `source.sh * targetAspect` 破坏为 `source.sw`。运行：

```text
npx vitest run src/renderer/renderable.test.ts -t "横图进竖框 cover"
```

结果 exit 1，锚点断言由预期 source `{x:160,width:100}` 变为 `{x:10,width:400}`。随后用 `apply_patch` 恢复正确计算，并复跑全套定向 37 测试全绿。

## 独立复查门

施工人不自评 PASS。本单已送独立复查；复查人须独立复跑上述测试、重做 cover 撤修验红、检查 atlas 不越界及旧 Sprite 参数兼容性。

## 独立复查结论（2026-10-10）

结论：**PASS，可由 `game-card-reveal` 的 S5 消费；不等于 S5 或全库门禁完成。**

- 非施工人独立复跑 renderer / viewport / manifest 定向集：**3 files / 37 tests passed，exit 0**。
- 非施工人独立复跑范围 ESLint：**exit 0**；capability registry 守卫同步：**139 条，exit 0**。
- 逐项复读确认：未填写新字段时仍使用完整 source rect 与原生目标尺寸；`cover` 只在已解析 source rect 内居中裁切；`contain` 完整保留 source 并在最终目标框内居中；非中心 anchor 以目标框为基准；CanvasRenderer 的普通 Sprite 路径确实消费 `planSpriteDraw`，Life 专用路径未被替换。
- 独立撤修验红带唯一锚点：临时把横向 cover 裁切宽改回 `source.sw` 后，点名用例精确得到 **1 failed / 20 skipped**，received source `{x:10,width:400}`、expected `{x:160,width:100}`；随后已用 `apply_patch` 恢复，37 项再次全绿。
- 全库 `npx tsc --noEmit` 仍 exit 1，诊断只落在并行的 `game-dice`、`game-simlife`、`game-theft` 与 `src/launcher/game-runner.tsx`，本单改动文件零命中。因此能力本身独立复查通过并允许 S5 接线，但 S5/交付仍不得绕过最终全库门禁。
- 复查未执行 Git/GitHub、数据库操作或服务启动；没有临时破坏或浏览器进程残留。
