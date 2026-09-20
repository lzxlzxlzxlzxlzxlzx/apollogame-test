# R3 程序证据：首批可运行族与REQ-007～009

日期：2026-09-15。施工基线为r3-program-work-order.md与r3-planner-resolution-batch-1.md；吞噬两项补充裁定见r3-owner-decisions.md。**本文件不是整个R3完成声明。** 目前24个身份程序测试通过，60个待定；可购买的已开放20/78，另4个已测基本身份属于隐藏来源单位。没有把六个隐藏单位放入商店，尚未接通的召唤/转换来源不能据此称为完成。

## 已交付范围

- 六层目录沿用唯一事实源。84张卡均按legacyUnitIndex连接effectiveAttributes，九项基础数值投影完整；空间除24、时间保持秒、起始金币1000。七组策划缺参已写入正式adoption与loadout，但其余参数/组合未完成的单位仍拒绝进入运行目录。
- S4旧六单位30金币保留在同一单位记录的s4Attributes范围及既有S4 loadout，未另建第二份单位事实表。正式入口采用R3兼容范围，`?scope=s4`及s4-preview.html保留原演示。
- 22个基本单体近战、1个圆形范围近战、独眼巨人吞噬/重击接入公共Flow、索敌、移动、真实Overlap/Trigger/Hitbox及伤害路由。单位数据只经共享装配器翻译，不新增按单位ID分支的战斗系统。
- 公共护甲/韧性、真伤与穿甲，记录原伤害、护甲后伤害、实际HP回执；治疗单列且排除过量。合格直接来源与普通最后伤害分开；周期显式路由保存来源和实际有符号回执。
- SK20最大HP≤50、地空资格、成功删除、不治疗、5秒CD、3秒恢复；吞噬来源的已有区域漏伤经独立探针发现并修复，详见r3-009-program-handoff.md。

## 当前证据索引

| 文件/范围 | 结果与限制 |
|---|---|
| r3-compatibility.test.ts | 5项：84有效属性/换算、原S4隔离、商店来源限制、非法字段原子拒绝、七组参数投影 |
| r3-identity.test.ts | 25项：23身份各自真实三轮/双实例/来源死亡清理；另有错时移动及圆形双目标/对空友军过滤 |
| r3-devour.test.ts | 8项：最大生命而非残血、地空、CD/无治疗、争抢、失效来源、待释放取消及双实例三轮 |
| r3-devour-pending-hit.test.ts | 2项：原独立吞噬漏7HP失败转绿，非吞噬正常7HP对照保留；区域销毁 |
| r3-source-routing.test.ts | 3项：最后合格来源、来源死亡快照、一次转化；间接/周期对照与实际治疗。不是尸巫/先驱者身份通过 |
| r3-boundary.test.ts | 3项能力边界探针，包含成功复现限制；不能计为跃击、蛇身、骑乘通过 |
| r3-determinism.test.ts | 1项：同seed、同购买部署输入，连续三次260Tick，逐拍位置/阶段/CD/目标/实际伤害一致；尚不覆盖随机复杂候选 |
| armor-mitigation.test.ts | 11项：公式边界、真伤/穿甲、真实碰撞、过量伤害与治疗 |
| 项目及相关共享回归 | 44文件321通过、1历史跳过，退出0；self-check/r3/final-tests.log/json。后续公共排序收尾另纳全库最终回归 |
| 类型检查、构建 | 均退出0，typecheck-final.log、build-final.log；保留大于500kB分包提示，不以其宣称性能通过 |
| 能力组合 | 生产部署31、周期来源30、平面探针30、全部共装33系统；均0 SCC/0重复/0未知引用。21/14/16/19个可选引用均对应registry已有但该组合未装系统 |

命令入口：`node node_modules/vitest/vitest.mjs run games/game-mcfight --maxWorkers=2 --minWorkers=2`；公共能力定向见r3-009-program-handoff.md。审计：`node node_modules/vite-node/vite-node.mjs scripts/mcfight-r3-audit.ts`。身份轨迹/矩阵生成：`node node_modules/vite-node/vite-node.mjs scripts/mcfight-r3-evidence.ts`，只接受成功的final-tests.json，并逐身份匹配真实通过用例，不按目录可加载自动填PASS。

