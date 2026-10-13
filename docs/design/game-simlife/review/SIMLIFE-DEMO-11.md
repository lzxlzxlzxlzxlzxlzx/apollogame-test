# Review 单 · `SIMLIFE-DEMO-11` 小山谷世界内键盘交互

> 施工方已自做自验；复查人必须与施工人不同，并独立复跑本单证据。

| | |
|---|---|
| 工单 | `SIMLIFE-DEMO-11`（消费已验收 `SIMLIFE-ENG-10`，不新增玩法 system） |
| 施工 | BDM程序（已在游戏工单抢锁） |
| 复查 | **待策划指派** |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 改动面 | `src/renderer/{world-ui2d.ts,world-ui2d.test.ts,index.ts}`；`games/game-simlife/{game-simlife.ts,game-simlife.test.ts,keyboard.ts,ui.ts,view-model.ts,world-interaction.ts,world-interaction.test.ts}`；审计入口、手册、能力计划与本工单 |

## 一、做了什么（三句话）

1. `WorldUi2DLayer` 新增通用只读 presentation source：宿主每帧可提供 `entityId + transform + LayoutNode`，与 World 组件合并共存；同实体 source 仅覆盖表现，不增加/删除 World component。
2. 小山谷删除旧 `interactionOpen`、全屏 Modal、`simlife.menu.open/close`，改为玩家锚定的 E 提示与紧凑键盘菜单；Tab/Shift+Tab 循环、Enter 确认、Escape 返回/关闭、移动或离开范围关闭。
3. 菜单由编译后的 context、inventory、package placement/warp/dialogue 数据投影；叶子只排入既有 `life.*` / `dialogue.*` 语义 action，包含播种→种子递归和邻近对话，不直写 World、不新增游戏 system。

## 二、复查请逐条核

| # | 核什么 | 怎么自己验 | 施工方自验 |
|---|---|---|---|
| 1 | render-local source 不污染世界 | 复跑 `src/renderer/world-ui2d.test.ts` 的 source 用例；检查 snapshot 前后与世界组件 source 共存 | source 消失只回收自身 host，WorldUI2D host 保留；snapshot 逐值相等 |
| 2 | 单选 E 直接执行 | 复跑 `world-interaction.test.ts` 第一例 | 镇长单选返回 `life.select-target(mayor)` → `life.action(talk)`，菜单不开 |
| 3 | 多选/反向循环/确认 | 复跑 controller 与 keyboard 用例 | E 开根菜单；Tab/Shift+Tab 发 `+1/-1`；Enter 发当前叶子 |
| 4 | 播种递归 | 复跑 `enters the plant submenu...` | Enter 进 `plant` 子层，种子叶输出 `life.select-item` → `life.action(plant)` |
| 5 | Escape、移动、越界关闭 | 复跑组合关闭用例 | Escape 先退层再关；方向 keydown 先关；`canInteract=false` 自动关 |
| 6 | 对话不再依赖 Modal | 复跑 dialogue 用例与完整采收→镇长→矿洞路径 | 邻近已选 NPC 时展示对话文本/选项，发 `dialogue.choose/advance`；走远后不遮住 warp 菜单 |
| 7 | UI 闭集与世界锚定 | 复跑两份 game 测试和 renderer source 测试 | `validateLayoutNode=[]`、JSON 无 Modal；`data-entity-anchor="life:player"` host 可见，Life 投影实跑 |
| 8 | 没有游戏层规则逃生 | 查 `world-interaction.ts` 与 game audit | 无 World API、DOM、Canvas、Math.random、system；操作资格来自 context/package，表只管文案/顺序 |
| 9 | 合并回归 | 运行交付命令 | **72 files / 574 tests 全绿**；eslint、component manifest、component universe、game audit、system graph、docs guard 均 PASS |

## 三、撤修验红

临时把 `LifeInteractionController.reconcile` 的自动关闭守卫改成 `false && (...)`，只跑 `world-interaction.test.ts`：

- 实测 **1 红 / 4 绿**；准确命中 `loss of context auto-closes`，收到 `expected true to be false`。
- 恢复守卫后该文件当时 **5/5**，加入对话回归后最终 **6/6**。

## 四、请重点看三个取舍

1. **source 与组件同 id 时 source 胜出。** 这是为了让宿主临时菜单替换静态名牌而不写 World；不同 id 正常合并。请核这个覆盖优先级是否符合通用层预期。
2. **农务 context 允许的操作都列出，具体地块条件仍由既有 Life capability 判定。** UI 不复制播种/收获规则，因此某叶子可能得到 capability 的 rejected 结果。请核这是正确的 outcome-first 边界，而非应在 UI 重写资格判断。
3. **对话只在 selectedTarget 仍位于 nearby 时占用世界菜单。** 这样走远后旧 dialogue session 不会遮住矿洞/资源交互，同时仍保留 sim 中的对话状态。请核是否需要另开通用“取消对话”语义 action；本单没有自行创造。

## 五、门禁实情与已知未做

- `npx tsc --noEmit` / `npm run build` 仍被既有无关错误阻断：`game-dice` Label size、`game-theft` Label font、launcher 对 game-theft mount 签名；没有本单文件错误。
- UI audit 完成打包后因本机不存在 `/opt/pw-browsers/chromium` 无法启动；`.ui-audit-tmp` 已由 finally 清理，无浏览器遗留。
- `scripts/scoped-gate.mjs --run` 未执行，因为它会调用 Git，而 owner 明令禁止 agent 执行任何 Git/GitHub 操作；已手工跑不含 Git 的对应验证。
- 未改 `src/ui/**`，未启动服务、未修改数据库、未执行 Git/GitHub。
