# LIFE-DEPENDENCY-FENCE-A 独立复查

2026-10-16；复查人 `/root/life_fence_a_review`，非施工者。判词：**局部 PASS**。Owner A 的 Life Host 分层迁移、旧入口兼容、游戏/脚本消费接缝与依赖围栏在当前共享工作树上通过独立核证；**不代表全库 scoped-gate、根 tsc、Owner 人门或 Mooncastle Playtest 通过**。本报告是唯一复查编辑，未修改生产源码、测试、需求单、路线图或正式数据。

## 依据与范围

完整阅读 `AGENTS.md`、`docs/llm-onboarding.md`、`docs/playbooks/{index,game-production,game-requests,testing,review-gates,save-platform,base-lib,randomness}.md`，以及 `../work-orders/LIFE-DEPENDENCY-FENCE-2026-10-16.md` 和 `../self-check/LIFE-DEPENDENCY-FENCE-A.md`。工单记录 Owner 原话“好的，选择A”，授权上迁至 `src/assembly/life-host/` 而不增 `engine/host` 围栏例外。复查只判物理归层、公开兼容、旧档/hash/HUD/calendar 回归；没有代签视觉/产品阶段。多人共享脏树不能用 `git diff --stat` 直接归责全部改动，故按工单文件与实际接缝逐项核对。

## 独立实证

1. `npx depcruise --config .dependency-cruiser.cjs src games --output-type err-long` **exit 0，0 errors / 0 warnings**；复查最终复跑扫描 1741 modules / 6754 dependencies。未修改围栏规则。另直接调用 dependency-cruiser 的已归一化真实规则，对三条旧问题的合成坏边分别判红：`src-no-games`（skills test→Little Valley JSON）、`games-no-relative-escape`（游戏→Host 相对逃逸）、`engine-core-is-bottom`（旧 engine Host→services）。每类点名命中；这是**in-memory 规则反证**，并非修改共享源码后再跑全图。当前全图基线已绿。
2. `src/assembly/life-host/exports-compat.test.ts` 独立 Vitest **1/1 exit 0**：新 `@zerocraft/engine/assembly/life-host/*` 与六个旧 `@zerocraft/engine/engine/host/*` 实际同模块导出。`package.json` 精确 exports、`tsconfig.json` 精确 paths 和 `scripts/engine-aliases.mjs` Vite 旧短名/包名别名均指向 `src/assembly/life-host/`，不是 engine 层向上 re-export。`npx tsc -p scripts/tsconfig.life-ui-skin.json --noEmit --pretty false` **exit 0**。
3. 首次复查发现 `tools/export-game.mjs` 只用宽泛 `engine/` 别名，旧六路会解析到已删物理文件，`trace()` 对未解析项静默略过，故当场通知施工者并拒绝先判 PASS。修复后独立运行 `node --test tools/export-game-life-host-compat.test.mjs` **1/1 exit 0**：12 个旧路径的 resolver、六模块 closure、导出 tsconfig/Vite 精确脚手架均核真。另 `node tools/export-game.mjs game-simlife --out <隔离临时目录>` **exit 0**，376 个源码文件，导出目录内六个 `assembly/life-host/*.ts` 全在；临时导出目录已删除。对生成 tsconfig 的唯一 `life-save.js` 锚点做 in-memory 删除，点名断言转红，源文件未改。修后再次完整 depcruise 0/0。
4. `npx vitest run src/engine/host src/launcher/life-game-host.integration.test.ts src/launcher/demon-castle-playtest-contract.test.ts games/game-simlife/life-relationship.integration.test.ts games/game-simlife/life-asset-candidate-plan.integration.test.ts games/game-simlife/life-asset-review-packet.integration.test.ts games/game-simlife/life-pose-integration.test.ts` **18 文件、216/216、exit 0**；覆盖旧档恢复、持久 hash、日历显示映射、HUD/皮肤等。`node scripts/life-calendar-presentation-recursion.mjs` **exit 0**，基线 4 条、单锚破坏目标转红、恢复 4 条且源字节不变。
5. Bundle/gate/save/生成链独立 Vitest：首轮 8 文件共 72/94，通过数之外的 22 例在受限 Windows 沙箱临时目录的 symlink/rename 报 `EPERM`，**该首轮 exit 1，不能藏作绿**。允许隔离本机临时文件操作后点名重跑 `games/game-simlife/life-bundle-compose.test.ts`、`life-materializer.test.ts`、`scripts/life-materialize.test.ts`，**3 文件、59/59、exit 0**。其余五文件首轮已绿，含 `life-generation-bundle/gate`、`save`、`life-gen-check`、exports compat。未写远程数据库或正式游戏文件。
6. `npx vite build` **exit 0**。独立短时 `node scripts/demon-castle-ui-runtime-02.probe.mjs` **395/395、exit 0**，随机本地地址 `http://127.0.0.1:57289/`；证据仅写任务级临时目录，Edge、局部 HTTP 服务和临时构建在探针 finally 关闭，临时证据目录随后删除；未占 5173 或启动整套 ZeroCraft。脚本物理锚点 `life-calendar-save.sabotage.config.ts`、`life-ui-runtime-02.sabotage.config.ts`、`life-calendar-presentation-recursion.mjs` 与 `tsconfig.life-ui-skin.json` 都已指向 assembly 新址；源码/脚本/工具中未检出旧 `src/engine/host/life-{六模块}.ts` 物理锚点。

## 告警与判词边界

- Host Vitest 的 `mount-host.test.ts` 在 happy-dom iframe 测试打印 `AsyncTaskManager destroyed` 与 `example.com ENOTFOUND` stderr，测试仍 216/216、exit 0；这是测试模拟外部页的清理/网络告警，未将“绿灯”解释成零 stderr。
- Vite build 打印 `>500 kB` chunk 体积警告，未导致 exit 非零；本单不扩大范围改打包拆块。
- 根 `npx tsc --noEmit --pretty false` **exit 1，12 条错误**，位置均在 GAL/Manor/Studio 并行域（`gal-authoring-tools`、`gal-character-library`、`gal-draft-review.test`、`manor-escape-authoring`、`gal-ui-slice-host.test`、`AuthoringStudio`），未见 Life Host 路径错误。施工自证的 `scoped-gate --run` 也因 Windows 本机缺 `python3`、缺本地 `origin/claude/mainbranch` ref 与并行脏树扩大 scope 而未全绿。故本单只给局部 PASS；不得凭此推送、宣称全库绿色或替 Owner 审批。
