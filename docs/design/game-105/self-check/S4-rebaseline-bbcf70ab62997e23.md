# game-105 S4 结构基准重建记录

日期：2026-09-03  
批准：owner 允许以当前 S4 内容重建基准；本记录不构成 bless。

## 受控来源

- S4 内容指纹：`bbcf70ab62997e23`
- 范围清单：[S4-scope-bbcf70ab62997e23.json](S4-scope-bbcf70ab62997e23.json)
- 范围摘要：`04471332dcb80c44`，共 30 个固定文件。
- 本地不可变来源提交：`6184801819ad111f74bcd5856f6a169bc1f83e28`
- 本地引用：`baseline/game-105-s4-bbcf70ab62997e23`

该提交使用独立临时 Git index 从范围清单生成；没有修改当前分支或正常暂存区。独立复查者可对
清单执行 `node scripts/game-105-s4-scope-manifest.mjs --check`，并用该引用核对每个受控文件。

## 结构候选

- LayoutNode 四态快照：[S4-structure-bbcf70ab62997e23.json](S4-structure-bbcf70ab62997e23.json)
- 状态：`opening`、`player-interaction`、`aftershock`、`player-wrap`
- 截图候选：[s4-structure-bbcf70ab62997e23.png](D:/Users/1010709/Desktop/projects/ApolloGame-workspace/public/games/game-105/golden/s4-structure-bbcf70ab62997e23.png)
- 截图 SHA-256：`7b30a7249a59698f7b91e8d0ee2803792b050fe9dc9469ac35931fac73daa6e4`
- 固定视口：`1280x800`；连续两次采集一致；已由 owner 于 `2026-09-03T06:32:58.790Z` 签核为 `blessed`。

结构快照只包含节点 ID、父子关系、顺序、可见性、锚点、尺寸、动作和参数；不比较颜色、字体、纹样、阴影或动效。

## 下一步

1. 独立复查已核对来源提交、范围清单和四态结构快照，并通过结构守卫。
2. owner 已执行 `golden-shot bless` 冻结本 S4 结构合同。
3. 当前 S5 皮肤基准独立保存并定向像素比对；S5 像素不与 S4 零差异比较。
