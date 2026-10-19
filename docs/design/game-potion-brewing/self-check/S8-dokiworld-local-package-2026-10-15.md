# 炼药 DokiWorld 本地出包自检（2026-10-15）

状态：**本地候选包已生成；不是 DokiWorld 安装或正式发布，也不代替 S6–S8 流程人门。**

## 产物

- `dokiworld/game-potion-brewing/dist/`：重新运行 App `npm run build` 生成。
- `release/game-potion-brewing/game-potion-brewing-dokiworld.zip`：压缩包根目录直接包含 dist 的 22 个文件，无多包一层目录。
- 压缩包 SHA-256：`1D56169B8779AADD6B5F4B20105A4A229930B2A1A5C265AE8BC0404A27774894`；大小 7,940,914 字节。本值绑定 Windows 修复后由标准入口重建的本地候选，源码或资产变化后必须重建重验。

## 本轮证据

| 检查 | 结果 |
|---|---|
| App `npm test` | 2/2 通过；初次受限沙箱因依赖真实路径 EPERM 未跑到测试，获准只读依赖路径后复跑退出 0 |
| 根工程 `npx tsc --noEmit --pretty false` | 退出 0 |
| App `npm run build` | 退出 0；Vite 提示单 chunk 超 500 kB，未伪装为零告警 |
| `node scripts/dokiworld-docs-guard.mjs game-potion-brewing` | 退出 0；源码 manifest 与包内中文调用说明一致 |
| `node scripts/potion-doki-smoke.mjs` | 真 dist + vendored SDK 假宿主：success/failure/rejected/preview 保持通过；非法输入（缺 recipe）触发一次 `requestExit`、`complete` 0；有效局按 Escape→确认退出同样一次 `requestExit`、`complete` 0，未进入失败结算；终局回执无重复。初次受限沙箱 Edge 启动失败，隔离无头 Edge 提权复跑退出 0，测试服务与浏览器均已关闭。 |
| `node dokiworld/game-potion-brewing/scripts/subpath-smoke.mjs` | 真 dist 在 `/apps/game-potion-brewing/` 子路径的空数据预览可加载，浏览器错误 0、退出 0；短时服务与无头浏览器均已关闭 |
| dist/zip 完整性 | zip 文件集合与 dist 相同；`SHA256SUMS.txt` 覆盖除自身外全部文件且逐字节校验通过；manifest ID、entry、文档、`ASSET-CLOSURE.json` 在包内；源码 manifest/说明与包内字节相同 |
| 卫生与新鲜度 | 仓库 `_assert_doki_dist_hygiene` 通过；重建后检查 App 源码、游戏代码和游戏 art 没有比 dist SHA 清单更晚的文件 |
| 标准出包函数与包装器独立复查 | 修复后实际运行 `_pkg_build_dokiworld_app('game-potion-brewing')` 退出 0，生成安装戳与上述 zip；独立复查再次核得 22 文件、包根结构、全量 SHA 与卫生 PASS。Windows 选 `npm.cmd`、POSIX 保持 `npm`；锚点撤修为旧裸 `npm` 时 Windows 断言转红，失败输出中的无效 UTF-8 字节经 replacement 解码并保留错误原因。此项仅复查包装器修复，不等于整包独立交付复查。 |

## 标准发布屏出口复核

首次标准函数调用曾因 Windows Python 不解析裸 `npm` 而报 `WinError 2`；共享包装器随后选用 Windows `npm.cmd` 并以 UTF-8/`errors='replace'` 捕获子进程输出。非施工者独立复跑标准函数已 PASS，并验证 Unix 命令选择不漂、失败原因仍可读。Vite 单 chunk 超 500 kB 的构建警告仍在；它非阻断，但标准包装器成功时捕获输出，因此不能把退出码 0 说成零告警。此处只证明本地标准出包函数，不证明发布屏 UI job 或真实 DokiWorld 安装。

## 共享工作区全库终检诊断（2026-10-15 后续重跑）

上表的根工程 `tsc` 通过发生于本地包构建时；共享工作区随后出现并行变更，不能沿用旧绿灯作为当前 HEAD 的 S8 证据。本轮重新独立执行 `npx tsc --noEmit --pretty false` 与 `npm run build`，均因 `src/services/presentation/narrative-transition-policy.ts:76` 的 `CommittedTransitionController<... | null>` 类型不匹配退出非零。`npx vitest run` 为 683 个测试文件通过、21 个失败，6636 个测试通过、34 个失败、6 个 snapshot 失败；已见的失败包括设计稿收件测试调用 Python 启动器返回 9009，以及 Gal UI 文案断言不符。这些是共享工作区全量诊断，不归因于炼药，也不粉饰成 S8 三绿；本游戏定向阶段测试、DokiWorld App 测试和本地候选 zip 校验另见上表。当前共享工作区非净树，正式 S8 gate/review 不落账。

## 未冒充的验收

未复制到 DokiWorld `frontend/public/apps`；未做真实 DokiWorld 宿主联调、宿主主动销毁 iframe 的取消路径、完整自动合同矩阵或整包独立交付复查。上述取消探针只验证游戏内 Escape→确认退出路径，不外推为真实宿主关闭验收。S7/S8 正式流程门与 Owner 人门仍以流程板真实状态为准。zip 是可复核的本地候选，不标记“可上传/正式交付”。

## 宿主展示图 URL 接线后的候选刷新（2026-10-15）

旧候选 SHA `1D56169B...74894` 已因游戏图像接线与中文调用说明变化而过期。本轮在 `_doki_deps_stale(...) == None` 后重新调用标准本地 `_pkg_build_dokiworld_app('game-potion-brewing')`，没有安装到 DokiWorld 目录，也没有远程发布。

- 当前候选：`release/game-potion-brewing/game-potion-brewing-dokiworld.zip`；**SHA-256 `7F389FADE24E9B56C06000D1C445416FFA7B279BFACF33601B7AA6DF515F8A7B`**；大小 **7,942,087 字节**。zip 根与 dist 同为 **22 文件**，无外层目录；逐文件字节相同。此前 `5BA2B664...B358CDF` 候选因 App `pagehide` 预载竞态修复而过期，随后 `A89C4CED...C4EDBE` 候选又因材料/结果图加载失败日志脱敏而过期；以本行完整 SHA 为准。两次后续修复均重新走标准出包函数与下述字节核验。
- `SHA256SUMS.txt` 对除自身外的全部 21 文件逐字节核验 PASS；`manifest.json` 和 `docs/integration.zh-CN.md` 与当前源码字节相同；`ASSET-CLOSURE.json`、entry 存在，仓库 `_assert_doki_dist_hygiene` PASS。`node scripts/dokiworld-docs-guard.mjs game-potion-brewing` 退出 0。
- `node dokiworld/game-potion-brewing/scripts/subpath-smoke.mjs` 首次在受限沙箱中因 Edge 配置目录写入失败而未到页面；批准隔离浏览器启动后重跑退出 0，`/apps/game-potion-brewing/` 预览 `browserErrors:0`。探针退出后临时浏览器及测试服务已关闭。
- 远程材料图和成果图是合同允许的可选 HTTPS 展示输入；没有把它们登记为包内必需资源。未在真实 DokiWorld 宿主下验证目标图片域的 CORS/CSP 与真实 URL 加载，故本轮仍只称本地候选。
