# S2 独立复跑与可视化检查记录

日期：2026-09-13。复查者：本策划任务（未参与被审程序实现）。结论：退回补齐，B/S2 不签通过。本轮检查当前共享工作目录；未完成隔离副本撤修验红，因此不是公共能力完整独立复查通过记录。未更改程序或能力请求状态。

## 实际复跑

- `npx vitest run games/game-mcfight/s2-dive.test.ts games/game-mcfight/s2-round2.test.ts src/skills/tier3/aggro.test.ts src/skills/tier3/flow.test.ts --silent`：4 文件、42 项通过，退出码 0。silent 不用于证明不存在运行告警；系统环另行审计。
- `npx tsc --noEmit`：退出码 1。s2-visual.ts 第 9 行两处 TS2339：querySelector 返回 Element，不能访问 onclick（单步、重开按钮）。
- 交接单指定的 10 能力组合审计：PASS，退出码 0。
- 加入实际近战测试使用的 t2-event-when、t3-caster、t3-prefab 后，13 能力、16 系统组合审计：PASS，退出码 0；无重复系统、悬空边或组合环。

审计命令：`npx vite-node scripts/system-graph-audit.mjs t3-flow t3-aggro t2-steering t1-motion-apply d1-overlap-detect t2-trigger-zone t2-hitbox f1-resource t2-mortal k2-destroy t2-event-when t3-caster t3-prefab`。

## 浏览器实测

实际打开 http://127.0.0.1:5173/games/game-mcfight/s2-visual.html 。暂停后重开至 Tick0/Ready/飞行/HP30；逐次点击单步；暂停期间观测保持不变；再次重开恢复初始血量与区域；继续后 Tick 自动增长。初始和 Tick6 截图已在复查会话中留存，尚无独立图片文件或录像工件。

| Tick | Flow 显示 | 资格显示 | HP |
|---|---|---|---|
| 0 | Ready | 飞行 | 30 |
| 1 | Dive | 飞行 | 30 |
| 2 | Dive | 飞行 | 30 |
| 3 | Dive | 地面窗口开启 | 25 |
| 4 | Rise | 地面窗口开启 | 25 |
| 5 | Rise | 地面窗口开启 | 25 |
| 6 | Rise | 飞行 | 25 |

可见圆形单位移动、区域消失、HP 减少及窗口开闭。网页区域初始 x=4，自动测试基本场景区域 x=6，因此网页 Tick3 扣血、测试 Tick4 扣血是不同布置，不是相同场景的逐拍一致证据。

## 退回项

1. **类型门禁失败**：修复按钮类型后复跑类型检查。
2. **观察信息不完全来自运行状态**：s2-visual.ts 的连线终点固定 X(6)，Tick0 没有索敌结果仍显示“当前索敌目标”。须从 Relation 读取目标，无合法目标不画线；攻击区域及单位轮廓应读取 Shape 并共享比例尺（目前单位 Shape 半径1映射应为90像素，绘制硬编码28像素）。当前画面不可用来验收攻击范围和素材一致性。
3. **边界组合覆盖不足**：s2-dive.test.ts 的前摇后升空用例直接写 Status=FLIGHT、Transform.x=30；启动前升空用例预填 Relation 并直接改 Status。它们可作为边界单测，但不能证明真实 Flow 关窗→aggro 重选/承诺命中的完整接缝。补由生产 Flow 自动关窗、生产移动产生距离变化的组合场景，复用到可视化入口。
4. **硬控证据范围有限**：现用例直接注入 HARD_CONTROL，验证下一边界关窗；没有验证伤害附加硬控与待发生攻击同拍的优先级。应明确并断言取消生效拍，不能把“之后不再受接触伤害”称为“攻击在硬控时被正确打断”。
5. **范围区域销毁缺直接断言**：两个目标最终各扣7血已验证，但范围用例没有断言区域/PrefabOrigin 已消失；补生命周期断言。当前可视化仅普通俯冲，没有这些边界场景的可观察证据。

## 收尾顺序

先修类型与观察数据绑定；补齐上述真实组合边界及区域清理断言；更新当前版本测试、组合审计与页面轨迹。再在隔离副本执行带锚点断言的撤修验红，读取非静默测试告警，完成正式独立复查。REQ-MCFIGHT-003 交接单“无运行入口”的旧文字须更新为“已有最小入口，边界画面与复查待完成”。

本轮未复查完整美术绑定、S2 全部验收项或全库共享能力回归；几何页面通过基本操作检查不等于这些项目通过。
