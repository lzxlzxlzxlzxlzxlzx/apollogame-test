# 月影魔王城 · M0 物化计划与正式提升记录

严格身份闭合、Bundle、placeholder-authoring、启动器 discovery 均通过；冲突为零。M0 计划本身零写入，随后 owner 于 2026-10-12 以同一候选和确认哈希亲自在本机完成正式提升。

| 目标文件 | 字节数 | 内容哈希 |
| --- | ---: | --- |
| `games/game-demon-castle/life.json` | 12,643 | `sha256:64a1c57b658c8aec10c5bdb8fb00f9d31051873daf6b6dd1a1695481b0825faa` |
| `games/game-demon-castle/asset-slots.json` | 26,047 | `sha256:d68c970c1924444f5f0068a561d3f90a2812f89cf2fe41b4b950a4642e6879d5` |
| `games/game-demon-castle/life-host.json` | 789 | `sha256:4edd68564a33fec583b109bdc7e031b1590cf4f849071d84c678bec82597ac43` |
| `games/game-demon-castle/life-launcher.json` | 376 | `sha256:b16d755111458cfd6d6c543f01a49c3a3056c84502b0bb3129defea0323bbf68` |

确认哈希：`sha256:441ab550e45b61362cb9e7bdc1b022ac0721714bc24b137f56b0b70a14fd09ee`

## 正式提升实证

- owner 返回的 CLI 结果：`mode:"promote"`、`writesPerformed:true`、`writtenFiles:4`，目标目录为 `games/game-demon-castle/`。
- 提升后逐文件 SHA-256 与上表四项完全一致；再次执行只读 M0 plan 返回 `writesPerformed:false`、`conflicts:[]` 和同一 confirmation hash。
- Materializer、launcher catalog/integration 与 CLI 定向回归：**4 files / 40 tests passed**。
- 独立 `vite build`：**765 modules transformed，PASS**；仅保留既有 chunk-size warning。组合 `npm run build` 仍在 Vite 前被既有 `game-card-reveal`、`game-dice`、`game-theft` 与 `game-runner` TypeScript 错误阻断，本次四个 JSON 未命中错误。

正式目录现已包含上述四个 canonical JSON 文件；共享 `mountLifeGame` 与固定 discovery 据此发现条目，不复制 Little Valley 运行时代码。下一道人门是 Playtest，不由本记录代签。

## Owner A 返修后的安全更新预检

建设可达性通用 gate 与 owner-only 安全更新事务通过施工自检和非施工人独立复查后，候选 World 只做了两处闭集动作修正：`courtyard-town` 增加 `build`，`undercrypt-vein` 在保留 `mine` 的同时增加 `build`。三个建设项目均已在真实 Engine session 中证明 `nearby:true`、`allowed:true`、`available:true`；耕种、采集与采矿动作未被扩宽或移除。

新候选与零写 M0：

- source input：`sha256:a1e88d1b464e9d9c0816ea115519f5f49ea7bd24ecd76491426895c18eedbae2`
- Bundle `baseHash`：`sha256:599205ffb0d3a94e9087039c9f020821fa2549aa750e78a3f2b4ab38d521647b`
- candidate file：39,261 bytes，`sha256:2a509581bcf2f629ae15d0802b21980ffd0d2064212f2805a42c373a611d6539`
- 当前正式四文件组 hash：`sha256:801242eb0e9c2445c24241f51172fa0161202d39ee0fcec2742e85080bf9bfa6`
- 新正式四文件组 hash：`sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`
- 新 confirmation hash：`sha256:559fb88aa44660ac1d33c15331ad92ffa674a62a897f7669e409e2b5664173f7`

