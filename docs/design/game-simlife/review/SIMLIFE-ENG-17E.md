# SIMLIFE-ENG-17E Review 单｜启动器 Life descriptor runner

## 1. 结论与边界

状态：**待非施工人独立复查**。

本单接受为 launcher/host 共享接线缺口：`mountLifeGame` 已存在，但此前每个游戏仍需手改卡片表和 loader map。实现只增加 build-time 固定发现、严格 catalog 边界与生命周期 runner；不新增 gameplay system、自由模块加载器、materializer、真实游戏/资产、数据库、服务或 Git 操作。

本会话主 agent 已完整阅读并遵守：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/design/data-driven-manifesto.md`、`docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`docs/playbooks/assets.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`、17A–17D contracts/reviews，以及 `module-ui`、`module-assets`、`module-save`、`check-ui` skills。技能约束使实现继续复用 LayoutNode Life HUD、受控 AssetManager 与 descriptor-derived save，而没有在 launcher 里制造游戏 UI、资产或存档旁路。

## 2. 文件面

- 严格 catalog：`src/launcher/life-launcher-catalog.ts`
- catalog 负例与第二 fixture：`src/launcher/life-launcher-catalog.test.ts`
- Life runner/bridge：`src/launcher/life-game-runner.tsx`
- runner lifecycle：`src/launcher/life-game-runner.test.tsx`
- 真实 bridge 集成：`src/launcher/life-launcher-integration.test.ts`
- launcher 接线：`src/launcher.tsx`、`src/launcher/game-runner.tsx`
- 契约说明：`life-launcher-entry.md`
- 可视审计/截图工具：`tools/audits/life-launcher.audit.ts`、`tools/life-launcher-visual-proof.mjs`
- 三尺寸截图：`self-check/eng17e/life-launcher-640x720.png`、`life-launcher-1060x760.png`、`life-launcher-1440x900.png`

## 3. 语义实证

1. 生产发现只有四个源码字面量 eager glob：`games/*/life-launcher.json`、同目录 `life-host.json`、`life.json`、`asset-slots.json`。entry 不含路径字段；没有 fetch、运行时 importer 或数据驱动 dynamic import。
2. `zerocraft.life-launcher.v1` 根对象严格闭集；id、纯文本长度、六位颜色均受限。entry id 必须同时等于目录、descriptor slug、package meta.id 与 asset-slot game；host/package/slots 分别走既有严格 parser/compiler。
3. 无效条目只有 `coming-soon` 诊断卡，没有 bundle；错误信息只暴露稳定 code，不回显异常/stack。未知 glob key 被忽略，缺固定文件、unknown/prototype-shaped metadata、unsafe path 字段、重复 id 与四路身份错均 fail-closed。
4. 可运行条目用 `life:<id>` 隔离于内置 `game-*` 和 library `lib:*`。`GAMES` 字面量及 built-in loader map 原样保留；player/library 路由和现有 launcher 回归全绿。零 entry 时 catalog 为空、启动器行为不变。
5. `LifeGameRunner` 只接受已发现 bundle，并调用 17D `mountLifeGame`；同步失败不运行，异步失败立即 dispose 并显示受控错误，切换/卸载释放旧 handle，host exit 仍回 launcher。
6. runner 不提供 save slot override，只传 storage port；集成测试核对实际 `LifeHostSaveAdapter.slot === deriveLifeHostSaveSlot(descriptor)`。
7. 第二个 `game-seaside-market` fixture 从固定模块 map 自动发现并实际 mount，共享 HUD 显示“海风集市”，无“小山谷”专名。World snapshot 不含 launcher schema/title、asset approval 或 prompt。

## 4. 负例与撤修验红

catalog 测试覆盖：零条目；unknown/URL/module 字段；非 plain object 与 `constructor`；缺三文件；invalid host/package/slots；entry-directory、descriptor、package、slots 四路身份错；重复 id；固定 glob 外 key；稳定排序。runner 测试覆盖 host 参数、save slot 不可覆盖、back、切换、卸载、invalid-before-mount 与 async reject cleanup。

