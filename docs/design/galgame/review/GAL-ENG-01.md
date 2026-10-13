# GAL-ENG-01 独立复查记录

> 2026-10-09 · 复查人：GAL 策划会话；施工人：gal程序会话。最新结论：**PASS（GAL 合同定向复查）/ CONCERNS（全库门禁）**。本单的两项打回已复验通过；全库类型检查仍红，不能宣称整体交付或推送。

## 范围与已验证事实

- 范围：`src/engine/protocol/galgame.ts`、`src/assembly/gal-package.ts`、施工测试；复查测试由本会话维护于 `src/assembly/gal-package.review.test.ts`。
- 独立复跑原有 13 条测试：13/13 通过，退出码 0。
- 增加媒体载荷与判别式闭集两条对抗测试后：复查文件 8/10 通过，2 条失败，退出码 1。失败测试名为 `validates complete media and voice payloads, not only their outer shape`、`rejects branch-only fields on other node kinds and effect variants`。
- 独立 `npx tsc --noEmit --pretty false`：退出码 1；诊断位于 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 GAL 文件诊断。不能据此宣称全库门禁绿。
- 前轮已对 URL 资产键守卫做带锚点的撤修验红：守卫临时移除后点名测试转红；同回合恢复并复跑通过。本轮未对尚未通过的新增测试做撤修验红。

## 打回项

1. `gal-package.ts` 的角色语音、BGM 与合成 SFX 校验不完整：非法 `voice.characterId`、TTS 文本字段、`defaultVolume`、SFX 资产 URL，以及 SfxSpec 的 `gain`/`partials` 内非法数值、波形、未知字段均可漏过。V1 合同要求闭集纯数据；只验证 `partials` 是数组不够。
2. StoryNode 与 StoryEffect 未按 `kind` 完整互斥：例如 `line` 可携带 `ending/options`，`unlockCg` 可携带 `op/value`。只为 `ending.options` 写单点特判不构成五种节点与五种效果的闭集。
3. 施工方应系统性核对同类字段（包括场景/演出 zOrder、视频 play/stop 互斥），补正反例，避免只修当前两个样例。

这两条红测已交回施工会话。复修后需重新独立复跑、读完整告警，再更新本判词。

## 2026-10-09 复修后的独立复查

- 独立执行 `npx vitest run src/assembly/gal-package.test.ts src/assembly/gal-package.review.test.ts`：2 个文件、15/15 测试通过，退出码 0，无 Vitest 告警。首次受沙箱 `realpath node_modules/vitest/dist/spy.js` 的 `EPERM` 阻断、零测试执行；在不修改文件或启动服务的隔离限制外重跑后才得到上述真实测试结果，未把首次运行算绿。
- 先前失败的媒体/语音完整载荷与 node/effect 判别式闭集测试现均转绿。源码实查 `gal-package.ts` 现有 `kind` 专属字段白名单，以及 voice、BGM 音量、SFX、视频播放互斥的后置校验。此前 URL 资产键守卫已经做过带锚点撤修验红并恢复；本轮两项新增对抗断言先红后绿，保留为回归守卫。本轮未再破坏共享工作树。
- 独立执行 `npx tsc --noEmit --pretty false`：退出码 1；仅报 `games/game-dice/dice-window.ts`、`games/game-theft/ui.ts`、`src/launcher/game-runner.tsx`，无 GAL 文件诊断。不能据此判断全库门禁通过；此红灯不由 GAL 施工单擅改其他游戏/UI 域。
- 结论边界：GAL-ENG-01 的**定向合同复查通过**，可作为后续 Director 设计的输入；全库门禁与推送仍需另行消红并复跑。不得把此结论外推成 GAL runtime 或 UI 已可用。
