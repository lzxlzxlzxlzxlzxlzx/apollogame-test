# SIMLIFE-ENG-17A Review 单｜life-host.v1 严格运行描述符

## 1. 施工结论与边界

状态：**待非施工人独立复查**。

本单接受 owner 的 A 裁决，新增 sim 外、authoring-only 的 `zerocraft.life-host.v1` 严格纯数据合同。它只选择已有 Life host 零件，不新增 gameplay capability/system，不进入 World/snapshot/runtime hash，不接 launcher，不执行 materialize，也不读写游戏目录、AssetIndex、数据库或网络。

本会话完整阅读并遵守：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/design/data-driven-manifesto.md`、`docs/design/capability-plan-template.md`、`docs/design/ui-playbook.md`、`docs/playbooks/ui.md`、`docs/playbooks/assets.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`、`docs/design/asset-slot-brief.md`、`docs/design/game-simlife/life-generation-sop.md`、`docs/design/game-simlife/capability-plan.md`、`docs/design/game-simlife/requests.md`；命中 UI/资产/存档 authoring 边界，使用 `module-ui`、`module-assets`、`module-save`。

## 2. 文件面

- 核心合同/validator/hash：`src/authoring/life-host-descriptor.ts`
- 两个独立 fixture：`src/authoring/life-host-descriptor.fixture.ts`
- 合同与安全负例：`src/authoring/life-host-descriptor.test.ts`
- authoring SOP：`docs/design/game-simlife/life-generation-sop.md`
- ENG-17 实查报告：`docs/design/game-simlife/SIMLIFE-ENG-17-life-host-materialization-investigation.md`
- 工单与本 Review：`docs/design/game-simlife/requests.md`、本文件

未改 `life-generation-bundle.ts`，因此 ENG-16 的 bundle v1 envelope、canonical payload/hash、CLI 与 dry-run plan 保持原语义；descriptor 只以独立 API 存在。

## 3. 合同实证

1. root、viewport、hud、input、save 全部闭字段；只接受 plain object，非普通 prototype fail-closed。
2. slug 严格为 `game-` 小写 kebab；`artSlug` 必须逐字等于 slug；package/slot 路径只能分别为 `life.json` / `asset-slots.json`。
3. viewport 全为有限正整数并设上界：field 8192、bar 2048、cell 512；mode/cameraFit 闭集。
4. theme/input/HUD/autosave 均为一期单值 preset；HUD labels 只有 11 个通用语义 key，拒绝 NPC/zone id、action、CSS、LayoutNode 或自由模块字段；title/labels 禁控制符并限长。
5. save namespace 只接受 `life:<slug>:v1`，schemaVersion 只为 1；不以 Life content id 命名。
6. `hashLifeHostDescriptor()` 复用 ENG-16 `sha256Canonical()`；对象键顺序变化 hash 不变，可见值变化 hash 必变。
7. Little Valley 等价 fixture 只证明合同可描述当前参数，不声称已迁移运行；第二个 `game-seaside-market` fixture 使用不同 slug、尺寸、标题和词条，证明合同未硬编码 Little Valley。
8. 本单无 tick/world decision，按日志规则不添加 DebugTrace。

## 4. 独立复查命令

工作目录：

```text
C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch
```

定向测试与连带回归：

```text
npx vitest run src/authoring/life-host-descriptor.test.ts src/authoring/life-generation-bundle.test.ts scripts/life-gen-check.test.ts src/assembly/life-package.test.ts src/assembly/life-package-compile.test.ts src/assets/asset-slot-brief.test.ts
```

施工结果：6 files / **63 tests passed**，其中 descriptor **28 tests passed**；CLI no-write 测试真实子进程通过。

Lint：

```text
.\node_modules\.bin\eslint.cmd src/authoring/life-host-descriptor.ts src/authoring/life-host-descriptor.fixture.ts src/authoring/life-host-descriptor.test.ts --max-warnings 0
```

结果：exit 0，零 warning。

文档与系统图：

```text
node scripts/docs-ref-guard.mjs
npx vite-node scripts/system-graph-audit.mjs
```

结果：`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`，116 systems、零重复 id、零悬空显式边。全局超集环仍为工具明示的 4 个 informational 组合，不是本单新增，且本单未改 system。

副作用静态扫描：

```text
rg -n "writeFile|mkdir|rename|copyFile|fetch\(|XMLHttpRequest|AssetIndex|launcher|materializ|localStorage|indexedDB|child_process|spawn\(|exec\(" src/authoring/life-host-descriptor.ts src/authoring/life-host-descriptor.fixture.ts src/authoring/life-host-descriptor.test.ts
```

结果：零命中。

TypeScript 全库只读检查：

```text
npx tsc --noEmit --pretty false
```

结果：仍失败于既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx` 类型错误；输出无任何本单文件。按冻结边界未修无关红。

