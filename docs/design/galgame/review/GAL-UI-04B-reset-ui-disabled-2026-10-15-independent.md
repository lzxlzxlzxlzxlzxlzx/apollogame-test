# GAL-UI-04B 恢复默认禁用边界独立复查（2026-10-15）

判词：**指定拒写边界 PASS**。复查人未改生产代码；本单只核「仍有无消费者的可见设置时，恢复默认必须禁用，直接分发同样不得写 Profile」。不代签完整设置、04B、S5/S6、全库门禁或 Owner gate。

## 范围与依据

- 对照 `docs/design/galgame/gal-ui-complete-v2.dc.html` 的 V2 显示项，以及 `gal-ui-04b-settings-gap.md:66`：转场、高对比、界面缩放/显示模式尚无消费者；全项消费者齐备前不得开放单事务 reset。
- `src/services/gal-ui/gal-ui-settings.ts` 的显示页仍将 `gal-setting-transitions-control`、`gal-setting-high-contrast-control` 和 `gal-setting-ui-scale-control` 标为 disabled；页脚的 `gal-settings-reset` 无 action 且 `disabled:true`，文案为“恢复默认（待完整设置接入）”。这不是把已有 Profile reset 基础接口当成可用 UI 合同。
- `src/services/gal-ui/gal-ui-slice-host.ts` 未出现 `gal.settings.reset` 分派分支；因此绕过禁用的具名直接分发会自然落入无操作路径，而不会调用 `persistGalPreferencesReset` 或写 Profile。

## 独立实证

1. 在共享工作树独立运行：
   `npx vitest run src/services/gal-ui/gal-ui-slice-host.test.ts --testNamePattern "persists six independent Toggle actions and keeps inert controls actually disabled"`
   结果：1 文件 **1/1** 通过、退出码 0。点名用例先改变六项确认偏好，再直接 `dispatch('gal.settings.reset')`，Profile 序列化字节必须保持 `beforeReset`；同时核 reset 控件 id 与待完整设置接入文案。
2. **锚点撤修验红**：没有修改共享工作树。创建 detached 本地 worktree，应用当前三份范围内文件的未提交差异；唯一破坏是将 `persistGalPreferencesReset` 引入 `gal-ui-slice-host.ts`，并给 `gal.settings.reset` 加入直接持久化分支。以同一条点名命令复跑，结果 **1/1 失败、退出码 1**。失败锚点是 `gal-ui-slice-host.test.ts:992` 的 Profile 字节相等断言；预期确认偏好 `overwrite/load/...=false` 被错误恢复为默认 `true`。因此拒写断言并非未覆盖的绿灯。
3. 隔离 worktree 的 Vite 临时缓存和 node_modules junction 仅用于测试；未启动整套系统、未访问远程服务、未写远程 Git/数据库。共享工作树上的产品文件保持未修改。

## 未签范围与后续限制

- 既有 `GAL-UI-04B-reset-independent.md` 覆盖的是 Profile reset 基础接口；本单补的是设置 UI 的禁用与 direct-dispatch 拒写，二者不可互相替代。
- 本复查不启用转场、高对比或界面缩放，也不评估其共享 PUI/叙事宿主工单。上述能力各自独立 PASS 且其 GAL 消费、迁移和失败回退完整后，才可重提 reset UI。
- 不改变 `ui-settings-confirmations` 的 active 状态，不代签 Owner 门或 V2 原型重新确认。
