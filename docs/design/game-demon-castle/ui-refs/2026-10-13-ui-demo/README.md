# 月影魔王城 UI 原型素材

此目录仅服务于 `../demon-castle-ui-demo.html` 的视觉定稿候选，不是运行时素材登记，也不替代 `public/games/game-demon-castle/art/index.json`。

- `ui-moonshadow-courtyard-v1.png`：AI 生成的月夜庭院场景底图；HTML 负责所有实际文案与交互。
- `ui-moonshadow-panel-frame-v1.png`：AI 生成的透明空心面板边框；HTML 在空心区域渲染任务、背包或档案内容。
- `ui-moonshadow-hud-chrome-v1.png`：AI 生成的顶部 HUD 月相装饰骨架；HTML 覆盖任务、时间、资源与按键文字。
- `ui-reference-extracted-kit-v1.png`：由 owner 提供的 UI 母版图作为视觉参考生成的透明 UI 图集；原型通过 CSS 裁取其中的 HUD、追踪任务纸张与角色档案面板。
- `ui-world-status-ribbon-v1.png`：用于地点、季节、日期与时钟的一条连续顶栏标签，HTML 覆盖真实中文数据。
- `ui-resource-badges-v1.png`：金币、月影晶体、自然材料三枚 HUD 资源标签图标；原型以 CSS 裁取并在每个资源数值前显示。
- `ui-profile-attribute-badges-v1.png`：威望、关系、月能、成长、知识、居民六类角色/城堡属性图标；原型以 CSS 裁取，文字和数值保持由 HTML 提供。

两项均为本轮 prototype candidate。若 owner 定稿后要进入正式游戏，必须走资产审核、索引登记与引擎消费槽接线，不能直接以本目录作为运行时资产来源。
