# Life Host UI skin pack v1

`life-host.json` 可选 `uiSkin`，仅影响共享 Host 的渲染。省略该字段时不增加默认值，原 descriptor 的 canonical hash 保持原样。正式 key 由资产管理流程登记后才能绑定；本合同不会批准或导入素材。

```json
{
  "uiSkin": {
    "id": "moonshadow-courtyard",
    "slots": {
      "trackedQuestFrame": "art:game-demon-castle:ui:tracked-quest-frame",
      "worldStatusRibbon": "art:game-demon-castle:ui:world-status-ribbon",
      "panelFrame": "art:game-demon-castle:ui:panel-frame",
      "hudChrome": "art:game-demon-castle:ui:hud-chrome",
      "questIcon": "art:game-demon-castle:ui:entry-quest-scroll",
      "inventoryIcon": "art:game-demon-castle:ui:entry-backpack",
      "profileIcon": "art:game-demon-castle:ui:entry-profile"
    },
    "slices": {
      "trackedQuestFrame": { "source": 32, "display": 8 },
      "panelFrame": { "source": 48, "display": 12 }
    }
  }
}
```

示例只说明数据形状，不表示这些素材已登记或批准。`id` 是小写 kebab 标识，`slots` 只允许上述七个可选键，值必须是 `art:<artSlug>:ui:<小写-kebab-name>`；game 段与同一 descriptor 的 `artSlug` 精确一致。拒绝空串、URL、路径、Data URL、CSS、atlas 槽及任意额外字段。三个入口图标不接受 slices，不增补缺省值。

`slices` 只允许 `trackedQuestFrame` / `panelFrame`，且必须存在对应 slot。每项只能包含必填整数 `source`（1..256）和可选整数 `display`（1..128）；分别对应现有 LayoutNode 的 `skinSlice` 和 `skinBorderWidth`，省略 display 时沿用源边距。

共享 Host 通过同一个 AssetManager resolver 查找已加载的 texture，取得 URL 后交给 Panel.skin。追踪卡、世界状态和 HUD 框各有直接消费节点；不能给 DrawerProps 填入一个不会被渲染的 skin 属性。资源/属性图集裁切不属于本合同。

`DEMON-CASTLE-UI-RUNTIME-01`：至少一个框皮就绪时，使用同一套共享 LayoutNode 全视口叠层；三类侧栏由 Panel + 不透明内纸面 + Panel.scroll 重组，保留原有开关/关闭动作，不使用原生 Drawer 的固定340px与全屏遮罩。尺寸来自 Host 实测视口，仅重排表现，不改世界/镜头。状态框皮内部用 bare 文字分组，不能另加实底卡遮住纹样；地点/日期/时段有受限列宽与长文换行。Owner 已选择仅两项真实属性和 PUI 原生 icon-only 按钮；PUI 合同已交付且本票独立PASS，Host对已解析图使用 `Button.iconOnly:{size:60}`（窄屏42，表示按钮外径、图为size-8）。非空中文label保留可访问名称，独立Tooltip给悬停/焦点提示、键徽独立；mountUI确认图加载后才隐去可见label。resolver缺图保留常规文字按钮，图显示阶段失败由PUI恢复文字；不以Panel.action或emoji替代。不能把本段当作整单验收或最终视觉冻结。

未声明或全部框皮尚未加载时不产生 skin/slice 属性，LayoutNode 树及其 HTML 与原 starter 回退完全相同；部分就绪时只解析已加载项，缺失项保留安全数据底。文字、任务进度、地点、Calendar、资源与人物值仍为动态投影。UI skin 不参与保存入口的 descriptor 指纹，选择、替换或移除它不会使旧存档失效；World、snapshot、persistent hash 和存档格式保持原合同。

Owner 输入 A 的可选 Host 接缝只在实际 overlay 已就绪且无活动世界互动菜单时生效：body/本playfield canvas首次Tab自然进入HUD；本Host原生控件内Tab/Enter/Space由浏览器处理；闭集Tooltip的Tab也放行，避免困住序列。世界菜单打开仍用旧Tab循环/Enter确认。无uiSkin或框皮全缺时不改变键盘；不改变纯reducer、持续移动、World/save/hash或动作词表。PUI局部PASS不能代替Host最终视觉/交互验收。

验证入口：`src/authoring/life-host-descriptor.test.ts`、`src/engine/host/life-ui-skin.test.ts`、`src/engine/host/life-game-host.test.ts`；深浅主题审计位于 `scripts/audits/life-ui-skin-*.audit.ts`。
