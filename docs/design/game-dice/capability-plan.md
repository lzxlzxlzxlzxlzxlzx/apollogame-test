# 能力总览 Capability Plan — game-dice《掷界》

> Owner 于 2026-09-21 选择路线 A：跨平台会话与多面骰表现必须下沉为通用引擎能力；禁止在游戏层手写 Three.js、随机或跨窗口协议。

## 1. 游戏一句话

悬浮掷骰判定窗：它居中显示在透明外层之上，DokiWorld 场景仍可透出；玩家在窗内点击或拖拽掷出调用方指定骰池的真实 3D d4/d6/d8/d20。Cannon 物理世界停稳后读取朝上面，引擎以调用方声明的区间表对“总点数 + 修正值”给出结果标签。

## 2. 消费的引擎能力

| capability / 基座件 | 用来做什么 | 状态 |
|---|---|---|
| `w1-random` | 由宿主熵派生每次投掷的初速度与角速度 | ✅ 已有 |
| `external-game-session` | 宿主请求、初始随机 seed、结果回传与 requestId 去重 | 🟡 已实现，待第二消费者验收 |
| `three-dice-overlay` | 透明 WebGL + Cannon 的 d4/d6/d8/d20、真实刚体停稳、iframe 消息桥 | ✅ 已实现 |
| 本地 mesh 资产 | d6 与 d20 的高精细外观；标准凸包仍负责物理 | ✅ 已接入 |

## 3. 摆成数据的规则面

| 数据 | 内容 | 固定解释器 |
|---|---|---|
| `DiceRollConfig` | 每颗骰子的 sides（4/6/8/20）、可选预定值、最大骰数、交互模式 | `external-game-session` + `t2-dice-roll` |
| `DiceRollInput` | 1–3 颗骰子的 `sides`、可选 `modifier`、标准 `difficulty` 阈值或完整的 `judgement.bands`、展示字段与 `backdrop` | `dice-overlay` |
| `PhysicalDiceInput` | 骰池规格与判定/窗体皮肤数据；拒绝调用方指定 seed 或结果 | `three-dice-overlay` |
| `ThreeDiceOverlay` | idle / rolling / settled 生命周期与透明 WebGL 演出 | `three-dice-overlay` |
| `DiceRollResult` | requestId、逐颗 `{sides,value}`、raw `total`、`modifier`、`finalTotal`、`outcome`、随机来源 | `external-game-session` |

## 4. 游戏层代码例外

| 例外 | 裁决 |
|---|---|
| 随机、跨平台通信、Canvas、自由 DOM、结果计算 | ❌ 一律不准；由上述通用宿主能力解释 |
| 游戏目录内内容 | 仅 manifest / 蓝图数据、资产 key、验收剧本与结果合同样例 |

## 4.5 美术接入

- 主体：d6 使用授权原型 STL，d20 使用逐面核对过 1–20 凹刻数字的 `d20-numbered-v1.stl`；两者都只替换 render-only 网格，Cannon 仍用简单凸包负责碰撞和朝上面判定。d4/d8 暂用统一程序化刻面后备。
- `backdrop` 选择奥术、皇家绒幕、月夜遗迹或炼狱熔炉。四套主画框与四套修正卡均为已登记的 AI 生成透明 PNG，并按背景成对切换。资产内不烘焙文字或骰子，由 LayoutNode 根据调用数据排版；它们不是骰子下方的 3D 地台。

## 4.6 UI 呈现

- 外层 `Screen` 与 Three Canvas 保持透明；标题位于不规则画框上方，画框内依次是难度、独立骰子画布与“点击骰子”文本框，修正卡片单独放在下方。文字不覆盖 Three Canvas，因此飞起的骰子不会被标题层遮挡。
- 抛出前后保持同一镜头 FOV，以物理高度围栏防止骰子越出 WebGL 画布；停稳后演出原始值、修正算式、最终值与判定结果，再回传宿主。
- 多骰长时间叠压不休眠时，先用一次轻量分离恢复物理收敛，再以 7 秒硬超时作为最后结算保障。
- 开发模式可用 `diceDebug=1` 显示 LayoutNode 调试面板，所有参数变更同步到 URL；生产导出不含该面板。
- 弹跳、转动、阴影和刻面全部是 `dice-overlay` 的通用 render-only 表现；悬浮窗也由通用 LayoutNode 组件描述，不新建游戏专属 DOM UI。

## 4.7 代码准入阶梯

| 规则 | 落级 | 说明 |
|---|---|---|
| 骰子数量与面数 | L0 纯数据 | `DiceRollConfig` |
| 权威点数 | L2 物理表现能力 | Cannon 刚体停稳后的朝上面 |
| 初始冲量熵 / 回传 | L2 通用宿主能力 | `external-game-session` |
| 多面骰视觉与落定 | L2 通用宿主能力 | `three-dice-overlay` |

## 5. 确定性声明

- Web Crypto 的初始熵只用于初速度和角速度；调用方不允许预定 seed 或结果。
- Cannon 刚体停稳时的最大 world-Y 面法线才是权威骰面；结果与回传均在这一刻生成。
- `outcome` 由调用方的 `judgement.bands` 在 `total + modifier` 上匹配；未传区间时改用 `finalTotal >= difficulty` 的标准阈值模式。不存在天然 1 / 20 特权。
- 拖拽、光照、阴影、窗体皮肤与大号结果字均不改变物理结算。

## 6. 评审记录

- 提交人 / 日期：Codex / 2026-09-21
- Owner 裁决：✅ 路线 A（通用能力下沉）
- 当前实现：✅ `game-dice` 卡带、透明 Canvas、DokiWorld SDK 合同、d6/d20 本地高精细网格与四套成对 UI 皮肤均已落地；`REQ-3D-POLY-DIE` 仅保留给 d4/d8 的未来通用增强。
