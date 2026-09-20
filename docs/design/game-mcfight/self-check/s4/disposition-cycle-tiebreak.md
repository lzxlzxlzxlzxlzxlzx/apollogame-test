# cycle-tiebreak 四项旧失败处理

日期：2026-09-15。依据 `s4-review-disposition-20260915.md` 和 `independent-compatibility-diagnosis.md`。仅修改 `src/assembly/cycle-tiebreak.test.ts`，没有改正式系统相位或排序算法。

## 修复前证据

`node node_modules/vitest/vitest.mjs run src/assembly/cycle-tiebreak.test.ts`：4 失败、3 通过，实际退出 1，见 `disposition-cycle-before.log`。

四项失效构造分别是 timeline/resource 假定仍同 Update 二元环、加入 event 假定仍三元环、假定低 tier 的 resource 先执行、假定反转装载能跨相位反转顺序。实际 resource-apply 已为 Resolve，timeline/event 为 Update；不能为这些断言把结算退回 Update。此原因与独立诊断一致。

## 保留与新增合同

- 四项真实组合用例现在明确钉住 event → timeline → resource，重复装载确定，反向装载也不能跨相位反转，预期告警严格为空。
- 增加真实事件/时间线/资源用例：拍初资源0使 event 发出 play，timeline 当拍置10，Resolve 同拍加5；三拍严格 `[15,15,15]`，正反装载一致，ResourceModify确实已消费。若误把 resource 提到 Update 先执行，则起播或数值会不同。
- 原同相位平局防线迁至两个真实读写 Resource 的局部系统夹具；并非空声明。正向执行实际值12，反向21，重复正向仍12，要求三次都产生指定 Resource 环告警。
- 增加显式约束优先级：同相位硬约束要求 tier-like 先于 atom-like，两种装载顺序均21且无环告警。
- 原三组 dialogue/flow、card-play/card-pile、dialogue/timeline 的环成员/组件完整签名逐条断言原样保留，未刷新或删除这些基线。

## 修复后证据

同一命令：10 通过，实际退出 0，见 `disposition-cycle-after.log`。本轮没有运行全库测试。此记录为施工者自验，待非施工复查者复跑及撤修验证，不代签独立通过。
