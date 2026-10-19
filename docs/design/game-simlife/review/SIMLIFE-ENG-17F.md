# SIMLIFE-ENG-17F Review 单｜受限 Life authoring materializer M0/M1

## 1. 结论与边界

状态：**待非施工人独立复查**。

本单接受为 17A/16A 严格 authoring 收件与 17E 四文件发现约定之间的受限控制面：M0 只生成稳定计划，M1 只向显式 scratch root 原子落四份 canonical JSON。它不新增 gameplay capability/system，不改变 bundle v1，不创建真实游戏/资产，不写 AssetIndex/public/TS/launcher 注册，不调用模型、网络、数据库、服务或 Git。

本会话主 agent 已完整阅读并遵守：`AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/index.md`、`docs/playbooks/game-production.md`、`docs/design/data-driven-manifesto.md`、`docs/playbooks/assets.md`、`docs/playbooks/art-pipeline.md`、`docs/playbooks/save-platform.md`、`docs/playbooks/testing.md`、`docs/playbooks/review-gates.md`、`docs/design/game-simlife/life-generation-sop.md`、`docs/design/game-simlife/life-launcher-entry.md`、17A–17E contracts/reviews，以及 `module-assets`、`module-save` skills。技能约束使 slot 始终停在 placeholder、不触碰 AssetIndex/真实素材，并让存档 identity 继续严格由 descriptor slug 派生。

## 2. 文件面

- Node-only materializer：`src/authoring/life-materializer.ts`
- materializer 正负例/事务/撤修测试：`src/authoring/life-materializer.test.ts`
- CLI：`scripts/life-materialize.ts`
- CLI 集成测试：`scripts/life-materialize.test.ts`
- 17E 纯发现 core：`src/launcher/life-launcher-catalog-core.ts`
- 生产 fixed-glob wrapper：`src/launcher/life-launcher-catalog.ts`
- npm 命令：`package.json`
- 契约/SOP：`life-generation-sop.md`

没有改 `src/ui/**`、任何 Life gameplay 数据、AssetIndex、public 素材、正式 launcher 条目或真实游戏目录。

## 3. M0 语义实证

1. 三输入分别经过既有严格边界：bundle 重跑 envelope/canonical/source hashes/Life compile/two-tick restore/placeholder slot closure，host 走 `parseLifeHostDescriptor`，entry 走 17E 闭集 parser。
2. identity 闭包要求 bundle slug = host slug = host artSlug = launcher id = package meta.id = slot game，save namespace 必须为 `life:<slug>:v1`；随后用固定同目录四 map 调 17E `discoverLifeLauncherCatalog`，只有唯一 runnable item 才能出 plan。
3. canonical 文件固定为 `life.json`、`asset-slots.json`、`life-host.json`、`life-launcher.json`，内容为排序键 JSON + 单一 LF；plan 记录精确字节 SHA-256/长度、三输入 hash、四道 gate 与 confirmation hash。
4. M0 默认/`--plan` 都是 `writesPerformed:false`；plan 不包含图片 bytes、prompt、approval、provider、任意路径或写入动作。

## 4. M1 containment 与事务实证

1. apply 必须同时收到逐字匹配的 `--owner-confirm` 与已存在绝对 `--target-root`。目标根不能是文件系统根、workspace、workspace 的祖先/后代或 symlink；`games`/游戏目录/四文件继续逐段拒绝 symlink，并核对 realpath containment。
2. 已存在目标只接受“恰好四个 regular file 且逐字节等于 plan”；partial、extra、different、file/dir symlink 都在覆盖前失败。完全相同返回 `writesPerformed:false / writtenFiles:0`。
3. 新目标在同一 `games` 目录建立 staging，以 `wx` 写四文件；staging 先完成真实读取/parse/hash/discovery，再用一次目录 rename 发布。发布后重新读取目标并再次执行同一全链验证。
4. write、rename、post-rename 任一注入失败会清理本事务创建的 staging/target/空 games 目录。测试核对无 residue；所有成功 apply 只发生在 OS 临时目录且 finally 删除。
5. 代码不含 public、AssetIndex、图片、TS 生成、launcher 修改、pipeline/meta 写入、fetch、模型或网络调用。

## 5. 负例与撤修验红

测试覆盖 Little Valley conversion fixture 与第二异名 game；stale base/source hash、approved/contentHash、unsafe consumer、unknown entry；host slug/artSlug/save、entry id、package id、slot game 六路 divergence；错误/缺失确认；相对/root/workspace/symlink/穿越边界；existing partial/extra/different；三类注入故障回滚；exact-idempotence；四文件 parse/hash/discovery；CLI plan/apply/退出码。

