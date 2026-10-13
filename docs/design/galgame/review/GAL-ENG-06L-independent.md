# GAL-ENG-06L 独立复查（2026-10-12）

复查人：独立 review agent（非施工人）。判词：**局部 PASS；整个 `replay-save-preview-auto` 里程碑仍不得称完成**。

## 范围与接线核证

- `src/services/gal-ui/gal-browser-game-host.ts`：通用 `mountGalBrowserGame` 从经验证的包与初始数据创建 World，将同一产品命名的 IndexedDB KV 显式交给 Profile、权威手动槽、非权威预览侧车，同时注入浏览器场景采集、宿主时间与播放时钟；无 demo 剧情隐式注入。`close()` 先卸载 UI，再关闭自有 KV 连接；外部注入的 KV 仍归调用者所有。`createGalWorld` 在分配 KV 前校验；创建/挂载异常路径有自有连接清理。
- `src/services/gal-ui/gal-save-preview-idb-live.audit.ts` 已改为调用上述正式宿主，而非在夹具里另搭一套手工宿主；夹具另建的检查端口只作只读断言及显式坏图/无侧车故障注入。
- `src/services/gal-ui/verify-gal-save-preview-idb-live.mjs` 只打包静态审计页、拦截到单一 `.audit.invalid` 源，不启动应用服务、不访问远程数据库；用任务级临时浏览器 profile，`finally` 关闭 browser 并安全核验后清理临时目录。测试夹具的 `data:image/png` URL 来自已登记的本地 demo 图，仅用于隔离审计；不是新作品隐式内容。
- 单窗口策略与 06K Owner 判词一致：没有声称跨标签页/进程原子写、冲突解决或实时缩略图同步。此复查不把 WebView 可复用性误写成已发行桌面安装包。

## 独立实跑

1. `npx vitest run src/assembly/gal-world.test.ts src/services/gal-ui/gal-ui-slice-host.test.ts src/services/gal-ui/gal-playback-scheduler.test.ts src/services/gal-save/gal-save-preview.test.ts`：**4 文件、60/60 PASS，退出码 0**。普通沙箱首跑因 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM` 在收集前失败；隔离外重跑成功，不能把首次环境失败记作代码红灯。
2. `UI_AUDIT_CHROMIUM=<本机 Edge> node src/services/gal-ui/verify-gal-save-preview-idb-live.mjs`：普通沙箱的 Edge 进程退出码 `3221225477`（临时 profile 中 Edge 升级/Crashpad 写入受限）；隔离外重跑 **`GAL LIVE IDB PREVIEW: PASS`，退出码 0**。静态 HTTPS 测试源：`https://gal-preview-live.audit.invalid/index.html`，全部请求由脚本本地 fulfill，其余 abort，未启动服务。初次槽 2 的权威/预览 hash 同为 `eaacc4d6`，真实图片 `320×180`；跨浏览器会话重开后仍同 hash/尺寸，Profile 的退出确认偏好为 `false`。坏图时 `previewStatus=damaged`、无侧车时 `unavailable`，两者 `canLoad=true` 且权威 hash 不变，均真实点击读档成功；坏图读档后真实点击自动播放，剧情抵达 `['a','done']`。审计输出列出了权威 `snap:`、Profile `env:` 与侧车 `gal-preview:v1:` 三类本地键。浏览器与临时 profile 已由 `finally` 关闭/清理。
3. 撤修验红在**内存 esbuild 插件与临时构建**执行，未编辑共享工作树：精确锚点 `previewCapture: new BrowserGalPreviewCapturePort(),` 要求恰好 1 次，实际 `ANCHOR_HITS=1`，替换为 `previewCapture: undefined,`。同一隔离 Edge 真 UI 保存槽 2 后，`ready` 断言转红为 `no-preview`，而权威 `authorityHash=eaacc4d6` 仍在；输出 `SABOTAGE_RED expected=ready actual=no-preview`、退出码 0（探针预期红被正确捕获）。临时 browser/profile 与构建均清理。第一次探针因路径过滤器未命中显式拒绝 `ANCHOR_NOT_HIT 0`，第二次因未注入 Edge 可执行路径显式失败，纠正后才取得有效证据；没有拿这两次失败充作撤修验红。

## 限制与后续门禁

- 本单核证正式**浏览器宿主接线与隔离静态真图槽存读**，不核证已发布的 Web 构建、Electron 安装包、桌面存档路径、离线资源闭包；那是 `web-desktop-release` 的真机门。现有 06A/06C 对 replay/skip 的既往证据也不因本单重跑而自动变成全里程碑验收。
- 全库 `tsc` 仍有先前已记录的 14 条非 GAL 错误（game-card-reveal、game-dice、game-theft、launcher）；本复查未重跑全库类型门，故不得宣称全库三绿或可以推送。
- `replay-save-preview-auto` 的控制台 Owner 人门仍须 Owner 本人操作；本单只支持 06L 局部 review，不代签 Owner，也不直接提交 `done`。
