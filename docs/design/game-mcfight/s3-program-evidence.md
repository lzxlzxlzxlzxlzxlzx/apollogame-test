# MC Fight S3 程序交付证据

2026-09-15。施工基线仅为 [s3-skeleton-design.md](s3-skeleton-design.md) 第8节。S2三门结论保留；本文件不是S3人审签核。

## 交付范围

正式编译期入口：`http://localhost:5173/?game=game-mcfight`。启动器状态为playable，动态导入 `games/game-mcfight/game-mcfight.ts`。无manifest、无JSON代码、无S2 fixture生产依赖。

| 文件 | 责任与实际消费者 |
| --- | --- |
| `content/catalog.ts` | 冻结目录：单位/文本/商店元数据、技能模板与装配、决策候选、表现槽；引用、参数和政策校验 |
| `world.ts` | 把目录翻译为公共组件；统一安装20能力25系统；三个本方代表单位，没有敌军配军或战斗入口 |
| `session.ts` | Engine及输入队列生命周期；phase/selection读公共State；初始shop，不开放阶段迁移 |
| `render.ts` | 只读HP、位置、状态、技能阶段/CD，关联目录形成LayoutNode；不计算伤害 |
| `game-mcfight.ts` | mountHost + createRunLoop + Engine公共时钟，mountUI信号队列；卸载退订、停帧、清队列/实体/宿主 |
| `s3-skeleton.test.ts` | 7项固定回归：目录引用、两拍、真实输入链、同模板实例隔离、装配参数消费、完整组合审计、公共循环DOM点击与卸载 |
| `s3-ui-audit.ts` | 公共UI审计适配器，直接挂正式入口 |

所有上述游戏文件位于 `games/game-mcfight/`。共享修改仅 `src/launcher.tsx` 状态和 `src/launcher/game-runner.tsx` 动态导入；没有修改任何公共系统。

## 数据与能力消费对照

S2能力计划中已验证的Flow、索敌、施法、预制体、窗口、碰撞伤害和生命周期，在本骨架按需装配。S3新增的选择接线只重组已注册 `t2-keybind` 与 `t2-effect-apply`；是基线第7节的动作信号，不是新能力或S4购买机制。不改S2规格文件以免把施工事实误写为S2验收输入变更。

| 能力 | S3消费者 |
| --- | --- |
| t3-flow / t3-aggro | 三技能的GameFlow、身体Perception、目标捕获与窗口意图 |
| e1-timer / t2-event-when / t2-effect-apply | 技能独立CD、阶段事件、启动CD；选中单位State |
| t2-keybind | 三个选择按钮→InputQueue→KeyBinding→Signal→Effect→会话State |
| t3-caster / t3-prefab | 模板定义的releaseAt/targetPolicy→Caster；正式攻击模板库及三单位实例化 |
| t1-motion-apply / t2-steering / t2-launch | 拍初位置与位移；恼鬼窗口中的移动数据；骷髅弹丸Launch |
| d1-overlap-detect / t2-trigger-zone / t2-hitbox | 单位Shape和攻击模板Shape、ZONE_FLAG与Hitbox；几何/伤害从loadout唯一来源消费 |
| f1-resource / t2-mortal / k2-destroy / t1-lifetime | 实例HP、死亡、攻击模板life计时和清理 |
| t1-hierarchy-resolve / t1-hierarchy-cascade | 技能及事件子实体挂点、随来源销毁 |

商店里技能被 `mcfight.phase == battle` 门控，两个真实Tick均保持Ready/CD可用，无攻击区域。上述攻击相关系统的消费者存在于正式可实例化数据；S3不把尚未进入的战斗流程称为可玩战斗验证。

模板显式定义目标政策、源硬控掩码、动作互斥、取消不退款、阶段和窗口掩码。参数无第二套运行状态，Prefab展开后独立持有Timer/GameFlow/目标快照。决策只决定候选创建顺序，Flow解释就绪、距离、资格与动作锁；本轮三个代表单位各一技能，不外推多技能组合验收。

表现档只消费动作语义、素材缺失槽、根挂点、朝向、镜像、缩放范围；S3没有声称动作播放完成。卫道士4+僵尸4+恼鬼6仍是原14段外部缺项；骷髅4个缺失槽仅登记额外远程接口，并未替换僵尸或改写素材验收范围。

## 当前版本验证

工作目录：项目根。命令退出码由实际进程返回，不由搜索日志猜测。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| S3固定回归 | 7通过，exit0 | [s3-tests.log](self-check/s3/s3-tests.log) |
| 游戏及相关公共/入口回归 | 39文件239通过，1昂贵规模用例按既有环境开关跳过，exit0 | [s3-regression.log](self-check/s3/s3-regression.log) |
| 类型检查 | exit0，无类型错误 | [s3-types.log](self-check/s3/s3-types.log) |
| 构建 | exit0，保留大分块提示 | [s3-build.log](self-check/s3/s3-build.log) |
| 20能力25系统审计 | exit0，无环、无重复、全局无悬空引用 | [s3-audit.log](self-check/s3/s3-audit.log) |
| LayoutNode校验 | 全树0 issue，固定回归包含 | s3-tests.log |
| 实际UI审计 | exit0，重叠/对比阻断0，6处shape/fx | [s3-ui-audit.log](self-check/s3/s3-ui-audit.log) |
| S3机器门 | exit0，渲染/点击均通过；最终指纹见回执 | [s3-gate.log](self-check/s3/s3-gate.log) |

