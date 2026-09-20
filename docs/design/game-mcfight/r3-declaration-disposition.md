# R3 公共申报与生成清单收尾

第一轮全库回归：564文件中561通过、3失败；5206项通过、4失败、1跳过，退出1。原始日志self-check/r3/full-regression.log保留。四项均明确修复，未删除测试或扩大实际组合告警白名单。

## 新增组件配套

QualifiedDamage是REQ-008的最后合格直接来源快照。新增协议类型/能力申报后，公共组件全集与冻结清单未同步，导致build-component-map两项、component-manifest-guard一项失败。

使用原有生成器：`node scripts/build-component-map.mjs`、`node scripts/component-manifest-guard.mjs --update`。组件全集161、协议清单155；生成物保留排序和原守卫逐字节检查，不手填例外。

## Flow / merge-rule 读取时点

全库SCC首次变化不是MC Fight组合环：新增DestroyRequest读取导致merge-rule写删除请求→Flow，随后Flow写State→移动决策/Velocity→motion写Transform→merge-rule读取移动后位置，形成回路，merge-rule被纳入已有Update超集SCC。

正式含义：Flow是本拍移动前决策，读取执行前已有删除意图；merge-rule读取本拍移动后位置再合成，不能迫使同一次Flow又在合成之后。新显式边Flow→merge-rule固定这一先后；后续合成的销毁由接触/释放前检查处理。未移相位，未删DestroyRequest真实读取，也未修改merge实现。MC Fight运行装配不消费merge-rule；此边属于公共能力共装排序收尾。

加显式边后，全库SCC的数量、系统节点成员全部恢复原基线，仅原Update大SCC的viaComponents多出DestroyRequest（来自真实读取与已在环内的其他销毁写者）。基线只同步这一新增组件名，保留全部节点严格相等、真实组合无SCC的断言；没有把新系统或新环纳入允许集合。

复现顺序：declaration-before.log为新增merge-rule与DestroyRequest的原失败；declaration-after.log为显式排序后仅组件清单差异；declaration-final.log为配套守卫与吞噬共26项通过、退出0。新排序的独立复核追加到review/r3-public-008009-independent-20260915.md。

## Hitbox / Mortal 读取时点

本轮还保留了吞噬来源漏伤修复中的第一次有环日志devour-pending-after.log。Hitbox读取执行前已有DestroyRequest；本拍接触产生伤害后才由Mortal写死亡请求。显式Hitbox→Mortal压住组件级“未来死亡写者必须在前”的错误推断，未延迟实际死亡。真实链与HP反例见r3-009-program-handoff.md及独立报告。

## 最终验证

全部修正后的单worker完整回归：564文件、5210项通过、1历史跳过，退出0，无worker异常，见self-check/r3/full-regression-serial.log。之前第二轮双worker有一次异常退出并留存full-regression-final.log，未用失败白名单或省略文件伪装通过。配套排序与组件清单另经独立复核确认，REQ-008/009有界PASS保持。
