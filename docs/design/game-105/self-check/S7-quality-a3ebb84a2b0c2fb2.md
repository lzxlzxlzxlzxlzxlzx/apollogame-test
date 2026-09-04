# game-105 S7 Current-Hash Quality Evidence

日期：2026-09-03  
内容指纹：`a3ebb84a2b0c2fb2`

本记录只提交当前版本的程序证据，评分卡仍由独立复查人裁决。

## Narrow-Screen Usability

- 真实路径：在 `1280x800` 通过 canvas 真实抽取进入互动卡，再缩放同一会话至 `800x450`；没有注入会话状态。
- 证据：[S7-a3ebb84a2b0c2fb2-usability.json](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-a3ebb84a2b0c2fb2-usability.json) 与 [narrow player card](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-a3ebb84a2b0c2fb2-narrow-player-card.png)。
- 输入框实测 `40px` 高；快捷按钮 `40px`；提交、换卡和跳过按钮均约 `51px` 高，全部在 `800x450` 视口内。
- 修复仅限 [game-105-s5.css](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/games/game-105/game-105-s5.css)：移除互动卡的二次 `scale(.69)`，并把收尾卡输入/按钮纳入同一触控补偿；未改 LayoutNode、动作或玩法。

## Visible Feedback

- 悬停：[hover](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-a3ebb84a2b0c2fb2-hover.png)；真实 canvas cursor 解析为已登记的 `hover-ring.svg`。
- 心动：[heart](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-a3ebb84a2b0c2fb2-heart.png)；真实互动后账本包含 `heart-spark.svg`，`apollo-pop` 动效已激活。
- 倒塌：[collapse](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-a3ebb84a2b0c2fb2-collapse.png)；真实拖拽触发收尾卡，短暂 `g105-collapse-settle` 余晖的动画名和金色阴影均由浏览器读取确认。
- 汇总：[S7-a3ebb84a2b0c2fb2-vfx.json](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-a3ebb84a2b0c2fb2-vfx.json)，零 console error。三项均不显示风险预测、成功率或脚本化物理结果。

## Performance And Regression

- [S7-a3ebb84a2b0c2fb2-perf.json](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/probe/S7-a3ebb84a2b0c2fb2-perf.json)：真实 Chromium `240` 帧，median `16.7ms`、p95 `16.9ms`、max `17ms`、DOM `64`、零错误。
- `npx tsc --noEmit` passed.
- `npx vitest run games/game-105 --silent` passed: `9` files, `42/42` tests, including art `2/2` and frozen structure `4/4`.

## Scope Note

本轮视觉 CSS 修复改变了游戏内容指纹，因此此前 S3--S5 的记录按阶段指纹自然过期。S7 当前证据完整，但在重新评分之前，S5 需要按当前指纹重采标准照、重跑门禁并交独立复查；不可将旧 `bbcf` 的 S5 签核冒充为当前 `a3ebb` 的签核。
