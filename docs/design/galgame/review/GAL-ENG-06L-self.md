# GAL-ENG-06L 施工自证（2026-10-12）

## 范围与判断

接受现有能力重组，不新增 UI/存档协议。`gal-browser-game-host.ts` 是可由 Web 或 Electron webview 作品调用的通用装配函数；只接作品数据和显式资源 URL，不注册/启动首作、不打包桌面程序。06J 测试页已改走此入口。

## 实际验证

- 隔离 Edge 静态 HTTPS 路由、临时 profile：`verify-gal-save-preview-idb-live.mjs` 退出 0。三端口持久化，槽 2 权威/预览 hash 同为 `eaacc4d6`；预览 320×180；重开会话仍 ready 且可读档；坏图 `damaged`、侧车不可用 `unavailable` 均仍可读权威槽；自动按钮在真实宿主时钟注入后推进至结局。测试关闭浏览器并删除临时目录。
- 定向 Vitest：`gal-world`、`gal-ui-slice-host`、`gal-playback-scheduler`、`gal-save-preview` 共 60/60，退出 0。首次沙箱运行因 node_modules realpath EPERM 未收集用例，随后隔离提权重跑通过。
- `npx tsc --noEmit --pretty false` 退出 1，共 14 条既有非 GAL 诊断，涉及 game-card-reveal、game-dice、game-theft、launcher；没有新增 GAL 文件诊断。全库门禁不宣称全绿。

## 边界

06L 只证明正式宿主装配与隔离浏览器路径。首作数据包/资产、桌面安装包、V2 S5/S6 视觉演出不在本票；单窗口策略按 Owner 06K-B。独立撤修验红与判词见 `GAL-ENG-06L-independent.md`，在复查完成前不得标整里程碑 review/done。
