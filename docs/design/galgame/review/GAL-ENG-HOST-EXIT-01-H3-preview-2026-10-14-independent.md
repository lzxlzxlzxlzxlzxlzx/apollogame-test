# GAL-ENG-HOST-EXIT-01 H3-preview 独立复查（2026-10-14）

判词：**局部功能 PASS；GAL 全阶段及桌面退出仍 CONCERNS**。复查者与施工者不同。本单仅核浏览器预览退出的诚实反馈；不批准 H2/Electron、S5/S6 或 Owner 人门。

## 范围与实现核对

- `src/services/gal-ui/gal-browser-game-host.ts:66` 只在通用浏览器装配显式传 `previewExitFeedback:true`；普通 `GalSliceHost` 缺省无此能力。
- `src/services/gal-ui/gal-ui-structure.ts:81` 缺能力时首页退出钮禁用；`gal-ui-slice-host.ts:367-370` 对非主页、已有确认窗或缺能力的动作 fail closed，并复用 `requiresGalConfirmation('exitGame', …)`。
- `gal-ui-slice-host.ts:617-623` 确认接受仅写 UI 反馈；此分支在任何读写槽、World 操作之前返回。所涉文件未见 `window.close`、Electron IPC 或 `HostExitPort` 消费。这里的“退出”不等于桌面窗口关闭。

## 四步独立核证

1. **复跑**：`npx vitest run src/services/gal-ui/gal-ui-slice-host.test.ts` 退出码 0，38/38；`npx tsc --noEmit` 当前共享树退出码 0（与施工自证时 `cart-run-core.session.test.ts:56` 报错不同，不能把旧红误报为现红）。`docs-ref-guard` 与 `context-budget-guard` 均 0；需求池 10/10、24099/25000 字符。
2. **锚点撤修验红**：仅在临时 Vitest 配置的 Vite `enforce:'pre'` 变换中，将 `gal-ui-slice-host.ts` 唯一 `!this.ports.previewExitFeedback) return;` 锚点替为 `false) return;`，并断言锚点恰好一次。运行 `-t "fails closed for exit"` 得 1 failed/37 skipped，预期 `confirm:null`、实际 `confirm:'exit-game'`，证明缺省拒绝断言有效。临时配置已删除，未改生产文件。
3. **真实复现**：独立运行短时隔离 Edge `file://` 页面，`verify-gal-03e-action-live.mjs --transient-shots` 退出码 0：退出取消→再次确认接受→剧情逐字/选项/回滚/读档入口/设置入口均通。另用独立临时探针检查确认、取消、接受、再次打开取消；Toast 在 DOM 中可见；四次前后 World hash `e3500939`、Profile JSON、手动槽 JSON `[]` 和主页均逐字相同。两次浏览器启动均只用了任务级临时 profile，浏览器和临时文件在 `finally` 关闭/清理，未启动 ZeroCraft 工作台。
4. **告警审查**：`tools/ui-audit.mjs src/services/gal-ui/gal-ui-slice-audit-fixture.ts` 退出码 0，重叠/低对比/九宫格阻断均 0；“华丽度 0、非 house 主题”是既有结构夹具的非阻断 S5 提醒，不构成 V2 外观已验收。默认沙箱运行 Vitest/Edge 曾分别出现本地依赖 `EPERM` 与 Edge profile 权限失败；同一只读检查在隔离的本机执行成功。Edge 日志的 Elevator/USB/组件更新噪声未影响复现，不能当作产品全局门禁结论。

## 保留边界

- 真实浏览器 probe 用 `gal-ui-live-wheel.audit.ts` 显式注入的内存端口，并非 `mountGalBrowserGame` 的 IndexedDB 装配端到端；正式装配注入仅经代码路径核对。因此本判词限于 H3-preview 行为，不扩称正式 Web 发行或桌面退出。
- 施工自证的全量类型红灯是当时共享树快照；本次重跑为绿，但未据此宣称全库 `scoped-gate`、S5/S6 或项目里程碑完成。
