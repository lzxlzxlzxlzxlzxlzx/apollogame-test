# SETTLEMENT-PARITY-01 · DokiWorlds 结算卡包/卡牌视觉对齐

状态：B 路线施工中，尚未取得 DokiWorlds 真实结算画面对照与 owner 视觉判词。施工范围仅限 DokiWorlds 当前结算界面中的封包和拆包后卡牌；不扩展收藏、交易、主页卡面，不修改 S1-P 原型。Owner 在本会话明确要求以该结算界面为本次视觉基准，原型保持原样。

## 已核对的源头

- DokiWorlds `frontend/src/components/hub/CardPackOpening.tsx`：`packLook` 从 `campaign_image_card → campaign_image → 首张事件卡 imageUrl` 选择封面，从 `campaign_title_logo` 选择 Logo；封包层还有渐变、撕顶、文字/数量、金边和动态高光。拆包后实际调用 `<CardFace card={card} showWorld={false} />`。这一个调用结果是唯一的卡面验收对象。
- DokiWorlds `frontend/src/components/hub/CardFace.tsx`：结算调用使用默认 `frame='gameplay'`；该组件会按已结算卡的数据生成完整卡面，包含图片、框、文字、稀有度等。`frontend/src/components/cards/LandscapeCard.tsx` 和 `frontend/src/components/hub/OrnateLandscapeCardFrame.tsx` 是该调用当前经过的视觉组件，不另立收藏/交易外观目标。
- DokiWorlds `frontend/src/lib/card-reveal-contract.ts` 目前只发送 v1 `{presentationId,cards:[{id,faceImageUrl,alt}]}`，未传封包外观和完整卡面字段。Apollo `games/game-card-reveal/blueprint.ts` 当前将 `host-card:*` 图片作为 `260×390 cover` Sprite，并用固定包装贴图；这不足以复制上述结算画面。
- 当前引擎机读 capability：`l1-sprite` 只绘制单张贴图；`l6-text` 是独立文本原语；`a2-hierarchy/t1-hierarchy-resolve` 的本地偏移不随父旋转旋转，且不继承父透明度；`t2-presentation-track` 负责位姿，不合成卡面。`docs/playbooks/rendering-fx.md` 与 `docs/playbooks/assets.md` 禁止游戏层临时手写 Canvas/DOM 渲染器。

## 源码可追溯样例（非线上真实掉落）

DokiWorlds `frontend/tests/browser/layout/settlement.tsx` 的 clear 预览提供：`packId='preview'`、世界名 `哈利·波特`、事件卡 `id='preview-clear'`、名称 `哈利·波特 · 通关纪念`、描述 `完成全部主线`、稀有度 `epic`、图片 `/assets/covers/neon-harbor-preview.webp`；字节在 `frontend/public/assets/covers/neon-harbor-preview.webp`。该测试不提供独立卡包 Logo；在无 pack manifest 的预览条件下，`packLook` 会回退用事件卡图作封面。它可用于离线开发对照，但不是一次真实玩家结算，也不能把本地相对路径伪称为正式 HTTPS 输入。

已将这些原值整理为 [`settlement-source-preview.json`](settlement-source-preview.json)，其中 `*Source` 是源码资产定位而非正式合同 URL。

正式验收还需 DokiWorlds 从一次实际结算提供脱敏的 batch/packLook、当时有效的图片字节或固定 QA URL、以及封包/P5 同尺寸截图；签名 URL 会过期，不宜当长期 golden fixture。

## 已实现的 v2 合同事实字段

输入仍为有序 1–5 张已结算卡，输出仍为 `doki.game.card-reveal-result` v1，不接奖励/随机。v2 接受：`presentationId`；`pack:{packId,title,coverImageUrl,titleLogoUrl}`；`cards:[{id,kind,name,description,rarity,imageUrl,worldTitle}]`；可选 `locale`。图片字段允许 `null`，非空时必须是 HTTPS；合同按字段闭集、长度和 64 KiB 限额校验。这些是现有结算组件消费的事实，不把 `frame/layout/artFit` 等可由目标组件推导的样式决定权重复交给宿主。App manifest 与运行时已更新到输入 v2，旧 v1 输入仍可被本地运行时解析，但 DokiWorlds 当前 v1 调用尚不能直接安装此 v2 包；宿主同步、真实图片可用性及视觉验收均未完成。

## 动态合成能力裁决

**A · 通用 render-only 卡面/包装合成能力（推荐）**：在资产/渲染层将远程插画、本地框/遮罩、文本与徽记合成为可由现有 Sprite/轨道运动的稳定纹理。代价是共享引擎面、异步图片/CORS/缓存/字体/像素比与回退测试，以及非施工人复查；其他动态卡牌/奖励演出可复用。选错会为单项目过度扩引擎。

