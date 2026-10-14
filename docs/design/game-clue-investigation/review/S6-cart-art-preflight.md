# S6 原型资产接入预检（2026-10-13）

结论：接受复用 Owner 指定原型资产；尚未施工。卡带装载接缝需要 Owner A/B 裁决。

## 阅读与授权

主 agent 本轮完整阅读：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`game-production.md`、`game-requests.md`、`assets.md`、`art-pipeline.md`、`rendering-fx.md`、`testing.md`、`randomness.md`、`self-check.md`、`review-gates.md`、`game-flow-questions.md`、`ui.md`、`pick-list.md`（后十三项位于 docs/playbooks）；另读 `docs/design/ui-playbook.md`、`data-driven-manifesto.md`、`asset-pipeline-review.md`、`art-platform-2026-07-09.md`、`art-pipeline-asbuilt-2026-08.md`、`art-replacement-workflow.md`；本游戏能力计划、原型说明、流程板及项目路线图。

使用技能：module-assets、module-art、resource-manager、module-fx、module-ui、check-ui、align-check、ask-owner、project-roadmap。涉及资产、美术、渲染、UI 与验证线，无新玩法、无 SDK 打包。

- 流程板真实 S5 Owner signoff：2026-10-13T10:29:29.574Z。
- Owner 本轮明确确认“使用原型这套素材”，回应问题包含正式用途及来源/许可确认。此记录不代替 S6 终审。
- 本轮未改 manifest、未登记生产资产、未启动完整系统。

## 实查原文与判断

`npx vite-node scripts/dump-capability-catalog.mjs --only l1-sprite,t2-clickable` 独立运行 exit 0：

- `l1-sprite` 提供 `textureKey,anchorX,anchorY,zOrder,width?,height?,fit?`，fit 为 cover/contain。
- `t2-clickable` 提供 `hitMaskKey`，缺省 AABB，可选预烘焙二值实形命中。

源码接缝：

1. `src/studio/DataCartridgeRunner.tsx` 的预览和正式入口均为 `parseManifestDetailed(manifest)` 或等价单参数调用，没有传入 `assetIndex`。
2. `src/assembly/manifest-core.ts` 只从 `opts.assetIndex?.assets` 绑定 mask；内联 `Clickable.hitMask` 明确拒收；缺索引会输出“未绑定有效掩码或与 Sprite.textureKey 不符；点击将 fail-closed”。
3. `src/studio/cart-run-core.ts` 的 `new CanvasRenderer({ width, height, ...pointerFeedback })` 未提供 `assets`。
4. `src/renderer/canvas-renderer.ts` 明确无 AssetManager/未加载图像时退回 Shape 或占位方块。
5. 现有 `src/assets/game-art-load.ts` 有本地索引装载/skinMap 函数，但当前卡带启动链未调用；该加载器默认失败静默回退，不应原样用作本游戏必需素材的成功条件。

因此，已有确定性命中与映射能力可复用，但仅改 manifest 数据不能建立资产加载和 mask 绑定。禁止游戏自写点击算法或退回矩形热区。当前共享树大量在途修改，未切分支、pull/rebase 或覆盖他人文件。

## Owner 两条路线

| 路线 | 代价与影响面 | 通用性及选错成本 |
|---|---|---|
| A（推荐）：补通用卡带资产装载桥 | 共享卡带宿主接本地 AssetIndex、AssetManager、mask 绑定和 UI skinMap；需要异人复查、缺图/错 mask 的失败测试、无资产旧卡带回归；在线/预览/离线边界须明确 | 后续卡带复用；施工面较大，但避免每个游戏维护独立加载逻辑 |
| B：本游戏专属宿主适配 | 需要显式游戏层例外及技术债，接同一资产/命中基座，仍不许自写命中 | 局部改动较小；以后替换美术、预览和打包容易双轨，迁回通用桥需返工 |

验收：8 图可见；7 个物件 opaque/transparent 反例；contain/cover 与缩放坐标；hover/pressed 同轮廓；收录后 Sprite 不消失；键鼠触控完整链；缺失/错绑拒收；独立撤修必须唯一锚点命中。

另：资产专员角色必读的 `docs/design/asset-library.md` 不存在，其依赖的导入暂停，不以旧文档记忆替代。源图尺寸与 alpha 调查见 `S6-assets-import.md`。不得冒称接入或验证已完成。
