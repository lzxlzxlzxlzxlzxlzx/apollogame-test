# S4 当前规则域独立复查（2026-10-15）

- 复查主体：`/root/potion_current_review`，非施工者。`full=453f23a6b8e49673`，`rules=f1fca8d9f97ffeb3`。
- 判词：**PASS（仅 S4 玩法结构）**；不代表 S5/S6 视觉、S7 品质或宿主部署联调。

## 实证

1. 独立 `npx vitest run games/game-potion-brewing`：4 文件、19/19；`npx vite-node scripts/acceptance-run.mjs --game game-potion-brewing`：GD 署名的 5/5 剧本（检查点 12+9+4+5+9=39）通过。五本 `acceptance/*.scenario.jsonc` 首行均为 `// author: GD /root/potion_s4_gd`；错误材料、错误方向和重复取材均有剧本。`blueprint.test.ts:63-77` 明确断言同 seed 同输入/tick 的完整 `world.snapshot()` 相等；本作无随机，异 seed 亦相等。
2. 独立短生命周期 `node scripts/potion-s4-browser-probe.mjs`：12 帧、0 浏览器错误、exit 0。鼠标与触屏真实投料/锅外释放/沿锅口搅拌、错误紫汤和终局链可走；临时 Vite 与浏览器由探针 `finally` 关闭。另独立 `node scripts/click-probe.mjs --game game-potion-brewing`：鼠标和触屏 Canvas 拖动 2/2，`Engine.step` 收到 `drag/drag`，玩家可见步骤 1→2，零 console error。不是 DOM 豁免。
3. 递归反证：`blueprint.test.ts` 对错误材料、重复材料第三次多投的真实会话失败与终局锁定逐项断言；GD 剧本 03/04 的错误路径真实红/绿边界与 01/02 成功路径相互对照。S3 Canvas 探针另经锚定三重判据的内存撤修验红，输入匹配位由 true→false 使 2/2 变 1/2 FAIL。S4 规则没有在游戏层复制有序步骤解释器；接受/拒绝由共享 OrderedActionSession 解释。
4. `S4-alignment.md` 文首已明确 2026-10-13 截图及库存/QE/重开描述是历史合同，文末 2026-10-15 当前合同附录对应 Owner S1-P-07/08。当前玩法为材料无限取用、整根棒身可抓、无 Q/E、终局一次性返回宿主且无本局重开。S4 checklist 原文“终局→可重开”已被 Owner 后续裁决取代，不可反向加回重开。

## 已读告警与边界

S4 machine UI walk 显示“DOM direct drive 0%”非阻断警告：其枚举 `[data-action]` DOM 控件，本作关键操作位于 Canvas，不能拿 0% 当不可玩或冒充覆盖率。通用 S3 Canvas 真手势门及本轮 S4 浏览器自玩才是当前覆盖证据。S4 对齐单尚有一项 S5/S6 视觉待裁，不计作玩法结构 ❌；`align-count` 13✅/1⚠/0❌。并行工作树中其他游戏改动未算成本游戏成果。
