# GAL-PUI-LABEL-CUSTOM-COLOR · 非施工者独立复查

## 判词

**局部 PASS（仅 PUI 的 `Label.color` 显式 custom 合同）。** 不签 GAL 原图亮主题可读性、Modal 内建标题色、S2 贴图尺度或 S5 视觉定稿。

## 独立证据 · 2026-10-11

- 读取施工导航、`catalog.ts`、`validate.ts`、`render.ts` 与测试；确认字符串仍只收既有令牌，`{custom}` 必须单键、非空，且与渲染所用 `safeColor` 净化结果逐字一致。非法裸色、注入与扩展对象的校验返回硬 issue。
- 独立复跑 `npx vitest run src/ui/components/label-custom-color.test.ts src/ui/components/catalog-validate.test.ts src/ui/components/label-tween-spans.test.ts src/ui/components/label-font-glow.test.ts`：**4 文件、29/29，退出码 0**。默认沙箱对 `node_modules/vitest/dist/spy.js` 的 `realpath` 返回 EPERM；改用获批的本机只读测试执行后通过，此 EPERM 不是测试失败。
- 深、亮 `tools/audits/label-custom-color-{dark,light}.audit.ts` 分别以 720×360 **串行**跑，退出码均 0：重叠 0、硬低对比 0、对比警告 0、border-image 前提 0。华丽度 0 是最小合同夹具的非阻断提示；无头浏览器已由审计命令关闭，未启动应用服务。
- 独立内存撤修 `node docs/design/galgame/review/verify-pui-label-custom-color-review.mjs`：两个被改锚点各唯一命中；目录退纯 enum 后合法 custom 转红；移除净化等值守卫后注入拒收转红，输出 `ANCHOR_HITS=1+1 SABOTAGE_RED=2 BASELINE_SAFE=1 TOKEN_CLOSED=1`。只在 esbuild 内存加载时替换，未编辑生产源码。
- 手册口径复核：`docs/design/ui-playbook.md` 已将“只用令牌”收窄为“令牌优先，创作者特别指定时显式、安全的 `{custom}` 为受限例外”；仍禁止裸 hex，深亮对比度仍须真测。`docs/playbooks/ui.md` 同步了目录/校验边界。

## 边界与后续

`safeColor` 是现有渲染净化器，不是完整 CSS 颜色语法解析器；本票只修公开类型、目录和校验不一致，未扩大既有自定义色语义。GAL 必须在取得 S3 Modal 标题色裁决后再用真实原图逐屏复测 4.5:1/3:1 可读性，不能引用本 PASS 替代视觉验收。全库 `tsc` 的其他游戏/启动器红项不归本票；不曾执行 Git、数据库写入或启动服务。
