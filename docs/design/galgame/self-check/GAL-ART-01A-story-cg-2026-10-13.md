# GAL-ART-01A · 剧情 CG 消费局部自证（2026-10-13）

结论：局部功能成立，**不代表 `media-and-final-skin`、S5 或 S6 已完成**。定稿 V2 未展示剧情 CG 专用屏，故本项按数据合同的“CG 替换主视觉”验收；不反向修改原型。仅使用已在模板中登记的 demo CG 做视觉探针，未登记或批准新素材。

| 合同/玩家可见承诺 | 结论 | 实证与边界 |
| --- | --- | --- |
| 背景＋立绘场景遇到 `cg.show` 后由 CG 占据主视觉，台词与选项仍可用 | ✅ | `gal-ui-read-model.test.ts`、`gal-ui-art.test.ts`；[CG 亮主题截图](../review/gal-art-01a-story-cg-light.png)、[暗主题截图](../review/gal-art-01a-story-cg-dark.png)。 |
| 连续两个 CG ID 形成分镜切换；`cg.hide` 恢复背景＋立绘 | ✅ | `gal-ui-slice-host.test.ts` 的真实 Director→宿主→LayoutNode 路径；第一、第二张 URL 互斥。 |
| CG 场景可回滚、手动保存/读取到相同分镜 | ✅ | `gal-ui-slice-host.test.ts` 同一世界/槽测试；读档后 `cgAssetKey` 与画面一致。 |
| CG 场景的存档预览不泄漏被遮挡的背景或立绘 | ✅ | `gal-browser-preview-capture.test.ts` 验证只绘一张 CG；CG URL 缺失则无缩略图，权威存档仍可用。该预览仅为非权威侧车。 |
| 缺 CG 素材时不回退显示隐藏背景/立绘，玩家能看到明确提示 | ✅ | [亮主题缺素材](../review/gal-art-01a-story-cg-missing-light.png)、[暗主题缺素材](../review/gal-art-01a-story-cg-missing-dark.png)。 |
| 同一 CG 组的多分镜共享一个画廊条目/解锁 | ⚠ | 当前 `MediaCatalog.cg` 是单 ID→单图；可用多个 ID 串联分镜，但无组语义。若产品要求“共用条目与解锁”，须按缺口协议另请 Owner A/B 裁决；本轮不擅改协议。 |

本地复验：`src/services/gal-ui` + `src/services/gal-save` 124/124；`src/ui/components` 528/528；`npx tsc --noEmit --pretty false` 退出 0；`validateLayoutNode` 在 CG/缺图树断言零 issue；隔离 `file://` Chromium 四态真渲通过，浏览器与临时构建均由探针关闭/清理。亮主题 CG 缺图页 `ui-audit` 退出 0：重叠 0、硬对比度失败 0，仍有两项 3–4.5:1 警告（24px 缺图提示 4.18:1、23px 人名 3.57:1，均为大字，按 3:1 判据可读）。`scoped-gate --run` 退出 1：当前 32 项非 GAL 的 simlife 依赖边界错误；没有改动该生产线。

素材/发行边界：示例 CG 来源许可尚不足以证明可发行，新增正式素材与来源、审美审核仍归 Owner。未写远程 Git/数据库，未启动整套 ZeroCraft，未代签 Owner 人门。
