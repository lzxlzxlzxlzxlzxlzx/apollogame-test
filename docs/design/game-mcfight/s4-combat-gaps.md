# S4 战斗组合缺口探针

2026-09-15。程序实测；不是能力验收通过，不修改策划基线。

## 最新裁决与施工锁

2026-09-15 owner 在阅读本单及上一轮交付后明确回复“选择A”。REQ-005/006 以下限定方案（含移动邻域、最小距离、单体锁定过滤、定向光束与来源安全/释放原点正交绑定）进入施工。施工主体为本会话程序负责人，分工按文件隔离；下文“未授权”等为历史记录，不再是当前状态。不得扩大至其他机制，不修改策划 acceptance。未独立复核、未签 S4。

命令：`node node_modules/vitest/vitest.mjs run games/game-mcfight/s4-combat.test.ts`。
结果：2 项 characterization 通过，退出码 0，表示两种失败行为已复现。实际输出见 [combat-gaps.log](self-check/s4/combat-gaps.log)。

## 建议 REQ-MCFIGHT-005：移动圆邻域资格

女巫在 (10,0)，敌人在 (11,0)。给随女巫的子实体配置 Zone 的 [-3,3] 世界矩形，实际 unsafe=false；要求应为 true。

`zone-occupancy` 读取 Zone、Transform、Tag、Flag，写 Flag；Zone 只定义绝对世界矩形，算法不读取 Zone 宿主 Transform 或 Hierarchy。即使 hierarchy-resolve 已将子实体移动到女巫位置，矩形仍留在原点；方形角点也不等价于半径 3 的圆。

已检查 ConditionExpr、SelfRule、Flow EntityCheck：Condition 无邻域条件，EntityCheck 只能检查显式实体或已捕获目标，不能表达“周围无任何敌人”，特别是无目标时安全自疗仍应允许。不能用游戏代码逐拍写安全 Flag。

- A：限定扩展已有邻域资格语义（以来源实体拍初位置为圆心、半径、阵营、生命资格、数量比较），为 Flow/条件提供同拍决策读取；缺省不变。需要组合审计、近/远/无人/死亡目标/双实例测试。
- B：明确批准游戏会话维护该安全判定的架构例外，单一实现并记录时序。程序不自行采用。

同一决策资格请求还需覆盖冲锋闭区间 `range.min=4`：S4 唯一基线参数表明确为距离 ≥4。当前 EntityCheck 只有 `range.max`，反向 max=4 只能表达严格 >4；不能减 epsilon 迁就阈值。建议 A 增加可选最小距离，启动捕获原子检查 min/max；测试 3.999、4、4.001、不同位置快照及失败不扣 CD。未授权前 charge 仍列为待装配，不将后备近战计作冲锋已通过。

## 建议 REQ-MCFIGHT-006：定向光束实际几何

生产 overlap-detect 中，宽 10、高 .6、rotation=π/4 的 box，对中心线上的圆目标 (2,2)、半径 .5，实际 Overlap 数 0；要求 1。

`overlap-detect` 读取 Transform/Shape，产生 Overlap；`contactBetween/aabbOf` 的 box 明确按 AABB，不含旋转。`face-rotate` 读取 Transform/Velocity/Relation，仅写表现层 FaceDir，不能改变实际接触。

S2-C6 已通过的是手工横/纵两种静态 Shape 参数，不包含任意方向的动态瞄准光束。本记录保留原通过范围。

- A：限定补充基于源/锁定目标方向的线段或胶囊几何及宽相位包围盒，接入既有 overlap→trigger→hitbox，不在游戏编写射线扣血；必须明确源消失、目标移动与释放方向快照，并回归静态 box/circle。
- B：由策划明确改变本阶段光束的允许方向/几何合同，或批准受控游戏例外。不能静默用目标位置圆区替代激光。

两项都尚未取得新的公共扩展授权。REQ-004 的 A 仅授权自由部署，不自动覆盖这两项。

## REQ-005 追加申请：锁定目标 ID 的命中过滤（未授权）

