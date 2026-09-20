# R2 内容装配独立复查

日期：2026-09-15。复查人：独立复查代理，未参与被审源码施工。

**结论：PASS，限 `r2-program-work-order.md` 的内容装配与校验范围。** 84 单位实战、最终平衡及动作素材绑定没有获得通过；它们仍属于 R3/R4/S6。历史 S2 静态 UI 审计红项单独确认隔离，不声称所有工具全绿，不签署任何流程阶段。

## 冻结与隔离

- 独立工作目录：`C:/Users/24652/Desktop/projects/apollpgame/mcfight-r2-independent-20260915`。
- 源码、测试、内容及脚本复制到独立目录；`node_modules` 仅作为依赖目录链接。此次未做美术观察，未复制无关媒体、未修改共享源码。
- 内容摘要独立复算为 `702039a635181a88036d0d9f731924029d2c9427129570cf03727491c2e14544`，与交付一致。
- 撤修后比较 893 个源/脚本/游戏内容文件，独立副本与共享目录 SHA 差异为空。[范围与源码比较](r2-independent-20260915/scope.json)

## 独立执行结果

所有命令在独立目录运行；各退出码由实际进程取得。

| 检查 | 命令 | 结果 |
|---|---|---|
| R2 内容校验 | `node node_modules/vite-node/vite-node.mjs scripts/mcfight-r2-check.ts` | 退出 0；84 卡/单位/决策/表现/来源一一对应，186 装配、6 隐藏单位；摘要一致 |
| 首轮 R2、S3、S4 相关测试 | `vitest run`，点名 `r2-content`、`s3-skeleton` 和 7 个 `s4-*` 测试，单 worker、关闭文件并行 | 9 文件、111 项通过，退出 0；其中新增 R2 13 项 |
| 撤修恢复后的完整游戏回归 | `node node_modules/vitest/vitest.mjs run games/game-mcfight --maxWorkers=1 --minWorkers=1 --no-file-parallelism` | 33 文件、216 通过、1 历史跳过，退出 0；40.00 秒 |
| 类型检查 | `node node_modules/typescript/bin/tsc --noEmit` | 退出 0 |
| 构建 | `node node_modules/vite/bin/vite.js build` | 退出 0；18.76 秒；保留大于 500 kB 的 chunk 提示 |
| 组合审计 | `node node_modules/vite-node/vite-node.mjs scripts/mcfight-r2-audit.ts` | 退出 0；实际 31 系统、33 个候选机制族组合，无 SCC、重复或未知排序引用 |
| 原 GD 验收 | 设置 `ZEROCRAFT_ACCEPTANCE_CLI=1` 后运行 `node node_modules/vite-node/vite-node.mjs scripts/acceptance-run.mjs --game game-mcfight` | 4 份剧本、14 检查点通过，退出 0 |

完整日志：[内容校验](r2-independent-20260915/content-check.log)、[首轮相关测试](r2-independent-20260915/related-tests.log)、[恢复后游戏回归](r2-independent-20260915/restored-game-regression.log)、[类型](r2-independent-20260915/types.log)、[构建](r2-independent-20260915/build.log)、[组合审计](r2-independent-20260915/combination-audit.log)、[验收](r2-independent-20260915/acceptance.log)。没有重新运行全共享测试库；游戏目录中的历史反例探针通过不等于其描述的未完成机制被批准。

## 撤修验红

每项在隔离副本单独修改后运行现有 R2 13 项，再按原始字节恢复。每个锚点命中数必须等于 1，修改前后 SHA 必须不同，恢复 SHA 必须等于修改前值。五项均实际出现预期断言失败（退出 1，12 通过/1 失败），不是导入失败或测试无法启动。

