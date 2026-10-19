# SIMLIFE-BUNDLE-05 独立 Review

状态：**PASS（2026-10-12，非施工人独立复查）**。

施工自检：`docs/design/game-simlife/self-check/SIMLIFE-BUNDLE-05.md`。施工自检仅作导航；以下判词基于复查人从当前终态重新读代码、独立复跑、竞态 probe 与撤修验红所得。

## 架构判定

**接受 owner 已裁决的 A。** 现有 Bundle checker/materializer 都只消费完整 Bundle，不能把分阶段批准的纯数据切片安全组合为候选。实现位于共享 authoring control plane，复用唯一 `checkLifeGenerationBundle()` 与 `sha256Canonical()`，没有新增游戏 runtime/system、第二套 Bundle 校验器或 `game-demon-castle` 分支。

## 独立核证

- [x] `zerocraft.life-generation-slice-manifest.v1` 与 patch 的根对象、session、operation 均闭集；对象必须普通，array 不冒充 object，未知字段 fail-closed。
- [x] source root 必须绝对、已存在、canonical、非文件系统根、真实非 symlink 目录；manifest/world/slices/asset-slots 只接受互不重复的同目录安全 `.json` basename，source 必须是普通非 symlink file。
- [x] slice 固定同一 `baseWorld`；`requiresSlices` 必须与全部已批准前序文件逐项、同序相等。operation 只允许 `add|replace`；JSON Pointer 禁根、空段、坏 escape、`__proto__|prototype|constructor`、未批准根、缺 parent、越界/非规范数组下标及重复非 append 路径。
- [x] value 只接受可克隆的有限 JSON 标量、数组和普通对象；循环、非有限数字、原型对象和 prototype key 均拒绝。
- [x] composer 从最终 Life package 与 AssetSlot draft 重算 source hashes/base hash，不信任作者 hash；随后复用严格 Bundle、compile、two-tick snapshot/hash/restore 与 slot closure 检查。
- [x] 默认 plan 零写；显式 write 只允许固定 `bundle.candidate.json`。同目录 staging 先严格复验，再以不覆盖的 hard-link 原子发布；已有目标只有逐字节相同且严格验证通过才幂等零写。
- [x] source root、全部 source、staging、published target 均有字节和 bigint `dev+ino` 竞态守卫。different/partial/extra、source/target/staging 篡改、symlink、写/发布/复验故障均 fail-closed；catch 只清理仍绑定本事务 inode 的条目，外部替换者保留。
- [x] 首轮复查发现发布后 source 可变化但仍返回成功的 Major；终态在最终成功前再次执行 `sourcesUnchanged(allSources)`，稳定返回 `source_changed`，保留外部 source 修改并删除本事务 candidate。永久回归与独立复现均通过。
- [x] 魔王城真实 source manifest 重建 `baseHash sha256:ab2510b87787a77c74e3416fd00064bc396dbb7f18d6be980b803f91e8b37890`；现有 candidate 为 39246 bytes、文件 hash `sha256:0acb457785a0d61f4b9836b82ad8d25057d50fe76a0ba9cc92e0313b6658340a`，slug 与闭集根字段正确；既有 M0 四文件 plan 回归保持一致。
- [x] CLI 默认 plan，`--plan|--write-candidate` 互斥，唯一输出名不可注入。manifest 可为 basename，或无 `..` 且从 cwd 解析后父目录恰等于 source root 的相对路径；CLI 只把最终 basename 交给核心，核心 basename-only 合同未放宽。绝对路径、URL、`..` 与其他目录均以直接子进程 exit 2 拒绝；未执行正式 `--promote` / `--apply-authoring`。
- [x] 静态扫描实现/CLI 未命中 `game-demon-castle`、public、AssetIndex、网络、模型、子进程、数据库、Git 或服务副作用。

## 首轮 Major 与返修复验

首轮独立 probe 在 `afterRename` 中只修改 OS 临时 source root 的 `world.life.json`。旧终态仅复核 source root inode、candidate inode/bytes，返回 `ok:true`；candidate/provenance 因而可能不再对应“当前 source”，违反 source race fail-closed，判为 **Major**。

返修后最终复验先重新检查 source root 与 `sourcesUnchanged(allSources)`，再检查 candidate identity/bytes。永久用例 `fails closed and removes its candidate when a source changes after publication` 独立点名为 **1 passed / 21 skipped**：结果含 `io_failure + source_changed`，外部 source 修改原样保留，本事务 candidate 删除。该 Major 已关闭。

## 后续两轮 Major 与返修复验

第二轮由策划实跑首个试点命令发现：用户按文档传入 `docs/design/game-demon-castle/bundle.sources.json` 时，旧 CLI 把完整相对路径直接交给 basename-only 核心，得到 `unsafe_source_name`。终态 CLI 只接受安全 basename，或解析后父目录逐字等于 `--source-root` 的无 `..` 相对路径，再降为 basename 交核心。复查人原样执行：

```text
npm run life-bundle-compose -- docs/design/game-demon-castle/bundle.sources.json --source-root C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch\docs\design\game-demon-castle --plan
```

