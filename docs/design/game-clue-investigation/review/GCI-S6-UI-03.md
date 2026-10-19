# GCI-S6-UI-03 · 共享闭集排版与焦点反馈施工导航

2026-10-14。Owner 选择 A：统一补通用字段。施工锁在 `docs/workflow/requests.md` 的 `REQ-GCI-CART-UI-BRIDGE`；本单只改共享 UI/卡带只读表现，不改 GCI 正式 manifest、原型、素材、World/hash、命中几何或 Owner 人门。

## 接口

- `Label.lineHeight?:number` 为 8–120px，`weight?:400|600|700|900`；显式 weight 覆盖旧 `bold`，不填维持旧 HTML。
- `Panel.border?:{width:0..24,color:LabelColor}` 只用于非 `bare`、无 `skin` 面板，颜色只取语义令牌或不透明 `{custom:'#RGB|#RRGGBB'}`；配 `bg:'transparent'` 时不叠 house `panelTexture`，中心仍透明。不填维持旧 1px 主题边。
- `presentation.focusTargets[]` 可选 `labelPlacement:'center'|'above'`、`labelGap:0..64`（仅 above）、`labelSize:10..32`、`tone:'cyan'|'gold'|'jade'`。above 使用同源 Shape/PNG mask 绘制包围盒顶边，gap 为逻辑画布 px；逐物件 tone 覆盖全局指针反馈 tone 并修饰标签，未配置沿用旧中心锚与全局色。焦点键依然只经 `ActionSink` 入队，pointer hover/press 仍 render-local。
- 已有 `tracking`、`rotate`/`scale`、指针 pressed .95 原样复用；不增自由 CSS、字体主题、金环或世界状态。

## 施工自证（异人已复核）

- UI-03 点名 5、focus/投影 3、presentation 合同 24，合并 UI 组件 + game-i gallery 范围 76 文件/593 测试 exit 0；TypeScript exit 0、build exit 0。build 的 >500kB chunk 是非阻断告警。
- `node tools/ui-audit.mjs tools/audits/gci-s6-ui03{,-light}.audit.ts` 深/亮各 exit 0：0 重叠、0 硬/软低对比、0 border-image 前提缺陷。两套 `[华丽度]0/house:false` 是字段夹具提醒，不是 GCI 正式屏品质判词。短时浏览器已关闭。
- 扩大到全 game-i 的 99 文件/704 测试出现既有 `games/game-i/dialogue-world.test.ts:30` 好感 8≠14，单文件独立复跑仍失败；该文件不在本单改动内，不能把 703/704 冒充全绿。全库门禁结果另核。
- `context-budget-guard`、`docs-ref-guard`、本单定向 ESLint 均 exit 0；`scoped-gate --run` 停在 32 条 depcruise 跨层依赖违规，输出路径均不在本单新增接口中。不能宣称全库门禁绿。
- Windows 普通沙箱的 Vite/Vitest `realpath` 对本地 `spy.js`、`src/ui/components/index.ts`、`index.html` 反复 EPERM、0 测试；上述真正执行的 Vitest/audit/build 使用合规的本地隔离命令，未连接远端或启动整套系统。

## 独立复查

非施工者按四步独立复跑、两个唯一锚点撤修验红、真实浏览器复现并读告警，**UI-03 共享字段局部 PASS**；完整证据见 `GCI-S6-UI-03-independent.md`。共享字段的局部结论不代表游戏 S6 完成。
