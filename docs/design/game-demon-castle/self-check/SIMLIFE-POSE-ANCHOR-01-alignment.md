# SIMLIFE-POSE-ANCHOR-01 · 玩家脚点对齐单

对照：owner 2026-10-12 真机附图、`docs/design/game-demon-castle/playtest.md` 第 ② 步。修复前截图显示黄色格位于左上，玩家精灵脚点位于右下，约相差一个格。

| # | 玩家可见承诺 | 结论 | 证据 / 说明 |
| --- | --- | --- | --- |
| 1 | 当前格来自玩家连续脚点所属的 floor 格，不再读取陈旧离散缓存 | ✅ | `src/renderer/life-scene-render.test.ts` 唯一 sabotage 锚点撤修后精确转红，恢复后转绿 |
| 2 | 连续移动未跨边界时高亮不提前跳；到整数边界时逻辑格、interaction context 与高亮同时进入正侧格 | ✅ | `src/skills/tier2/life-continuous-motion.test.ts` 边界探针 + renderer 边界探针 |
| 3 | 玩家 PNG 的 bottom-center 与权威脚点重合；大透明图/display/fit/anchor/offset 不改变判定点 | ⚠ **待目击** | 报 owner 裁：`playtest.md` 第 ② 步与 `POSE` 分类，需修复后真机静止/跨格截图；机器 draw-plan 与两正式包探针已通过 |
| 4 | NPC/placement 以 footprint 底部中心落位，不以图片左上角作为判定点 | ⚠ **待目击** | 报 owner 裁：`playtest.md` 第 ② 步须同时出现玩家与石像鬼/月井使者；机器 descriptor 已固定 bottom-center |
| 5 | WorldUI 提示、相机目标与 interaction/proximity 消费同一脚点及派生格 | ✅ | 真实 Little Valley/Demon Castle package host/camera/activity 探针；130/130 回归 |
| 6 | 所有表现投影只读，不改变 World、snapshot 或 hash | ✅ | renderer/host 前后 snapshot 相等，responsive 三尺寸 hash 不变 |

迭代记录：第 1 轮 · 统一共享 Life pose、修高亮/WorldUI/placement anchor，补两正式包与边界探针；机器差异 0，保留 2 条 owner 真机视觉裁决。

