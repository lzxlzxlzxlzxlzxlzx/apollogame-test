# S7 宿主图片 URL 接线自检（2026-10-15）

范围：既有 DokiWorld v1 合同不增字段、不升版本；`recipe.name` 是唯一药剂名称。`ingredients[].imageUrl` 由严格 parser 接收后，仅在 render-only AssetManager 内按材料 ID 装图；`recipe.resultImageUrl` 沿既有结算图接线。图片 URL、字节不入 World/Signal/输出，加载失败不改变步骤判定。

## 机器与真浏览器证据

| 检查 | 本轮结果 |
|---|---|
| `npx vitest run games/game-potion-brewing` | 4 文件、24 测试通过；含已知材料原子换图、两个未知材料独立 key、失败回退、卸载/超时后迟到图片不换图及 World 零 URL 断言。 |
| DokiWorld App `npm test -- --run` | 1 文件、3 测试通过；接收材料/结果 URL，拒绝独立 `productName` 及非法 URL。 |
| `node scripts/dokiworld-docs-guard.mjs game-potion-brewing` | 退出 0；中文调用说明与 manifest 文档闭包在档。 |
| DokiWorld App `npm run build` | 退出 0；Vite 单 chunk 超 500 kB 告警仍在，不冒称零告警。 |
| `node scripts/potion-host-image-e2e.mjs` | 沙箱内 Edge 启动失败后，获准以同一短时隔离探针复跑退出 0；真 dist + vendored SDK 假宿主请求了两张不同 HTTPS 材料图，页面错误 0。截图中红、蓝两图分别位于两张材料卡；临时服务与无头浏览器已在 `finally` 关闭。 |

截图：[S7-host-material-image-urls.png](shots/S7-host-material-image-urls.png)。测试图片由本地探针拦截提供，并非远程真实 DokiWorld 素材；真实部署仍须核 CSP/跨域与目标图片可访问性。图片失败时保留本地获批图，未知材料保持 Shape 占位。独立复查、标准 zip 与 Owner 人门另按真实证据判定。

补充：宿主结果图异步预载期间若页面卸载，已增加关闭标记防止事后挂载；图片失败日志不输出可能含签名 query 的原始 URL。跨域图片当前仅用于 Canvas 显示，像素读取/导出不在本游戏路径内；真实宿主 CSP 仍待联调。
