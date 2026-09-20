# S4 CONCERNS 收尾独立复核 — 最终 PASS

2026-09-15，复核者s4_drag_review，非施工者。唯一新增处理基线为s4-review-disposition-20260915.md。当前冻结hash `fa44cf15c26e5769`。本报告是最新结论，[此前CONCERNS报告](s4-independent-review-20260915.md)和[原16失败范围表](s4-shared-failure-scope-20260915.md)保留为历史，不再表示当前仍有16项红。

## 最终判词

**S4 独立复核 PASS**。三项CONCERNS均闭合：统计按实际HP扣除/恢复且分账；16项共享失败全部修复，没有整项隔离；三轮受控全库未复现worker异常，历史异常和主动中止证据保留。S3独立记录已以当前hash刷新PASS。已核对同hash最终S3/S4机器门均退出0；owner人门由owner本人处理，本报告不代签或自动开启后续批量装配。

## 独立复跑与撤修

隔离副本 `C:/Users/24652/Desktop/projects/apollpgame/mcfight-s4-independent-20260915`。本轮独立执行MCFight全目录及snapshot-provider、event-when-dependencies、SelfRule、OverTime、platformer、cycle-tiebreak、declaration-audit：39文件256通过、1历史规模跳过，exit0。原S3骨架7项、统计3项、三次同seed轨迹在内。

新四组撤修全部在隔离副本：

|改坏点|锚点数|真实退出|还原|
|---|---:|---:|---|
|结算实际回执改成原请求伤害|1|1|SHA一致|
|删除敌方实际治疗分账|1|1|SHA一致|
|不自动提供FrameStartTransform|1|1|SHA一致|
|SelfRule退回Update|1|1|SHA一致|

第一项检出普通/过量伤害及治疗口径错误，第二项检出治疗通道丢失，第三项检出静态索敌首拍与审计/执行不一致，第四项由真实组合调度告警检出。脚本、原始日志、SHA均在[s4-disposition-independent-20260915](s4-disposition-independent-20260915/)。原005006六组及原GD购买/奖励/清场三组撤修证据保留，未修改四份策划剧本。

## 新统计与真实画面

生产damage-route写appliedAmount：结算前HP减结算后HP，正值为实际伤害、负值为实际恢复；每份请求先清零，避免非法请求沿用旧回执。Observer仅保存本系统输入引用、在系统结束读取回执并清空，不复算伤害、不按Tick净额抵销治疗、不使用会覆盖的LastDamage累加。

独立生产测试确认：普通12只统计12；余血7遭同拍5+12只统计7；90HP同拍扣12再治疗50，最终100HP、伤害12、有效治疗22，互不抵销。

隔离端口5186正式入口、正常20Hz、真实鼠标购买/拖放/战斗/继续，六张新截图及JSON均exit0、无pageerror。最终画面实际显示失败5.95秒、伤害36/60、治疗0/0、奖励5、第二轮金币30持有0。旧显示71的过量部分已去除；此普通卫道士旅程无治疗，因此不将画面0宣称为发生正治疗，正治疗22由真实生产接触测试证明。已打开最终结果截图确认伤害、治疗及口径文字完整。

部署出售复跑exit0：6实例按钮完整、拖拽中全禁售、部署实例/待命实例均正确退款、归零禁开战、部署区标签完整。画面采用真实Shape/Transform投影，未改逻辑位置。

## 16项共享失败与三轮稳定性

主程最终正式批次为19:20:11起的`self-check/s4/disposition-final-stability`，不混此前诊断或主动中止轮。独立读取summary/results及三份原始log，并另写脚本从三份Vitest JSON逐文件提取原16失败所属11个文件：**三轮每文件全passed**，证据shared-sixteen-verification.json。没有任何一项凭“别的游戏”隔离。

每轮555文件、5139通过、0失败、1历史跳过、exit0；workerErrors=0。1328文件运行前后全新扫描SHA零差异。结论是“本次受控三轮未复现worker异常”，不是删除或否认历史异常。

共同修复经代码/测试核对：声明消费者统一自动安装一次快照；motion-only无复制成本；steering仅单execute复用只读邻居引用；SelfRule/OverTime读取本拍结算、GroundSense读取本拍接触；相位守卫按真实合同更新，保留严格SCC和同相位平局行为；game108暴露的EventWhen StringVar/Timer真实读取补申报并有反序生产者当拍信号测试。240单位性能原阈值保留并三轮通过，不以放宽阈值消红。

## 阶段门与剩余边界

当前源码S3骨架独立PASS已落账，报告s3-disposition-independent-20260915.md。程序本轮最终相关测试203通过1历史skip、类型/构建/联合审计/四GD剧本exit0；其原始日志由程序证据引用。此前独立完整类型/构建/四GD/31系统及浏览器证据保留，本轮按实际变更增量回归。

已读取 disposition-final-s3-gate.log（12:01:05.993Z）、disposition-final-s4-gate.log（12:02:10.964Z）：两者exit0、hash均fa44cf15c26e5769。disposition-final-board.log确认S3机器/复查有效，S4机器/复查有效，仅S4 owner人门待签。通用UI探针0/21能力限制仍保留，实际操作证明来自真实浏览器；不把退出0当作全部控件自动驱动成功。正式14段动作素材不是本次S4几何占位验收范围，未冒充素材合格。

当前没有剩余具体程序退回项。同hash机器门已有效，现交owner完成人门；未授权R2批量84单位施工。

