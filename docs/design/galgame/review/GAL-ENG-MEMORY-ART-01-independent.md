# GAL-ENG-MEMORY-ART-01 独立复查

- 复查人：独立复查 agent（非施工者）；日期：2026-10-13。
- 局部结论：**PASS**。仅针对可选回想预览/锁态素材槽；不代表 GAL 整体 S5/S6、资产审批或共享工作树全量门禁通过。

## 合同与实证

1. 旧包与非法 key：`GallerySpec` 仅增两个可选 `AssetKey`（`src/engine/protocol/galgame.ts:30-36`）；`src/assembly/gal-package.ts:25-34,60` 对二者复用资产 key 校验，原有无字段包仍被接受，`parseGalPackage` 规范化后保留字段，`createGalWorld` 先 parse 再装配。发现过无 resolver 时 `file:`/`javascript:` 被误收；施工者修复后我用原包测试 fixture 独立重演：`file:`、`javascript:`、`data:`、`https:` 均 `ok=false` 且定位 `$.gallery.memories.intro.previewImage`，`art:valid` 与 `tex/gal-demo` 保持合法。未知 key 的存在性仍需由调用方提供 `resolveAsset` 判定；本单没有把无 resolver 伪称资产索引已审核。
2. 锁态隔离：`src/services/gal-ui/gal-ui-read-model.ts:193-205` 只在解锁时投影 `previewImage`，未解锁仅投影独立 `lockedImage`，CG 映射仍走原有 `pkg.media.cg`/独立 ID。`src/services/gal-ui/gal-ui-structure.ts:166-190` 再按 `unlocked` 选择 key；锁态不提供重播按钮。无 URL 时不建 `Image`，已解锁显示“场景素材待入库”，锁态维持文字状态。
3. 独立复跑：修后 `npx vitest run src/assembly/gal-package.test.ts src/assembly/gal-package.review.test.ts src/assembly/gal-world.test.ts src/services/gal-ui/gal-ui-read-model.test.ts src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts`，6 文件 **75/75**，退出 0；`npx tsc --noEmit --pretty false` 退出 0、无诊断。测试覆盖旧包、恶意/不存在 key、锁态私有 key 不出读模型、解锁切换、无 URL 降级、CG 与图库消费。初次沙箱运行因 `node_modules/vitest/dist/spy.js` `realpath EPERM` 未收集测试，随后在受控环境完整复跑，非测试失败。
4. 撤修验红：从 `src/services/gal-ui/gal-ui-read-model.ts:204` 精确唯一锚点抽取守卫表达式，在隔离 Node 内存中移除 `unlocked &&`（未改共享文件）。原式对锁态 `private/scene` 不输出 `assetKey`；撤修后同输入立刻输出 `assetKey=private/scene`，隐私断言转红。该撤修针对锁态泄露的关键因果点。
5. 真浏览器：独立运行 `node tools/ui-audit.mjs src/services/gal-ui/gal-gallery-memory-art-light.audit.ts`，退出 0；26 个定位节点，重叠 0、对比硬失败 0、对比警告 0、border-image 缺项 0、华丽件 4。另以短生命周期隔离 Edge + 真实本地 PNG data URL 渲染 `gal-ui-art.audit.ts` 的 `gallery-memories-art` 深/亮两态，实际 `Image.complete && naturalWidth>0`：预览图与锁态图均为 true，位置分别 `[85,245,626,147]`、`[729,411,626,147]`；解锁卡有重播按钮，锁态卡无。两态截图目检无图像溢出或剧情图覆盖锁态。浏览器已关闭、临时截图已清理；施工侧保留的深/亮截图 `gal-art-01a-gallery-memories-art-{light,dark}.png` 也经独立目检。

## 告警与边界

- 上述 Vitest、TypeScript、静态 UI 审计均无测试/对比/布局告警；本机 `git diff` 曾给选定文件 LF→CRLF 提示，不影响本次读侧结论。
- 本次未执行共享工作树 `scoped-gate`；施工者报告它受其他在途改动的依赖巡检 37 条影响，不能据本局部 PASS 宣称全库绿。素材来源/许可批准、正式图片登记与 GAL 整体阶段人门不在本票结论内。
