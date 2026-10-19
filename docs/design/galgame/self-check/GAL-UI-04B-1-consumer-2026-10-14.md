# GAL-UI-04B-1 · GAL 消费段自证（2026-10-14）

状态：**施工自证通过，待非施工者独立复查；不代表完整 04B、S5/S6 或 Owner 人门。**PUI 通用 `typewriterSignal` 已有独立局部 PASS，本票只消费其闭集接口。

## 实现范围

- `GalSliceHost` 为当前可见、非回想、非历史/确认/CG 遮挡的 StoryRef 保留原始 `PresentedStoryToken`，仅向 `Label` 投影每次可见世代唯一的 opaque string。PUI 回传 `gal.story.presented(arg)` 后，宿主比对 page、遮挡、世代字符串和**对象身份**，再调用 `PresentationReadGate.fullyPresented`；旧回调无害。
- 删除了 `attach/redraw` 的同步 `completeVisibleText()` 路径。自然末字、0ms/空句及首次点击显全文字才会通知读门；输入忙的 `pending` 完成会在宿主 flush 后受控重试。
- 所有宿主侧推进/选择入口在真实挂载时先守住未显全文字：先重投影 `typewriter:0`，该次动作不推进/不选；PUI 回传完成后，下一次动作才进入既有 `narrative.*` 队列。回滚仍按既有行为，投影切换使旧 opaque key 失效。
- “文字显示速度”滑杆已接 `gal.settings.text-speed`，经既有同包串行 Profile 存储成功才刷新；失败保留旧 Profile 并走既有反馈。该偏好不进入 World/快照/手动槽；恢复默认仍禁用，等待其他消费者。

## 本轮机器证据

- `npx vitest run src/services/gal-ui src/services/gal-profile src/ui/components/typewriter.test.ts`：14 files / 145 tests PASS。
- `npx tsc --noEmit`：PASS。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slice-audit-fixture.ts`：阻断项 0（重叠/硬对比/border-image 均 0）；夹具的华丽度 0 为既有非阻断提醒，不能用作 V2 终视觉结论。
- `node src/services/gal-ui/verify-gal-03e-action-live.mjs --transient-shots`：隔离无头 Edge PASS，实点剧情框首击显全、二击推进；choice 首击显全、二击选择；回滚后重选、读取入口和设置入口均通过。测试使用临时目录，浏览器已关闭。
- `node scripts/docs-ref-guard.mjs`、`node scripts/context-budget-guard.mjs`：PASS；需求池 10/10、24042/25000。
- `node scripts/scoped-gate.mjs --run`：**未绿**。共享工作树缺少
  `origin/claude/mainbranch` 基线，门禁因而选择全量范围；随后在
  `depcruise` 以退出码 33 停止，命中 33 条既有的 life/simlife/demon
  区域依赖违规。本轮未触碰这些无关区域。
- 复查覆盖补充：`gal-ui-slice-host.test.ts` 现有“宿主仍挂载、新句已投影、
  迟到旧 PUI opaque token”负例；旧 token 不得把新句标已读，只有新 token
  可以提交。`npx vitest run src/services/gal-ui/gal-ui-slice-host.test.ts`：38/38 PASS。

## 撤修与独立复查要求

`gal-ui-slice-host.test.ts` 新增陈旧 opaque token 在 StoryRef 变化后不得记已读的断言，并把真实 mounted 点击/滚轮旅程改为首击显全、二击推进。独立复查必须自行复跑上述命令，并对至少一个锚点撤修验红：移除 `opaque !== current.opaque` 或对象身份检查应使旧 token 误记新句的测试转红；移除推进守卫应使首击不推进的浏览器断言转红。复查人还须确认 Profile 写失败保留旧值、回想/读档/确认遮挡无旧回调写入，以及现有 PUI 组件接口没有被 GAL 修改。