退出码 0，JSON 为 `ok:true / mode:plan / writesPerformed:false`；`inputHash sha256:1a8c62c9631ca677a377838304b78ea39931e4c3065e05ae8de3c06a04a42761`、`bundleHash sha256:ab2510b87787a77c74e3416fd00064bc396dbb7f18d6be980b803f91e8b37890`、candidate hash/bytes 均与已审记录一致。直接 CLI 子进程对绝对路径、URL、含 `..`、解析到其他目录四类输入均精确 **exit 2**。该 Major 已关闭。

第三轮独立全量曾真实捕获 post-publication 外部替换文件偶发 `ENOENT`：数字型 `Stats.dev/ino` 在 Windows 上可能丢失 64 位身份精度，使回滚误认并删除替换者。终态将 `EntryIdentity` 改为 bigint，并让 root/source/staging/published 的身份采集和比较全部使用 `lstatSync(path,{bigint:true})`。永久用例每次循环 32 个独立 temp root；复查人独立运行 **8 轮 × 32 = 256 次替换，256/256 PASS**，随后 Composer/CLI 与联合回归各再通过一轮含 32 次的压力用例。该 Major 已关闭。

真实 candidate 再进入既有 M0：

```text
npm run life-materialize -- docs/design/game-demon-castle/bundle.candidate.json --host docs/design/game-demon-castle/life-host.candidate.json --entry docs/design/game-demon-castle/life-launcher.candidate.json --plan
```

退出码 0，`mode:plan / writesPerformed:false / conflicts:[]`，四个内容 hash 与已审记录一致，confirmation hash 精确为 `sha256:441ab550e45b61362cb9e7bdc1b022ac0721714bc24b137f56b0b70a14fd09ee`。

## 独立复跑与 warning 裁决

普通 Windows 沙箱在 Vitest 收集前被 Node 24 `realpath` 以 EPERM 拒绝，无测试执行。按本单许可使用短生命周期沙箱外测试进程；所有写盘 fixture 都在自动清理的 OS 临时目录：

```text
npx vitest run src/authoring/life-bundle-compose.test.ts scripts/life-bundle-compose.test.ts --reporter=verbose
```

退出码 0：**2 files / 24 tests passed**，无失败、无 warning、无 skipped。

```text
npx vitest run src/authoring/life-bundle-compose.test.ts scripts/life-bundle-compose.test.ts src/authoring/life-generation-bundle.test.ts src/authoring/life-host-descriptor.test.ts src/authoring/life-materializer.test.ts src/launcher/life-launcher-catalog.test.ts scripts/life-materialize.test.ts --reporter=verbose
```

退出码 0：**7 files / 100 tests passed**，覆盖 Composer/CLI、Bundle、Host、M0/M1/promote 与 launcher catalog 兼容；无失败、无 warning、无 skipped。

原样首个 plan 保留 **10 条非阻断 warning**：Flag provider 1 条、两个 NPC placement 的 `npcDialogueId` 投影 warning、7 条可选 peer/system dangling。它们来自既有共享 Life compile/system graph，plan 仍 `ok:true` 且完整 Bundle/M0 回归通过；本单没有新增 provider/system，也未静默删除这些诊断。

```text
npx eslint src/authoring/life-bundle-compose.ts src/authoring/life-bundle-compose.test.ts scripts/life-bundle-compose.ts scripts/life-bundle-compose.test.ts
```

退出码 0，无输出、无 warning。

```text
node scripts/docs-ref-guard.mjs
```

退出码 0：扫描 **46 Markdown / 395 paths**，`DOCS-REF: PASS`，无 warning。

```text
python -m unittest main_entry.test_project_roadmap -v
```

退出码 0：**11 tests / OK**。唯一 stderr 是 Python 启动器 `Failed to find real location ... Python313\\python.exe`；实际解释器继续执行且全部通过，未命中路线图或本单数据。

```text
npx tsc --noEmit
```

退出码 1；全部错误仅命中既有 `game-card-reveal`、`game-dice`、`game-theft` 与 `src/launcher/game-runner.tsx`，本单四个 TS 文件零命中。本 Review 不把全库既有红冒称为总体门禁绿。

## 独立撤修验红

唯一锚点 `SIMLIFE-BUNDLE-05: every slice must depend on the entire approved prefix in exact order.` 变更前命中 **1**，独立 marker 命中 **0**。

复查人用 `apply_patch` 临时把依赖 canonical 比较从 `!==` 反转为 `===`，并加入唯一 marker；点名 `reports stable slice_dependencies patch diagnostics without writing` 精确转红：退出码 1，**1 failed / 21 skipped**。aggregate `slice_dependencies` 仍存在，但对实际被破坏第二个 slice 的精确路径断言为 `expected false to be true`，证明路径锚点避免了假绿。

精确恢复后同一依赖用例与发布后 source-race 用例合跑为 **2 passed / 20 skipped**，最终 Composer/CLI **24/24** 全绿。终态锚点 **1**、sabotage marker **0**、首轮临时 probe marker **0**、`life-bundle-compose-*` 临时目录残留 **0**。

## 判词

- Blocker：**0**
- Major：**0 个未解决**（累计发现 3：发布后 source 未复验、首个试点相对 manifest 路径不可用、Windows 数值 inode 偶发误删外部替换者；均已返修并独立复验关闭）
- Minor：**0**

**最终判定：PASS。** 本结论只验收通用阶段切片 → Bundle candidate 编译与 authoring-only 候选落盘；不代签正式提升、素材审批、Playtest、S1-P 或 owner 人门。