UI审计适配器的house静态扫描显示“否”，实际生产 `game-mcfight.ts` 明确传入公共 `apolloOnyx`（扫描入口只导入mount，没有复制主题）；不使用自写主题。初次自测的Button字段及测试环境错误已修正，未更改公共控件。

完整组合另有15条可选排序引用：flow→poker-eval/string-apply、zone-occupancy/group-count→flow、clickable→caster；merge-rule/merge-on-place/merge-proximity-clear/order-fulfill/group-count/tray/drag-place/grid-move→prefab-spawn；hitbox/steering→over-time。固定回归逐条证明目标系统存在于全注册表，当前内容不消费这些能力，因此不为消提示空装系统。

```powershell
node node_modules/vitest/vitest.mjs run games/game-mcfight src/skills/tier3/flow.test.ts src/skills/tier3/targeted-caster.test.ts src/skills/tier3/caster.test.ts src/skills/tier3/prefab.test.ts src/skills/tier3/review-death.test.ts src/skills/tier2/hitbox.test.ts src/skills/tier2/mortal.test.ts src/skills/tier2/steering.test.ts src/skills/tier2/collision-resolve.test.ts src/skills/tier2/anim-state.test.ts src/skills/tier1/hierarchy-resolve.test.ts src/skills/tier1/hierarchy-cascade.test.ts src/launcher.player.test.tsx src/launcher.liblaunch.test.tsx
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node node_modules/vite-node/vite-node.mjs scripts/system-graph-audit.mjs e1-timer t3-flow t3-aggro t3-caster t3-prefab t2-event-when t2-effect-apply t1-motion-apply d1-overlap-detect t2-trigger-zone t2-hitbox f1-resource t2-mortal k2-destroy t1-hierarchy-resolve t1-hierarchy-cascade t2-launch t1-lifetime t2-steering t2-keybind
$env:UI_AUDIT_CHROMIUM='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node tools/ui-audit.mjs games/game-mcfight/s3-ui-audit.ts --w 1280 --h 800
$env:RENDER_PROBE_CHROMIUM='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node scripts/game-pipeline.mjs gate game-mcfight S3
```

## 逐拍与浏览器证据

`S3_TWO_TICKS`逐拍表在s3-tests.log：Tick1/2三单位HP分别100/70/30，位置0/10/20，状态0/0/16，技能Ready，剩余CD0。选择测试通过公共输入在下一个Tick把selection由vindicator改为skeleton；未实现的buy信号不推进阶段。宿主测试实际点击DOM按钮再推进公共Engine帧，详情变为骷髅，卸载后RAF/控件归零，重开恢复shop。

机器探针产物：`public/games/game-mcfight/probe/S3-render.png`、`S3-click-gate.json`，最终运行记录绑定pipeline.json当前gameHash。点击逐项覆盖卫道士、骷髅、恼鬼，校验详情、HP/技能和选择按钮发生变化；零控制台error。最终内容指纹存回执，避免证据文档自引用hash导致循环变化。

最终机器回执：`2026-09-15T07:57:05.188Z`，gameHash `931152bfcae6107c`，exit0。此前Chrome两次报ERR_NETWORK_CHANGED导致空页；保留 `self-check/s3/s3-render-network-failure.json` 与 `s3-gate-network-failure.log`，改用公共探针已有的浏览器路径选项运行Edge后两探针均通过，未删错误断言或豁免游戏。运行产物集中到流水线明确排除的self-check目录，避免普通evidence目录写日志改变内容指纹。

最终回执已包含共享目录同时新增的S4策划文档所造成的指纹变化；本施工没有编辑或消费S4规格，未提前进入S4。9个本轮实现/测试/入口文件摘要在 `self-check/s3/source-sha256.json`，供独立复查比对，区分程序变化与并发资料变化。

## 独立交审与边界

非施工者 `s3_independent_review` 已按第8/10节及pipeline checklist完成独立复查并登记 **PASS**：独立39文件239通过/1既有规模跳过、类型和组合审计exit0，四组单锚点撤修均验红并恢复；实际操作三单位详情并留图，渲染/点击通过。详见 [独立复查报告](review/s3-independent-review-20260915.md)。登记时间2026-09-15T07:57:39.807Z，绑定最终指纹931152bfcae6107c。本轮无需要新建capability的真实表达缺口。

保留风险：真实动作素材缺失；既有规模非线性风险；S4购买/部署/战斗/结算及正式AI/平衡未实现。骷髅数据采用既有Launch最近目标发射接口，未承诺发射后追踪；三代表的战斗时序与完整玩法验收仍需S4剧本，S3两拍装载证据不能代替。S3通过需独立结论及owner人审，程序不代签。