**B · `game-card-reveal` 专属合成例外**：只在本 App 拼 Doki 结算外观再喂给 Sprite。初期改动面较窄，但复制渲染规则、积累专属解释器债务，Doki 样式变动时双端难同步；选错会使后续游戏再造同类代码，且须 owner 明确豁免游戏层自由 Canvas/DOM 禁令。

原推荐 A，因为完整卡面必须作为一件实体稳定旋转、撕包、遮挡与召回，现有多实体层叠/父子关系不能在旋转和透明度下保持 1:1。**Owner 于 2026-10-16 选择 B**，理由是今后预计不再需要此能力。专属 Canvas 合成仅允许在 `dokiworld/game-card-reveal/src/settlement-*.ts` 的 render-only 边界；不得扩大为游戏层每帧动画解释器或共享引擎改动。

## 当前实现与待验偏差

- App v2 parser 接受当前结算 `packLook` 与 `CollectibleCard` 的必要事实，manifest/调用说明声明 v2；输出仍 v1。旧 v1 解析与动画路径保留为本地兼容，不代表新包可直接对接尚未更新的 DokiWorlds v1 宿主。
- App 专属合成器生成封包 front/top/body 和完整卡面，资产管理器使用稳定 key；原 P2–P5 轨道、实例和完成门保持。横版卡使用结算组件的 3:2 轮廓，竖版使用 2:3。
- 离线合成预览截图：[`../self-check/shots/settlement-v2-P2.png`](../self-check/shots/settlement-v2-P2.png)、[`../self-check/shots/settlement-v2-P5.png`](../self-check/shots/settlement-v2-P5.png)。该预览使用 Apollo 包内图片，不是 DokiWorlds 真实图片对照，也不证明像素 1:1。
- DokiWorlds 源码 QA WebP 离线注入截图：[`../self-check/shots/settlement-v2-source-P2.png`](../self-check/shots/settlement-v2-source-P2.png)、[`../self-check/shots/settlement-v2-source-P3.png`](../self-check/shots/settlement-v2-source-P3.png)、[`../self-check/shots/settlement-v2-source-P5.png`](../self-check/shots/settlement-v2-source-P5.png)。脚本仅把 `frontend/public/assets/covers/neon-harbor-preview.webp` 作为图片响应注入隔离浏览器，没有复制资产入本包或发起网络请求。卡包、撕片与事件卡确实消费同一源图；仍非真实玩家掉落或 Doki 原生组件的并排截图。
- 正式 v2 假宿主（vendored SDK + 构建产物）离线演示：[`../self-check/shots/settlement-v2-formal-P5.png`](../self-check/shots/settlement-v2-formal-P5.png)。`tests/settlement-v2-formal-browser.mjs` 用上述 QA WebP 分别应答 HTTPS 封包/卡牌图片请求，真实播放至 P5 后收到 `doki.game.card-reveal-result` v1 的 `viewed/natural`；无服务或外网请求，隔离浏览器在 `finally` 关闭。这证明合同链和本地图片渲染，不证明与原生组件逐像素相同。
- Owner 指定的 DokiWorlds 本地 `frontend/public/apps/game-card-reveal/` 已在 2026-10-16 安装完整 v0.2.0 包；安装前 `verify:dist` PASS，安装后 17 个文件逐一与源 dist 做 SHA-256 比对。旧 v0.1.1 完整保留于 DokiWorlds `frontend/.codex-app-installs/game-card-reveal.backup-20261016-205135/`，未运行或重启前端。APPS 面板本地源可读取新 manifest 的输入 v2；结算页面现有 `CARD_REVEAL_APP.url` 仍指远程 v0.1.0 且组装 v1，不能把本地安装误当成结算链已联调。
- 可直接粘贴到本地 APPS 面板 `data` 框的无图调试参数：[`settlement-local-debug-data.json`](settlement-local-debug-data.json)。封包、卡图、Logo 的 `null` 可分别替换成真实可访问的绝对 HTTPS 图片 URL 后验图；本地相对路径和 HTTP URL 不符合正式合同。
- 已知偏差：装饰线、字体/裁字、徽记 fallback 和高光与 DokiWorlds React/CSS/SVG 组件仍需同画布逐项比对；当前静态 pack 撕线仍沿旧 P3 的 15% 裂口，而 DokiWorlds 原生封包装饰带约占顶部 22%。这些不能自行标为已验收。
- 后续需要 DokiWorlds 程序员将当前 v1 调用改为 v2，提供一份脱敏的真实结算 batch/packLook 与固定图片字节，并核对原生封包及拆包后同尺寸截图。双方未同步前不得安装/发布 v2。