| 撤修 | 检出的失败 |
|---|---|
| 移除运行入口的递归 `hasPendingContent(l)` 检查 | 待定目标资格进入真实选择器后没有抛错，运行拒绝测试转红 |
| 停止将同模板斜线攻击拆为独立装配 | 同输入生成结果与冻结目录不再相同，完整装配一致性测试转红 |
| 取消已确认规则字段值的校验 | 龙卷对空降级未返回 `confirmed rule` 错误，对抗用例转红 |
| 让运行投影直接导入 `legacy-source.json` | 运行来源隔离测试转红 |
| 将运行技能别名唯一性检查误改为普通 ID 唯一性 | 重复别名未返回对应错误，对抗用例转红 |

[撤修脚本](r2-independent-20260915/mutate.mjs) · [锚点/退出码/恢复 SHA](r2-independent-20260915/mutations.json)。首次“同模板”撤修因大对象差异输出触发复查脚本的 `ENOBUFS` 缓冲上限；该次不计验红成功。保留原始记录，改为直接写文件后重跑，五项得到上述真实断言结果。不是生产 worker 异常，也未修改被审测试以缩小差异。[首次工具中断记录](r2-independent-20260915/mutation-initial-buffer-interruption.json)

## 内容边界核对

- 六层已分离；正式入口的 TypeScript 解析导入闭包有 205 个文件，不含旧事实库、`legacy-source`、`adoption` 或 `s2-visual`。单位运行数值从统一目录选择，没有保留另一份 S4 六单位数值事实表。
- 177 个复原装配与 9 个历史 `s4-validated` 变体分开。复杂策略保留原文与完整候选，并明确待定，不将候选排列误称已实现复杂 AI。
- 同模板多攻击、嵌套效果、无主动攻击单位、隐藏六单位和已确认规则字段有内容及对抗断言。第一轮发现的击退遗漏、资格拒绝、别名和表现映射问题已在冻结版本修复。
- 5507 条待定采用记录可以追踪：3050 条旧数值来源路径、2457 条新版槽/缺参；未用 0、旧像素数值或默认平衡值伪装装配完成。10 条 adopted、100 条 rebuilt、0 条 normalized 与内容校验一致。
- 84 张 idle 仅身份候选，78 张攻击图仅单姿态候选，6 张缺攻击图，84 个死亡图及所有动作槽未绑定，S6 仍待完成。六类组合/设计待核对项保留，未扩展共享引擎或写单位专属战斗解释器。
- `vex` 的 R2 复原定义保持 hidden；历史 S4 已验收子集继续允许购买 vex。范围有明确记录，本次不是 84 单位正式商店上线。S4 原六单位参数及顺序对照保留，原验收剧本独立回归通过。
- S3 历史骨架改从正式目录读取身体属性，其实例隔离测试由固定 100 HP 改为捕获实例初值后验证不受第二实例修改影响，符合原隔离合同；独立 S3 7 项通过。

## 静态工具历史红项

额外执行 `node scripts/game-skill-audit.mjs game-mcfight`：当前 R2 副本与此前 S4 独立冻结目录**均退出 1**，同为 `games/game-mcfight/s2-visual.ts` 第 6、14、15、17、19、20、21 行的 7 处 `createElement`。

两份文件 SHA256 均为 `3ec5367b09f98d791c17428315a2da553225e13de7e584bfca22799bee3d99a9`。正式 `game-mcfight.ts → s4-mount` 的 205 文件闭包不消费该历史观察入口；R2 没有增加该红项，未修改审计基线或加入豁免。因此它作为既存 S2 观察入口的独立维护项保留，不阻塞本次 R2 数据装配范围通过；其自身仍未通过该静态工具。

[当前静态日志](r2-independent-20260915/static-audit-current.log) · [S4 冻结同红日志](r2-independent-20260915/static-audit-s4-frozen.log) · [导入闭包与同 SHA 证据](r2-independent-20260915/scope.json)

## 后续边界

R2 交付范围无退回项。下一阶段先由策划裁定机读待定参数、复杂选择和六类待核对组合，再按 R3 逐单位证明实际行为。不得据本报告宣称 84 单位均可运行、全部复杂机制已验收或素材绑定完成。
