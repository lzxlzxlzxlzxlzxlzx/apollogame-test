# S7 视觉评分独立预检（2026-10-15；未落正式评分卡）

复查者与 S6 施工者不同。本记录只收集可核证材料，不代替 `game-pipeline.mjs scorecard`，也不代签 Owner S7 人门。

## 前置门

`node scripts/game-pipeline.mjs board game-potion-brewing` 在本次预检时显示 S2 当前，S6 台账 8/8 复核；但 S3、S4、S5 的机器门和独立复查都因游戏内容指纹变化而过期。按 `docs/playbooks/game-production.md` 的复查前置硬闸，本次不落 S7 正式分数，待不同复查者重核前置后重读流程板。

另外，`public/games/game-potion-brewing/art/art-ledger.json` 的 `art-08` 搅拌棒仍记 `provenance.humanArtPlatformReview: pending`，`self-check/S6-alignment.md` 的第 8 行也称 Owner 平台逐行复核未执行；这与当前流程板 S6 8/8 复核显示不一致，应由总负责者核对真实控制面，不能仅据一方文字断言。

## 已独立核证的视觉证据

- 2D 形态，适用 `docs/playbooks/visual-scorecard.md` 的 2D 底线。开局 `self-check/shots/S6-01-start.png`、投料中间帧 `S6-02b-add-fade-middle.png`、成功 `S6-05-success.png`、失败 `S6-06-failure.png` 均由本复查者打开目视；另打开定稿原型帧 `ui-refs/29-transparent-fixed-recipe.png`、`30-purple-static-failure.png`、`31-transparent-success.png` 对照。
- 主体锅和瓶不是程序图元：资产台账 `art-01`/`art-02` 指向已批准 AI PNG；五种材料 `art-03` 至 `art-07` 为已批准原型 SVG；`art-08` 为原型派生搅拌棒 SVG。真浏览器开局和结算帧可见这些资产。
- 卷轴暖纸面、深木材料架、古铜锅和青蓝汤色形成同一暖金/深棕/青蓝色系。卷边、卡片描边、架面渐变、液面内高光和投影在开局帧可见；投料中间帧可见只在汤面内的亮心/双环，非锅体光晕。
- 成功/失败结果框均在舞台中央，成功瓶图清晰；但透明宿主背景留下较大无装饰空区。世界密度按既定 2D 底线是否达标应严格据截图判断，不因“宿主透明”擅自豁免。
- 旧的 20 帧/零浏览器错误只能证明走查，没有帧时分布。本次另在 Owner 已运行的 `http://localhost:5173/?game=game-potion-brewing` 进行两次隔离 Edge 只读采样（1440×900、DPR1、`requestAnimationFrame` 各 240 个间隔；分位数按升序最近秩，毫秒；仅拦截开发壳的 providers/library/status 读取）。开局静态：median 5.9 / p95 6.1 / p99 6.5 / max 6.6 ms，DOM 节点 104，Canvas 1，pageerror 0。真鼠标拖月露草入锅、等 `#potion-liquid-previous` 出现后采样：median 17.5 / p95 18.1 / p99 18.5 / max 19 ms，采样中 glow cue 存在 54 帧，DOM 节点 115，Canvas 1，pageerror 0。它是该本机无头浏览器的实测，不外推到所有宿主设备或压力场景；两个浏览器都在 `finally` 关闭，未启动/停止 Owner 的 5173 服务。

预检结论：目前有八维评分可用的素材和基本性能实数，但前置 stale review 及 S6 逐行复核文字冲突必须先厘清；本记录故不预填 0–3 分，不写 `VISUAL`/`PREMIUM` 判词。
