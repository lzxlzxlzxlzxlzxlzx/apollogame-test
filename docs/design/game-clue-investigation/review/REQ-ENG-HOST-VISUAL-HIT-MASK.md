# REQ-ENG-HOST-VISUAL-HIT-MASK · 施工自检与独立复查导航

状态：**本地施工自检完成，等待非施工者独立复查；不得据此解锁 S2/S3 或代签 Owner 人门。** 施工主体 Codex/root，2026-10-12；未执行 Git/GitHub、服务启动、数据库或审批操作。

## 改动与边界

- `src/assets/host-visual-bridge.ts`：一次宿主会话的闭集视觉描述、64 KiB JSON / 131072 mask bit 预算、唯一 ID、无凭据 HTTPS PNG URL、声明像素与 `bitset-hex-msb` mask 校验。预备阶段创建输入顺序稳定的临时 texture/mask key；浏览器默认加载器用 `fetch(mode:cors,credentials:omit)`、PNG MIME/签名、16 MiB 上限和 `createImageBitmap` 解码，再核对原生尺寸。`projectHostVisual` 将准备好的 key 与归一摆放变为纯组件数据；任何失败整体清理并拒绝；preview 不注册、不请求远程图。重复 URL 不合并对象。`renderOrder` 固定同 zIndex 的输入顺序。
- `src/engine/protocol/host-hit-mask-catalog.ts` 与 `src/skills/tier2/clickable.ts`：动态 mask 留在 World 外的会话级 catalog；`Clickable.hitMaskKey` 以 `host-mask:` 前缀走 catalog，不回退静态 mask 或 AABB。SystemView 通过 `root` 对齐 World 身份，复用既有 `planSpriteDraw` 的 cover/contain/anchor 与零旋转 fail-closed；`DebugTrace.reject` 可解释缺失。
- `src/assets/asset-manager.ts`：局部 `unregister` 和异步竞态守卫；清理已解码 `ImageBitmap`，迟到加载不得重新污染缓存。静态资产索引、正式素材登记、游戏层 system 与 DokiWorld App 未改。
- `docs/design/game-clue-investigation/dokiworld-contract-v1.md`：修正候选示例 `320×240` 图片对应的 mask 为 `8×6`，写明宽高比约束。该候选仍非发布合同。

## 施工者实证

1. `npx vitest run src/assets/host-visual-bridge.test.ts src/assets/asset-manager.test.ts src/skills/tier2/clickable.test.ts src/assets/import/hit-mask.test.ts src/assets/asset-index.test.ts src/assembly/validate-manifest.test.ts src/renderer/renderable.test.ts src/assembly/component-map.test.ts --reporter=dot` → **8 files / 120 tests PASS**，exit 0；其中静态 mask 原六文件 93 例全在。
2. `npx eslint src/assets/host-visual-bridge.ts src/assets/host-visual-bridge.test.ts src/assets/asset-manager.ts src/skills/tier2/clickable.ts src/engine/protocol/host-hit-mask-catalog.ts` → exit 0。`node scripts/docs-ref-guard.mjs` → PASS。`npx vite build` → PASS，768 modules；仍有大 chunk 警告。
3. `npx tsc --noEmit` → FAIL，错误均在既有 `games/game-card-reveal`、`games/game-dice`、`games/game-theft`、`src/launcher/game-runner.tsx`；本单文件零命中。`node scripts/sim-dom-fence.mjs` → FAIL，唯一 `src/skills/tier3/narrative-director.ts`，本单零命中。**未宣称全库门禁绿。**
4. 唯一锚点撤修验红：先 `rg -n -F 'resolveHostHitMask((world as typeof world & { root?: object }).root ?? world, tg.click.hitMaskKey)' src/skills/tier2/clickable.ts`，仅 118 行 1 处；暂改为 `undefined`，`npx vitest run src/assets/host-visual-bridge.test.ts -t 'opaque pixel' --reporter=dot` → **1 failed / 8 skipped**，实心像素被拒收且 trace=`invalid-mask`；恢复该表达式后同命令 **1 passed / 8 skipped**。之后补入键盘用例，终态完整八文件复跑 120/120。

## 非施工者须独立核对

1. 独立复跑八文件、ESLint、构建、文档守卫，读 stderr 与全库红项，不采信本单自陈。
2. 自己选独立破坏锚点验红；特别核查会话 `dispose`、迟到加载、SystemView.root、动态 key 缺 catalog 不回退 box，以及同 zIndex 输入顺序。
3. 复现 CORS/解码/尺寸/非法 mask/预算失败；观察 snapshot/hash/Signal/output 不含 URL、二值行或图片字节。用独立隔离浏览器测试真实 CORS/preview（如有 Owner 已启动的服务或静态构建）；本单未启动服务。
4. 复查后另写独立 Review 判词。未通过前本工单及 S2 均保持未完成。
