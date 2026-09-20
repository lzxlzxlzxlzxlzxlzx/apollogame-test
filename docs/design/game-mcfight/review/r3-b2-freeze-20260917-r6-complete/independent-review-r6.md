# R3-B2 r6 独立复查报告

日期：2026-09-17  
范围：`r3-b2-freeze-20260917-r6-complete/frozen-source`。未修改冻结源码、配置、测试或矩阵；撤修仅在独立临时副本 `mcfight-r3-b2-r6-review-mutations` 中进行，随后逐项恢复。

## 结论：PASS

B2 八单位的生产战斗链、撤修检出和最终门均满足独立复查清单。此结论只签核 R3-B2；不签核 B3、S3、S4、S6 或整体 R3。

## 冻结完整性

- 根入口、Vite/TypeScript 配置、R2 基线、测试、截图和 manifest 中 12 项哈希均存在且匹配。
- 冻结包未附带依赖。标准 `npm ci` 在 Electron 二进制下载时因网络超时失败；按同一 lockfile 使用 `npm ci --ignore-scripts` 成功安装 527 个包。复查所需 Vitest、TypeScript、Vite 与 Vite Node 均可运行。
- 除依赖与构建产物这一运行环境外，冻结源码未被改写。

## 复跑结果

| 检查 | 命令 | 退出码 | 结果 |
|---|---|---:|---|
| 定向 B1+B2 | `node node_modules/vitest/vitest.mjs run games/game-mcfight/r3-b1-projectile.test.ts games/game-mcfight/r3-b2-status.test.ts games/game-mcfight/r3-b2-runtime-wiring.test.ts games/game-mcfight/r3-b2-identity.test.ts games/game-mcfight/r3-b2-b3-catalog.test.ts games/game-mcfight/r3-b2-production.test.ts src/engine/spatial/cone.test.ts --maxWorkers=2 --minWorkers=2` | 0 | 7 文件、39 项通过 |
| MC Fight 全量 | `node node_modules/vitest/vitest.mjs run games/game-mcfight --maxWorkers=2 --minWorkers=2 --reporter=dot` | 0 | 47 文件、325 项通过、1 项历史跳过 |
| 类型检查 | `npx tsc --noEmit` | 0 | 通过 |
| 构建 | `npm run build` | 0 | 通过；仅有 bundle 体积提示 |
| R3 审计 | `node node_modules/vite-node/vite-node.mjs scripts/mcfight-r3-audit.ts` | 0 | 4 组，全部 `cycles=0`、`unknown=0` |

## 六组撤修

每组先在临时副本变更实际生产实现或内容配置，运行关联生产测试确认验红；随后恢复原文件并复跑确认转绿。

| 组 | 撤修方式 | 验红证据 | 恢复 |
|---:|---|---|---|
| 1 | 将 cone 几何半径扩展 1 | 半径外目标 `(4.2,0)` 被错误接触，cone 边界测试失败 | 通过 |
| 2 | 关闭 cone 的 `useCapturedAim` | 喷火甲虫、寒冬狼横移锁向场景均得到 rotation=0，期望固定启动方向，失败 | 通过 |
| 3 | 将 Volley 下一发改为每 Tick | 烈焰人 2 Tick 间隔变为 1；双羽也不再同 Tick，失败 | 通过 |
| 4 | 将双羽请求改为共用实体 ID | 第二次创建同一请求实体时报重复实体错误，独立实体约束被检出 | 通过 |
| 5 | 移除来源死亡取消条件 | blaze 来源被真实接触击杀后仍生成 shotIndex 1、2，取消场景失败 | 通过 |
| 6 | 移除铜羽 `armorPiercing` | 实际 afterArmor 从 1 变为 0.696，穿甲断言失败 | 通过 |

## 规则核对

- Cone 使用唯一运行时 `radius` 字段；边界、角度外、半径外均有真实接触测试。
- 两种 cone 均为四段、10 Tick 间隔，目标真实横移后方向仍保持首次捕获的旋转。
- Blaze 三连按 0/2/4 Tick 发射，实例有独立 `castId`、`shotIndex` 和 seed；铜羽同 Tick 生成两枚独立实体。
- 来源硬控、来源死亡、目标首弹死亡均会取消未发射余弹；已发射投射物维持独立清理。
- 三个状态投射物、凋零骷髅、两种 cone 和铜羽的身份场景均在定向及全量复跑中通过。

S3/S4 因本批源码已改变，未在本报告中继承历史门结论，仍需按各自阶段流程复核。

