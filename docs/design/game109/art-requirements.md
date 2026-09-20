# game109《种田》（暂名）资产需求表（15 项·脚本自动生成·**勿手改**）

> 来源：`scripts/game109-art-requirements.mjs` 扫 `buildBlueprint()` 的**被消费 skinKey**（Sprite.textureKey + SpriteBinding.skins）。
> 三条机读断言（三方集合相等 / 帧号不越界 / 无空 skinKey）全过才落盘；本表与 `public/games/game109/art/art-ledger.json` 同源。

| 编号 | skinKey | 规格 | 消费点 | 当前占位 | 说明 |
|---|---|---|---|---|---|
| art-01 | `109/scene/farm` | 720×910·满幅 | 1 处 | 程序化 CSS 渐变底（SCENE_BG） | 农场全景底（草地 + 田埂围栏 + 下沿木条） |
| art-02 | `109/soil/wild` | 102×102·满幅 | 36 处 | 素坯 Shape + Color.tint（无图回退） | 未开垦的草地土块（行 0 荒·干） |
| art-03 | `109/soil/tilled` | 102×102·满幅 | 36 处 | 素坯 Shape + Color.tint（无图回退） | 翻开的垄沟土块（行 2 翻·干·亦作行 1/3 不可达档的共图） |
| art-04 | `109/soil/sown` | 102×102·满幅 | 36 处 | 素坯 Shape + Color.tint（无图回退） | 播过种的深色垄沟（行 4 播·干） |
| art-05 | `109/soil/sown-wet` | 102×102·满幅 | 36 处 | 素坯 Shape + Color.tint（无图回退） | 浇透的近黑湿土带反光（行 5 播·湿·今晚会长的那格） |
| art-06 | `109/crop/carrot` | 102×102·3帧·透明底 | 12 处 | 素坯 Shape + Color.tint（无图回退） | 胡萝卜 3 帧横排：幼苗 / 成熟 / 空帧 |
| art-07 | `109/crop/wheat` | 102×102·4帧·透明底 | 12 处 | 素坯 Shape + Color.tint（无图回退） | 小麦 4 帧横排：幼苗 / 抽穗 / 成熟 / 空帧 |
| art-08 | `109/crop/pumpkin` | 102×102·5帧·透明底 | 12 处 | 素坯 Shape + Color.tint（无图回退） | 南瓜 5 帧横排：幼芽 / 藤叶 / 结瓜 / 成熟 / 空帧 |
| art-09 | `109/plant/bar` | 96×10·4帧·透明底 | 36 处 | 素坯 Shape + Color.tint（无图回退） | 生长条 4 帧横排：0% / 33% / 66% / 100% 填充 |
| art-10 | `109/tool/plow` | 96×88·透明底 | 1 处 | 素坯 Shape + Color.tint（无图回退） | 工具按钮：锄头 |
| art-11 | `109/tool/plant-seed` | 96×88·透明底 | 1 处 | 素坯 Shape + Color.tint（无图回退） | 工具按钮：种子袋 |
| art-12 | `109/tool/watering-can` | 96×88·透明底 | 1 处 | 素坯 Shape + Color.tint（无图回退） | 工具按钮：洒水壶 |
| art-13 | `109/tool/scythe` | 96×88·透明底 | 1 处 | 素坯 Shape + Color.tint（无图回退） | 工具按钮：镰刀 |
| art-14 | `109/hud/night-sleep` | 96×88·透明底 | 1 处 | 素坯 Shape + Color.tint（无图回退） | 动作按钮：月亮睡觉 |
| art-15 | `109/hud/coins` | 96×88·透明底 | 1 处 | 素坯 Shape + Color.tint（无图回退） | 动作按钮：金币 |

共 15 项 · 状态：filled · 台账 JSON（工具读此路径）：public/games/game109/art/art-ledger.json
