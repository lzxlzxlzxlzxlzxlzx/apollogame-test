# S4 CONCERNS 修复后独立复查准备清单

2026-09-15，s4_drag_review。当前仅只读检查；主程在受控串行三轮全库运行，未启动测试、浏览器、构建或大目录复制。本单是准备，不能当通过证据。

## 已阅读的修复事实

- damage-route给每份生产DamageRequest先置appliedAmount=0，再以before-current写已结算回执；正值实际扣除、负值实际恢复，请求实体随后清理。Observer只在onSystemStart保留本系统输入引用，在onSystemEnd读取回执再清空引用，不重新计算HP或命中。相同Tick伤害/治疗分别累计。
- World.ensureSorted与图审计共用withSnapshotProvider；仅有真实FrameStartTransform读取者时补一次，显式provider和重复声明不被隐藏。motion-only无快照成本；原systems[0]仍motion。
- Steering邻居引用缓存为单次execute局部变量，不跨Tick/World；只缓存只读位置/标签/存在性，未缓存结果或目标。
- SelfRule移Resolve，读取伤害后状态、写独立self-spawn载体供Materialize，同拍死亡不会把已经发出的载体连带清掉。OverTime在Resolve产资源请求；GroundSense在overlap后、collision前观察接地。必须复核这些真实时序而非只看图无环。

## 待主程释放资源后执行

1. 同步最终变更到独立副本，记录源码/四GD剧本SHA，不覆盖历史失败日志。核对统计新协议、会话、UI、adapter同口径。
2. 定点复跑16旧失败所属文件（规模仅独立空闲时测，不与全库/浏览器争资源）；逐项更新s4-shared-failure-scope，不隔离任何失败。
3. 复跑snapshot-provider、SelfRule、OverTime、GroundSense/平台、steering与旧引擎相位守卫，核对真实读写与自动provider后审计计数一致。
4. 复跑MCFight全目录、statistics、005006及原死亡/前摇承诺；新伤害测试至少普通12、余血7遭5+12仅统计7、同拍伤害12+恢复22分别计数，过量治疗不计入。
5. 新撤修（隔离、anchor=1、日志exit1、原字节SHA恢复）：appliedAmount改为原请求amount；移除治疗分账；关闭自动snapshot provider；SelfRule退回Update（真实组合审计应红）；必要时关闭单次邻居缓存由性能/结构计数证据检测。不得因机器噪声声称性能撤修可靠。
6. S3骨架当前源码相关回归与S3 gate核对；独立checklist后更新S3 review，不代owner signoff。
7. S4最终types/build/31或更新后实际系统联合audit/四原GDacceptance/正式隔离浏览器旅程；画面必须显示实际伤害及实际治疗，不能仍写含过量。部署出售、拖拽禁售及标签显示保留。
8. 查三轮全库原始日志：逐轮测试/文件/退出码/worker错误；三次无异常只能写“此次未复现”，保留原worker退出证据，不能改写为历史不存在。
9. 查最后S4 gate及源码hash；按真实剩余项将S4更新PASS或精确退回，owner人门保持未代签。历史CONCERNS/旧统计截图/旧全库失败全部保留，以追加结论说明已修复。

## 范围护栏

没有因测试属于其他游戏而隔离共享前因；本次选择修复全部16项。新规则来自策划s4-review-disposition，不新增84单位或S5素材任务。旧005006六组及GD三组撤修无需无差别重跑，仅新增修改影响到相应路径时增量复核。
