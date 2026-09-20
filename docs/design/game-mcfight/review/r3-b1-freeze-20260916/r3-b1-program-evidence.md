# R3-B1 标准直线投射物施工证据

状态：程序验证完成，待独立复查；不代表 R3 全量通过。

本批只启用 `pillager`、`skeleton`、`twilightforest_death_tome`、`twilightforest_slime_beetle`。四个单位均通过统一 SK05 数据适配：伤害读取 effective `attack`，CD 读取 `attackInterval`，资格射程为 `attackRange / 24`，直线速度为 `280/24` 世界单位/秒（按 20 Tick 换算），最大行程为含目标半径资格的射程乘 1.15。未引入单位 ID 战斗分支。

公共链路已接通：Flow 捕获目标、方向、来源 Tag 快照和最大行程；Caster 以快照产生投射物；Prefab 展开 `ProjectileFlight`；Launch 只设置一次速度；motion 后由 ProjectileFlight 按实际 Transform 累计行程；overlap/trigger/hitbox 使用真实接触结算。投射物使用 `singleImpact`，命中后区域清理；来源死亡不影响已发射弹的来源归属，死亡/硬控仍阻止尚未发射的技能。

`games/game-mcfight/r3-b1-projectile.test.ts` 当前包含 13 项：四单位内容对应；真实生成、位置变化、Shape 接触、实际扣血、每颗弹单次命中和清理；四单位发射前硬控取消；四单位双实例三轮确定性。既有 R3 身份回归仍保留。

边界证据映射：

- 发射前硬控/死亡取消：`pre-launch hard-control cancellation` 参数化场景；死亡取消仍由既有 R3 生命周期回归覆盖。
- 发射后来源死亡与来源快照：既有 `r3-identity.test.ts` 的 source-death cleanup 回归；ProjectileFlight 使用 source/sourceTags 快照。
- 对空与友军过滤：共享 Hitbox/Tag 过滤回归和 R3 组合场景；B1 专用场景保持无状态标准弹，不扩大附带状态范围。
- 最大距离/越界清理：ProjectileFlight 累计实际位移并在 maxDistance/bounds 触发 DestroyRequest；测试断言最终无 ProjectileFlight。
- 真实飞行与单次命中：fixture 的 `flightTrace` 记录每拍位置，`projectileHits` 按实体记录命中次数；测试要求位置变化、每个弹实体恰好一次命中。

矩阵已将四个单位的 `r3IdentityTest` 更新为 `r3-b1-program-passed`；`stray`、鸡蛇、观测者和磁流灵没有在本批标记通过。

待独立复查：双实例隔离、远程对空、发射者死亡后的来源回执、硬控/死亡取消和三轮确定性轨迹的冻结副本复跑，以及组合审计与完整回归。

本次执行记录：`r3-b1-projectile.test.ts` 13/13 通过；与 `r3-identity.test.ts` 合并运行 42/42 通过；`tsc --noEmit` 退出 0；`npm run build` 退出 0；`scripts/mcfight-r3-audit.ts` 四组组合审计均 cycles=0、unknown=0。冻结副本位于 `review/r3-b1-freeze-20260916/`。S3/S4 既有门因源码变更显示 stale，按流程留待相应阶段复跑，不将本批误记为 S3/S4 通过。

门复跑：S3 gate 未通过，渲染探针尝试访问 `http://localhost:5700/?game=game-mcfight` 时连接失败；S4 walkthrough 报告 38 个文件通过、3 个文件失败、1 个跳过，待复查者读取 gate 生成的逐项日志。当前不宣称 S3/S4 门通过。浏览器复核同样因当前 in-app tab 已落到连接拒绝页，未能形成有效运行截图；已保留失败状态，不能把空白/错误页作为画面证据。
