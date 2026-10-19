# Review 单 · `SIMLIFE-DEMO-18` 世界对话 / 交互可靠性

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-18` |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | ✅ 已独立验收（2026-10-09） |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 主改动面 | WorldUi2D viewport 约束、game-simlife responsive interaction node、keyboard visibility/pointer release、点名测试与三档真浏览器证据 |

## 一、架构与根因

1. **接受施工**：本单是既有 `WorldUi2D presentation + LayoutNode handlers + ActionSink + life keyboard/controller` 的可靠性扩写，不新增 game system、规则 DSL 或 Little Valley 私有 DOM/Canvas 旁路。
2. **裁剪根因**：固定宽递归菜单可在窄 viewport 超出外层 host；通用 guard 未同步约束直接 LayoutNode root。修复为 prompt/menu 响应式 `maxWidth`，host 与 root 双层 box constraint，横向不滚、纵向必要时滚。
3. **残留移动根因**：页面 visibility 切换可能丢 keyup；world overlay 与 HUD pointer action 过去绕过 held-key release 边界。修复为 visibility release-all，并在两个 pointer action ingress 先排入 `life.move.stop`。
4. 所有 stop/T/N/interaction leaf 仍经 `QueuedInputSource`；未直写 movement flag、World、snapshot/hash，也未引入 timer、墙钟或随机。

## 二、请独立逐条复核

| # | 核什么 | 建议复跑 / 观察 | 施工方结果 |
|---:|---|---|---|
| 1 | 四边安全 | `world-ui2d.test.ts` 四边、超宽、多行高；root `maxWidth:100%` | PASS |
| 2 | 响应式菜单 | `world-interaction.test.ts` prompt/root/child 都是 maxWidth，无固定 width | PASS |
| 3 | 递归鼠标等价 | 父项、子项、叶项与 Enter 动作相同；disabled/伪造/走离拒绝 | PASS |
| 4 | 移动恢复 | visibility、blur、keyup、repeat、W/Arrow alias、world click、HUD T/N click | PASS |
| 5 | 时间入口 | HUD T/N 常驻且可点击；键盘/鼠标更新同一 calendar/slot | PASS |
| 6 | 真玩家链 | WASD 至左侧农田 → till → water → 鼠标播种 → N 跨天 | PASS：三档 viewport 均完成 |
| 7 | UI 红线 | LayoutNode only，无 Modal/React/自由 DOM gameplay handler；不改 `src/ui/**` | PASS |
| 8 | 撤修验红 | 菜单 `maxWidth` 临时退回 `width`，点名锚点必须红 | PASS：准确 1 红 / 17 skipped |

## 三、当前证据

- 点名回归：`game-simlife.test.ts`、`world-interaction.test.ts`、`world-ui2d.test.ts` 共 **3 文件 / 47 测试全绿**。
- 扩展相关回归加入 Little Valley JSON/save 与 UI ActionSink：**6 文件 / 61 测试全绿**；check-ui 要求的 `src/ui/components` 为 **62 文件 / 493 测试全绿**。本单 7 个 TS 文件 ESLint 0 warning。
- 三档 UI audit：1060×760、1440×900、640×720 均为 overlap 0、硬对比失败 0、警告 0、border-image 0；每次短生命周期浏览器均关闭，临时目录已清理。
- `self-check/shots/demo18/` 共 9 张真渲染截图；三档均从真实 spawn 用键盘移动到 `(2,10)`，浏览器断言根/子菜单包围盒完全在 scene 内，鼠标选择 turnip 成功。
- 三档均实证 `KeyD held → 点击 N → 连续 5 tick x 不变` 与 `KeyW held → visibilitychange → 连续 5 tick y 不变`；最终键盘 N / 鼠标 T 得到 spring 2 日、午后。
- 浏览器访问本地 `file://` 静态构建，未启动应用服务；验收后 Edge、临时 IIFE 与入口全部关闭/删除。
- component manifest **196/196 PASS**；`game-skill-audit game-simlife` 为 **AUDIT PASS / RATCHET PASS**；docs-ref guard PASS；S4 align-count 为 **✅44 / ⚠0 / ❌0**，退出码 0。
- 全库 `tsc --noEmit` 已执行；只剩既有/并行的 `game-dice`、`game-theft` 与 launcher 类型错误，最终输出中没有本单文件。`scoped-gate --run` 未执行，因为其内部调用 Git，而项目规则禁止 agent 执行任何 Git 命令。

## 四、独立复查重点

1. `visibilitychange` 当前无条件 release，目的是覆盖 hidden 事件和测试替身；重复 release 在 held set 已清空时严格 no-op。请复查是否保持一次 start 对应至多一次 stop。
2. pointer action 的 release 发生在 handler/ActionSink enqueue 之前；同 tick 中 stop 应先于交互或 T/N 被 input source 取走。请用真实 held key + click 独立验证顺序。
3. WorldUi2D 横向采用 hidden 而非 auto，避免窄屏产生横向滚动后仍“看似可滚但默认裁左”；纵向保留 auto 以容纳极高菜单。请重点看直接 child root 的约束是否对旧 presentation 保持兼容。

## 五、独立复查结论（2026-10-09）

- 复查人：本会话策划，非施工主体 BDM程序。独立复跑 `game-simlife.test.ts`、`world-interaction.test.ts`、`world-ui2d.test.ts`，共 **3 文件 / 47 测试**全绿。
- 独立撤修：将递归菜单 `maxWidth: 244` 暂改为固定 `width: 244`；响应式锚点准确变为 **1 红 / 17 绿**，断言明确指出 `width` 不等于 `maxWidth`。已精确恢复，未留撤修内容。
- 目视复核 `640x720-01-left-root-menu.png`、`1060x760-02-mouse-submenu.png`、`1060x760-03-hud-and-recovered-motion.png`：左边界菜单、递归播种子菜单与顶部 T/N 均完整可见；未见左侧裁切或全屏遮挡。
- 结论：**PASS**。本单的浮层边界、held-key 清理、跨天入口与鼠标递归交互均在既有通用桥接链中解决，未引入游戏专属 UI 或玩法系统。
