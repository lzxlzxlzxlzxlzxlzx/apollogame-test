# MC Fight S2 阶段窗口提交时序方案

日期：2026-09-12。状态：已按策划核对修正；待主程实现和组合验证，不是阶段签核。

## 两个时点

`N` 是一个 **tick 开始边界**，不是 Flow 在 tick 中途改值的瞬间。上一拍末已提交的阶段窗口，在 N 边界同时决定该拍的可见动作与受击资格。

- 在 `N-1` 的 Flow Update，阶段转移只生成“下一边界的窗口意图”。
- 在 `N-1` 的 Commit，意图写入可快照的待提交窗口数据。
- 到 `N` 的 tick 开始，窗口数据原子成为 `Status`；此刻下降动作开始，地面资格也开始。aggro、攻击、移动、碰撞和伤害都读取该同一边界的 Status。
- 回升同理：`M-1` 产生关窗意图；`M` 边界回升完成且窗口关闭。M 起地面索敌和范围伤害都不能再选中它。

因此不存在“已经下降却仍不能受地面攻击”或“已回升完成却仍被当作地面”的额外空拍。文档中的 N/M 是可观察边界，而不是内部意图写入拍。

## 单一 tick 的执行顺序

| 顺序 | 读取的数据 | 写入的数据 | 语义 |
|---|---|---|---|
| 边界提交 | 上拍窗口意图 | 本拍 Status | 动作相位与地面/飞行资格同步开始。 |
| aggro | 本拍已提交 Status、Transform、Perception.targetCheck | Relation | 只从本拍合法目标中重选。 |
| Flow 启动检查 | 本拍 aggro Relation、冷却、阶段 | targetSnapshot、阶段/窗口意图 | 成功启动才扣 CD、锁定目标；Flow 不直接写 Status。 |
| steering / motion | Relation、Transform | Velocity、Transform | 实际移动。 |
| overlap / trigger / hitbox / resource | 本拍 Transform、Status | 接触、伤害、生命 | 范围伤害逐次按本拍资格结算。 |
| Commit | Flow 窗口意图 | 下一拍窗口数据 | 仅影响下一可观察边界。 |

这里没有“Flow 先读旧目标、aggro 后更新目标、同拍又读更新目标”的矛盾：aggro 明确在 Flow 启动检查之前执行，Flow 读取的是该拍 aggro 已写入的 Relation。窗口的可见变更已在 tick 开始边界提交，不依赖 Flow 在该拍中的直接 Status 写入。

## 单体近战承诺

若 Flow 在 N 的启动检查成功，`targetSnapshot` 在 N 写入并启动冷却。即使目标在 N+1 边界关闭窗口或离开距离，该次单体前摇仍按快照命中；执行期只检查死亡、销毁和硬控等取消条件。下一次启动重新使用 aggro 的合法 Relation。

## 实现与验收约束

实现必须把 Flow 的直接 `Status` 写路径替换为“窗口意图 → 边界提交”最小机制，并保留真实的组件读写申报。先用同一组合安装窗口提交、aggro、Flow、steering、motion、overlap、trigger、hitbox、resource，要求系统图无环；随后复跑三轮、动作锁、死亡取消、硬控、重复取消、重开隔离和真实俯冲扣血。不能借删除依赖、忽略警告或改断言实现通过。

## 2026-09-12：战斗链读取时点修正

上一版将 `motion-apply → aggro` 写成前向依赖是错误的。它同样是回边：若 aggro 等待本拍 motion 写 Transform，就违背“先索敌、后移动”。统一合同改为：

| 环节 | 读取/写入时点 |
|---|---|
| 边界提交 | 上拍窗口意图 → 本拍起始 Status |
| aggro、steering | 只读拍初 Transform 与边界已提交 Status；写 Relation / Velocity |
| motion | 读本拍 Velocity，写本拍移动后 Transform |
| overlap、trigger、hitbox | 读本拍移动后 Transform；产接触、伤害请求 |
| resource、mortal、destroy | 本拍末结算生命与死亡；拦截未发生的后续效果 |
| 伤害附加 Status | 只在下一拍边界影响普通 aggro/steering；硬控另需显式定义其打断生效点，不能静默沿用该延迟 |

实现不能让同一 Transform 同时承担拍初决策位置与移动后接触位置；需要最小快照或相位分离，使 aggro/steering 不再读取 motion 的本拍写入，overlap 仍读取新位置。`consumeOnHit` 当前只证明一个区域首个命中后销毁；它不证明范围攻击多目标。范围验证必须另建“同一攻击保留到本拍所有 Trigger 已结算、按目标去重一次”的场景。


## 2026-09-14 独立复核状态与当前时序
R1/R2/R3已修复并由原复查者隔离复核通过，依据 `mcfight-review-20260914-contact/independent-contact-review.md`。Tick3生成攻击区域，Tick4接触扣血并清理；历史失败不删除。B/S2不自动通过。新边界入口与具体证据缺项见 `s2-b-acceptance-evidence.md`。
