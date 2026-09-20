# S4 公共改动的全库回归对照

2026-09-15。本记录不豁免失败，不更新冻结断言，不把局部通过写为全库通过。

## 当前完整运行

`node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1`

实际退出 **1**；544 个文件，529 通过 / 15 失败；4982 个测试通过、21 失败、1 跳过。日志 `shared-regression.log`。运行时仍有其他装配工作，不能作为最终 S4 冻结版本回归。

## 修复前对照

将原 S3 独立冻结目录复制到 `C:/Users/24652/Desktop/projects/apollpgame/mcfight-s4-baseline-20260915`，保留其源码，使用依赖目录联接；没有撤销或覆盖共享目录修复，也没有修改原复查冻结目录。

先单独复跑 grid-move 与 pull-anchor：31 通过、2 失败，退出 1。随后从当前日志提取全部 15 个失败文件，在该副本复跑：182 通过、21 失败，退出 1。全部 21 个失败名称一致，见 `old-baseline-probes.log`、`old-baseline-all-failures.log`、`baseline-comparison.json`。这证明这些失败在拖放扩展前已经存在；性能测试受机器负载影响，复现失败不构成稳定性能基准。

失败分布：

| 分类 | 数量 | 文件 |
| --- | ---: | --- |
| 生成组件全集与清单漂移 | 3 | build-component-map、component-manifest-guard |
| 原定序断言和全库相位/SCC基线 | 6 | cycle-tiebreak、declaration-audit |
| 既有游戏组合 | 3 | game-103、game-i/ai-lab |
| 规模测试 | 1 | game211/slg-scale.bench |
| 移动/寻路/伤害能力旧组合 | 8 | boomerang-compose、flow-field、grid-move、path-follow、platformer.integration、pull-anchor、navmesh-bake、resource |

没有为了消除红灯而改断言、刷新基线或忽略告警。后续公共兼容性修复必须分别确认读取相位合同，不能把此对照当作豁免最终全绿要求。

## 系统图差异

当前与 S3 源码的全 90 系统图均为 4 个 SCC，成员集合没有新增；图不完全相同：本次 drag-place 真实写部署 Tag，声明补齐后，既有 Update 大 SCC 的 `viaComponents` 新增 `Tag`。该差异是公开的真实依赖，不删除声明隐藏它。原图与现图分别保存为 `all-systems-baseline.json`、`all-systems-current.json`。

MC Fight 的实际 S3 战斗 + 新拖放 27 系统组合无 SCC、无重复 ID，已被独立复跑。尚不能用该组合替代后续 S4 新战斗完整装配的最终审计。


## A 路线最终整库运行（2026-09-15）

`node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1`：551文件538通过/13失败；5103测试通过、18失败、1跳过，并有1个worker意外退出。总退出1、533.50秒。完整原始日志full-regression-final.log，不能写全库绿。

其中16项是原冻结版本已有失败（旧游戏共装环、相位基线、PUI ai-lab未安装快照provider、规模测试）；已修复原grid-move测试的显式provider和motion系统数组兼容，原navmesh行为回归恢复。build-component-map按当前组件重新生成并通过。

另两项已定点处理并复跑16测试通过：

- Shape创作选项测试原仅认box/circle，按获批capsule接口更新为box/circle/polygon/capsule；默认box断言保留，真实capsule几何/扣血另有正向与撤修证据。
- component-manifest的Windows CLI入口用字符串拼file://，原命令退出0却未执行更新。修成pathToFileURL(resolve(argv))后实际更新154组件，再跑清单守卫及生成物检查通过。不是删除漂移断言。

整库本次存在worker异常，不将定点转绿换算为一次完整全绿。其余16项未改断言、未忽略告警；PUI专属game-i装配交该域处理。具体调用方与修复建议见independent-compatibility-diagnosis.md。这些全库风险保留供主程/独立复查，不扩大为MC Fight的失败，也不被S4通过自动豁免。
