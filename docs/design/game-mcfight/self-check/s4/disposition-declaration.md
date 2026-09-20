# declaration-audit 相位与SCC处置

2026-09-15。仅测试基线施工，依据独立兼容性诊断；不是对现存新环的豁免。

## 修复前

`node node_modules/vitest/vitest.mjs run src/assembly/declaration-audit.test.ts`：2通过、2失败，退出1。原文 `disposition-declaration-before.log`。

原相位表是2026-08-16版本，未纳入已批准的S2/S4边界：拍初快照(-2)、窗口提交(-1)、真实接触至来源安全释放(10)、晚物化(12)。现在相位枚举改用 `collectSystems`，与 World 使用同一基础服务展开规则，避免审计遗漏非能力所属的快照系统。原缺失系统引用、重复ID及字面访问声明门保持不变。

## 相位变化原因

- `frame-start-transform` -2：所有普通决策读取拍初位置，碰撞读取移动后位置；基础服务按真实读依赖注入一次。
- `flow-window-commit` -1：拍初有效意图先提交，再进行索敌/Flow，来源失效不能重新开窗。
- overlap / committed-contact / trigger / hitbox / resource / mortal / hierarchy-cascade / destroy / targeted-caster 到Resolve：先真实移动后接触，伤害与硬控先结算，死亡必须拦截尚未释放的效果。
- damage-route/death-conversion 在Resolve：直接命中请求路由、资源结算与一次死亡转换共享本拍安全边界。
- over-time在Resolve且资源结算前：本拍状态/持续伤害产生及清理顺序明确，普通决策下一拍读取状态。
- self-rule在Resolve且伤害/资源之后：读取已结算资源做反应，spawn使用resolve意图；不会回到拍初普通决策。
- ground-sense在Resolve，overlap后、碰撞响应前：读取当前接触及落地前速度，Commit跳跃消费当拍Grounded。
- targeted-prefab-spawn为Materialize(12)：以当拍最后位置生成区域，下一拍碰撞；Hierarchy(14)仍可定位新挂点。不能删除其真实Shape/Transform写声明来消环。

## 棘轮更新前识别的新环

1. Resource三环：self-rule写Resource→damage-route读Resource→resource-apply（显式）→self-rule（显式）。主程已补self-rule在damage-route之后，明确反应读取结算结果。本环不应计入可接受基线。
2. 2D物理环：tile写Transform→overlap读取；overlap→collision（显式/Overlap）；collision→tile（显式）。此外tile写Velocity→ground-sense→collision→tile；tile写Transform→committed-contact→overlap→collision→tile。即使不装3D仍可能发生，已逐边提交主程裁定读取时点，不能用“全库超集”掩盖。
3. 2D与3D碰撞响应共同读写Transform/Velocity形成历史超集耦合；只有排除实际同装新环后才允许保留严格成员/组件签名。

## 状态

主程保留tile原来在collision后的时序，补齐其在committed-contact / overlap / ground-sense之后的声明；这表示tile修正位置用于下一拍检测，本拍接地读取本拍响应前速度。真实读写声明保留。测试已加入实际2D五能力组合断言，包含关键五系统唯一存在、真实扫描数量、无SCC/重复ID。

## 实际复跑与棘轮变更

SLG独占测量结束后，先运行未更新基线的守卫：新增2D五能力组合已经通过，而相位/SCC仍准确报2项红（`disposition-declaration-mid.log`）。新Resource三环已消失，只剩以下严格超集签名差异：

- p0成员从旧45系统缩小：hitbox、over-time、overlap、resource-apply、self-rule、trigger均移至Resolve；matrix-duel写ResourceModify而其消费者resource已不在p0，失去回边；string-apply也不再由旧跨结算路径拉进大SCC。p0由这些边产生的OverTime、Overlap、ResourceModify、Status、StringVar、Trigger闭环组件消失。
- p0新Tag闭环组件源于drag-place真正写入部署标记Tag，aggro/群体资格读Tag；原有位置/拖放/决策超集回路使其纳入SCC。这是已授权部署实现的诚实读写声明，不能删除Tag声明隐藏影响。
- p10仅保留六系统物理超集：3D响应写Transform→committed/overlap读Transform→2D响应读Overlap/Transform→3D响应读Transform；3D响应写Velocity→ground-sense读Velocity→2D响应（显式）；tile与3D又共同读写Transform/Velocity。新增committed/overlap/ground因此被旧2D/3D超集吸入。实际**不含3D**的五能力组合已经严格证明无环；没有把前述新2D或Resource环收入基线。
- p20两个签名（Sprite与Transform）完全不变。

逐边处理与2D组合通过后，严格更新相位及上述两条SCC成员/组件串，未使用宽松包含、忽略告警或删除缺失/重复门。最终同命令5项通过、退出0，见 `disposition-declaration-after.log`。新增2D夹具同时钉住5能力均存在、关键5系统各一次及扫描数量真实。

行为证据：主程 `disposition-shared-targeted.log` 实跑9文件147通过，包含over-time、ground-sense及platformer接地/跳跃等；本轮子任务只运行声明守卫，不运行全库。`disposition-game-regression.log` 当时仍有1失败（226通过、1跳过），不能因本棘轮绿而宣布整批游戏绿。最终游戏复跑和独立撤修仍由主程统一交接。

## 条件读取漏报增量（19:10）

稳定性诊断第一轮暴露game108回顾应加1但未及时加1。只读核查确定：event-when通过Condition helper实际读取StringVar/Timer，但系统仅声明Resource/Flag/State；旧self-rule在Update的StringVar读→Resource写间接保证string-apply先于event-when，迁至Resolve后意外保障消失。matrix-duel Update只读armed intent，不能凭猜测加Flag依赖。

主程补齐event-when及Flow真实读取。生产边逐条为：

1. 上拍Commit matrix-duel-announce写StringSet→本拍Update string-apply消费StringSet并写StringVar。
2. string-apply写StringVar→event-when通过Condition读取StringVar。event-when发Signal→Commit Effect写回顾资源，本拍可观察。
3. timer-advance写Timer→Flow/event-when读Timer；不再依赖偶然装载顺序。
4. Flow已有显式runsBefore string-apply保持：Flow读取已提交字符串快照，本拍string-apply随后落账；显式时点覆盖反向组件推断，但读声明仍完整保留。Flow写Flag/Resource→event-when仍为真实正向边。

全库超集原p0中已有event-when→timeline（Signal）、timeline与Flow等Resource/Flag回路、Flow→string-apply显式边；新增string-apply→event-when真实StringVar边使string-apply及StringVar闭环组件重新进入原大SCC。没有新增独立SCC；p10与p20签名不变。

更新前守卫准确报1红、4绿（退出1，`disposition-declaration-condition-before.log`）。先对真实游戏图独立检查：game108 master配置13系统、MCFight29系统，均SCC空/无重复，所有可选引用在全局存在（2项通过、退出0，`disposition-declaration-condition-graphs.log`）。这两个实际组合固定检查已加入守卫，真实扫描数量与collectSystems一致且大于10，不能零扫描通过。随后仅在严格p0串中恢复string-apply/StringVar两个标记，未放宽其他基线。

增量最终守卫7项通过、实际退出0，见 `disposition-declaration-condition-after.log`。本记录不替代主程最后三轮稳定性及独立复跑。
