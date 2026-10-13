# Review 单 · `SIMLIFE-ENG-09` 格子世界相机投影

| | |
|---|---|
| 工单 | `SIMLIFE-ENG-09`（owner 裁决 A：下沉通用引擎能力） |
| 施工 | BDM程序 |
| 复查 | BDM策划（须独立复跑） |
| 提交 | 本会话受仓规约束未执行 Git |
| 改动面 | Life schema/compiler、Camera/camera-follow、Life renderer、Little Valley 数据与相关测试/文档 |

## 做了什么

1. `LifeGamePackage.camera` 新增严格 JSON 格单位视口与有限 follow 参数；旧包省略时保持原 20×15、margin 80、zoom `[0.25,1]`。
2. 通用 Camera 仅增加可选 follow 参数；同一个 `t2-camera-follow` 解释像素世界与格子世界，Life compiler 负责固定脚底锚点和 Bounds。
3. Life renderer 通过 `projectLifeCamera` 做唯一一次格坐标→像素转换；Little Valley 声明 28×19、margin 0、zoom 1。

## 逐条复查

| # | 核什么 | 怎么自己验 | 施工自陈 |
|---|---|---|---|
| 1 | generic 默认零回归 | 跑 `camera-follow.test.ts`，重点看 exact margin/zoom 用例 | margin=80、zoom=[.25,1] 精确钉住 |
| 2 | schema fail-closed / 旧包兼容 | 跑 `life-package.test.ts`；检查未知 callback/matrix 与非法范围 | 非法路径点名，省略 camera 合法 |
| 3 | compiler 只产数据 | 跑 `life-package-compile.test.ts` | 新包产 Camera+Bounds；旧包 Camera 逐字段不变 |
| 4 | 单次像素投影与边界 | 跑 `life-scene-render.test.ts` | interior=(450,310)；28×19 边缘投影=(2,6)..(898,614) |
| 5 | 小山谷实接 | 跑 `game-simlife.test.ts` | tick 后 zoom=1、viewport=28×19；完整矿洞路径仍通 |
| 6 | 定序/组件/游戏审计 | 运行施工单四条自证命令 | component/system/game audit 均 PASS |
| 7 | 撤修验红 | 删除 `life-demo-package.ts` 的 `camera` 行再跑游戏测试 | 1 红：实际退回 zoom=.25、viewport=20×15；恢复后 10/10 绿 |

## 请重点看

1. Life 的 `followOffsetX=.5 / followOffsetY=1` 固定脚底锚点，避免 renderer 再暗加半格；请核这是否是期望的角色锚语义。
2. 声明 camera 的包会给相机挂 Bounds；scene warp 后由既有 `life-position-sync` 同步当前 scene 尺寸，没有新增跟随 system。请核这个职责扩写是否接受。
3. 900×620 与 28×19×32 相差左右各 2px、上下各 6px；测试把它视为固定逻辑视口的框边，而非 scene 外曝光。请核这个像素口径。

## 已知未做

- 未改变通用 Camera 的单位或默认参数。
- 未改连续移动、碰撞、warp 规则、素材目录、服务、数据库或 Git。
- 全量 `tsc` 仍被既有 `game-dice`、`game-theft`/launcher 类型错误阻断；本单文件无新增 TypeScript 错误。

## 独立复查判词

- 结论：✅ PASS（BDM策划独立复跑并在 owner 已启动的 5173 页面目击）。
- 实景：地图铺满主视口；玩家移动时镜头跟随；方向键操作未滚动浏览器页面（`scrollY: 0 → 0`）。
- 机器证据：45 项指定回归全绿；撤掉 camera 声明会稳定复现 `zoom=.25 / viewport=20×15`，恢复后转绿。
