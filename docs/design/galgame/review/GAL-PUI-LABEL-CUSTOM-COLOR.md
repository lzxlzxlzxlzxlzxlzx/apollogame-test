# GAL-PUI-LABEL-CUSTOM-COLOR · Label 显式自定义色合同 · 自检导航

## 范围与结论

`GAL-ART-01A/S3` 的既有 PUI 合同不一致已完成施工自检，结论为 **待独立复查**。

此前 `LabelProps.color` 与渲染器支持 `{custom:string}`，目录却将 `color` 标为纯 enum，使校验器拒收已公开的合法数据。本单将目录、校验和既有渲染净化对齐：

- 既有 `ColorToken` 保持不变，是优先且唯一可直接填写的字符串闭集。
- `{custom:string}` 是唯一允许的显式逃生对象；对象必须只含 `custom`，内容非空且经渲染器同一 `safeColor` 净化后逐字不变。
- 裸 `'#F4EEFF'`、带分号/属性逃逸的 custom 值、或带额外字段的对象都会被拒收；渲染器仍以 `safeColor` 做最终样式净化。

没有新增 Modal 标题色字段、贴图缩放能力、GAL 消费、资产或原型改动；本单不签 GAL S5 亮主题原图可读性。

## 施工文件

- `src/ui/components/catalog.ts`
- `src/ui/components/validate.ts`
- `src/ui/components/render.ts`
- `src/ui/components/label-custom-color.test.ts`
- `tools/audits/label-custom-color-dark.audit.ts`
- `tools/audits/label-custom-color-light.audit.ts`

## 自检证据

```text
npx vitest run src/ui/components/label-custom-color.test.ts src/ui/components/catalog-validate.test.ts src/ui/components/label-tween-spans.test.ts src/ui/components/label-font-glow.test.ts
```

退出码 `0`：4 files / 29 tests 通过，覆盖合法 custom、合法 token、裸色串拒收、注入串拒收、扩展对象拒收以及渲染净化。

```text
node tools/ui-audit.mjs tools/audits/label-custom-color-dark.audit.ts --w 720 --h 360
node tools/ui-audit.mjs tools/audits/label-custom-color-light.audit.ts --w 720 --h 360
```

两条命令退出码均为 `0`：0 重叠、0 硬低对比、0 对比警告、0 border-image 前提失败。此为最小颜色合同夹具，华丽度 0 是审计的非阻断提示，不是游戏屏验收。

`npx tsc --noEmit` 仍退出 `1`，但没有本单文件；既有错误来自 `games/game-card-reveal/s4-flow.test.ts`、`games/game-dice/{dice-window.test.ts,dice-window.ts}`、`games/game-theft/ui.ts` 与 `src/launcher/game-runner.tsx`。

## 自检撤修验红

1. 将 catalog 的 Label `color` 临时退回 `type:'enum'` 后，只运行“accepts a safe explicit custom color”：精确 1 failed / 2 skipped，错误为 `{custom}` 重新得到 `bad-enum`。恢复 `enum-or-custom-color` 后继续。
2. 临时移除 `safeColor(raw) === raw` 后，只运行“rejects injected or structurally widened custom values”：精确 1 failed / 2 skipped，注入值未再得到 `bad-custom-color`。恢复守卫后继续。
3. 恢复最终实现后，四文件定向回归为 29/29。

## 独立复查步骤

1. 独立复跑上述 Vitest 与深/亮审计，读取所有警告。
2. 检查 `Label.color` 的三种输入：token、单键 `{custom}`、非法裸串/注入/多键对象。
3. 撤修验红：临时将 catalog 的 Label `color` 改回 `type:'enum'`，确认“accepts a safe explicit custom color”精确转红；恢复后复跑全绿。再临时去掉 `safeColor(raw) === raw` 守卫，确认注入用例转红；恢复。
4. PASS 仅签 PUI `Label.color` 合同；GAL 原图上的具体颜色和 Modal 内建标题色仍由各自的 S3 后续票真渲复查。