新实测 `S4 gap: committed single-target melee also hits a second overlapping enemy`：生产卫道士锁定 a-target，T8 生成攻击区域，T9 两个重叠敌人都由 100 扣至 88；单体合同要求 b-neighbor 仍为 100。日志 [single-target-gap.log](self-check/s4/single-target-gap.log)。测试固定保留为 characterization，不把反例通过计为功能通过。

逐项检查：Caster.targetFlow 保存目标；targeted-prefab-spawn 的 CommittedContact 仅保证区域位置跟随该目标到首拍碰撞，不限制其他 Trigger。Hitbox 过滤只有阵营、目标状态、生命比例等，没有允许命中的目标 ID。PrefabOrigin.source 用于来源资源缩放/伤害路由，不携带锁定目标资格；onHit 是已经命中之后的派生生成，无法撤销错误命中。consumeOnHit 在本批 Trigger 遍历完成后销毁整区，因此也不是单目标门。

限定 A 申请：让承诺释放的数据能携带目标 ID，并由公共命中链检查“只命中该 ID”；须保留范围多目标行为不变、移动目标承诺不变，并测试两重叠敌人、友军、目标死亡、区域清理。不得通过动态修改目标 Tag 或单元私有扣血绕行。受影响的是 slash / strike 两个单体模板；当前大多数不重叠样例能命中，不代表重叠边界已满足。尚未修复，不纳入本轮已有 A 授权。

## 释放位置与来源检查的现状

quake 已明确配置以自身为圆心，potion 为目标位置区域；只有单体近战使用 targetFlow 承诺位置，不能把震地画成目标位置爆炸来借用后置 Caster。

当前合法实际顺序（见 S4_COMBAT_ORDER 日志）为：frame-start-transform → flow-window-commit → timer → aggro → launch/lifetime → steering → motion → Flow → event-when → modifier-stack/keybind → **caster → prefab-spawn** → committed-contact-position → overlap → trigger → **hitbox → resource-apply → mortal/cascade/destroy → targeted-caster → targeted-prefab-spawn** → hierarchy-resolve → stat-bind/effect-apply。

因此普通自身位置/目标位置释放发生在当拍 Hitbox 结算之前；承诺单体释放位于当拍死亡结算之后。新测试已证明硬控/来源死亡/目标死亡在前摇中由真实接触产生时，尚未释放的单体攻击取消、不退款、不补发。普通释放“先生成，后同拍致死”与“伤害已经结算但尚未释放”不是同一边界，不能引用单体测试声称两者相同。如果 S4 要求所有释放也共享 Resolve 后置来源检查，需在 005 中另明确申请将 **目标资格捕获、释放原点与来源安全检查正交配置**；不能改为目标区域假装支持自身释放，也不擅自改公共次序。

## 当前可运行子集与尚未完成的核对

`s4-world.ts` / `s4-catalog.ts` 已形成共用模板装配，六种实例的 slash、arrow、dive、strike、quake、potion 子集产生真实 HP 下降；这不是六种代表技能验收。charge、beam、heal 不静默伪造替代技能，见 `S4_COMBAT_PENDING`。

- 俯冲：当前简化 Flow 仍需对照 S2 的开窗生效边界、移动后接触、回升完成同步关窗逐拍收尾；冒烟中的伤害可能因敌方接近而发生，不能证明自身完整俯冲路径。
- 普通 `at:self` Caster 的释放位置与 `targeted-caster` 的 Resolve 后置路径不同。箭与俯冲须单独补“致死在当前碰撞结算，尚未释放”的证据；不能以已通过的目标承诺死亡测试替代。
- 地面范围攻击已经改用协议支持的 Hitbox.requireMask=GROUND，而非不存在的 rejectStatusMask。固定空/地两目标实际接触测试已通过，真实 Flow 升空边界仍需补。
- 朝向、施法中移动目标承诺及三轮完整轨迹尚需当前装配验证；本文件未关闭 B 或 S4。
- 已定位并修复阵营位冲突：trigger-zone 占 Tag bit 0（值 1），战斗玩家/敌人现在分别使用 2/4。旧 S3 展示数据中的 Tag=1 不能直接当作生产战斗玩家身份；新增三象对单近战真实敌方扣血回归，保持原验收剧本不变。

