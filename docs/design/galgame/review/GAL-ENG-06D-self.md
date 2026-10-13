# GAL-ENG-06D · 施工自证与独立复查导航（2026-10-12）

状态：**施工自证局部 PASS，待非施工者独立复查；不签路线图里程碑。**

## 范围与架构判断

- `src/services/gal-save/gal-save-preview-indexeddb.ts` 只实现可注入的 `GalSavePreviewPort`：消费现成 `IndexedDbKV`，键空间为 `gal-preview:v1:` + `[packageId,slot]` 的 JSON 编码；不改 `StoragePort`、`SaveMeta`、`WorldSnapshot`、Profile 或 `src/ui/**`。
- 写前复用 `parseGalPreviewRecord` 严格校验，读到坏 JSON/超限 JSON 交控制器判 damaged，缺失为 missing；KV 异常沿现有控制器降级 unavailable。实例化不打开数据库，GAL 宿主仍只通过显式 `savePreview` 注入。
- 这是现有基座重组，不是新的通用存储能力。真实剧情画面采集/编码、正式宿主注入、S5/S6 及跨会话真存储验收仍票外。

## 自验记录

1. `npx vitest run src/services/gal-save/gal-save-preview.test.ts`：首次沙箱 Vite 读取 `node_modules/vitest/dist/spy.js` 时 `realpath EPERM`，**0 测试收集，不计通过**；只对完全使用内存端口的同一命令复跑，14/14 通过、exit 0。
2. `npx vitest run src/services/gal-save src/services/gal-ui`：9 文件、88/88 通过、exit 0。新增三项点名覆盖无歧义跨包键、覆盖/删除/权威 hash、坏/超限 JSON 与不可用 KV；测试使用内存 `Map`，未运行真实 IndexedDB 或 fake-indexeddb 写入。
3. `npx tsc --noEmit --pretty false`：exit 1。诊断来自 `games/game-card-reveal`、`games/game-dice`、`games/game-theft`、`src/assembly/component-map.ts`、`src/launcher/game-runner.tsx`，未出现本票/GAL 文件；因此全库门禁仍 CONCERNS，绝不报全绿。
4. `node scripts/docs-ref-guard.mjs docs/design/galgame`：`DOCS-REF: PASS`、exit 0。

## 独立复查点名

- 独立重跑定向测试与类型检查，读 stderr，不采信本单自陈。
- 在隔离副本中以唯一锚点把 `gal-preview:v1:` 改坏，先断言命中，再验证键空间点名测试转红；另把读侧 `MAX_JSON_CHARS` 保护撤掉，验证超限 JSON 测试转红。勿破坏共享工作树。
- 实证复现跨包、旧 hash、坏 JSON/配额或存储失败时，合法权威存读档保持可用。确认实现未暗开数据库、未触权威 `snap:`/`env:` 键。此票通过后也不得代签真实截图采集或整条 `replay-save-preview-auto`。

本轮未执行 Git/GitHub、真实数据库或业务持久化写入，也未启动应用服务；项目控制台另按真实状态同步。
