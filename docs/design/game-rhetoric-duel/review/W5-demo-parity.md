# game-rhetoric-duel｜W5 demo parity 独立复查单

## 结论

**PASS（W5 三项强制 sabotage 与恢复复跑）；scoped-gate 的真实退出码仍由 owner 在 Git 步骤补齐。**

本单补齐 `program-work-order-w5-demo-parity.md §10.4` 要求。独立复查人与 W5/W5.1 施工人不同，复查在无 `.git`、无 `game-dice` 的隔离副本完成；未启动服务、未修改共享工作树。

| 强制撤修 | 实际锚点与验红 | 退出码 |
|---|---|---:|
| 撤掉 `skinMap[skinKey]` 优先 | 仓库无单独 `art.ts`；在真实锚点 `ui.ts::resolveRhetoricSkin` 令其恒取 fallback，skinMap 优先等 3 项测试变红。 | 1 |
| 撤掉来源/快捷键行 | 删除来源 Label，十张卡目录完整性测试准确变红。 | 1 |
| 令真图与 fallback 同时可见 | 将 fallback 破坏为 `portraitReady`，立绘/后备互斥测试准确变红。 | 1 |

每次破坏后均恢复。恢复后 W5 + W5.1 目标回归为 8 files / 60 tests，退出码 0，最终无 WARN/ERROR/stderr 告警；关键文件 SHA256 与隔离初始值一致，核对退出码 0。

W5 的真渲染、资产台账、UI 审计与对齐证据仍见 `self-check/S5-alignment.md`；本复查不以 W5.1 局部门禁替代待 owner 执行的 scoped-gate。
