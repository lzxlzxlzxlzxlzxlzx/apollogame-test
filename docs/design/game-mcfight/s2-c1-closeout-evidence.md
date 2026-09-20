# C1 双技能取消与移动挂点交付（2026-09-15）

依据 s2-closeout-plan.md；未采用素材缩减提案，B/V02原通过结论保留。本批完成C1程序自证，待独立复核。

## 数据装配

沿用 unitTemplate 的两技能、独立Timer、共享动作State。增加宿主hp/Status/Mortal，以宿主作为捕获sourceId与执行资格来源；目标身份仍分别保存在每个技能Flow里。宿主的公共最近目标选择由Perception产生，近战与远程启动仍分别检查距离/资格。此样例不是不同技能各自采用任意独立索敌算法的证明。

两技能Transform通过既有Hierarchy本地零偏移跟随宿主；hierarchy-resolve在PostResolve完成本拍显示位置，下一拍FrameStartTransform用于决策。效果在锁定目标处生成，PrefabOrigin.source指向宿主，不指向已脱离的技能实体。

Ready检查宿主存活且未硬控；Windup在后续决策发现硬控时进入Recovery、清目标，恢复后释放共享动作锁。释放检查同时读取宿主资格，防止本拍Hitbox硬控/死亡后仍生成攻击。已有启动Timer不重置、不退款。

死亡时宿主和全部技能/事件挂件由Hierarchy级联清理。发现并修复旧问题：hierarchy-cascade默认Update在Resolve死亡前运行，留下6个孤儿；现置于Resolve、mortal/hitbox之后、destroy-apply之前，读写声明保留。Commit产生的销毁请求仍在下一拍处理，不承诺倒序处理。

## 用例与结果

s2-c1.test.ts 共5项：近/远两种距离下生产控制区取消；近/远两种距离下生产伤害致死；移动宿主的两个技能挂点与来源。测试仅初始化、推进与观测。

- Tick1成功启动CD8/19；Tick2生产硬控；Tick3 Recovery、清锁定、CD6/17；后续推进到Tick12动作Free、只启动1次、目标HP2000。
- 死亡对照确认Tick1已启动CD，之后所有unit#0挂件消失、目标不多扣血。死亡实体Timer随实体销毁，不能把“组件消失”说成退款。
- 移动宿主每拍x增加0.5，两技能世界x同拍一致；Tick3区域来源为unit#0:body；Tick4目标HP1993。逐拍记录见 evidence/c1-20260915.log。
- 原V02七项含无硬控正常三轮持续通过；新增C1五项通过。相关25文件169项exit0，最终类型检查exit0。

尚未覆盖：非零旋转挂点、真实武器素材、所有多技能选择策略；这些不混入C1已测范围。Hierarchy当前本地偏移不随父旋转，不能声称支持八方向挂点。

## 复查交接

复跑：node node_modules/vitest/vitest.mjs run games/game-mcfight/s2-c1.test.ts games/game-mcfight/s2-multiskill.test.ts src/skills/tier1/hierarchy-cascade.test.ts src/skills/tier1/hierarchy-resolve.test.ts --silent（24项exit0）。

重点撤修：隔离撤去hierarchy-cascade的Resolve时序，两个死亡用例应发现残留挂件；隔离移除宿主资格/源检查，控制用例应检出伤害或重启；不在共享目录撤修。原独立复查者额度不可用，尚未执行这批独立复核，不能记通过或关闭请求。

## 对齐其他包的具体差额

C2：现为临时两姿态/只读HP差反馈；真实卫道士动作、挂点像素、实际运行画面仍缺，原两挥砍+俯冲要求保留。
C3：7项有限几何证据；无路目前回退直奔并由墙挡停，不是正式不可达策略。
C4：旧样例伤害3且友伤为开/关，缺新合同伤害4、倍率0/0.5、段间生产移动进出、打断后终止；不得直接沿用2项通过宣布完成。
C5：旧样例双跑60拍及16/64/128测量；尚需三跑、20/50/100各1000拍、环境与实体残留。
C6：待交逐项能力证据映射，未凭定点伤害区证明弹丸。