撤修锚点为 `applyLifeAuthoringMaterialization` 内 `options.ownerConfirm !== checked.plan.confirmationHash`。施工人先以 `rg -F` 命中实现第 301 行及两处测试断言，临时禁用守卫后点名用例精确 **2 failed / 14 skipped**，两处都缺 `confirmation_mismatch`；恢复守卫后点名 **2 passed / 14 skipped**。复查人仍须独立撤修并确认命中。

## 6. 施工验证

```text
npx vitest run src/authoring src/launcher src/studio/library-model.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-host.test.ts src/engine/host/life-save.test.ts src/ui/components games/game-simlife scripts/life-gen-check.test.ts scripts/life-materialize.test.ts
```

结果：**82 files / 659 tests passed**。本单涉及文件 ESLint exit 0；Vite build 成功（752 modules）；`DOCS-REF: PASS`；`SYSTEM-GRAPH: PASS`（116 systems、零重复 id、零悬空显式边）。

全库 `tsc --noEmit` 仍只报既有 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx` 三组类型错误；17F 新增/重构文件零命中。`scoped-gate.mjs` 会调用 Git，受 owner 最高优先级禁令未执行。

## 7. 未来 owner 本机执行格式（本单不要求现在执行）

materializer 只允许 workspace 外 scratch root。若后续 owner 决定复现 M1，先以 M0 取得 confirmation hash，再由 owner 亲自执行下列命令；这不会直接写正式仓库，正式接入仍需另行过 S1-P/capability plan/资产与复查门。

```text
需要你在本机执行：
工作目录：C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch
目的：把已经严格通过的 Life bundle/host/launcher 四文件物化到 workspace 外的隔离 scratch root，供人工复核；不写正式 games/public。
命令：
npm run life-materialize -- <bundle.json绝对路径> --host <life-host.json绝对路径> --entry <life-launcher.json绝对路径> --apply-authoring --owner-confirm <M0输出的confirmationHash> --target-root <已存在的workspace外绝对scratch目录>
影响/风险：只会在 <scratch>/games/<slug>/ 首次创建四个 canonical JSON；partial/extra/different 目标拒绝覆盖。请先确认 scratch 目录可丢弃且不含其他同名游戏。
预期结果：退出码 0，JSON 显示 mode=apply-authoring、writtenFiles=4；重复执行显示 writtenFiles=0。
停止/回滚：命令为短生命周期，无常驻进程；若不再需要，由 owner 人工删除该 scratch 根中的 games/<slug>。
请把完整输出贴回来，我再继续依赖此步骤的工作。
```

## 8. 独立复查重点

1. 独立构造第二 slug，复跑 M0 并核对 plan 的键序、bytes/hash/confirmation 完全稳定；确认没有第五个文件或任意输出路径。
2. 逐一破坏 bundle/host/entry/package/slots identity 与 placeholder 治理，确认全部在 staging 前失败；独立扫描无 AssetIndex/public/model/network/Git/service 写路径。
3. 在新的 OS temp root 复跑首次 apply、幂等 apply、partial/extra/different/symlink 与三类故障注入，核对写失败无 residue、永不覆盖。
4. 独立撤掉 owner-confirm 守卫验红后恢复；复跑 17A–17E launcher/Life 回归，确认 catalog core 拆分未改变生产 fixed-glob 语义。

## 9. 已知非本单问题

- 全库 tsc 的三组既有类型错误未越界处理。
- 本单没有创建真实 Life 游戏或获得 S1-P/能力计划/素材审批；四文件 materializer 的通过不等于游戏可发布。
- 未执行任何 Git/GitHub、数据库操作或应用服务启动；没有无头浏览器进程或临时 materialization 目录残留。

## 10. 独立复查结论（2026-10-09）

- 复查人：模拟经营游戏策划/Lead（非施工人）。
- 独立回归：物化器、CLI、launcher discovery、bundle 收件测试 **4 files / 36 tests passed**；完整关联回归也已独立运行通过。
- 撤修验红：临时移除 `options.ownerConfirm !== checked.plan.confirmationHash` 守卫，点名 `exact confirmation|sabotage probes` 得到精确 **2 failed / 14 skipped**，均缺失 `confirmation_mismatch`；已恢复 guard，物化器 16 项测试再次全绿。
- 文件事务边界：核心代码只包含 staging 所需的 `mkdirSync`、`writeFileSync(wx)`、单次 `renameSync` 和 rollback `rmSync`；静态扫描无 `public`、AssetIndex、网络、子进程或 Git 调用。本单的 apply 测试仅使用并清理隔离临时根，未对仓库 `games/` 或 `public/` 执行物化。
- 结论：**PASS**。默认 M0 是零写计划；M1 必须有完全匹配的 owner confirmation hash，且只能向受 containment 保护的 scratch root 原子写入四个 canonical JSON。
