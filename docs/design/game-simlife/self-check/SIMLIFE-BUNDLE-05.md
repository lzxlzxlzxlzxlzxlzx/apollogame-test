# SIMLIFE-BUNDLE-05 施工自检

## 结论与边界

施工自检：**PASS；返修后非施工人独立复查已 PASS**。

本单只新增共享 Life authoring composer/CLI、严格数据合同、测试与文档，并为已获批准的月影魔王城切片写入 authoring-only `bundle.candidate.json`。没有修改 Life runtime、renderer/UI、存档、素材批准/AssetIndex、launcher、pipeline、`games/` 或 `public/`；没有执行正式 `--promote`。

## 架构判断

接受 owner 已裁决的 A。既有 `checkLifeGenerationBundle()` 与 `life-materialize` 都以完整 Bundle 为输入，无法把独立批准的 World/Actors/Construction/Plot/AssetSlot 切片组合为稳定、可审、可复验的正式提升输入。人工复制与游戏私有脚本都会绕开依赖闭合、JSON Pointer 安全、provenance 重算及原子候选落盘；正确边界是 sim 外、通用 authoring composer，不新增玩法 capability/system。

## 文件面

- `src/authoring/life-bundle-compose.ts`
- `src/authoring/life-bundle-compose.test.ts`
- `scripts/life-bundle-compose.ts`
- `scripts/life-bundle-compose.test.ts`
- `package.json`
- `docs/design/game-demon-castle/bundle.sources.json`
- `docs/design/game-demon-castle/bundle.candidate.json`
- `docs/design/game-demon-castle/bundle-review.md`
- `docs/design/game-simlife/life-generation-sop.md`
- `docs/design/game-simlife/generation-workflow-v1.md`
- `docs/design/game-simlife/requests.md`
- 本自检、对应 review 导航与 SimLife 项目路线图证据

## 实现核对

1. `zerocraft.life-generation-slice-manifest.v1` 与 `zerocraft.life-generation-patch.v1` 均执行根对象/嵌套对象闭集校验；source root 必须为绝对、真实、非 symlink、非文件系统根目录，所有引用只允许不重复的同目录安全 `.json` basename。
2. 每个 slice 的 `baseWorld` 必须等于 manifest world；`requiresSlices` 必须逐项等于全部前序 slice。operation 只允许 `add|replace`、普通有限 JSON 值与批准内容根下的非根 JSON Pointer，并拒绝原型污染、缺 parent、非法/越界数组、重复非 append 路径及不存在/已存在目标语义错误。
3. composer 从最终 Life package 与 AssetSlot draft 重算 source hash/base hash，随后复用完整 `checkLifeGenerationBundle()` 进行严格 Bundle、compile、两 tick snapshot/hash/restore 与 slot closure 检查；任一 error 都零写。
4. 默认 `--plan` 零写；显式 `--write-candidate` 只写固定 `bundle.candidate.json`。staging 与目标同目录，先完整写入和严格复验，再用不覆盖的原子 hard-link 发布；已有目标只在 canonical bytes 完全相同且严格复验通过时幂等成功。
5. 写前、发布前与发布后最终成功返回前均复核 source root、所有 source 文件的原生 bigint `dev+ino` 与逐字节内容；目标、source、staging 的 symlink/竞态/复验故障 fail-closed。回滚只删除仍绑定本事务 bigint inode 的 staging/published 条目，避免 Windows 数值型 Stats 精度碰撞误删外部替换者。
6. 魔王城 `bundle.sources.json` 以 World → Actors → Construction → Plot → AssetSlot 顺序重建 `baseHash sha256:ab2510b87787a77c74e3416fd00064bc396dbb7f18d6be980b803f91e8b37890`，候选字节为 39246，hash 为 `sha256:0acb457785a0d61f4b9836b82ad8d25057d50fe76a0ba9cc92e0313b6658340a`；交给既有 materializer 仍得到已审四文件 M0 hash。
7. 策划首次按文档目录传入 manifest 相对路径时复现 CLI 把整个字符串交给 basename-only 核心而拒绝。返修只在 CLI 层接受“无 `..` 且解析后父目录恰好等于 source-root”的相对路径，再归一为 basename；绝对路径、URL、穿越路径和其他目录仍以 usage exit 2 拒绝。核心 composer 与磁盘边界未放宽。

## 定向回归

短生命周期测试只在 OS 临时目录创建并清理 fixture：

```text
node node_modules/vitest/vitest.mjs run \
  src/authoring/life-bundle-compose.test.ts \
  scripts/life-bundle-compose.test.ts --reporter=verbose
```

结果：**2 files / 24 tests passed**。覆盖两个不同 slug/slice 拆分的 deterministic plan、魔王城 exact hash/M0 plan、strict manifest/patch/pointer/array/source/asset/compile diagnostics、零写、首次写、幂等、different/partial/extra/symlink、写前及发布后陈旧 source、staging bytes 损坏、pre/post-publication race 与 CLI 模式。

随后组合既有 Bundle/Host/Materializer/Launcher 回归：**7 files / 100 tests passed**，无失败、无 skipped。真实 `bundle.candidate.json` 再次执行 `--write-candidate` 返回 `writesPerformed:false / writtenFiles:0`；交给 M0 返回 `mode:plan / writesPerformed:false`，confirmation hash 仍为 `sha256:441ab550e45b61362cb9e7bdc1b022ac0721714bc24b137f56b0b70a14fd09ee`，四个内容 hash 与已审计划逐项相同。

