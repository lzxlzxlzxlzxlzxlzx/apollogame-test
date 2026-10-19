# SIMLIFE-ART-DIRECTION-02 施工自检

日期：2026-10-13  
施工人：BDM程序  
结论：**PASS；等待非施工人独立复查。**

## 规格对账

- illustrated player：384×512 source、linear、transparent、`display={cell,1,1.5}`、bottom-center、contain、zero offset。
- illustrated npc：与 player 相同的地图 display/anchor/fit 合同。
- legacy player/npc：32×48 source、nearest、transparent、32×48 pixel display；未变化。
- `life-standard-v1` 仍为 32px 逻辑格，故方向化 actor 的 authored display box 等价为 32×48px。
- 384×512 source 保持 3:4；contain 在 32×48 box 内真实画面为 32×42.666…，bottom edge 精确落在脚点。这是既定 contain 语义，不拉伸、不改锚点。

## 机器实证

- 定向回归：7 files / 61 tests PASS（profile、candidate、review packet、generation batch、renderer、Host、launcher）。
- 核心锚点恢复后：2 files / 14 tests PASS。
- `tsc --noEmit`：PASS。
- 点名 ESLint：PASS。
- `npm.cmd run build`：PASS（785 modules，仅既有 chunk-size warning）。
- `docs-ref-guard`、`context-budget-guard`：PASS。

## 撤修验红

唯一锚点：临时把 `src/assets/life-art-direction.ts` 的 illustrated actor display 恢复为旧 `1.5×2`。`life-art-direction.test.ts` 精确转为 **1 failed / 7 passed**，失败 diff 明确显示 expected `1×1.5`、received `1.5×2`；同次 renderer 纯规则测试 6/6 PASS，证明红点来自 profile 派生而非无关 renderer。恢复后 profile + renderer **14/14 PASS**。

## 非目标核验

- 本单没有改 `games/game-demon-castle/**` 或 `games/game-simlife/**` 正式内容/素材。
- 没有模型调用、候选生成、AssetIndex 登记、素材批准或物化。
- 没有触碰 World/snapshot/hash/save、运动或逻辑格实现。
