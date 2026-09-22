# 能力总览 Capability Plan — game-dice《掷界》

> Owner 于 2026-09-21 选择路线 A：跨平台会话与多面骰表现必须下沉为通用引擎能力；禁止在游戏层手写 Three.js、随机或跨窗口协议。

## 1. 游戏一句话

透明叠加式掷骰小游戏：玩家点击或拖拽掷出调用方指定骰池的真实 3D d4/d6/d8/d20；Cannon 物理世界在骰子停稳后读取朝上面，向宿主返回逐颗点数与总和。

## 2. 消费的引擎能力

| capability / 基座件 | 用来做什么 | 状态 |
|---|---|---|
| `w1-random` | 同 seed 的权威逐颗点数 | ✅ 已有 |
| `external-game-session` | 宿主请求、初始随机 seed、结果回传与 requestId 去重 | 🟡 已实现，待第二消费者验收 |
| `three-dice-overlay` | 透明 WebGL + Cannon 的 d4/d6/d8/d20、真实刚体停稳、iframe 消息桥 | ✅ 已实现 |
| `poly-die-3d` | 未来 WebGL 多面体视觉升级（不决定结果） | ⏳ REQ-3D-POLY-DIE，可选增强 |

## 3. 摆成数据的规则面

| 数据 | 内容 | 固定解释器 |
|---|---|---|
| `DiceRollConfig` | 每颗骰子的 sides（4/6/8/20）、可选预定值、最大骰数、交互模式 | `external-game-session` + `t2-dice-roll` |
| `DiceRollInput` | 1–3 颗骰子的 `sides`（4/6/8/20） | `dice-overlay` |
| `PhysicalDiceInput` | 仅骰池规格；拒绝调用方指定 seed 或结果 | `three-dice-overlay` |
| `ThreeDiceOverlay` | idle / rolling / settled 生命周期与透明 WebGL 演出 | `three-dice-overlay` |
| `DiceRollResult` | requestId、逐颗 `{sides,value}`、total、随机来源 | `external-game-session` |

## 4. 游戏层代码例外

| 例外 | 裁决 |
|---|---|
| 随机、跨平台通信、Canvas、自由 DOM、结果计算 | ❌ 一律不准；由上述通用宿主能力解释 |
| 游戏目录内内容 | 仅 manifest / 蓝图数据、资产 key、验收剧本与结果合同样例 |

## 4.5 美术接入

- 主体：d4/d6/d8/d20 四种骰面由 `dice-overlay` 的统一渐变、刻面与阴影绘制；Canvas 保持透明，背景属于调用方。
- 首个版本采用引擎内建卡通骰面皮肤；未来 `PolyDie3D` 只替换表现，不改规则或会话协议。

## 4.6 UI 呈现

- 透明场只保留必要的掷骰引导与无障碍 Canvas 控件；宿主页面是视觉背景。
- 弹跳、转动、阴影和刻面全部是 `dice-overlay` 的通用 render-only 表现；不新建游戏专属 DOM UI。

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
- 拖拽、光照、阴影与大号结果字均不改变物理结算。

## 6. 评审记录

- 提交人 / 日期：Codex / 2026-09-21
- Owner 裁决：✅ 路线 A（通用能力下沉）
- 当前实现：✅ `game-dice` 卡带 + 透明 Canvas + iframe 协议已落地；`REQ-3D-POLY-DIE` 保留作 WebGL 视觉增强，不阻塞可用版本。
