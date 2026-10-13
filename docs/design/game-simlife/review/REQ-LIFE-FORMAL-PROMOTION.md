# REQ-LIFE-FORMAL-PROMOTION 独立 Review

状态：**PASS（2026-10-12，非施工人独立复查）**。

施工自检：`docs/design/game-simlife/self-check/REQ-LIFE-FORMAL-PROMOTION.md`。本结论不采信施工自报，以下结果均为复查人从当前终态独立读取、复跑和撤修所得。

## 架构判定

**接受 owner 已裁决的路线 A。** 既有 M0 能给出严格 plan，M1 又有意拒绝 workspace/祖先/后代；手工复制无法重用 confirmation、canonical bytes、原子发布和写后复验。把 owner-only 正式提升下沉到同一通用 materializer 是正确能力边界，没有引入游戏私有 runtime、UI、资产批准或第二套校验器。

## 独立核证清单

- [x] `promoteLifeAuthoringMaterialization()` 首先调用既有 `validateInputs()`，完整重跑 Bundle、placeholder、identity 和 launcher discovery；confirmation 不匹配在任何 workspace 检查之前拒绝。
- [x] workspace 必须绝对、已存在、非文件系统根、真实普通目录；`games/` 与 target 逐层做 realpath、containment、plain-directory、symlink 防线。
- [x] 唯一发布内容为 `life.json`、`asset-slots.json`、`life-host.json`、`life-launcher.json` 四个 canonical JSON；同目录 staging 先严格复验，随后一次 rename，发布后再次严格复验。
- [x] 已有 target 仅在恰好四个 regular files 且逐字节等于当前计划时幂等成功；partial、extra、different、路径式 slug、file/directory symlink、target race 全部 fail-closed。
- [x] `games`、staging 和 published target 都以 `dev+ino` 绑定本事务身份；catch 只删除仍指向该 inode 的目录。首轮复查发现的 post-rename 外部替换目录误删 Major 已修复，永久回归实证 `external-marker` 存活。
- [x] 原 M1 scratch 的 confirmation、workspace/祖先/后代拒绝、四文件字节幂等和回滚语义由同一完整回归保持。
- [x] CLI 的 `plan | apply-authoring | promote` 互斥，`--workspace-root` 只属于 promote，`--target-root` 只属于 scratch apply，结果闭集明确返回 `mode: "promote"`。
- [x] 静态扫描当前 materializer/CLI 未发现 public、AssetIndex、图片、TS 游戏入口、launcher/pipeline/save/database/service/Git/network 副作用。`save.namespace` 是身份校验字段，禁区词其余命中仅为注释和竞态诊断。
- [x] 所有写入测试只使用自动清理的 OS 临时目录；终态临时目录扫描为 0。复查未执行正式 `--promote`、Git/GitHub、数据库、服务或网络操作。

## 首轮 Major 与返修复验

首轮额外竞态 probe 在 `afterRename` 中把已发布目录移走，再在原 target 路径创建带 `external-marker` 的外部目录。旧 catch 仅按路径递归删除，导致 marker `ENOENT`，违反“竞态/故障零覆盖”，判为 **Major**。

终态实现记录 staging/published/games 的 `dev+ino`，清理前调用 `pathStillNamesDirectory()` 复核路径仍指向本事务 inode。永久用例 `preserves an external directory that replaces the published target during post-rename verification` 独立点名结果为 **1 passed / 25 skipped**；完整回归中再次通过。该 Major 已关闭。

## 独立命令与结果

普通 Windows 沙箱首次点名 Vitest 在收集前被 Node 24 `realpath` 拒绝：`EPERM ... node_modules/vitest/dist/spy.js`，无测试执行，属于已知执行环境限制。按本单许可改用短生命周期沙箱外进程，仍仅访问仓库代码与 OS 临时目录：

```text
npx vitest run src/authoring/life-generation-bundle.test.ts src/authoring/life-host-descriptor.test.ts src/authoring/life-materializer.test.ts src/launcher/life-launcher-catalog.test.ts scripts/life-materialize.test.ts --reporter=verbose
```

退出码 0：**5 files / 76 tests passed**；其中 materializer **26/26**、CLI **2/2**。完整逐项输出无 WARN、无 skipped（点名运行产生的 skipped 仅因 `-t` 过滤）。

```text
npx eslint src/authoring/life-materializer.ts src/authoring/life-materializer.test.ts scripts/life-materialize.ts scripts/life-materialize.test.ts
```