- ESLint：本单四个 TS 文件 exit 0，无 warning。
- `docs-ref-guard`：PASS（46 个 Markdown、395 路径）。
- 项目路线图 unittest：11 tests / OK；只有既有 Python launcher real-location 环境 warning。
- Vite build：PASS，761 modules；仅既有 chunk-size warning。
- 全库 `tsc --noEmit` 仍被既有 `game-card-reveal`、`game-dice`、`game-theft` 与 `src/launcher/game-runner.tsx` 类型错误阻断；输出零命中本单文件。
- `context-budget-guard` 仍报既有主 requests 池 11/10、主池/GAL/card-reveal 字符上限及 UI playbook 行数；本单位于 game-simlife 专属池，没有增加主池条目。
- `scoped-gate.mjs --run` 会调用 Git，受 Owner 禁令未执行。

## 撤修验红

唯一锚点：`SIMLIFE-BUNDLE-05: every slice must depend on the entire approved prefix in exact order.`，终态命中 1。

1. 基线完整回归中 `slice_dependencies` 用例通过。
2. 首次把 `!==` 反转为 `===` 时，旧断言只检查 aggregate code，第一条正确空前缀被错误标红而导致假绿；没有把该结果冒充验红证据，而是把用例加固为同时要求诊断命中实际被破坏的第二个 slice 路径。
3. 加固后再次反转同一比较，点名用例精确转红：**1 failed / 19 skipped**，失败为目标 slice 路径断言 `expected false to be true`，证明前序依赖检查与点名锚点均承重。
4. 精确恢复锚点后同一点名：**1 passed / 19 skipped**；最终 Composer 全量 **2 files / 24 tests passed**。终态扫描无 `|| false` 或反转条件残留。

## 独立复查首轮 Major 与返修

非施工人首轮在 `afterRename` 中修改 source world，复现旧实现发布后只校验 target、未再次校验 source 集，导致候选被错误报告成功，判为 Major。返修在最终 post-verify 加入 `sourcesUnchanged(allSources)`；永久回归 `fails closed and removes its candidate when a source changes after publication` 证明外部 source 修改保留、本事务 candidate 删除且返回失败。施工方点名为 **1 passed / 21 skipped**，完整回归为 **7 files / 100 tests passed**；同一非施工人已独立复验关闭该 Major，当轮判词为 Blocker 0 / Major 0 未解决 / Minor 0。

CLI 入口返修复查期间，非施工人首次全量又真实捕获一次间歇性 Major：post-publication 外部替换文件被 catch 误删，随后 12 次点名与 5 次全量均通过。根因是 Windows `Stats.dev/ino` 以 number 保存可能丢失低位，导致不同 inode 偶发比较相等。终态把 source root、sources、staging 与 published target 的所有事务身份采集/比较改为 `lstatSync(...,{bigint:true})`，并把该永久回归提升为每次 **32 轮**外部替换压力；施工方点名 32/32、连续 10 次共 **320/320** 外部替换与 Composer/CLI 24/24 通过。非施工人另跑 **8×32=256/256**，再以两次全量各覆盖 32 轮，已关闭该 Major；累计三个 Major 全部关闭，最终 Blocker 0 / Major 0 未解决 / Minor 0。

## 禁区与实际操作

只执行了短生命周期编译器/测试与 authoring candidate 写入；未执行正式 materializer `--promote`/`--apply-authoring`，未执行 Git/GitHub、数据库写入、服务启动、网络或模型调用，也未创建无头浏览器。

上述边界描述的是施工与独立复查阶段。复查通过后，owner 于 2026-10-12 亲自在本机执行正式 `--promote` 并返回 `writesPerformed:true / writtenFiles:4`；agent 没有代执行受限提升。随后只读核验四文件 byte/hash、M0 `conflicts:[]` 与 confirmation hash 全部一致，Materializer/launcher/CLI **4 files / 40 tests passed**，独立 Vite build **765 modules PASS**。这只证明物化与发现链闭合，不代签 Playtest。

## CLI 首个试点返修实证

策划复验命令已原样重跑并 exit 0：

```text
npm run life-bundle-compose -- docs/design/game-demon-castle/bundle.sources.json --source-root C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch\docs\design\game-demon-castle --plan
```

完整 JSON 返回 `ok:true`、`mode:"plan"`、`writesPerformed:false`、`bundleHash:"sha256:ab2510b87787a77c74e3416fd00064bc396dbb7f18d6be980b803f91e8b37890"` 与原 candidate hash。CLI 永久回归使用同一相对路径，并逐项验证绝对 manifest、含 `..`、URL 与其他目录路径均 exit 2。Composer/CLI 终态仍为 **2 files / 24 tests passed**。

随后原样运行 M0：

```text
npm run life-materialize -- docs/design/game-demon-castle/bundle.candidate.json --host docs/design/game-demon-castle/life-host.candidate.json --entry docs/design/game-demon-castle/life-launcher.candidate.json --plan
```

完整 JSON 返回 `mode:"plan"`、`writesPerformed:false`、`confirmationHash:"sha256:441ab550e45b61362cb9e7bdc1b022ac0721714bc24b137f56b0b70a14fd09ee"`，四文件内容 hash 与已审记录相同。
