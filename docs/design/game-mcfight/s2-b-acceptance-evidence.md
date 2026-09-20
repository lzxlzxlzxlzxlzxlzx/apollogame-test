# B 交付证据对照（2026-09-14）

R1/R2/R3：已修复并独立复核通过。依据：[原复查者报告](../../../../mcfight-review-20260914-contact/independent-contact-review.md)。2026-09-14 独立画面补验完成：本表范围的 B 战斗机制验收通过，无新增退回项；S2仍未完成，不代替用户阶段签核。历史失败保留于原报告与程序证据。

本轮固定副本、逐拍预期/实际、截图与操作原始记录：[独立画面验收报告](../../../../mcfight-review-20260914-contact/visual-evidence/index.md)。截图真实目录：`C:/Users/24652/Desktop/projects/apollpgame/mcfight-review-20260914-contact/visual-evidence/`。

当前近战时序：Tick1启动前摇并计CD；Tick3 Active，死亡与硬控检查后生成攻击区域；Tick4首次接触前按承诺目标定位，真实碰撞扣7血并清区。没有将Tick3生成描述为Tick3扣血。

入口：http://127.0.0.1:5173/games/game-mcfight/s2-visual.html 。从下拉框选择场景，默认暂停，单步推进。画面圆半径和位置读取Shape/Transform，目标线读取Relation；资源、窗口位、阶段、锁定目标均读世界组件。

|要求|自动证据|入口场景与观测拍|复核/具体缺项|
|---|---|---|---|
|升空前重选|s2-dive生产Flow重选；review-probes无替代不扣CD|升空前重选，Tick1→2观察目标切换|通过；[Tick1 CD0](../../../../mcfight-review-20260914-contact/visual-evidence/reselect-tick1.png)→[Tick2改锁替代目标](../../../../mcfight-review-20260914-contact/visual-evidence/reselect-tick2.png)；延后启动故Tick4生成、Tick5替代目标23，原目标30|
|前摇后升空及移动仍命中|rereview-boundaries移动承诺；s2-dive|前摇后升空与移动，Tick3区域→4 HP23|通过；[Tick3升空仍锁定并生成](../../../../mcfight-review-20260914-contact/visual-evidence/moving-tick3.png)→[Tick4 HP23区域0](../../../../mcfight-review-20260914-contact/visual-evidence/moving-tick4.png)，Tick6未重复扣血|
|Active当拍生成|s2-round2双单位三轮|正常近战对照，Tick3区域→4清区|通过；[Tick3 Active区域1](../../../../mcfight-review-20260914-contact/visual-evidence/normal-tick3.png)→[Tick4 HP23区域0](../../../../mcfight-review-20260914-contact/visual-evidence/normal-tick4.png)|
|释放拍硬控|rereview-boundaries释放拍控制区|释放拍硬控，Tick3控制32，无区域，Tick6 HP30|通过；[Tick3硬控/CD1/区域0](../../../../mcfight-review-20260914-contact/visual-evidence/control-tick3.png)→[Tick4 Recovery](../../../../mcfight-review-20260914-contact/visual-evidence/control-tick4.png)；Tick6 HP30无补发|
|死亡阻止释放|review-death；新页面夹具测试|释放拍死亡，Tick3来源消失，Tick6 HP30|通过；[Tick3来源消失](../../../../mcfight-review-20260914-contact/visual-evidence/death-tick3.png)、[Tick6仍HP30](../../../../mcfight-review-20260914-contact/visual-evidence/death-tick6.png)；实验cd致死资源，生产Mortal/Hitbox链|
|范围双目标各一次并清理|s2-dive区域；页面夹具测试|范围双目标清理，Tick3区域→4双方HP23|通过；[Tick3双方30区域1](../../../../mcfight-review-20260914-contact/visual-evidence/area-tick3.png)→[Tick4双方23区域0](../../../../mcfight-review-20260914-contact/visual-evidence/area-tick4.png)，Tick6仍23|
|普通俯冲/双实例|s2-dive|普通俯冲/双单位错时|通过；[俯冲Tick4 HP25清区](../../../../mcfight-review-20260914-contact/visual-evidence/dive-tick4.png)、[Tick6关窗](../../../../mcfight-review-20260914-contact/visual-evidence/dive-tick6.png)；[双实例Tick6窗口不同](../../../../mcfight-review-20260914-contact/visual-evidence/dual-tick6.png)、[Tick8均关闭](../../../../mcfight-review-20260914-contact/visual-evidence/dual-tick8.png)|

共享夹具：s2-dive.fixture.ts从原测试初始化代码直接抽取；s2-visual.fixture.ts承载页面各场景，s2-visual.fixture.test.ts对同一工厂直接验证。没有测试运行时写窗口、目标、阶段或HP。新观察场景不替代原严格回归。

本次命令：node node_modules/vitest/vitest.mjs run games/game-mcfight/s2-visual.fixture.test.ts games/game-mcfight/s2-dive.test.ts --silent。2文件17项通过，退出0。

独立补验：七类、八个场景均已实际打开；继续推进、暂停跨推进周期读数稳定、单步加1、重开恢复Tick0和初始状态全部通过，[控件原始记录](../../../../mcfight-review-20260914-contact/visual-evidence/controls.json)。在隔离副本复跑上述两测试文件，2文件17项通过、退出0，[独立日志](../../../../mcfight-review-20260914-contact/visual-evidence/fixture-tests.log)。所有截图的预期与实际及覆盖限制见独立画面报告。B本组验收通过；S2其余项仍包括真实动作素材绑定、规模/确定性等此前清单中的未覆盖项，不由B代签。
