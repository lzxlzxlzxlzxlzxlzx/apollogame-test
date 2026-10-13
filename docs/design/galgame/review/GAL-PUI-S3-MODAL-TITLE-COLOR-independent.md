# GAL-PUI-S3-MODAL-TITLE-COLOR · 非施工者独立复查

## 判词

**PUI `Modal.titleColor` 通用合同局部 PASS。** 仅放行 GAL 消费该闭集；不签 GAL 亮主题整屏、S2 皮层、S5/S6 视觉与演出。

## 2026-10-11 独立证据

- 类型和目录将 `titleColor` 声明为既有 `LabelColor` token 或受限 `{custom}`；渲染缺省仍为主题 `t.text`，有值走同一 `resolveLabelColor`。内建标题 `id` 与 `aria-labelledby` 未改变。
- 独立复跑 `skin-layer-and-modal-title.test.ts`、`button-shape.test.ts`、`modal-semantics.test.ts`、`catalog-validate.test.ts`：**4 文件 40/40，exit 0**。合法 custom 零校验 issue；裸色和注入拒收。
- 共享 UI 全套另独立复跑 `npx vitest run src/ui/components`：**68 文件、525/525，exit 0**，确认 S2 修复后的最终状态未令其它 PUI 控件回归转红。
- 串行独立复跑 S3 深皮亮标题与 daylight 浅底默认深字两套静态浏览器审计（720×420）：各 **exit 0**、重叠/硬低对比/对比警告/border-image 前提均为 0。夹具华丽度 0 是最小 Modal 合同的非阻断提示，不是 GAL 游戏屏验收；浏览器均已关闭。曾出现的“浅底配白字”夹具是真低对比，已改为两组合法用例，未放宽阈值。
- 独立 `verify-pui-s2-s3-review.mjs` 对 S3 的唯一源码锚点作 esbuild 内存撤修：`titleColor` 回退到 `t.text` 时 custom 断言精确转红；默认 Modal 输出与基线逐字一致，ARIA 保留。脚本输出 `ANCHOR_HITS=1+1 SABOTAGE_RED=2 LEGACY_UNCHANGED=3 VALIDATION_REJECTS=2`，其中另一锚点用于 S2 检查；没有编辑生产源码。
- `npx tsc --noEmit` 整体 exit 1，但输出仅指向既有 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher`，没有本票 PUI/GAL 文件。未执行 Git、数据库写入或应用服务启动。

## 使用边界

标题色只解决内建标题的闭集表达。GAL 应按定稿 V2 给深原图上的亮主题 Modal 填高对比色，再以真图复拍五类可执行确认；“退出游戏”仍是禁用宿主入口，不得冒充可执行。Panel/Button 的 S2 外扩皮在独立浏览器发现布局回归，**本判词不放行 S2**。