| 新目标文件 | 字节数 | 内容哈希 |
| --- | ---: | --- |
| `games/game-demon-castle/life.json` | 12,658 | `sha256:6b85a1dbb556d8371c8bf8d3bbad24f7f437196546d2c02f3cf6747ab617fa6e` |
| `games/game-demon-castle/asset-slots.json` | 26,047 | `sha256:d68c970c1924444f5f0068a561d3f90a2812f89cf2fe41b4b950a4642e6879d5` |
| `games/game-demon-castle/life-host.json` | 789 | `sha256:4edd68564a33fec583b109bdc7e031b1590cf4f849071d84c678bec82597ac43` |
| `games/game-demon-castle/life-launcher.json` | 376 | `sha256:b16d755111458cfd6d6c543f01a49c3a3056c84502b0bb3129defea0323bbf68` |

`--plan-update` 已零写通过，并把旧正式组与新计划分别绑定到上述两个组 hash。owner 随后于 2026-10-12 亲自在本机执行双 hash `--update`，返回 `mode:"update"`、`writesPerformed:true`、`writtenFiles:4`，且 previous/new group hash 与计划逐字一致。更新后的再次只读 `--plan-update` 返回 `conflicts:[]`、`writesPerformed:false`、`currentFilesHash` 与新组 hash `sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b` 相等；正式四文件 canonical bytes 已闭合。

## SIMLIFE-VIEWPORT-01 统一视口正式更新

本轮把魔王城的自由 `1440×900 / 48px / 16×10` Host/Camera 数值迁移为 engine-owned `life-standard-v1`，与 Little Valley 共享 `900×620` 逻辑宿主、52px 顶栏安全区、32px 格、28×19 可视格、固定 zoom/margin/dead-zone。素材槽位不改；角色、建筑和作物继续通过 `render.display` / `render.anchor` 保持各自视觉比例。

- composer input：`sha256:3a0e05dce89248d90526aaf25bd4c5fbd52518f20bd58ce7ee6c4680f0e7118e`
- Bundle `baseHash`：`sha256:37ef26f31cca73fedc75e679bb9fe76189c653c85c3b4a68bcce7d789047f7b4`
- candidate file：39,131 bytes，`sha256:20e503d886d49b94c2ecc091e8cff38f53ff20a9163fe10dee90e724988eedf5`
- 当前正式四文件组 hash：`sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`
- 新正式四文件组 hash：`sha256:8a639e81aa9d828077628b924d65ee85f1592f93f5738b6492b18540795e6529`
- 新 confirmation hash：`sha256:9553b62593fa5b0dc910226cea40d7a6f9b15513cbfd5ab9766971e519a770d3`

| 新目标文件 | 字节数 | 内容哈希 |
| --- | ---: | --- |
| `games/game-demon-castle/life.json` | 12,528 | `sha256:a84cacd49ed662a9b1f5e22c62667b6e80410404f35481e8ea3ee2917abe3942` |
| `games/game-demon-castle/asset-slots.json` | 26,047 | `sha256:d68c970c1924444f5f0068a561d3f90a2812f89cf2fe41b4b950a4642e6879d5` |
| `games/game-demon-castle/life-host.json` | 708 | `sha256:ac336d8471c95e66784b6541d2d371b7a35aef296516753158c3f039bfd21b56` |
| `games/game-demon-castle/life-launcher.json` | 376 | `sha256:b16d755111458cfd6d6c543f01a49c3a3056c84502b0bb3129defea0323bbf68` |

`life-gen-check` 与零写 M0 均通过；首次 `--plan-update` 还通过了 pre-profile 四文件的一次性严格迁移桥，返回 `writesPerformed:false`、`conflicts:[]` 和上述双 hash。依据 owner 明确修改后的 `AGENTS.md §2.2`，agent 随后执行受控双 hash `--update`，返回 `mode:"update"`、`writesPerformed:true`、`writtenFiles:4`，previous/new group hash 与计划逐字一致。写后再次执行只读 `--plan-update`，返回 `conflicts:[]`、`writesPerformed:false`，`currentFilesHash` 与新组 hash `sha256:8a639e81aa9d828077628b924d65ee85f1592f93f5738b6492b18540795e6529` 相等；正式目录恰含四个 canonical JSON，package 与 Host 均选择 `life-standard-v1`。本记录不代签 owner Playtest 人门。
