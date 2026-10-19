# GAL-ART-01A 画廊卡片局部自证 · 2026-10-13

范围：仅 V2 已加载素材时的回想/CG 卡片皮肤、密度、已解锁动作及锁定保密；不宣称完整 S5/S6。冻结原型：`../gal-ui-complete-v2.dc.html`，1440×900。

- 真渲：隔离静态 `file://` 探针 34 态通过，临时浏览器已关闭。证据为 `../review/gal-art-01a-gallery-cards-{memories,cg}-{light,dark}.png`。
- 卡片：回想 2×3、CG 3×2，V2 有图分支暗靛 `#111b36` 金边、内图井 `#172140`；页签 124×46 纹样按钮。无图及旧切片分支保留原路由。
- 交互：已解锁回想点击发 `gal.gallery.play-memory`；锁定卡无重播动作与图；CG 图片在卡内、展开动作可达。
- 回归：`npx vitest run src/ui/components src/services/gal-ui --maxWorkers=1 --minWorkers=1`：610/610；深亮图库 `ui-audit`：重叠/硬对比度/皮肤问题均 0。
- 独立复查：`../review/GAL-ART-01A-gallery-cards-independent.md` 判局部 CONCERNS；锚点撤修验红有效，卡片真实布局/动作与审计通过，但素材和完整原型差异未闭。
- 全库门禁：`tsc --noEmit` 在非 GAL 的 `ordered-action-session.test.ts` 有 6 条 `completedSignal` 类型错误；`scoped-gate --run` 在 33 项非 GAL 依赖违规处退出 1。均不得作为 GAL 全量绿灯。

剩余：场景纹理、锁定剪影与缺少的 CG 素材需要经来源/许可审核入库；图库顶部四入口、ghost 胶囊细节、设置/确认及 S6 时序仍按 `../gal-art-01a-s5-diff.md` 开放。Owner 人门未到。
