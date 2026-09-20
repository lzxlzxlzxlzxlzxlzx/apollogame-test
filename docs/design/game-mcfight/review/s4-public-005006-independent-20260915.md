# REQ-MCFIGHT-005 / 006 限定公共能力独立复核

日期：2026-09-15。复核者：s4_drag_review。未参与本批实现，仅曾提供只读调度诊断及独立探针；本次全部运行在独立副本 `C:/Users/24652/Desktop/projects/apollpgame/mcfight-s4-independent-20260915`，没有撤销共享目录代码。

## 结论

REQ-005/006 这次 owner A 授权的公共能力范围复核通过，可据此更新对应请求的能力交付状态。不是 S4 阶段复查通过，不代 owner 签核。整批游戏、浏览器、gate 与全库风险另记。

## 实际复跑

`node node_modules/vitest/vitest.mjs run src/skills/tier2/entity-check-s4.test.ts src/skills/tier3/resolve-release-binding.test.ts src/engine/spatial/capsule.test.ts src/skills/tier2/drag-place.test.ts src/skills/tier2/drag-place-free.test.ts games/game-mcfight/s4-six-skills.test.ts games/game-mcfight/s2-closeout-audit.test.ts`

7 文件、112 项通过，实际退出 0；包含旧拖放8和新拖放12作为组合兼容回归，不重复归入005006新增数。原始日志在 [附件目录](s4-independent-20260915/)。closeout 的29系统审计无SCC、无重复；16条可选排序引用均被测试核对为全局存在。

已逐项阅读生产与用例：局部HP资格、移动圆邻域/拍初位置、无人/死亡/友军/双实例、最小距离3.999/4/4.001与失败不扣CD；放置原点与目标身份正交、单体不误中重叠邻居、承诺移动目标仍命中、固定AOE不跟目标、源死亡/硬控/非致死对照、区域清理、捕获方向传入实际Launch/capsule，及九技能真实HP变化。

## 隔离撤修

每次精确锚点命中必须为1，修改后真实运行指定测试，finally按原字节恢复；每条 before/after SHA256一致。脚本和全部日志已归档。

| 撤修点 | 锚点数 | 实际退出 | 恢复 |
|---|---:|---:|---|
| 关闭邻域数量上限拒绝 | 1 | 1 | SHA相同 |
| 去除最小距离检查 | 1 | 1 | SHA相同 |
| 去除晚释放来源资格检查 | 1 | 1 | SHA相同 |
| 去除Hitbox唯一目标过滤 | 1 | 1 | SHA相同 |
| 捕获Launch朝向改为固定朝右 | 1 | 1 | SHA相同 |
| 晚物化退回Resolve相位 | 1 | 1 | SHA相同 |

前五条由行为断言检出，第六条由真实共装调度SCC检出。未调整生产顺序强造释放边界，未删除真实读写依赖。最终源码SHA逐项见 independent-mutations.json。

## 边界

Materialize12位于Resolve10伤害/死亡/释放检查之后、Hierarchy14之前；新区域本拍生成、下一拍参与接触。统计显示含过量的有效命中请求量，非HP净扣除，口径仍需策划核对。

共享全库仍有旧组合/相位/性能失败，另见程序全库记录；这些失败不被本报告豁免。本报告只允许限定请求能力落账，不宣称全引擎或S4全绿。
