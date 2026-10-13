# REQ-S3CART-RENDER · 施工自检与复查导航

施工主体：`Codex/root`。范围仅 `scripts/render-probe.mjs`、`scripts/lib/render-harness.mjs`、`scripts/render-probe.test.mjs`；`REQ-S3CLICK` 的点击探针与接线未修改。复查人须独立重跑，不采信本页自述。

## 病例与修复

- 原探针把 `/api/library` 固定为 `[]`；`?game=lib:game-clue-investigation` 因而停留在启动器，启动器截图方差 489.95 却获 `ok:true`。原图与记录已由本次真探针覆盖，病历见 `review/S3-independent.md`。
- 现在卡带分支从真实 `library/<slug>/meta.json` 与 `manifest.json` 组只读隔离路由，必须找到「返回架上」运行器内的 Canvas 才能通过 `gameMounted`。仅启动器 Canvas、加载态和错误态均判红；非卡带路径维持原有三断言，不加新挂载门。卡带 slug 严格闭集，坏路径 fail-closed。

## 自检实证

- `npx vitest run scripts/render-probe.test.mjs`：exit 0，**18/18 PASS**。沙箱第一次碰 Windows `realpath` EPERM、无测试执行；相同命令在允许环境复跑通过。
- 唯一锚点 `return !!back?.parentElement?.querySelector('canvas');` 在 `render-probe.mjs` 仅命中 1 次。暂改为 `return false` 后定向测试 exit 1，精确失败 `启动器自己的 Canvas 不算卡带挂载；运行器内 Canvas 才算`，`expected false to be true`；恢复后 18/18 再绿。
- `node scripts/render-probe.mjs --game game-clue-investigation`：exit 0；`S3-render.json` 的 `gameMounted.pass=true`、方差 127.58、console/page error 均 0。目视 `S3-render.png` 是灰盒调查场景，不是启动器。无 5700–5702 端口残留。
- `npx eslint` 三个改动脚本：exit 0。`node scripts/context-budget-guard.mjs`：10/10 槽，PASS。`npx vite build`：772 modules，exit 0；有大 chunk 警告。
- `npm run build`：exit 1，`tsc` 在 `game-card-reveal`、`game-dice`、`game-theft`、`src/launcher/game-runner.tsx` 等非本单文件报已有类型错；**不宣称全库绿**。

## 独立复查重点

1. 再跑真实卡带探针并看截图；只看 JSON 方差仍会重演假绿。
2. 自选唯一锚点撤修验红，确认启动器或错误态不能通过 `gameMounted`。
3. 检查只读路由未伪造游戏内容，浏览器/局部 Vite 关闭，编译期游戏判据未退化。
4. 本单 PASS 只说明渲染门修复，**不**说明 Canvas 点击门、S3 整关或 S4 已通过。