## 17:08 更新：现有能力内的生产时序收尾

前节“尚需验证”的历史状态以本节具体结果为准，原反例和历史 S2 fixture 不改。

- 俯冲改为 Prepare / Windup / Active / RisePrepare / Recovery / ClosePrepare / Ready；窗口仍通过公共 FlowWindowIntent 边界提交。新增现有 modifier-stack/stat-bind 按公开字段提交 stopRange，准备拍仍保持正常接近距离，下降生效拍才使用接触接近距离。未新增公共 capability。
- 首轮逐拍：T1 成功启动、CD=0，尚飞行且位置不变；T2 开窗并开始实际下降移动；T11 开始接触段并实际扣 14 HP；T18 开始回升且停止地面位移；T26 仅准备关窗，资格仍为地面；T27 回升完成、恢复飞行且关窗。下降 9 Tick、接触 7 Tick、回升 9 Tick。
- 双单位首轮分别 T1 / T8 启动，每只连续完成三轮；每轮只扣 14，两个目标各从 1000 至 958。只初始化位置、CD错时和静态目标，然后推进观测，没有逐拍写状态。此样例在起始距离 2.4 下验证真实接触；不是保证所有最大启动距离或移动逃离目标都命中。
- 前摇承诺复用 S2 的目标自身 Flow 关窗 + Velocity 远离模式：T1 捕获，T2 目标升空，T8 生成攻击，T9 移动后的目标扣 12，下一次重新选择替代目标。额外近战双实例三轮保留首拍启动、独立 CD 与各次实际扣血的固定逐拍断言。
- 本次共有 22 能力、27 系统，真实共装审计无环，实际顺序附在 `combat-audit.log`。新增普通技能秒数映射明确使用 `Flow.after = durationTicks - 1`，因为新阶段 onEnter 下一 Tick 将 elapsed 初始化为 0；这是正确换算，未修改 S2 历史测试。
- 仍未通过的是 005/006 申请范围、完整六种代表技能验收，以及单体重叠邻居过滤反例；不把本批新增通过扩大为 S4 通过。

### 审计证据纠错

早先调用 `analyzeSystemGraph` 错把 SystemDeclaration[] 当作 CapabilityDefinition[]，因此实际扫描 0 系统；该“无环”结果无效，不能作为证明。现改为传入 s4Capabilities，并固定断言扫描数量等于真实引擎排序数量且为 27，SCC 和 duplicateIds 均为空，15 条可选排序引用全部可在全局 registry 找到。`combat-audit-count-before.log` 保留纠正 API 后发现手数 28 不准确的失败；最终正确审计见 `combat-audit.log`。

最终相关回归命令：

`node node_modules/vitest/vitest.mjs run games/game-mcfight/s4-combat.test.ts games/game-mcfight/s2-dive.test.ts games/game-mcfight/s2-round2.test.ts games/game-mcfight/s2-multiskill.test.ts games/game-mcfight/rereview-boundaries.test.ts`

5 文件、46 项通过，实际退出码 0；其中 S4 文件 18 项包含 3 个 characterization，只有 15 项为正向验证。完整逐拍日志：[combat-regression.log](self-check/s4/combat-regression.log)。单独审计和早期局部日志不能替代此最终版本回归。

## 裁决影响与推荐

推荐两项均采用 A，但分开工单验收。005 的共享面是决策条件及拍初查询，006 的共享面是实际碰撞几何与释放朝向；均不能靠删除依赖边绕过调度审计。A 需要补协议/注册描述、生产实现、固定回归及隔离撤修，工作量高于游戏例外，但可供其他单位与项目复用。B 若选择游戏例外，仍必须走真实世界统一入口，不能在 UI 或 adapter 扣血；将留下后续迁移公共能力及重跑全链的成本。若选择调整光束规则，则必须由策划修改基线，程序不能代改。

两项暂不阻止已经授权的拖放、经济会话与其他技能施工，但会阻止“六单位代表技能全部成立”和最终 S4 交审。未申请其他新增机制。
