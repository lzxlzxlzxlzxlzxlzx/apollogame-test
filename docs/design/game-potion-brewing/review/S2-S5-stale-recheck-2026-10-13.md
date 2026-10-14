# S5 换皮后 S2 能力计划独立复查（2026-10-13）

- 复查人：`/root/s5_prior_review`，不是本轮 S5 `screen.ts` 施工者；未改游戏源码、Owner 人门或远端。
- 范围：当前 S2 checklist 的五项；仅判断 S5 外观改动是否改变能力计划与规则契约，不代替 S3/S4/S5 各自的复查与 S6 素材批准。
- 判词：**PASS**，绑定最终 `gameHash=35b6fc9128549795`。S2 机器门独立重跑 `exit=0`，摘要为“五条缺口全已裁决、全部了结”。

## 清单逐项

1. **范围**：检查 `git status --short -- games/game-potion-brewing public/games/game-potion-brewing docs/design/game-potion-brewing` 与 `git diff --stat --`。游戏目录仍整体 untracked，Git 无法给 S5 单独源码 diff；用 S5 施工自证 `self-check/S5-alignment.md` 对照现文件复核：`screen.ts:18-27,70-98` 是 LayoutNode 的配色、字色、字体及面板外观，`blueprint.ts:21-34,95-106` 的步骤、能力和库存接线不受这些外观常量解释。共享树另有在途改动，不把它们归为本轮 S5；没有撤销或移动任何人的文件。
2. **能力实名**：`capability-plan.md:14-25` 的真实消费能力在 `src/assembly/capability-registry.gen.ts:19,50,58-62,71,100,106,113,126-128,139,141` 可核；`DragPreviewLayer` 明确是 render-only runtime，不冒充 registry capability。独立 `npx vitest run src/assembly/registry-guard.test.ts games/game-potion-brewing/blueprint.test.ts games/game-potion-brewing/screen.test.ts` 为 **3 文件、12/12 PASS**。
3. **解释责任**：`blueprint.ts:26-29` 把 add/stir 步骤交 G1，`blueprint.ts:78-87` 把连续角度交 G2，`blueprint.ts:95` 用 G5 完成信号触发 `Effect` 扣库存，`blueprint.ts:101-109` 用 `Resource/SelfRule/Draggable/Clickable` 保持权威。`screen.ts:18-27` 外观色不进世界；没有新增“数据表 + 游戏层解释器”。S5 改色不更改成功/失败或材料份数判定。
4. **例外裁决**：`capability-plan.md:43-50` 的 G1–G4 游戏层 B 例外仍不批准，G5 的 Owner A 和完成信号写在该计划第 5、22 行；`capability-gaps.json` 的 G1–G5 均为 `P1/engine/delivered`。锚点撤修验红采用**内存副本**，先断言 `GAP-POTION-05` 恰好一条且状态 `delivered`，仅将副本改 `open`：`evalCapabilityGaps` 从 `ok` 变 `warn`，`blockingGaps(...,'S4')` 精确锁住 G5；未写共享文件。
5. **美术方案**：`capability-plan.md:52-56` 仍明确坩埚、药液、棒、卷轴、材料、成品瓶消费槽与本地 fallback。第 55 行已将原计划 S5 前正式登记未达成的原因写明：两张原型参考图尚无 Owner 对具体候选及来源/许可的正式批准；生产资产、台账推导及接线归 S6，不把 S5 换皮或原型图片冒充已批准素材。

## 独立执行与告警

- `node scripts/game-pipeline.mjs gate game-potion-brewing S2`：**exit 0**，`gameHash=35b6fc9128549795`。
- 定向 Vitest 首轮在受限沙箱 `node_modules/vitest/dist/spy.js` 遇 `EPERM realpath`，0 测试被收集，故未算通过；本地只读复跑后 **12/12 PASS**、无测试 WARN。
- `node scripts/game-skill-audit.mjs game-potion-brewing`：红旗 **0**、`RATCHET: PASS`；告警仍有 S6 美术台账未建与 `game-potion-brewing.ts:114` 的 render-only `performance.now()` 建议项，均不当作 S2 能力计划失败，也不宣称 S6/S8 绿。
- `capability-plan.md` 旧的“S4 待过人门”及“S5 前必接生产图”时态已由施工方按真实流程/素材审批边界修订；我复读后才落本判词。该文档与游戏源码下一次变动仍会使流程板指纹更新，届时需按板重查。
