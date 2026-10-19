# 月影魔王城 · Generation Bundle M0 自检

## 输入收束

- World：`world.life.json`
- Actors：`actors.patch.json`
- 建设：`construction.patch.json`
- Plot：`plot.patch.json`
- 素材：`asset-slots.json`（26 槽位；26 个已批准的本地 AssetIndex 条目）

以上输入现在由 `bundle.sources.json` 固定顺序，并由共享 `life-bundle-compose` 合成为唯一 `LifeGenerationBundle v1` 候选 `bundle.candidate.json`，身份为 `game-demon-castle`；不再依赖人工或游戏私有脚本拼接。

## 机器结果

- `baseHash`：`sha256:599205ffb0d3a94e9087039c9f020821fa2549aa750e78a3f2b4ab38d521647b`
- `lifePackage`：`sha256:46899f61332a0167dc39b3bc4aca127256cece5d76b77a7c7ab2702d25398e40`
- `assetSlotsDraft`：`sha256:065ad91f3cd202d8926d336d774f520cbca03adae2b15e049f267bb39c980f7a`
- source input：`sha256:a1e88d1b464e9d9c0816ea115519f5f49ea7bd24ecd76491426895c18eedbae2`
- candidate bytes：39261；`sha256:2a509581bcf2f629ae15d0802b21980ffd0d2064212f2805a42c373a611d6539`
- 严格 Bundle 检查：通过。
- Life 编译、两 tick、snapshot/hash/restore：通过。
- 素材闭包：26 个 `art:` consumer 均有槽位。

## 已保留的非阻断告警

现有共享 Life 编译的 provider/system 图会输出 `Flag` provider 与若干可选 peer 的 dangling warning；与 Little Valley 的共享子集行为一致，未阻止编译或确定性探针。本阶段没有错误诊断，也没有游戏私有解释器。

## 正式提升与下一步

初版候选曾由 owner 于 2026-10-12 以 `mode:"promote"` 正式提升。Playtest 前置探针随后发现三个建设点均为 `zone-disallowed`；Owner 选择 A 后，通用 gate 现会稳定阻断该类候选。本次修正后的候选严格 Bundle 检查通过，三个建设项目在独立真实 Engine session 中均得到 `nearby:true`、`allowed:true`、`available:true`，同时耕种、采集、采矿动作保持原样。

新 M0 confirmation hash 为 `sha256:559fb88aa44660ac1d33c15331ad92ffa674a62a897f7669e409e2b5664173f7`，新四文件组 hash 为 `sha256:646a632dee40bd43726a4f81cc6069c8c0c5c21dcde19fe2fd8edc08f110518b`。owner 已亲自执行双 hash 正式更新，CLI 返回 `mode:"update"`、`writesPerformed:true`、`writtenFiles:4`，旧组 hash `sha256:801242eb0e9c2445c24241f51172fa0161202d39ee0fcec2742e85080bf9bfa6` 与新组 hash 均正确。更新后零写 `--plan-update` 再次确认 `currentFilesHash` 等于新组 hash、`conflicts:[]`；直接读取正式 `life.json` 的三个真实 Engine session 仍全部 `nearby:true`、`allowed:true`、`available:true`。本记录关闭正式返修，不代签后续可视化 Playtest。
