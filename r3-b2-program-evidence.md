# R3-B2 程序交付证据

日期：2026-09-17。结论仅为 **程序自证通过，等待独立复查**。B2 八单位的 R3 身份计数从 28/84 更新为 **36/84**；S6 动作与表现素材不在本批范围内。

## 范围

- `stray`：真实标准投射物命中后 slow。
- `iceandfire_if_cockatrice`：真实标准投射物命中后 wither。
- `cataclysm_the_watcher`：真实标准投射物命中后 burn。
- `wither_skeleton`：真实近战命中后 wither。
- `blaze`：一份 `VolleyPlan`，三枚独立子弹，shotIndex 0/1/2、2 Tick 间隔、种子散布与取消语义。
- `twilightforest_fire_beetle`：锁向 cone，64/24 半径、60°完整夹角、4 段、10 Tick 间隔、burn。
- `twilightforest_winter_wolf`：同一 cone 公共模板，slow。
- `iceandfire_stymphalianbird`：同一 castId 的两枚独立、同 Tick、同向、armor-piercing 羽弹。

## 实现事实

- `Shape.cone` 的唯一运行时半径字段为 `radius`；空间接触和 AABB 使用该字段。
- volley 由 `targeted-caster → VolleyPlan → volley-emitter → SpawnRequest → Prefab` 运行；每一枚弹使用独立请求实体和独立 `ProjectileShot`。
- `intervalTicks=0` 在同一执行内发射全部余弹；大于零按计划 Tick 发射。
- 来源死亡、硬控、目标首弹真实死亡都会停止未发射子弹；已发射弹维持自身飞行/命中/清理链。
- 区域引导由生产 Flow 的 `Pulse1..Pulse4` 状态驱动，每段走真实 Caster/Prefab/Overlap/Trigger/Hitbox。

## 验证

| 门 | 命令 | 结果 |
|---|---|---|
| B1+B2 定向链路 | `node node_modules/vitest/vitest.mjs run games/game-mcfight/r3-b1-projectile.test.ts games/game-mcfight/r3-b2-status.test.ts games/game-mcfight/r3-b2-runtime-wiring.test.ts games/game-mcfight/r3-b2-identity.test.ts games/game-mcfight/r3-b2-b3-catalog.test.ts games/game-mcfight/r3-b2-production.test.ts src/engine/spatial/cone.test.ts --maxWorkers=2 --minWorkers=2` | 7 文件、36 项通过、退出 0 |
| MC Fight 全量 | `node node_modules/vitest/vitest.mjs run games/game-mcfight --maxWorkers=2 --minWorkers=2 --reporter=dot` | 46 文件、313 项通过、1 项历史跳过、退出 0 |
| 类型 | `npx tsc --noEmit` | 退出 0 |
| 构建 | `npm run build` | 退出 0 |
| R3 组合审计 | `node node_modules/vite-node/vite-node.mjs scripts/mcfight-r3-audit.ts` | 4 组；cycles=0、unknown=0；退出 0 |

## 待独立复查

冻结副本：`docs/design/game-mcfight/review/r3-b2-freeze-20260917/`。复查必须遵循 `review/r3-b2-independent-review-checklist-v1.md`，特别执行 cone 边界、锁向、齐射间隔、双羽独立、来源死亡取消、穿甲六组撤修验红。未完成复查前不得把本批标为独立签核通过。
