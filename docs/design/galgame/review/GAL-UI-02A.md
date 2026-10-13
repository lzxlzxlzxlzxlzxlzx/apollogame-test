# GAL-UI-02A 非施工者独立复查

> 2026-10-10，复查者 Codex/review_gal_04b。仅审 `PresentationReadGate` 宿主接缝、真实 Director/04B 桥与同伴测试；未施工正式 LayoutNode、打字机、PUI 或自动/快进。未执行 Git/GitHub、数据库修改或应用服务启动。

**局部判词：PASS；全库判词：CONCERNS。** 初审连续实证出“队列丢失后永久闩”和“旧档无 outbox 无法发读完”两项缺陷，施工者各自修复并加正式回归，独立复验通过。只读宿主接缝局部通过，不代表玩家可见的完整呈现回调已在正式 UI 上接线，更不代表 S4/S5 纵切片验收。

## 四步核证

1. **独立复跑。** 最终版本 `npx vitest run` 点名 `presentation-read-gate.test.ts`、`gal-ui-read-model.test.ts`、`narrative-profile-bridge.test.ts`、`gal-manual-save.test.ts`、`narrative-director.test.ts`：**5 文件 66/66，退出 0**；02A 同伴测试 **8/8**，使用真实 Director/InputQueue、04B 桥及内存端口，覆盖未通知不标已读、显式完成后单具名输入→Profile 落盘→ack、重复 begin、玩家 action/缺队列 pending、晚到通知、同 ref 回滚/restore、换 World、bridge 写失败、相同操作 World hash/事件序列一致。`npx tsc --noEmit --pretty false` **退出 1**，诊断仍位于 `games/game-dice/dice-window{,.test}.ts`、`games/game-simlife/art-consumption.test.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 02A/GAL 新诊断。
2. **带锚点隔离撤修验红。** 只复制施工源与同伴测试到精确命名的临时 probe；测试 import 改指 probe。第一轮将 `if (active.queued) {` 撤回旧式永久 `already-queued` 闩，先断言原件/探针锚点各命中 **1**；点名“retries a read action lost”测试实测 **1 failed/5 skipped，退出 1**，预期重排 `queued` 却得 `ignored`。第二轮在最终版 probe 将 `if (outbox && ... )` 恢复为必须 `outbox` 存在，锚点各命中 **1**；点名“accepts an older restored presentation without an outbox”测试实测 **1 failed/7 skipped，退出 1**，预期 `queued` 却得 `ignored`。两轮均未原地破坏共享源码，探针在解析绝对路径核对后已清理。
3. **实证对抗复现与修复。** 初版：`begin`→`fullyPresented` 入队，Director tick 前宿主输入路由清空队列；同 token 重试被永久判 `already-queued`，导致无 `read-complete`（隔离探针 **1 failed/5 skipped**）。现版仅在动作仍在队列、或 Director 已令 outbox `nextSeq` 前进/同 ref 已有待确认 read 事件时去重；未消费且队列空则重排。第二处：合法当前 ref/runtime/projection 的旧恢复态可无 `NarrativeOutbox`（`GalManualSaveController.validate` 不要求该组件，而 Director 的 enqueue 可创建）；旧实现 `fullyPresented` 返回 `invalid-projection`（隔离探针 **1 failed/6 skipped**）。现版首次排入容许无 outbox，以 seq 1 为基线；正式测试覆盖丢队列重排与消费后去重。对玩家 advance 占队列并于下一 tick 改节点、错 ref/restore/World 切换、bridge 失败的点名断言也通过，旧通知不写 Profile。
4. **stderr/边界。** 最终定向回归无 stderr 告警；Director 512 步历史字节数在 stdout 仅为测试观测。`PresentationReadGate` 只写唯一空闲 `InputQueue` 的具名 `NARRATIVE_READ_COMPLETE`，不 tick、不清玩家 action、不直写 `GalProfile` 或 `NarrativeOutbox`；Director 仍作最终 ref 裁决。全库类型红灯单独记 CONCERNS，不冒称整体门禁绿或已推送。表现端“最后字符可见”通知与正式 PUI 控件尚未接线，故不宣称可玩或视觉 1:1。