退出码 0，无输出、无 warning。

```text
node scripts/docs-ref-guard.mjs
```

退出码 0：扫描 **46 Markdown / 394 paths**，`DOCS-REF: PASS`，无 warning。

```text
python -m unittest main_entry.test_project_roadmap -v
```

退出码 0：**11 tests / OK**。stderr 仅有 Python 启动器的 `Failed to find real location ... Python313\\python.exe` 环境 warning；实际解释器继续运行，11 项均通过，不命中路线图数据或本单实现。

```text
npx tsc --noEmit
```

退出码 1；错误仅命中既有 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx`，**零命中本单四个 TS 文件**。因此不把全库既有红冒称为本单绿，也不据此阻断本单局部验收。

## 独立撤修验红

唯一锚点：

```text
// REQ-LIFE-FORMAL-PROMOTION: stale or mismatched M0 approval must fail before filesystem inspection.
```

1. 变更前锚点命中 **1**，独立 marker 命中 **0**。
2. 用 `apply_patch` 临时把 promote 的 `ownerConfirm !== confirmationHash` 反转为 `===`，并加入唯一 marker。
3. 点名 `requires the exact current confirmation hash before touching the workspace`：退出码 1，**1 failed / 25 skipped**；准确失败为期望 `confirmation_mismatch`、实际先落到 `missing_root`，证明 confirmation 早于文件系统的守卫确实承重。
4. 用 `apply_patch` 精确恢复后，同一点名退出码 0，**1 passed / 25 skipped**；最终完整 76 项全绿。
5. 终态锚点 **1**；两轮 sabotage marker 与首轮临时 probe marker 均 **0**；OS 临时目录残留 **0**。

## 判词

- Blocker：**0**
- Major：**0 个未解决**（首轮发现 1，已返修并独立复验关闭）
- Minor：**0**

**最终判定：PASS。** 本结论只验收通用正式四文件提升能力，不代签新游戏 Playtest、S1-P、capability plan、素材审批或 owner 人门；`new-game-end-to-end-pilot` 仍保持 `active`，整体 `selfCheck/review/owner` gates 继续为 `pending/pending/required`。

## Owner A 通用返修扩展独立复查（2026-10-12）

复查人对建设可达性 gate 与正式四文件 safe update 从当前终态重新读实现、重跑目标测试并做撤修验红。首轮发现 **Major 1**：Windows 上 `dev/ino` 可超过 `Number.MAX_SAFE_INTEGER`，初版转成 JS `number` 后存在目录身份碰撞风险。施工方改用 bigint identity 并增加四轮实际外部替换竞态永久回归；复查确认外部 replacement 与旧 rollback 均保留，Major 关闭。

独立终态判定：**PASS（Critical 0 / Major 0 / Minor 1）**。Minor 是候选非变异用例最初缺少 before/after 调用锚点；施工方已补为真实候选的前后字节语义相等、精确动作表、三个项目稳定 sabotage 诊断和三个真实 Engine session 的直接 `nearby/allowed/available` 断言，因此不遗留为发布阻断项。

独立证据：

- Bundle 11、materializer 30、CLI 3：首轮 **3 files / 44 tests PASS**；施工方吸收 Minor 后终态为 **3 files / 46 tests PASS**。
- update 目标点名 4 passed / 26 skipped；validator 唯一 sabotage 锚点命中，临时禁用真实 affordance 判断后准确 1 failed / 10 skipped，恢复后全绿且 marker 0。
- ESLint 6 files PASS；DOCS-REF PASS；全库 tsc 只有既有无关游戏/launcher 红，本单零命中。
- 当前坏候选复现曾稳定产生三个建设错误；修正后的候选严格检查 `ok:true`，三项目真实 session 均为 `nearby:true`、`allowed:true`、`available:true`。
- 复查逐项读取 3 compile warning 与 7 dangling warning，均为既有非阻断项；没有把 warning 当作绿灯吞掉。

本扩展独立 review 只放行通用 gate、安全 update 和修正候选；正式 `games/game-demon-castle/` 更新仍是 owner 人门，未由施工人或复查人执行。

后续 owner 人门已真实执行：CLI 返回 `mode:"update"`、`writesPerformed:true`、`writtenFiles:4`，previous/new group hash 均与独立复查后的预检一致。施工 agent 的更新后动作仅为只读 `plan-update`、正式包 canonical 对比与真实 session 回归；结果全部通过，不改变本 Review 的独立 PASS 判词。