撤修锚点为 `discoverLifeLauncherCatalog` 内 `entry.id !== directory` 的 `directory_mismatch` 守卫。施工人临时移除后，点名身份测试精确 **1 failed / 9 skipped**，缺失诊断恰为 `directory_mismatch`；恢复锚点后最终回归全绿。复查人仍须独立撤修并确认命中。

## 5. 施工验证

```text
npx vitest run src/launcher src/studio/library-model.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-host.test.ts src/engine/host/life-save.test.ts src/authoring/life-host-descriptor.test.ts src/ui/components games/game-simlife
```

结果：**78 files / 633 tests passed**。本单 ESLint exit 0；Vite build 成功（751 modules）；`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`（116 systems、零重复 id、零悬空显式边）；game-simlife audit ratchet PASS，既有零能力接入仍是黄色 warning。

`check-ui` 的 `src/ui/components` 已含于 633 测试；实际 launcher bridge 在 640×720、1060×760、1440×900 的 UI audit 均为 overlap 0、硬对比 0、border-image 前提 0、低对比 warning 0。audit 的“零华丽件”是非阻断提示：该 fixture 只验证既有标准 Life HUD + Canvas host，没有新建游戏屏或修改 HUD；既有 game-simlife audit 仍命中 4 个华丽件。三尺寸截图均为实际 `mountLifeLauncherItem → mountLifeGame` file:// 路径，页面错误 0、单 canvas；隔离浏览器已关闭，`.ui-audit-tmp` / `.life-launcher-proof-tmp` 均已清理。

全库 `tsc --noEmit` 仍只报既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx` loader 签名错误；本单新增文件零命中。`scoped-gate.mjs` 会调用 Git，受 owner 最高优先级禁令未执行。

## 6. 独立复查重点

1. 确认四个 glob 都是源码字面量 fixed convention，entry 任意字段不能改变 module key；扫描 catalog/runner 无 fetch 或数据驱动 import。
2. 独立构造第二 id，复跑发现→卡片→runner→`mountLifeGame`，确认不新增 TS gameplay/loader 分支。
3. 逐一破坏 entry、descriptor、package、slots 与四路 identity，确认只有 diagnostic card 且无 DOM/World/listener/loop。
4. 快速切换/返回并制造 `ready` reject，核对 handle 释放和错误文案不泄漏 stack。
5. 独立撤掉 id-directory 守卫验红后恢复；复查三张截图和三尺寸 UI audit。

## 7. 已知非本单问题

- 全库 tsc 的三组既有类型错误未越界处理。
- game-simlife audit 的“零能力接入”是既有结构性黄色 warning，本单没有新增红旗。
- 当前仓没有正式 `life-launcher.json`，因此生产 catalog 为空且保持 launcher 零回归；第二条目只存在于测试/审计 fixture，未伪装成 materialized game。

## 8. 独立复查结论（2026-10-09）

- 复查人：模拟经营游戏策划/Lead（非施工人）。
- 独立回归：启动器、Life host、存档、descriptor、UI components 与 Little Valley 集合结果为 **78 files / 633 tests passed**。
- 撤修验红：临时移除 `entry.id === directory` 的 `directory_mismatch` guard，点名身份不匹配测试精确得到 1 failed、10 skipped，缺失 `directory_mismatch`；恢复后 catalog 11 项测试再次全绿。
- 发现边界复核：仅有四个源码字面量 `import.meta.glob`，分别固定为 launcher/host/package/slot JSON 约定；无 `fetch`、运行时动态 import 或由 entry 字段驱动的路径加载。`packagePath`/`assetSlotsPath` 只在 catalog 内作为受控同目录 module key，不执行 authoring descriptor 路径。
- 结论：**PASS**。启动器已能安全发现、隔离并运行纯数据 Life 条目，且不影响既有内置游戏与卡带入口；真实新条目仍须经过下一阶段的受限物化与 owner 人门。
