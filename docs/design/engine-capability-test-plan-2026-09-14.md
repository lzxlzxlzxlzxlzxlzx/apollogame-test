# 引擎能力测试复查与用例设计（2026-09-14）

> 范围仅 `src/{engine,skills,assembly,net}`，**不以任何游戏测试代替引擎能力测试**。初审基线 `5e6a0df8e`，推前复跑基线 `fef7929a9`。判据沿用 `docs/playbooks/testing.md`：条款原文、对抗反例、带锚点撤修验红、独立复跑；测试存在不等于能力正确。

## 1. 现状判词

- **覆盖在位是绿的，但只是第一层**：现有 `src/engine` 18、`src/skills` 140、`src/assembly` 16、`src/net` 13 个测试文件；`capability-test-presence` 保证每个 capability 有同伴测试，`registry-guard` 保证已定义能力进注册表。两者连同现有契约/不变量靶向复跑为 11/11 PASS。它们不能证明每条语义、跨能力定序和存档后行为都正确。
- **运行态契约覆盖稀疏**：统一的 `expectDeterministic / expectRestoreContinues / expectQuiescent` 原只用于 turn-order、cooldown、conveyor-queue 三项。本轮已给 gauge、over-time 再补两项（5/5 PASS），但其余运行态能力不能据此宣称有同等覆盖。部分能力有手写双跑/hash 例，不能一概说“无确定性测试”；要逐件对照是否涵盖**中途存档**与**静止零写入**。
- **性质测试已有好样板，不应重复造轮子**：`tier2/invariants.test.ts` 已对 inventory、dice、rate-limit 做种子序列；flow-field 的缓存、几何和定序测试也较强。下一步应优先把相同方法投到薄弱纯函数与运行态边界，而非追求测试文件数量或覆盖率百分比。
- **本轮验证**：对本机测试环境显式设置 `TMPDIR=/private/tmp`（避开 macOS `/var` 别名）、`RENDER_PROBE_CHROMIUM=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，并允许测试监听 localhost 后，`node scripts/scoped-gate.mjs --run` 判为 `FULL`；在最新远端基线复跑 549 文件 / 5262 用例、tsc、构建和守卫均通过，退出码 0。未设置这些环境条件时的三类脚本红分别来自临时路径别名、浏览器探针和沙箱 `listen EPERM`，不是本轮引擎测试的行为失败；构建大 chunk 与既有美术台账挂账仍是警告。

## 2. 优先测试矩阵

| 优先级 / 能力层 | 用例（建议落点） | 输入与必须断言 | 状态 |
|---|---|---|---|
| P0 · `t2-intent-barrier` 确定性 | `duplicate-delivery-permutation` · `intent-barrier-core.test.ts` | 同 NPC 两份冲突意图分别以 AB/BA 送达，拓展到三份全排列；同一事实**集合**的 settled 结果与后续 world hash 必须相同。先由 owner 定冲突策略，不把“先到者胜”当到达无关 | **已实证红**：现有测试把先到者胜写为预期；引擎语义需裁定后修 |
| P0 · `t2-intent-barrier` 回合隔离 | `late-response-after-reopen` · `intent-barrier.test.ts` | 第 7 回合请求迟到，第 8 回合同门重开后才投递；旧意图不得占新回合名额，拒收须可见，后续结果可重放 | **已实证红**：当前只看 waiting，未核 `intent.turn` |
| P0 · lockstep 广播 | `stale-authority-broadcast` · `intent-barrier.test.ts` | 非权威端已开新门，再收旧回合 settled 包；旧包不得覆盖新门，须明确拒收并能继续同步 | 待实现；不能从当前绿例推断已守住 |
| P1 · 运行态持久化 | `contract:flow/timeline/matrix-duel/intent-barrier` · `tier3`/`tier2` 对应契约测试 | 在“游标已推进但 cue 未发”“双方仅一方提交”“门已开未收齐”等**最脆弱拍**快照；恢复后逐拍对比输出及 hash；无输入稳定态零写入 | 待逐件补；只测终态双跑不足以抓私藏闭包态 |
| P1 · `t2-gauge` | `contract:gauge` · `tier2/contracts.test.ts` | 资源变更后两世界同 hash；中途存档续跑一致；资源不变时条宽和锚位不漂移 | **本轮已落地**；故意把锚位改成每拍 `+1`，该用例第 1 拍转红，恢复后绿 |
| P1 · `t2-over-time` | `contract:over-time` · 同上 | DoT 在 `period` 中间存档，恢复后扣血拍位与到期移除一致；到期后空闲 hash 不变 | **本轮已落地**；5/5 契约测试通过 |
| P1 · 纯函数性质 | `math-grid-roundtrip` / `modifier-stack-algebra` · 各能力测试 | 固定 seed 枚举合法网格坐标，`index ↔ row/col` 往返；对合法 modifier 验同策略聚合与输入排列无关。每条报 seed/step/最小输入 | 待补；先核现有单测，避免复制已有例子 |
| P1 · 能力组装 | `manifest-capability-roundtrip` · `assembly/manifest.test.ts` | 按 registry 实名取跨 tier 代表能力，以 manifest 装配→运行→快照→恢复；解析失败须点名未知 ID/组件，不能静默跳过 | 待与现有 manifest/registry 用例逐条对账后补缺，不另造测试框架 |
| P2 · 运行成本 | `slow-lane-engine-impact` · `scoped-gate` 行为测试 | 改共享能力且它的慢车道消费者未被直接改动时，仍能进入定期/推前复查；报告所跑目标与退出码 | 流程缺口；`test-strategy-review-2026-09-10.md` 已记过冻结游戏漏红三周的实证 |

## 3. 用例质量门槛

1. 每个新增用例须先说**条款是什么**、另一种错误实现能否也通过；不能只断言“不抛异常”“数值变大”或仅比较两个同构世界的同一错误结果。
2. 运行态能力至少核“语义边界 + 拒收/降级 + 双跑确定性 + 脆弱拍存档续跑 + 稳定态零写入”。永久运行（如 regen）不能硬要求空闲；先进入设计上应静止的状态再验。
3. 对抗验证在隔离副本进行：先断言锚点命中，临时破坏实现，点名测试必须转红，立即恢复并再跑绿。红例在生产行为未修复前只留审查记录，不塞进绿门禁伪装完成。
4. 跨 `src/skills` / `src/engine` 的测试变更按共享面跑 full scoped gate；stderr 的环警告、棘轮 WARN 与退出码分开报告。当前测试文件数不是验收目标，**每条高风险语义有能红的断言**才是。
