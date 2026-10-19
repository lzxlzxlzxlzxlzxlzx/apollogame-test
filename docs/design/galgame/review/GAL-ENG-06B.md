# GAL-ENG-06B 施工自证与独立复查导航

> 2026-10-11；施工主体 Codex/root。Owner 已选 C5a 的 A，并豁免本项目先 Git 抢锁的顺序；不放宽 Git/GitHub、数据库、真实持久化写入或应用服务启动禁令。本单只论非权威预览 sidecar；非施工者另行签署局部结论。

## 合同、归属与实现锚点

- `src/services/gal-save/gal-save-preview.ts`：可替换 `GalSavePreviewPort`，按 packageId + slot 隔离，记录以当前权威 hash 绑定；PNG/WebP base64 仅允许边长 ≤1024、编码后 ≤256 KiB，拒 SVG、远程 URL 与恶形结构。CRC/头部检查后还做有上限的实际图像解码（浏览器 ImageBitmap；无浏览器解码器的宿主对 RGBA8 PNG 做 deflate/扫描行验证，其余格式保守拒收），防止空/伪 IDAT 冒称可显示图片。控制器先用 `GalManualSaveController.inspect` 在隔离 World 验权威存档，再取可选侧车，并在取回后复验权威 hash。侧车缺失、损坏、不可用、旧 hash 显式降级；恶形 getter/Proxy 亦降级而不抛出。写失败不影响已完成的权威保存，删档先删权威再尽力清侧车。只有内存端口实现，未落真实存储适配或截图采集。
- `src/services/gal-save/gal-manual-save.ts`：抽出原读档核验的 `readVerified`，供无 active World 副作用的 `inspect` 复用；`load` 仍在全部核验通过后才恢复活动世界。未修改 `SaveMeta`、`StoragePort` 信封、`WorldSnapshot` 或 Profile。
- `src/services/gal-ui/gal-ui-read-model.ts`、`gal-ui-slice-host.ts`、`gal-ui-structure.ts`：宿主可注入侧车端口，只读刷新槽投影；只为当前 12 槽异步读取，authority 的 refresh/save/load 不等 sidecar，epoch+hash 拒绝迟到结果。read model 复核包/槽/hash 与数据 URL，LayoutNode `Image` 消费有效图像，其余状态用文本降级。无预览时旧 4×3 槽及读档行为不变。不改 PUI 共享基座，也不把图像视作进度或解锁事实。
- `src/services/gal-save/gal-save-preview.test.ts`、`src/services/gal-ui/gal-ui-slots-preview.audit.ts`、`measure-gal-06b.mjs`：纯/内存边界、宿主刷新、静态浏览器截图与几何探针；浏览器仅访问本地 HTML/静态构建，结束时关闭，任务临时目录清理。

## 施工者实测（不是独立复查）

