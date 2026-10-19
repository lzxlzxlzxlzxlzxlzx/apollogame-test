# REQ-ENG-HOST-VISUAL-HIT-MASK · 非施工者独立复查

日期：2026-10-12  
复查人：Codex `/root`（非“引擎程序”施工聊天）  
结论：**PASS（Critical 0 / Major 0 / Minor 0）**

## 独立复跑

- `npx vitest run src/assets/host-visual-bridge.test.ts src/assets/asset-manager.test.ts src/skills/tier2/clickable.test.ts src/assets/import/hit-mask.test.ts src/assets/asset-index.test.ts src/assembly/validate-manifest.test.ts src/renderer/renderable.test.ts src/assembly/component-map.test.ts --reporter=dot`：**8 files / 120 tests PASS**。首次沙箱内运行因 Windows `realpath` EPERM 未收集任何测试；按同一命令在允许的短生命周期测试环境复跑后 exit 0。
- `npx eslint src/assets/host-visual-bridge.ts src/assets/host-visual-bridge.test.ts src/assets/asset-manager.ts src/skills/tier2/clickable.ts src/engine/protocol/host-hit-mask-catalog.ts`：exit 0。
- `node scripts/docs-ref-guard.mjs`：`DOCS-REF: PASS`。
- `npx vite build`：768 modules，exit 0；读到既有 `>500 kB` chunk 告警，未把告警冒称为无事。
- `npx tsc --noEmit`：exit 1；只命中既有 `games/game-card-reveal`、`games/game-dice`、`games/game-theft` 与 `src/launcher/game-runner.tsx`，本单文件零命中。
- `node scripts/sim-dom-fence.mjs`：exit 1；唯一命中既有 `src/skills/tier3/narrative-director.ts`，本单文件零命中。
- `node scripts/context-budget-guard.mjs`：exit 1；主需求池 11/10、30809/25000，另有 GAL/card-reveal 游戏池和两本手册既有超限。此为共享控制面红项，未宣称全库门禁绿。

## 独立撤修验红

除复核施工方的动态 catalog 锚点外，另选了**不同锚点**：`src/assets/asset-manager.ts` 中“描述符与 inflight promise 仍为本次加载才可回填缓存”的唯一守卫。`rg -F` 确认恰好 1 处后，临时将条件改为恒真；点名运行 `unregister during inflight`，得到 **1 failed / 9 skipped**，失败精确表现为已注销临时纹理被迟到加载重新写回。恢复原守卫并再次确认唯一锚点后，同一用例 **1 passed / 9 skipped**。现场已恢复。

同时复核施工方 catalog 破坏：临时令 `host-mask:` 分支返回 `undefined`，点名 `opaque pixel` 得到 **1 failed / 9 skipped**，`DebugTrace` 为 `reject / invalid-mask`；恢复后 **1 passed / 9 skipped**。这证明测试既会抓到动态 catalog 接缝，也会抓到 dispose 后迟到异步加载污染。

## 代码与行为核对

- 输入只接受闭集 plain object、稳定 ASCII id、无用户名/密码的 HTTPS `.png` URL、整数原生尺寸、零旋转、合法 contain/cover/anchor 和 `bitset-hex-msb`；mask padding、宽高比、总 bit 与 JSON 预算均 fail-closed。
- 远程 URL 只进入 `AssetManager` 描述符；World 投影仅含临时 texture/mask key、Transform/Sprite/Clickable。现有快照用例确认不含 URL、图片字节或 mask 行。
- `HostPngAssetLoader` 使用 `mode:'cors'`、`credentials:'omit'`、10 秒 abort、PNG MIME/签名与 16 MiB 上限，再以解码尺寸核对声明尺寸；重定向后的 URL 重新过 HTTPS PNG 边界。
- 动态 mask 位于按 World 身份绑定的会话 catalog；`SystemView.root` 能解析同一 World。缺 catalog、缺/坏 mask、贴图 key 不符、非零旋转都拒收，绝不回退 Shape/AABB。
- 命中复用 `planSpriteDraw`，cover/contain/anchor 与渲染同义；鼠标/触控共用世界坐标，键盘发同一具名 Signal 且不依赖像素采样。
- 同 zIndex 使用从输入顺序派生的唯一 `renderOrder`，不受异步加载完成顺序影响；重复 URL 仍保留不同对象 key。
- 成功或失败 dispose 都解绑 catalog、清临时 mask/texture；异步迟到句柄会关闭且不能回填缓存。preview 返回空 visuals，零注册、零远程请求。

## 判词边界

本判词只确认通用“宿主动态 PNG + 预烘焙二值 mask”能力满足工单写死边界。它不代表 DokiWorld App、游戏 S2、正式 parser/manifest、全库门禁或 Owner 人门已经通过；这些仍按各自阶段和控制台状态推进。
