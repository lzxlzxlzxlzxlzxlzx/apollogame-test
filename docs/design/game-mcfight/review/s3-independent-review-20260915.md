# MC Fight S3 独立复查

日期：2026-09-15。复查人：s3_independent_review（非本批施工者）。唯一产品基线：[S3骨架设计](../s3-skeleton-design.md) 第8、10节。只复查S3，不重开S2，不签owner人审，不批准S4施工。

## 冻结与方法

独立副本：`C:/Users/24652/Desktop/projects/apollpgame/mcfight-s3-independent-20260915`。src、games、scripts及依赖文字数据单独复制，node_modules仅复用依赖；撤修只发生在副本，未撤销共享目录实现。9个S3实现/测试/入口文件SHA256逐一与共享目录及施工摘要核对一致，见副本 `frozen-source-sha256.json`。数据图片未复制，不将隔离副本当完整资产发布包。

## 独立执行结果

| 检查 | 实际结果 | 独立证据（副本根目录） |
| --- | --- | --- |
| S3及启动器 | 3文件14通过，exit0 | independent-tests.log |
| 完整相关回归，撤修恢复后执行 | 39文件239通过、1既有昂贵规模用例跳过，exit0 | independent-regression.log |
| 类型检查 | exit0，无输出错误 | independent-types.log |
| 20能力25系统组合审计 | exit0，无环、无重复；全注册表引用无悬空 | independent-audit.log |
| 独立渲染探针 | exit0，非空；console/page error均0 | independent-render.log、S3-render.json/png |
| 独立点击探针 | exit0，3控件、3次可见改变，console error0 | independent-click.log、S3-click-gate.json |
| 独立浏览器三详情 | 恼鬼→骷髅→卫道士实际点击，3张截图，console/page error0 | review-browser.mjs、independent-browser.json、independent-{vex,skeleton,vindicator}.png |

测试、类型、审计命令与[程序证据](../s3-program-evidence.md)相同，在独立副本执行。独立浏览器探针在共享原项目运行，使用现有公开旋钮 `RENDER_PROBE_CHROMIUM=C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，没有改探针阈值。三详情截图通过正式 `http://localhost:5173/?game=game-mcfight` 运行，未注入会话状态；仅点击公开data-action。肉眼检查恼鬼6槽折成两行，底部实验说明在1280×800内可见，无横纵溢出。当前截图只代表骨架，不代表动作素材完成。

构建由施工者实际执行exit0，复查读取完整结果末尾：保留超过500KB分块提示，无构建错误；本次没有把该构建声称为复查者独立执行。

告警审阅：完整回归中旧S2能力反例的self-rule，以及test-observe-origin/test-segments测试观察系统产生推断环告警；未将这些日志称为零告警或改变S2既有结论。S3正式装配自身审计无环，15条子集可选排序引用均指向全表已注册但本骨架不消费的能力，无需空装系统。

## 隔离单锚点撤修

全部通过精确文本命中计数1的守卫后修改；每组finally恢复原字节并比对SHA256；失败均为目标行为断言，不是导入/语法错误。命令及脚本见副本 `mutate-review.mjs`，机读结果 `mutation-results.json`。

| 撤修点 | 检出结果 |
| --- | --- |
| 引用校验返回空错误数组 | exit1：重复ID检测断言失败 |
| 选择Effect固定指向vindicator | exit1：选择skeleton后仍为vindicator |
| 去掉递归Object.freeze | exit1：装配参数非冻结 |
| 去掉dispose实体清理 | exit1：卸载后仍有实体 |

四组均恢复成功；随后完整239项回归通过。不将这四组外推为S4战斗时序撤修覆盖。

## S3逐项结论

| 基线要求 | 独立核对 |
| --- | --- |
| 正式动态入口 | playable动态导入，浏览器真实装载；编译期形态无需卡带manifest |
| 薄宿主与卸载 | mountHost/createRunLoop/Engine公共循环；测试真实DOM点击与卸载/重开，无第二时钟 |
| 只读目录及三代表 | 卫道士/骷髅/恼鬼由同一装配器建立；单位、装配、模板、决策、表现引用无悬空；HP/CD/阶段/目标不回写目录 |
| 能力消费 | 20能力消费关系见程序证据；无新system、无单位ID战斗分支、无S2 fixture生产依赖 |
| 可观察shop | 标题、3条目、真实详情、开发骨架提示均可见；选择通过公共信号改变State；没有购买/部署/战斗按钮 |
| 两拍与实例隔离 | Tick1/2均shop、Ready、CD可用；HP100/70/30；额外同模板实例改HP/CD/目标不串扰 |
| 字段与政策 | 模板目标/释放/窗口政策由装配消费，互斥和取消政策由校验约束到支持合同；表现字段被校验或快照/画面读取，无代码走私或伪动画声明 |
| 范围边界 | 三代表各一技能，不外推完整多技能战斗验收；素材及S4真实战斗仍有自己的后续验收 |

原14段素材仍为卫道士/僵尸/恼鬼；骷髅额外缺失槽没有替换僵尸。未发现需要公共能力扩展的S3阻断缺口。

## 机器门与复查落账

结论：S3独立复查 **PASS**。最终机器门于2026-09-15T07:57:05.188Z返回exit0，指纹 `931152bfcae6107c`；已读取同指纹渲染回执，console/page error均0，点击3控件3次变化。于07:57:39.807Z以复查人身份执行 `node scripts/game-pipeline.mjs review game-mcfight S3 --verdict PASS --note … --by s3_independent_review`，实际exit0，登记回执同指纹。

期间不同gameHash来自其他角色并发更新S4策划文档，9个S3源码摘要保持一致；独立早期浏览器回执 `134cacf71cb9fece` 不冒充最终门指纹，最终正式回执以以上记录为准。未运行signoff，owner人审仍由owner决定；S3通过不代表S4闭环完成。
