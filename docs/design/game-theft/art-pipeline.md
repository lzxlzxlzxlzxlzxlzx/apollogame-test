# game-theft 美术管线

- 风格锚：夜行盗贼的青铜锁盘；深蓝黑珐瑯、旧黄铜、暗红皮革，不使用菱形语言。
- 真相索引：`public/games/game-theft/art/index.json`；台账：`public/games/game-theft/art/art-ledger.json`。
- 消费约定：`games/game-theft/assets.ts` 始终先取 `skinMap[skinKey]`，本地 URL 只作回退；六行台账均有实际 `Panel.skin` / `Button.skin` 消费槽。
- 生成方式：OpenAI imagegen 原创透明 PNG；图片不烘文字，可变标题和数值由 LayoutNode 排版。
