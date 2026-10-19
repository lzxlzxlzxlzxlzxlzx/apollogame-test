# REQ-GAL-PUI-GHOST-STATE · PUI 施工自证（2026-10-13）

## 范围与判词

- 接受 Owner 的 A 判词：原 `Button` 的 `kind/shape/labelColor/skin` 无法描述 V2 ghost 的底色与边色在默认、悬停、按下、禁用间变化；只在 PUI 通用闭集下沉 `Button.stateColors`，不做 GAL 专用分支或 Panel 伪按钮。
- 施工文件：`src/ui/components/{types,catalog,validate,render,server,index}.ts`、本域点名测试/审计夹具、`games/game-i/gallery.ts`、`docs/playbooks/ui.md`。没有编辑 GAL 消费、原型、资产索引、引擎请求池或路线图。
- `stateColors` 需完整四态，每态底/边必填、文字可选。底取 `SurfaceToken` 或受限 `#hex/rgb/rgba` 实色，边/字取 `LabelColor` 同合同；文字缺省回退 `labelColor`/kind。非空贴图皮不可共用；有该字段时不取主题 `buttonSkins`，避免皮与状态底互相覆盖。字段缺省旧 HTML/CSS 路径不变。原生 `<button>`、`disabled`、ActionSink、焦点环仍在。

## 机器与真浏览器证据

| 检查 | 实际结果 |
| --- | --- |
| `npx vitest run src/ui/components --maxWorkers=2 --minWorkers=1` | 69 文件、532/532 测试 PASS；含四态目录/校验/渲染点名 4/4 |
| `npx tsc --noEmit --pretty false` | exit 0 |
| `node tools/ui-audit.mjs src/ui/components/button-state-colors.audit.ts --w 760 --h 360` | exit 0；重叠 0、对比硬失败 0、3–4.5 警告 0、border-image 前提 0；“华丽度 0”是单件 PUI fixture 非完整游戏屏，不视作游戏 S5 结论 |
| `node src/ui/components/verify-button-state-colors.mjs` | exit 0；file:// 下深/亮主题默认、hover、pressed、disabled、键盘 `:focus-visible`、原生 click→ActionSink、禁用不发动作、触屏长按与释放均 PASS；浏览器已关闭，临时 bundle 已删除 |
| 隔离锚点撤修验红 | `SABOTAGE_BUTTON_STATES=1` 时只在临时浏览器 `<style>` 中删除精确 hover 选择器，锚点命中 `1`，hover 背景等待超时，exit 1；随后无破坏重跑 exit 0。共享源码未变 |
| `node scripts/scoped-gate.mjs --run` | full 档 exit 1，止于 depcruise **32** 条非 PUI 的现有 Life/SimLife 等依赖违规；无本票新增违规。默认基线 `origin/claude/mainbranch` 未解析，脚本退化按当前脏树 405 文件判 full |
| `npx vitest run src/ui/components games/game-i --maxWorkers=2 --minWorkers=1` | 651/652 PASS；仅 `games/game-i/dialogue-world.test.ts:30` 既有剧情世界好感期望 14、实得 8；该世界与本票改动的 UI Button 无调用链，且其文件与 `src/skills/tier3/dialogue.ts` 在本票施工时未改。单独复跑同样失败，未借题改剧情规则 |

## `/check-ui` 四关与截图

- 防重叠：审计 0，胶囊组走流式 row，无绝对定位撞盒。
- 对比：深/亮主题四态真浏览器逐态计算文字/实色底对比，均 ≥4.5:1；独立 `ui-audit` 0 硬失败、0 警告。禁用态保持全不透明，不再被旧 blanket opacity 洗淡。
- 透明：fixture 面板实底；状态底允许受限 RGBA，但 V2 实际半透底须由 GAL 在其真实背景上再跑明暗审计，不把样例的深色安全性冒充整页结论。
- 布局卫生：节点 ID 唯一、动作只走 `action`/ActionSink；无自由 DOM/CSS 游戏逃生、无资产。浏览器图片 `pui-button-states-{dark,light}-{default,hover,pressed,focus}.png`（每图右侧包含禁用态）。

局部施工自证为 PASS；完整 GAL S5/S6 与本票独立复查、人门均未签。未推远端。
