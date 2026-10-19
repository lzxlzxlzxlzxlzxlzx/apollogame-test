# GAL-UI-04B-1 · PUI 逐字完成信号独立复查（2026-10-14）

判词：**PUI 接口局部 PASS**。复查人不是施工者。本单不验 GAL 消费、Profile、文字速度设置、S5/S6 或 Owner 人门。首次复查时文档预算红；PUI 仅压缩手册后，已独立复核并转绿，见末节。

## 范围与实查

- 对照施工自证及实际 `src/ui/components/{types,render,server,catalog,validate,typewriter.test}.ts`、`games/game-i/gallery.ts`、`docs/playbooks/ui.md`：接口是 `Label/dialog` 可选 `typewriterSignal:{token,action}`，只在配 `typewriter:0..1000` 时合法。渲染为转义后的 data 属性；token 仅作不透明参数，经既有 HandlerMap 或 ActionSink 交给宿主，不解析 StoryRef、不写 World/Profile。
- `server.ts` 的完成守卫按当前元素、当前 token、宿主包含关系和 `complete` 幂等判断；换投影清旧定时器，卸载清理；首次点击显全时拦截同次推进，随后点击仍走原推进动作。0ms/空句即时通知；无新字段的旧路径保留。点名测试覆盖上述语义及 Unicode 码点、非法字段、代际更新。键盘推进属于既有 dialog/宿主输入机制，本接口没有新建键盘动作；未据此声称 GAL 宿主键盘消费完成。

## 独立机器证据

| 检查 | 实测 |
|---|---|
| `npx vitest run src/ui/components/typewriter.test.ts src/ui/components/ui-contract.test.ts` | 2 文件、13/13；首次受限沙箱 `realpath node_modules/vitest/dist/spy.js EPERM` 未进入测试，后用仅本地依赖读取权限复跑通过 |
| `npx vitest run src/ui/components games/game-i/game-i.test.ts scripts/ui-find.test.mjs` | 76 文件、581/581，退出 0；点名 7/7 |
| `npx tsc --noEmit` | 退出 0 |
| `node tools/ui-audit.mjs tools/audits/dialogue-demo.audit.ts` | 退出 0；重叠、硬对比、border-image 阻断各 0；两个非阻断文字对比 WARN：`vn-aff-n` 3.21:1、`林清越` 3.57:1。该审计为 1060×760 示例，不证明 V2 终图。临时浏览器已关闭 |
| `node scripts/context-budget-guard.mjs` | 首次退出 1：`docs/playbooks/ui.md` 107/100 行、22244/22000 字符；PUI 手册压缩后的独立复跑退出 **0**，全部预算内，公共池 10/10 槽、24982/25000 字符 |

## 对抗性撤修验红

先断言 live `server.ts` 中唯一锚点 `if (i >= glyphs.length) { clearInterval(iv); if (state) finishTyper(el, state); }` 命中 **1** 次。将 `src/ui` 机械复制到仓库内单独临时目录，只在复制件删除该 `finishTyper` 调用，再断言复制件原锚点命中 **0** 次；未修改 live 实现。针对复制件执行 `npx vitest run src/.pui-review-04b1/components/typewriter.test.ts -t '自然结束后仅发一次'`，退出 **1**，恰为 **1 failed / 6 skipped**：期望 `['ch1:n2:rev2']`，实际 `[]`（测试第 77 行）。live 基线点名 7/7 及相邻 581/581 均绿。临时复制目录已核对绝对路径并删除，无残留。

## 边界与后续

局部接口可供 GAL 程序在独立工单中消费，但不能把本判词扩成 04B 设置、S5/S6 或控制台人门通过。两条对比警告需在 UI 视觉验收中复核，不冒充本接口新引入或已修复。

## 预算修复补复查

PUI 归属者只压缩了 `docs/playbooks/ui.md`。独立检查该文件工作树 diff：原有的 LayoutNode、ActionSink、S1-P 和 UI 禁令仍在；并行新增的“排印默认律”仍明确 house 默认字体、`cnwen` 禁作正文/默认，以及只有 Owner 定稿原型逐处指定的大尺寸短标题例外；`typewriterSignal` 表格仍保留 `Label/dialog`、0–1000ms、StoryRef+世代 token、一次完成通知、首次点击不推进、换投影旧 token 失效、旧路径不变。`git diff --check -- docs/playbooks/ui.md` 退出 0，只有 Git 的 LF→CRLF 提示，无空白错误。独立再跑 `node scripts/context-budget-guard.mjs` 退出 0（报告为全部在预算内）；无实现文件变化的证据，故不重复前述代码测试。此补复查消除本单文档预算 CONCERNS，不证明全库 scoped gate 已绿。