备注：沙箱内 Vitest/Vite 对 `node_modules/vitest/dist/spy.js` / audit 脚本 `realpath` 持续报 Windows `EPERM`；获准在沙箱外复跑后上述测试/系统图真实通过。这不是测试内容失败。

## 5. 撤修验红（已由施工人执行，复查人仍须独立复跑）

锚点命中：

```text
rg -n "artSlug !== raw\.slug|cross-game artSlug" src/authoring/life-host-descriptor.ts src/authoring/life-host-descriptor.test.ts
```

施工前精确命中实现 1 处、测试 1 处。临时撤掉实现中的：

```ts
if (raw.artSlug !== raw.slug) add('/artSlug', 'art_slug', 'must exactly equal slug');
```

再运行：

```text
npx vitest run src/authoring/life-host-descriptor.test.ts -t "rejects bad slug and cross-game artSlug"
```

真实得到 1 failed：期望 `/artSlug:art_slug`，实际诊断中缺失；证明测试确实覆盖跨游戏资产串读守卫。随后用 `apply_patch` 恢复锚点，最终 6 files / 63 tests 全绿。

## 6. 复查重点

1. 逐个破坏 root/nested unknown、`__proto__` / `constructor`、两条固定路径、slug/artSlug、viewport 数值/枚举、HUD labels/text、input/theme/autosave、save namespace/version，核对 path+code 稳定。
2. 独立确认 valid descriptors 不产生任何 diagnostics，且 parse 返回深拷贝。
3. 独立调换对象键序、改一个可见值，核对 canonical hash 性质。
4. 确认 `LifeGenerationBundle v1` fixture/hash/CLI 未变化，且 descriptor 没有进入 World/snapshot/runtime hash。
5. 重跑副作用扫描，并检查 imports 仅复用 canonical hash，无 fs/network/launcher/AssetIndex 写路径。
6. 按上述锚点再次撤修验红；Review 单只作导航，不采信施工人自陈。

## 7. 已知非本单问题

- 全库 tsc 的 game-dice/game-theft/launcher 类型红在本单前已存在，本单不触碰。
- launcher descriptor runner、通用 Life view/UI/save/host、materializer 均是 ENG-17 后续切片；本单刻意不抢跑。
- 本单没有执行任何 Git/GitHub、数据库或服务启动操作。

## 8. 独立复查结论（2026-10-09）

- 复查人：模拟经营游戏策划/Lead（非施工人）。
- 独立回归：运行 review 所列六文件集合，结果 **6 files / 63 tests passed**；含 descriptor 28 项、ENG-16 generation bundle/CLI、Life package compiler 与 AssetSlot 既有回归。
- 撤修验红：临时移除 `raw.artSlug !== raw.slug` 的 `art_slug` 拒收分支，点名运行 `rejects bad slug and cross-game artSlug`，精确得到 1 failed、27 skipped，失败原因为测试期望 `/artSlug:art_slug` 而实际诊断缺失；已逐字恢复该分支，descriptor 28 项再次全绿。
- 边界复核：对核心、fixture 与测试扫描写盘、网络、AssetIndex、launcher、materializer、存储和子进程关键词，无命中；唯一 import 为 ENG-16 canonical hash 工具。未发现 bundle v1、World、snapshot 或运行时 hash 被改写。
- 结论：**PASS**。`life-host.v1` 已将可生成的宿主选择数据冻结为严格、可审计、无副作用的 authoring 契约，且没有抢跑后续宿主、启动器或物化工作。
