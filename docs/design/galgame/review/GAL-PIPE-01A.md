# GAL-PIPE-01A 施工自证与独立复查导航

> 2026-10-11；施工主体 Codex/root。文末已有非施工者签署的**本票局部 PASS**；全库门禁仍红，不得据此宣称全库 PASS。Owner 只豁免本票“先推送抢锁记录再写代码”的顺序，未放宽 Git/GitHub、数据库/持久化数据或启动服务禁令。项目控制台 `draft-review-contract` 仍 planned，本单未代改。

## 范围与实现锚点

- `src/authoring/gal-draft-types.ts`：P0–P4 作者态闭集、不可变信封、审核事件和只读投影类型。未更改 `GalPackage V1` 或游戏运行时。
- `src/authoring/gal-draft-validate.ts`：有限 JSON/大小、逐阶段 schema、引用闭合、P3 结构可达性和 no-exit、P4 节拍覆盖；`galDraftContentHash` 对 `projectId/kind/schemaVersion/basedOn/data` 规范化计算，键排序、数组顺序保留。
- `src/authoring/gal-draft-review.ts`：可信侧提交不可变版本、追加审核事件与四态 status 投影、`current/stale/blocked` 资格投影、上游换版/撤销失效；P0–P4 到正式包固定 `not_ready`。模型输入仅为 `data`；真人授权、审计持久化和并发属于后继票，纯 reducer 不声称替代身份验证。
- `src/authoring/gal-draft-review.test.ts`：研究稿 §5 六组点名语义及跨项目同名 ID 隔离；含独立复查发现的稀疏数组恶形输入回归。行号随编辑变化以测试名为准。

## 施工者实测（非独立复查）

- `npx vitest run src/authoring --pool=forks --maxWorkers=1 --minWorkers=1`：4 文件 **64/64**，退出 0；其中本票 12/12。沙箱内直接运行 Vitest 因现有 `node_modules/vitest/dist/spy.js` 的 `realpath` 返回 EPERM，改用获准的非沙箱纯内存测试；未启动应用服务或写数据库。
- 独立复查先复现：`locales` 稀疏数组曾在规范化时抛异常。现于有限 JSON 检查阶段按 `$.data.locales[1] / json` 稳定拒收，并纳入上项 12 个测试之一；修后重新通过本票 12/12 与目录 64/64。
- 本票四个文件的 `npx eslint ...`：退出 0；定向 `npx depcruise --config .dependency-cruiser.cjs`：10 模块、13 依赖、违规 0、退出 0；`node scripts/docs-ref-guard.mjs`：DOCS-REF PASS。
- `npx tsc --noEmit --pretty false`：退出 **1**，共 15 条诊断，仅在 `games/game-card-reveal/s4-flow.test.ts`、`games/game-dice/dice-window.test.ts`、`games/game-dice/dice-window.ts`、`games/game-simlife/art-consumption.test.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`；本票新文件诊断 0。整目录 depcruise 另有两条 Life fixture→game-simlife 的旧跨层违规；定向本票检查为 0。全库门禁不得报绿。
- 未运行 `scripts/scoped-gate.mjs --run`：该脚本内部调用 Git 收集改动，受 Owner 最高禁令约束，不能由 agent 运行；也未通过包装脚本绕过禁令。

## 非施工者复查必核

1. 独立复跑本票测试、lint、定向依赖检查；读 stderr 与退出码，分清本票与全库红项。
2. 带唯一锚点的**隔离**撤修验红：例如移除 `basedOn` 的内容指纹参与或让拒稿使旧批准链失效，先断言锚点恰命中一次，再证明相应点名测试转红。严禁在共享工作树撤修或用 Git worktree 绕 Owner 禁令。
3. 实证反例：模型伪 `status`、篡改 hash、同名跨项目 draftId、P0–P3 逐级 stale、owner 撤销后的 blocked、P3 no-exit/条件 intent 仅 warning、P4 错引用和 P0–P4 不可装配。疑似缺陷先复现再签。
4. 结论只签 `GAL-PIPE-01A` 局部 PASS/CONCERNS/FAIL；`draft-review-contract` 里程碑、P5–P9、WritingEnginePort、全库类型门保持独立。

## 独立复查结论（2026-10-11 · 非施工者 Codex/review_gal_pipe_01a）

**判词：GAL-PIPE-01A 纯 authoring 合同局部 PASS。** 不代表全库门禁、项目控制台里程碑或正式 `GalPackage` 装配通过。复查只读审阅本票四个 `src/authoring/gal-draft-*` 文件、`requests.md` 工单和 `creation-p1-spec-research.md`；未编辑实现文件。

1. **独立复跑与告警。** `vitest.cmd run src/authoring/gal-draft-review.test.ts --reporter=verbose`：12/12、退出 0；`vitest.cmd run src/authoring --reporter=default`：4 文件 64/64、退出 0。两次成功运行输出均无 WARN 或 unhandled error。首次沙箱内定向运行因 `node_modules/vitest/dist/spy.js` 的 `realpath EPERM` 退出 1、0 用例，故经许可仅对上述短生命周期纯测试非沙箱复跑；不把 EPERM 一次计为测试绿灯。没有启动应用服务、数据库或持久化写入。
2. **实证复现与修复复核。** 修前构造合法 P0 数据、令 `locales = new Array(2); locales[0] = 'zh-CN'`，调用 `submitGalDraftData` 实际抛出 `SyntaxError: Unexpected token ']'`；原因是稀疏数组被 `forEach` 跳过，规范 JSON 出现尾逗号。施工者修复后，我以同输入独立复探，返回 `ok:false` 与 `$.data.locales[1] / json`，不再抛异常；回归断言见 `src/authoring/gal-draft-review.test.ts` 当时第 72–75 行。再跑本票 12/12、目录 64/64 均退出 0。
3. **带锚点隔离撤修验红。** 用内存 `esbuild` 编译副本，不改共享文件；断言 `src/authoring/gal-draft-validate.ts` 中 `basedOn: content.basedOn` 锚点恰命中 **1** 次，再仅在内存副本将其替换为 `basedOn: []`。原版对仅 `basedOn` 不同的两个输入给不同内容指纹；撤修版给相同指纹，故测试中“`basedOn` 换版必须改 hash”的断言会由绿转红。稀疏数组守卫另做单点隔离破坏时，第二道规范 JSON 守卫仍拒绝该输入；这是防御冗余，**不**把该次未变红尝试冒称验红证据。
4. **语义与边界。** 代码与点名用例覆盖事件投影四态、跨项目同名 draftId 隔离、当前批准直上游、拒稿不失效旧批准链、P0–P3 换版下游 `stale` 与 owner 撤销后 `blocked`。P3 只证明结构可达，`checkIntent` 给 `intent_only` warning，不宣称条件可玩；P4 使用媒体需求 ID，P0–P4 的装配就绪恒为 `not_ready`。审核人真实身份/授权、事件可信存储及并发、P5–P9 和外部写作适配仍属后继票，不能由纯 reducer 假定完成。
5. **不能签的范围。** 施工者报告全库 `tsc` 退出 1、15 条非本票诊断；本次独立复查没有把它复跑或改称全绿。Owner 禁止一切 Git/GitHub 操作，故我未运行 `git diff` 或核验完整施工文件差异；范围仅依明确交付文件做内容复查，最终提交边界须由 Owner 的真实 Git 输出核对。未修改项目控制台，不签 `draft-review-contract` done。
