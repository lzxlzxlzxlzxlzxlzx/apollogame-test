# GAL-ART-01A · 剧情 CG 消费局部独立复查（2026-10-13）

**判词：局部 PASS，非完整 S5/S6 放行。** 复查人不是本轮施工者；本单只复查剧情 CG 的投影消费、两分镜替换/隐藏、回滚/读档、存档缩略图与缺素材降级。未修改生产代码、工单、资产索引或他人截图。定稿 V2 尚无剧情 CG 专用画面，因此功能合同通过不等于视觉 1:1；同组 CG 画廊条目/解锁和其余 S5/S6 差异仍开放。项目 `media-and-final-skin` 里程碑仍为 active，Owner 人门未通过。

## 独立四步实证

1. **独立复跑。** 默认沙箱首次 `npx vitest run` 因 `EPERM realpath node_modules/vitest/dist/spy.js` 在收集前失败（0 tests），并非代码红灯；随后只读测试权限下重跑 `npx vitest run src/skills/tier3/narrative-director.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-ui-art.test.ts src/services/gal-ui/gal-ui-read-model.test.ts src/services/gal-save/gal-browser-preview-capture.test.ts`：5 文件 **87/87**，退出 0。`npx tsc --noEmit --pretty false` 退出 0、无诊断。相关测试分别核实 Director CG show/hide 投影、UI 连续 `cg-1 → cg-2 → hide → wheel back → manual load`、当前 CG 资源 URL 而非背景的缩略图帧、CG-only OffscreenCanvas 绘制与缺图时不借用隐藏场景。
2. **锚点命中的隔离撤修验红。** 只在 Node 内存中读取 `gal-ui-structure.ts`，断言 `const cgSrc = model.story.cgAssetKey ? contentUrls[model.story.cgAssetKey] : undefined;` **恰好命中 1 次**，用 TypeScript 内存转译和 stub 依赖运行真实 `buildGalSliceTree`：原版“`gal-story-cg` 含 `/shot-2.png` 且无隐藏背景”断言通过；把该行仅在内存副本替换为 `const cgSrc = undefined;` 后，同一断言以 **`CG image missing`** 转红。共享源码未改动；这是消费断言的隔离 mutation，不冒充整套 Vitest 对突变体的复跑。
3. **实证复现。** 在真实 Host/Director 测试里，第一分镜显示 `/shot-1.png`，进入 choice 替换为 `/shot-2.png` 且旧图消失；存第 2 槽时捕获 `cgAssetKey=private/cg-2`、`cgUrl=/shot-2.png`；ending hide 后背景 `/bg.png` 恢复，轮回到 choice 与手动读取第 2 槽均恢复第二分镜，`validateLayoutNode` 零 issue。浏览器静态探针 `GAL_ART_AUDIT_PAGES=story-cg,story-cg-missing node src/services/gal-ui/verify-gal-art-live.mjs` 在独立临时截图目录跑深/亮四态，退出 0：有图态只见 CG、无背景/立绘；无映射态只见“CG 素材未就绪”、无被遮挡背景/立绘，两态对话层仍在。脚本使用临时 Vite 构建与短生命周期 headless 浏览器，结束清理构建、截图目录及浏览器；未启动整套应用服务或触碰数据库。浏览器探针验证的是静态两态，而分镜时序与存读档由上述 Host 测试验证。
4. **读告警。** `node tools/ui-audit.mjs src/services/gal-ui/gal-story-cg-missing-light.audit.ts --w 1440 --h 900` 退出 0：8 个定位元素，重叠 0、对比硬失败 0、border-image 前提失败 0、12 处华丽件/house 命中。审计仍有 **2 条非阻断对比警告**：缺图提示 4.18:1、姓名“澪”3.57:1（相对于审计器通用 4.5:1 提示阈值）；不得写成“零警告”。Vitest 的 Director 历史窗口用例另打印 `[GAL-ENG-02B] 512-entry history bytes=721111`，是测试信息而非错误。静态 CG 四态探针本身无 broken-image 报告。

## 范围与未解决项

- 有 key 但 `contentUrls` 没有映射时，LayoutNode 明确降级为缺素材提示，缩略图捕获返回 `null` 而不泄漏隐藏背景；本轮**未证明**已映射 URL 在运行中变成损坏图片时有同等 UI 降级，仍应由后续运行态素材故障验收覆盖。
- 存档缩略图是非权威 sidecar；本轮验证帧内容、编码绘制和缺图返回 `null`，不以其成功与否影响真实存读档。未做真实浏览器跨会话持久化验收。
- 定稿 V2 无该专用屏，且原差异单中 ghost、设置/确认、部分画廊素材和演出关键帧仍未收束；本局部 PASS 不可升级为 GAL-ART-01A 整票 PASS、S5/S6 完成或项目里程碑 done。
