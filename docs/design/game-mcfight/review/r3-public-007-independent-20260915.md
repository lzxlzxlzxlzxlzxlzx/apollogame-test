# REQ-MCFIGHT-007 护甲接口独立复核

日期：2026-09-15 23:13。结论：**PASS，仅限本次公共护甲接口与实际统计回执**。不等同铜羽泽鹗身份、全量单位或整个 R3 通过。

复查者为未施工本接口的独立能力边界 agent。依据 R3 策划第一批已确认公式、真伤和穿甲合同，独立核对代码、运行测试、隔离撤修并恢复。未修改共享源码和测试。

## 冻结与隔离

使用隔离副本 `C:/Users/24652/Desktop/projects/apollpgame/mcfight-r3-public-008009-independent-20260915`。复跑前确认以下四文件与共享最新版本 SHA-256 一致，无需重新复制：

| 文件 | SHA-256 |
|---|---|
| src/skills/tier2/armor-mitigation.ts | 87707cae727d3e34f943f69dd9bb24b1a8a6a1e6669ea19658f0cb56a282095b |
| src/skills/tier2/damage-routing.ts | 1d4fc18ee26cc1285abc8ed43e00554b68686c054164dea93f09b857e4bcf497 |
| src/skills/tier2/armor-mitigation.test.ts | c455a9e9c233fea543525f4f1293825bfbe453a0174dfc770c16d3a9490a46fc |
| games/game-mcfight/s4-statistics.test.ts | 50891dba0b8fad6cdff805f6183cc21d46eeb6923752d11597841b32e80759b2 |

## 正向验证

```text
node node_modules/vitest/vitest.mjs run src/skills/tier2/armor-mitigation.test.ts games/game-mcfight/s4-statistics.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

首次与撤修恢复后均为 **2 文件、14 项通过、退出码 0**：公式及真实碰撞 11 项，S4实际统计 3 项。完整日志在隔离副本 `evidence/007-baseline.log`、`evidence/007-restored.log`。未出现调度环或 worker 警告。

已核对：

- 使用 `g=min(20,max(armor/5,armor-4*damage/(toughness+8)))`，结果 `damage*(1-g/25)`。覆盖无甲、护甲、韧性、大伤害及上限。
- 真伤和穿甲均将使用的护甲/韧性归零；穿甲保留原伤害类别。非护甲部位倍率仍生效。
- 真实 Shape/Overlap/Trigger/Hitbox 生成请求，观察护甲后量及实际HP回执，无接触注入。
- 过量伤害只计实际扣血；治疗不受护甲公式减损，实际恢复与过量治疗分别钳制；S4伤害和治疗分别统计。
- 测试断言区域销毁且次拍不再次结算。

## 隔离撤修

脚本 `review-007-mutations.mjs`，每组锚点恰好命中 1 次。每次仅修改隔离文件，运行相同14项测试，最后 finally 恢复原始字节并核对 SHA。

| 撤修 | 要证明的检出能力 | 结果 |
|---|---|---|
| 普通护甲返回原始伤害 | 公式与真实碰撞数值不能被跳过 | 退出1，实际数值 AssertionError |
| 删除真伤绕过条件 | 真伤不能意外吃护甲 | 退出1，预期10实际3的数值断言失败 |
| 删除穿甲绕过条件 | 穿甲不能意外吃护甲 | 退出1，预期10实际3的数值断言失败 |

所有组恢复 SHA 一致，恢复后14项再次全绿。日志 `evidence/007-mutation-*.log`，汇总 `evidence/007-mutations.json`。验红不依赖导入、编译或 worker 错误。

本次未扩展到单位身份、所有减伤叠加策略、整库测试、浏览器或性能；完整交付仍以主程后续统一证据和对应独立验收为准，不代 owner 签核。
