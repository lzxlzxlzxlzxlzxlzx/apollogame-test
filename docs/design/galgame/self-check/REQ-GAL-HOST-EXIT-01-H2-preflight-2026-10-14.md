# REQ-GAL-HOST-EXIT-01 · H2 桌面适配只读预检（2026-10-14）

结论：**blocked，未施工、未领 H2 锁**。H1 共享 `HostExitPort` 已获局部独立 PASS，但当前仓库没有能明确证明“此窗口只承载当前 GAL 作品”的桌面入口；不得把退出 IPC 接到现有壳后宣称 H2 完成。本记录不代表桌面发行包、GAL S5/S6 或 Owner 人门通过。

## 实查锚点

- `package.json` 的 Electron `main` 指向 `electron/main.cjs`；`electron-builder.yml` 收入该入口和 `dist-cartridge/**`。`electron/main.cjs` 的窗口加载 `dist-cartridge/cartridge.html`，是通用单卡带先例，不校验 GAL 包身份，也未调用 `mountGalBrowserGame`。
- `electron/platform-main.cjs` 是 ZeroCraft 创作平台壳：启动内置 Python 后端、载入 `http://127.0.0.1:<port>/workshop/`，窗口关闭时清理后端。它拥有工作台而非独立 GAL 游戏；把 GAL 退出命令接入此入口可能关闭工作台及其后端。
- `electron/preload.cjs` 目前仅暴露 Steam 与 Steam Cloud 白名单，没有 GAL 窗口归属信息。`src/services/gal-ui/gal-browser-game-host.ts` 的 `mountGalBrowserGame` 是 Web/Electron **renderer 装配函数**；其 `close()` 只卸载 UI、停止播放并释放自有存储连接，不拥有 Electron `BrowserWindow`。
- `docs/design/galgame/gal-eng-host-exit-01.md` 已明确记载“当前未见 GAL 专用发行入口”，并要求 H2 经受限 preload、单一 IPC、来源/窗口归属校验，只关闭当前游戏宿主。

## 安全顺序选项（待 Owner 定范围）

1. **本阶段加入独立 GAL 桌面壳**：先明确 GAL-only 构建入口、作品包选择/校验和窗口所有权，再由 PS 领 H2 锁，做 preload 白名单、单命令 IPC 与所属窗口退出。这增加打包/生命周期工作，但能在 H2 内证明真实桌面退出。
2. **桌面壳后置到 `web-desktop-release`**：当前只保留 H1 共享合同及 GAL 浏览器预览反馈，H2 维持 blocked；待独立作品包和 GAL-only Electron 入口具备后再施工。不能把浏览器反馈或现有卡带/工作台壳当作桌面退出验收。

## H2 可开工与验收前置

- 有明确的 GAL-only 主进程入口、构建目标与经校验的作品加载路径；窗口归属可由主进程确定，而非渲染器传入任意 ID、路径或命令。
- preload 只暴露 `requestExit()` 受限接口，IPC 验证请求确实来自该 GAL 窗口的受信任 webContents/frame；不允许关闭工作台、其他游戏窗口或浏览器。
- 接收请求后返回 `accepted`，再按该窗口生命周期退出并清理其自有资源；缺失、错误来源、重复请求和关闭失败均有可复现的闭集结果。不得用 renderer `window.close()`、`process.exit()` 逃生。
- 用隔离 mock Electron 或短时局部探针证明“所属窗口恰好一次、非所属窗口零次、拒绝后仍存活”；定点测试、`tsc`、构建、唯一锚点撤修验红及非施工者独立复查在档。不得启动整套 ZeroCraft、发布、写远程状态或代签 Owner 门。