- `npx vitest run src/services/gal-save src/services/gal-ui src/services/gal-profile src/skills/tier3/narrative-director.test.ts --pool=forks --maxWorkers=1 --minWorkers=1`：全域回归 10 文件 116/116，退出 0（在最后两条挂起/分页用例之前）。之后 06B 点名 11/11，save/UI 联合 28/28，均退出 0。覆盖新/旧槽、跨包、覆盖/删除、空/伪 IDAT、恶形 getter、权威坏档、失败/挂起端口、旧截图迟到、当前页限定 I/O、LayoutNode 与宿主刷新。
- `npx vitest run src/ui/components --pool=forks --maxWorkers=1 --minWorkers=1`：65 文件 506/506，退出 0；相关 TS ESLint 退出 0；GAL save/UI depcruise 286 模块、1224 依赖、违规 0。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slots-preview.audit.ts --w 1440 --h 900` 及旧槽 fixture：各退出 0，重叠、硬低对比、对比警告、border-image 阻断均 0。华丽度/house 检测提示仅属既有结构切片，不能据此声称完整 S5/S6。首次同画布实测发现图片触发默认留白，将预览区从 80px 撑至 106px、状态文字溢出；改为闭集 `padding:0` 后预览区 82px、状态 bottom 400 < 卡片 bottom 413，复测退出 0。
- `node src/services/gal-ui/measure-gal-06b.mjs`：本地定稿原型与静态 LayoutNode 同为 1440×900，图像加载成功，12 卡可见；浏览器与临时构建已关闭/清理。截图 `gal-eng-06b-prototype-slots.png`、`gal-eng-06b-current-slots-preview.png`。原型 grid x84 y238 1272×508、卡 309×164；现有结构切片 grid x84 y237 1272×552、空卡/预览卡均 309×176。高度差为既有 S4 结构偏差，本票不反改原型、不签全局 1:1。图像为显式测试色块，不冒称正式剧情画面或真实截图采集。
- 全库 `npx tsc --noEmit --pretty false` 退出 1：末轮诊断只在 game-card-reveal、game-dice、game-theft、launcher，06B 文件零诊断；不得称全库门禁绿。较早一轮还在 game-simlife 有 1 条，末轮已不出现，属共享工作树其他在途改动，不能归功本票。`scoped-gate.mjs --run` 内含 Git，按 Owner 最高禁令未运行。未执行 Git/GitHub、数据库、真实业务持久化写入或应用服务启动。

## 非施工者复查必核

1. 自行复跑定向测试/静态分析，检查破损与跨包侧车是否可能提升权威、延迟读与迟到写是否可能显示错图；实证复现疑点。
2. 在隔离副本带唯一锚点撤修验红，证明 hash 或权威复验的测试断言实际转红；不得改共享实现或做 Git 操作。
3. 复查 1440×900 图像卡片几何、静态浏览器关闭与两张截图，读全量警告。只签本票局部 PASS/CONCERNS/FAIL；真实截图采集、持久化适配、S4/S5 1:1、全库门禁与项目控制台 done 均不在本票结论内。

## 非施工者独立复查签署（2026-10-11）

**结论：GAL-ENG-06B 局部 PASS。** 只放行非权威侧车合同、只读宿主投影及内存验收；不代表真实截图采集、持久化适配、完整 GAL、S5/S6 或全库绿灯。复查者未编辑共享实现或 Review、未执行 Git/GitHub、数据库写入或应用服务启动。

1. **独立复跑与实证：** 06B 11/11、既有手动档 10/10、宿主 18/18，共 39/39。最初实证三处缺陷：ready 图仍被 footer 写成“暂无真实存档预览”；合法 PNG 头/CRC 携空 IDAT 或伪 zlib 字节被结构解析误收；抛错的侧车 getter 逃逸使宿主刷新失败。施工者分别修复并补点名回归，复查者重跑确认。挂起端口的宿主用例证实权威覆盖保存不等待预览；第 13 槽只在第二页读取 sidecar。
2. **隔离撤修验红：** 在内存 esbuild 副本对二次权威 hash 校验锚点精确命中 1 次；同一“读侧车期间权威档换 hash”探针，原实现返回 `stale`，只在隔离副本撤守卫后返回 `ready`。未改共享文件、未写临时源码。
3. **同画布与告警：** 独立复跑 1440×900 ready 槽静态审计，12 卡可见、图像和状态均在卡内，重叠 0、硬对比 0、AA 对比警告 0、border-image 阻断 0；隔离 Edge 已关闭、临时目录已删除。审计的“华丽件仅 glass:1、未识别 house 皮”为非阻断提示；同画布仍存在既有原型/结构切片高度与美术差异，不能签 1:1 或 S5/S6。
4. **全库边界：** 复查者独立运行 `tsc` 仍退出 1，诊断只在 game-card-reveal/game-dice/game-theft/launcher，无 06B 新诊断；不得将局部 PASS 称作全库门禁绿或控制台里程碑 done。