## 逐拍与画面

self-check/r3/identity-index.json索引24份身份轨迹及摘要。基本近战当前零秒配置下仍经过生产Flow：Tick1前摇/捕获/CD归0，Tick2 Active生成区域，Tick3真实接触扣血/区域清理。卫道士对实验护甲8/韧性2目标，原伤13，实际11.544。不能套用S2实验的Tick3生成/Tick4命中来修改这些不同配置。

吞噬Tick1成功删除、CD归0；Tick61产生解锁意图、Tick62解锁；Tick101/201再次成功。独立复核确认的公共顺序为Flow→移动→（若安装则合成）→接触/Hitbox→周期/伤害→资源/死亡→清理→晚段Caster/Prefab。原漏伤与有环中间版本完整保留，不作为绿灯证据。

浏览器脚本self-check/r3/browser-current.mjs实际打开正式入口，检查1000金币、翻页、购买、真实拖放部署与10秒战斗。browser-current.json记录文字和pageerror空数组；r3-01-shop.png至r3-05-real-combat.png为运行截图。几何占位仅证实当前子集可观察，单位重叠时局部标签仍会拥挤，顶部HP条可读；未作为S6动作验收。

## 独立复查与请求

review/r3-public-008009-independent-20260915.md：限定REQ-008/009 PASS。39项隔离复跑、6组锚点撤修恢复SHA；最新Flow/合成排序配套又独立复跑20项和真实合装顺序。review/r3-public-007-independent-20260915.md：限定护甲/统计14项独立通过，普通甲、真伤和穿甲3组数值撤修检出并恢复SHA。REQ-007～009据各自公共接口范围标delivered，保留历史失败；整批身份完整复核仍待后续提交，不代签R3。

全库首次3文件4项失败已按r3-declaration-disposition.md补齐；没有修改策划验收剧本。组件清单用既有生成器更新，实际组合无环断言不变。

## 仍未完成，按性质区分

1. **程序装配与旧参数核实**：其余60身份仍未完成真实装配/身份测试。弹丸、光束、固定落点、多段/状态、冲锋、自爆、治疗及召唤/转化来源需继续按族完成；七组已裁定数值的写入不等于它们的签名机制通过。逐字段未定项在self-check/r3/unresolved-content.json，逐行状态在full-restoration-matrix.json。
2. **专门玩法合同待定**：仅SK10/SK22/SK24按策划要求先做最小探针，A/B及实测限制见r3-capability-boundaries.md。它们未被本次吞噬A授权覆盖。
3. **身份级复核/表现**：新公共接口PASS不等于尸巫、先驱者、铜羽泽鹗等身份PASS；完整美术绑定仍归S6，正式规模和平衡归R4。

R2、S3、S4既有独立通过结论保留；当前R3不签完成，不宣称84单位实战通过。

## 完整回归历史

- 首轮2 worker：564文件，5206通过、4断言失败、1跳过，退出1。失败为新组件生成清单3项和全库申报棘轮1项，已逐项修复；见full-regression.log、r3-declaration-disposition.md。
- 第二轮2 worker：563/564文件完成，5208通过、1跳过、1次worker异常，退出1。缺少完成记录的文件为games/game211/game211.turnmatch.test.ts。无断言失败也不算通过，日志full-regression-final.log保留；未凭并发现象宣称已找到异常根因。
- 为排除本轮构建与文件并发影响，最终使用`node node_modules/vitest/vitest.mjs run --maxWorkers=1 --minWorkers=1 --no-file-parallelism`：**564文件全部通过，5210项通过、1项历史跳过，退出0，无worker异常**，耗时589.77秒。先前异常的game211.turnmatch两项也完成通过。结果落self-check/r3/full-regression-serial.log；未跳过异常文件或增加失败白名单。历史跳过为s2-c5的规模测试，不是本次新增跳过。

最终类型检查退出0、构建退出0、四组能力审计退出0，浏览器旅程退出0且pageerror为空。原并发worker异常仍保留为实测记录；一次串行通过不等同证明其根因已消除。本轮交付止于已验证的公共扩展和首批身份范围，后续R3装配仍按上述未完成清单推进。
