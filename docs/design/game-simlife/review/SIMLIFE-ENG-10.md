# Review 单 · `SIMLIFE-ENG-10` 通用 2D 世界空间 LayoutNode 桥接

> 本单由施工方自做自验后提交。复查人必须独立复跑；本单只是导航，不是证据。

| | |
|---|---|
| 工单 | `SIMLIFE-ENG-10`（owner 判 **A**：补通用 2D 世界交互 UI 能力） |
| 施工 | BDM程序（已在工单抢锁） |
| 复查 | **待策划指派，且复查人不得为施工人** |
| 提交 | 未提交：项目规则禁止 agent 执行任何 Git / GitHub 操作 |
| 改动面 | `src/engine/protocol/components/render.ts`、`src/renderer/{world-ui2d.ts,world-ui2d.test.ts,canvas-renderer.ts,index.ts}`、`src/skills/atoms/{world-ui2d/index.ts,index.ts}`、`src/assembly/{component-map.ts,component-universe.gen.ts,capability-registry.gen.ts}`、`src/net/determinism.ts`、`scripts/component-manifest-baseline.json`、本工单与相关手册/能力计划 |

## 一、做了什么（三句话）

1. 新增 render-only `WorldUI2D` 与 `l8-world-ui2d`：实体可提供富 `LayoutNode`，或使用文字、字号、颜色、发光和世界偏移回退。
2. 新增 `WorldUi2DLayer` 并接入 `CanvasRenderer` 的显式 overlay host；它按实体池化 DOM、走 `mountUI`、随相机投影、出屏隐藏、实体/组件消失即回收，并保持 `pointer-events:none`。
3. 通用世界单位和 Life 格单位投影共用纯函数；Life 路径只做一次格→像素换算，同时产出 `data-entity-anchor`，让既有 `Float anchorTo:{kind:'entity'}` 契约拥有真实生产者。

## 二、复查请逐条核

| # | 核什么 | 怎么自己验 | 施工方自验 |
|---|---|---|---|
| 1 | 富节点与文字回退都合法 | 复跑 `src/renderer/world-ui2d.test.ts` 的 `WorldUI2D contract`，并检查 `worldUi2DTree` | `validateLayoutNode` 零 issue |
| 2 | 投影没有重复换算 | 复跑同文件 projection 用例；Life 场景 900×620、32px、玩家格坐标应为 `(450,310)` | 通用缩放/视口/出屏与 Life 单次换算均绿 |
| 3 | overlay 生命周期和旧调用兼容 | 复跑 CanvasRenderer 接线与 layer 池化用例 | 只在显式提供 host 时启用；无 host 的旧调用不抛 |
| 4 | 不阻挡 Canvas 输入 | 检查宿主 style，并复跑池化用例 | `pointer-events:none` 有断言 |
| 5 | entity anchor 真能被既有 Float 消费 | 复跑 `produces the existing Float entity-anchor contract` | 真 `mountUI` + rAF 路径断言浮层可见且跟随锚点 |
| 6 | render-only 不污染确定性 hash | 临时从 `NON_DETERMINISTIC` 删除 `WorldUI2D` 后只跑该测试文件 | 实测 **1 红/5 绿**，命中 add/change/remove hash 用例；复原后 **6/6 绿** |
| 7 | 锚点测试不是假绿 | 临时删掉 `host.dataset.entityAnchor = id` 后只跑该测试文件 | 实测 **3 红/3 绿**，命中 Canvas 接线、池化、Float 消费用例；复原后 **6/6 绿** |
| 8 | 注册/清单/系统图同步 | 跑 component manifest guard、component map check、capability registry check 和 `npx vite-node scripts/system-graph-audit.mjs` | 194/194、211、134 均同步；111 systems、无重复/悬空边，`SYSTEM-GRAPH: PASS` |
| 9 | UI 基座与游戏无回归 | 复跑 `src/ui/components`、相关 assembly/renderer/net 测试及 `games/game-simlife` | 合并回归 **74 文件 / 573 测试全绿**；game-simlife **10/10**；eslint 与 game-skill-audit 全绿 |

## 三、请重点看三个取舍

1. **投影模式由 CanvasRenderer 场景级选择。** 启用 `lifePreviewOptions` 时整层按 `life-cell` 投影，否则按通用世界单位投影；没有在每个组件上重复声明坐标制。请核：Canvas 单场景单坐标制的约束是否足够明确。
2. **交互桥保留 `actionSink`，宿主仍强制 pointer-events none。** 这保证世界 UI 不截断 Canvas 指针；本工单下游预定是键盘菜单，不把点击语义偷渡进渲染层。请核：若未来需要可点世界 UI，是否应另开显式输入策略字段，而不是放宽本单默认值。
3. **snapshot 保留组件，hash 排除组件。** 这与现有 `WorldUI3D` 等 render-only 组件一致，也满足本单的确定性验收；若要求连 snapshot 序列化都剥离，会改动共享存档语义，需另立通用裁决。请核：当前沿用既有约定是否正确。

## 四、告警与门禁实情

- `npx tsc --noEmit` 和 `npm run build` 被本工作开始前就存在的错误阻断：`games/game-dice/dice-window.ts` 的 Label size 类型、`games/game-theft/ui.ts` 的 Label font 类型，以及 `src/launcher/game-runner.tsx` 的 game-theft mount 签名；错误列表没有本单文件。
- `node tools/ui-audit.mjs tools/audits/game-simlife.audit.ts` 完成打包后因本机不存在 `/opt/pw-browsers/chromium` 无法启动浏览器；工具的 `finally` 已清理 `.ui-audit-tmp`，无浏览器进程遗留。
- `scripts/scoped-gate.mjs --run` 未执行，因为它会调用 Git，而 owner 规则明确禁止 agent 执行任何 Git 命令。已手动执行不含 Git 的对应清单、注册、测试、lint、系统图与审计步骤。
- 系统图审计打印的 4 个全局超集 SCC 是既有信息项；本能力 `systems: []`，没有新增 system、phase、读写或定序边。

## 五、已知未做 / 下游边界

- 不含 Little Valley 实体挂载、菜单内容、键盘开关状态机；它们属于收到本桥后才施工的游戏数据链。
- 未改 `src/ui/**`（PUI 专属域）；本单只消费既有 LayoutNode、`mountUI` 与 Float anchor 契约。
- 未启动应用服务、未修改数据库、未执行任何 Git / GitHub 操作。
