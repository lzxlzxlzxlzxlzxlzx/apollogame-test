# S7 宿主图片 URL 接线独立复查（2026-10-15）

结论：**PASS（本次图片 URL 接线范围）**。复查者与施工者不同；不代替 S7/S8 阶段门或 Owner 人门，也不证明真实 DokiWorld 部署域的 CSP/图片可达性。

## 范围与代码核证

- `dokiworld/game-potion-brewing/src/contract.ts` 的 v1 严格 parser 原样接收 `ingredients[].imageUrl`、`recipe.resultImageUrl`；额外 `productName` 被拒绝。`games/game-potion-brewing/screen.ts` 以 `recipe.name` 显示目标和成功产物名称，`potionOutput` 仅回 `brewingId/recipeId/outcome`。
- `games/game-potion-brewing/blueprint.ts` 只写稳定 `Sprite.textureKey`，宿主 URL 不进入 World/快照；`art.ts` 对两个未知材料分配不同 key。已知材料先显示包内图，远程图加载后由 `AssetManager.adoptLoaded` 同步替换；失败、超时和卸载后保留本地图/Shape 占位，临时 key 清理。`game-potion-brewing.ts` 以 `loadGameArtInto` 之后启动宿主图加载，卸载时清理 AssetManager。
- `dokiworld/game-potion-brewing/src/main.ts` 的结果瓶图原有接收路径仍保留；`pagehide` 后 `closed` 阻止慢速结果图预载完成后重新挂载。图片错误日志只报降级，不输出带 query 的 URL。
- `docs/design/game-potion-brewing/{brief.md,contract-v1.md}` 和 `dokiworld/game-potion-brewing/docs/integration.zh-CN.md` 均明确 `recipe.name` 是药剂名、两类 HTTPS URL 是 render-only 且加载失败回退；调用示例包含图片 URL。

## 独立复跑与实证

- `npx vitest run games/game-potion-brewing/art.test.ts games/game-potion-brewing/blueprint.test.ts`：退出 0，**15/15**。点名覆盖双未知材料不同图 key、URL 不入蓝图、成功替换、失败回退、待加载原子换图、卸载和超时后迟到结果。
- `npm test --prefix dokiworld/game-potion-brewing`：退出 0，**3/3**，含两类 URL 原样接收、产物名称单字段和输出字段闭集。
- `node scripts/dokiworld-docs-guard.mjs game-potion-brewing`：退出 0，文档闭包通过。
- `node scripts/potion-host-image-e2e.mjs`：在隔离无头 Edge 与短生命周期 Vite 下独立复跑，退出 0；假 SDK 宿主传入红色 `moon.svg` 与蓝色 `blue.svg`，两条 HTTPS 请求均命中，`pageerror=0`。截图 `docs/design/game-potion-brewing/self-check/shots/S7-host-material-image-urls.png` 可见材料架两个不同图。探针结束后本地端口 5703 无监听，浏览器已关闭。首次沙箱内 Edge 临时 profile 建立失败，改在隔离的非沙箱探针环境复跑成功；该启动错误未进入 App，不计作产品失败。
- 对 `art.ts` 的未知材料 key 返回分支做**只读内存撤修验红**：先断言锚点 `return hasHostImage ? ...` 恰命中一次，再将其仅在内存中改为共享 placeholder；基线 `unknown-a → potion/host-ingredient/unknown-a`，破坏态 `unknown-a → potion/ingredient-placeholder`，与 `art.test.ts` 的点名预期冲突。未修改共享工作树。

## 告警与边界

本次测试无 Vitest 失败、浏览器 pageerror 或文档守卫告警。`git diff --check` 无空白错误，仅提示 Windows Git 将 LF 转为 CRLF。当前 `ImageAssetLoader` 未设置 crossOrigin；跨域图仍可作为 Canvas 图片显示，画布会被 taint，但本游戏渲染路径没有 `getImageData/toDataURL/toBlob`，规则判定也不读像素。真实 DokiWorld 部署时仍需核验 `img-src`、图片服务防盗链/可达性及宿主 URL 来源；该宿主联调不由本局假宿主复查冒充。
