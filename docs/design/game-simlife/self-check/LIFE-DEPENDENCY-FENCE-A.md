# LIFE-DEPENDENCY-FENCE-A · Host 上层迁移施工自检

2026-10-16；施工者 Codex/root。Owner 在 BDM 策划聊天选择 A：Life Host 编排上迁 `src/assembly/life-host/`，不加依赖围栏例外。此单只改物理层次、公开入口、消费者导入和产品级测试归属；不改 World 算法、正式 JSON/资产、存档 codec、hash 算法或月夜城堡 HUD/日历语义。PUI icon feedback 仍属独立工单。

## 迁移与兼容

- 首批已独立 PASS 的 10 条游戏侧导入从 33 降至 23，本轮先给 authoring descriptor 增包名入口，23→22；把具体 Little Valley / Demon Castle 数据驱动的测试移到 `games/game-simlife/` 或 `src/launcher/` 集成域，22→13。原正式 JSON 保持单一真相，未复制夹具内容。
- 六个应用宿主实现 `life-game-host/save/presenter/interaction/hud/hud-overlay` 从 `src/engine/host/` 迁至 `src/assembly/life-host/`，保留其输出逻辑与数据。纯输入 `life-input` 和通用 `mount-host/run-loop` 留在底层，装配层向下引用。`package.json`、`tsconfig.json`、Vite `engineAliases` 为旧的六条 `@zerocraft/engine/engine/host/*.js` 与 `@engine/host/*.js` 建精确别名，指向同一新物理模块，不在 engine 层写向上 re-export。新消费者改用 `@zerocraft/engine/assembly/life-host/*` 或对应相对路径。
- `games/game-simlife/host-descriptor.ts` 用 `@zerocraft/engine/authoring/life-host-descriptor.js`；生成/审阅集成测试随 Little Valley JSON 迁到游戏目录，`scripts/life-{gen-check,materialize}.test.ts` 跟随夹具新路径。月夜城堡产品级 Playtest 测试归 launcher。探针夹具、sabotage 物理锚点和 `scripts/tsconfig.life-ui-skin.json` 已逐项迁接。
- `tools/export-game.mjs` 补 authoring 包子路径及六个旧 Life Host 的精确兼容映射：解析闭包、导出包 tsconfig/Vite alias 同步指向 `assembly/life-host`。独立复查先抓到宽泛旧 alias 会静默漏包，本轮已按该失败实证补齐。`scripts/demon-castle-ui-runtime-02.probe.mjs` 加可选独立证据目录，未覆盖 BDM 既有截图。

## 本地实证

1. 完整 `npx depcruise --config .dependency-cruiser.cjs src games --output-type err-long`：施工前 **23 errors / 0 warnings**；authoring 后 22；产品测试归属后 13；Host 迁移后 **0 errors / 0 warnings，exit 0**。唯一锚点反证：临时加入三条精确违规源，分别触发 `src-no-games`、`games-no-relative-escape`、`engine-core-is-bottom` 各 1 条，合计 3 errors / 0 warnings、exit 1；三源已删除，再跑完整围栏 0/0 exit 0。
2. Host/游戏定向 Vitest：`src/engine/host`、迁后的两项 launcher 集成、Little Valley 关系/素材/姿态合计 **18 文件 216/216，exit 0**；新旧公开路径同模块导出对照单独 **1/1，exit 0**。旧档/持久 hash、日历与 HUD 测试均包含其中。`node scripts/life-calendar-presentation-recursion.mjs`：基线 4 断言通过，精确一锚点撤掉季节映射后目标转红，恢复 4 断言且源字节未变。
3. 生成链搬迁用例：Bundle、gate、profile、inventory、gen-check 先前定向 PASS；`life-materializer` 34/34、`life-materialize` CLI 3/3、`life-bundle-compose` 22/22 在允许隔离本机临时 symlink/rename 的执行环境 PASS。受限沙箱首跑因临时目录 `EPERM` 红，不是产品回归；提升后只剩候选 Host hash 断言过旧，按当前 `docs/design/game-demon-castle/life-host.candidate.json` 的真实四文件计划将期望 hash 从 `6dc55d…` 更新为 `8f47f2…`，全 22/22 复跑通过；未改候选或正式文件。
4. `npx tsc -p scripts/tsconfig.life-ui-skin.json --noEmit --pretty false` exit 0；`npx vite build` exit 0，读到现有 `>500 kB` 大 chunk 非阻断警告。根 `npx tsc --noEmit --pretty false` exit 1，仅 GAL/Manor/Studio 并行域的 12 条类型错误，未见本单路径错误；不把全库门禁称 PASS。
5. `node scripts/demon-castle-ui-runtime-02.probe.mjs` 经允许的隔离 Edge/随机端口 `http://127.0.0.1:57130/` 真浏览器 **395/395，exit 0**。输出写入 `docs/design/game-simlife/self-check/host-migration-runtime02/`，原 BDM 截图与 measurements 未覆盖。Edge、局部 HTTP 服务和任务级临时构建均在 finally 关闭/清理；未启动 5173 或整套 ZeroCraft。
6. `git diff --check` 对本单已跟踪范围 exit 0；LF→CRLF 转换提醒属工作树环境提示。`node scripts/scoped-gate.mjs --run` 两轮均 exit 1：第一次受限沙箱使 `workshop-provider-guard` 的 Python 子进程 `EACCES`；第二次允许本机执行后本机仍无 `python3` 命令（Windows Store alias 提示），守卫在 11/12 处停下。门禁先提示缺 `origin/claude/mainbranch` 本地 ref、把当前多人脏树当 1442 文件 full scope；其 audit 无未覆盖红旗、eslint 与 depcruise 已过，随后因 Python3 缺失未运行后续阶段。另单独根 tsc 仍是 GAL/Manor/Studio 的 12 条他域类型红；不能声称全库绿色。
7. 导出接缝返修：`node --test tools/export-game-life-host-compat.test.mjs` **1/1，exit 0**，逐一验证 12 条旧 spec 的 `resolve`、旧路径 `trace` 不漏六个新模块、生成包 tsconfig/Vite 精确 alias。真实 `node tools/export-game.mjs game-simlife --out .tmp-life-host-export-check` exit 0，376 源文件，六个新 Host 文件在独立导出包中 6/6；核对后隔离输出已清理。

## 待非施工者复查

独立复查须自行复跑围栏 0/0、三类精确锚点反证、旧/新包入口同一模块、定向 Host/生成/旧档回归、短时 runtime02 真浏览器及清理，并读所有告警。局部 PASS 不代签 Owner 人门、Mooncastle Playtest 或全库 gate。
