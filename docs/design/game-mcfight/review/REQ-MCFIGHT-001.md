# REQ-MCFIGHT-001 施工交接单

> 当前状态（2026-09-15）：closed，按原始合同与历史独立证据关闭。依据 [逐请求独立核对](request-contract-closeout-20260915.md)；以下旧施工/退回记录保留，不代表当前仍未施工。新批C1/C3—C6另行复查，S2未签核。
日期：2026-09-12。施工者：PE-game-mcfight。此文件是供独立复查使用的导航，**不是复查结论或 S2 签核**。

## 改动范围

- `src/engine/protocol/components/logic.ts`：声明 `EntityCheck`、Flow 捕获/取消字段与运行时目标快照。
- `src/engine/protocol/components/spawn.ts`：声明 Caster 对目标快照的消费字段。
- `src/skills/tier2/entity-check.ts`：可复用的实体资格检查。
- `src/skills/tier3/flow.ts`：启动时捕获、取消时清理。
- `src/skills/tier3/caster.ts`：仅以快照目标为来源的 target caster。
- `src/assembly/validate-references.ts`：静态实体引用校验。
- `games/game-mcfight/s2-round2.*`：生命周期组合场景。
- `src/skills/tier3/targeted-caster.test.ts`：定向消费、死亡和同拍拒绝回归。

## 自证命令与结果

```powershell
npx vitest run games/game-mcfight/s2-round2.test.ts src/skills/tier3/targeted-caster.test.ts src/skills/tier3/flow.test.ts src/skills/tier3/caster.test.ts
npx tsc --noEmit
npx vite-node scripts/system-graph-audit.mjs t3-flow t3-caster t2-hitbox t2-mortal f1-resource a2-hierarchy
npm run build
```

定向测试：4 文件、39 项通过。类型检查、能力子集调度审计和构建通过。

## 复查重点

1. 撤去 `captureTarget` / `targetFlow` 路径后，移动重选和死亡取消用例应变红，并且断言确实命中行为。
2. 独立复跑上述命令，阅读调度告警。
3. 核查同拍死亡在 `targeted-caster` 前已被拒绝，且没有回退 nearest-target。
4. 本次不把 marker 生成当作真实俯冲或伤害结论；多技能动作锁、重复取消、重开隔离及 B 仍未验收。
