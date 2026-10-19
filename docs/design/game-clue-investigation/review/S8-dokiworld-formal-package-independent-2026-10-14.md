# DokiWorld 正式包独立复查（2026-10-14）

**判词：PASS（仅 `dokiworld/game-clue-investigation/**` 的本地正式候选、假宿主协议与 ZIP 闭包）；不等于 DokiWorld 平台验收或游戏 S8 总门通过。** 本人不是本轮施工者，旧 `S8-independent-2026-10-14.md` 的 FAIL 不被本判词覆盖；未修改 Owner 人门、流程板、施工代码或远端。

## 独立实证

- 实查 `src/contracts.js`、`src/scene-data.js`、`src/main.ts`、`manifest.json`、`scripts/build.mjs`、调用文档、SDK v2 host/client 实现及 `src/assets/host-visual-bridge.ts`。合同只接受无凭证 HTTPS `.png`、真实尺寸、零旋转、严格 bitset 与 1–12 物件；背景/特写不是可点击输入；World 投影只含资源 key 与 mask key，不含 URL、bitmap 或原始 rows。桥的 loader 对重定向后的 `response.url` 再校验 HTTPS PNG 边界。
- `npm test`（包目录，最终文件）：exit 0，**12/12**；包括真实 Markdown JSON 示例经生产 parser/validator、`dist` SHA 文件集。`npm run test:runtime`：exit 0，**3/3**，覆盖 1/7/12 物件 manifest 解析；解析器对宿主会话蒙版（不在静态 index）发预期“未绑定有效掩码”警告，非静态蒙版回退证据。根目录 `node scripts/dokiworld-docs-guard.mjs game-clue-investigation`：exit 0，`1 current app(s)`。
- 本轮独立 `npm run build`：exit 0。完整可行动告警：Vite 指出 `src/skills/atoms/random/index.ts` 同时被动态及静态导入，动态导入不会另拆 chunk；另有 `Some chunks are larger than 500 kB after minification`。无构建错误。最终 ZIP 在文档样例修正后由施工方重建；本人逐文件独立读回：**159 文件、880036 bytes，ZIP 条目集合 = dist 文件集合，每一 ZIP 字节 = 对应 dist 字节，158 条 `SHA256SUMS.txt` 全匹配**；根层含 `index.html`、`manifest.json`、`SHA256SUMS.txt`，调用文档在 `docs/`。施工方原 Python pack helper 因 WinError 2 / npm shim 子进程失败，改用同一 SHA/hygiene 和 ZIP 根目录规则出包；本次只确认最终产物闭包，未声称原 helper 成功。本人环境 `py` 亦报告 `No installed Python found!`，遂用仓库已有 `fflate` 对 ZIP 独立解包核字节。
- 真浏览器假宿主探针 `formal-host-probe.mjs`：短时 `127.0.0.1` 随机端口静态服务 + 隔离 Edge Headless iframe，SDK `createAppHost` 实际握手。用文档输入改成 1×1 有效 PNG/1-bit mask（保留一条必要线索），跨域图片由探针拦截并返回浏览器 canvas 生成的真实 PNG。画布实际像素点击进入调查，再点击“收录证物”：`onComplete` **恰一次**，结果为 `requestId=req-archive-007`、`investigationId=archive-room-007`、`outcome=completed`、`collectedObjectIds=[broken-latch]`，宿主 accepted，无 exit、无 console 警告。宿主 rejected：仍恰一次 complete、无 exit，UI 明确“不重复提交或自行结算”。取消确认：exit **一次**、complete **零次**。接受后重开再收录：complete 总数仍 **一次**。每轮输出均 `CLEANUP browser-and-server-closed`。最初手写 PNG fixture 解码失败及取消按钮名称探针误写均已更正并复跑，不算产品失败。
- 唯一锚点撤修验红：`formal-contract-sabotage.mjs` 在内存里断言 `parsed.protocol !== 'https:'` **恰命中 1 次**，以 HTTP 背景 URL 对照：原 parser 拒绝，撤掉该检查的临时 data-URL 模块错误接受；未改源码，源码前后 SHA-256 `e7d0e7d041b738610caca220407b1d9dbd56bb78196ecc73024b82e0e2c25cc5`。说明定向合同测试确实依赖该防线。

## 边界与剩余告警

- 真浏览器只复现单线索、1-bit mask 的宿主链；1–12/cover/contain 与非规则 mask 的正式 manifest 静态定向测试已过，但本窄审没有穷举 12 物件跨域图片的真浏览器压力路径。
- 假宿主确认 SDK 消息序列与一次性结果，不代表真实 DokiWorld 宿主已安装、发布或完成平台验收；宿主需对 `requestId` 自行幂等结算。拒收/超时无自动重试符合文档，但接入方必须保留查询/人工恢复路径。
- 构建两条 Vite 警告与 Python pack helper 在本机不可用应留档；当前 ZIP 字节闭包为 PASS，不能把这两项写成“全链无告警”。
