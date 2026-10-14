# GCI-S6-UI-02 · 通用受限视觉字段复查导航

2026-10-13。Owner 裁 A：补 PUI 闭集字段；Modal 遮罩 opacity 保留 0.9，其余纸框、裁切、按钮字级按定稿原型表达。本单仅交付共享 UI 基座能力，不修改 GCI 正式 manifest/art、Owner 人门或尚未获裁的 UI-03。

## 接口与边界

- `Modal.visual` 增 `width`(280–1200)、`radius`(0–64)、四边 `padding`(各 0–80)、不透明安全十六进制单色或固定 145° 两端渐变 `fill`、`border:{width:0..24,color}`；`scrim:{blur:0..12}` 只模糊背后，opacity 固定 0.9。旧字段与默认 800px/圆角/实底/焦点/关闭行为保持。
- `Image.position:'center'|'top'` 与既有 `fit:'cover'` 组合实现顶部裁切；缺省不追加 object-position。`Button.labelSize`(10–32px)/`labelWeight`(400|600|700) 作用原生按钮，保留 action 与四态。非法对象、半透明色、自由 CSS 和直渲绕校验值被拒绝或安全回退。
- `src/ui/components/{types,render,validate,catalog}.ts` 与新点名测试；game-i 活样例、`docs/playbooks/ui.md` 接线回填、深亮隔离审计夹具。无游戏层假 Modal/假按钮。

## 施工自证

- 新点名测试先在旧实现 5/5 预期红，补直渲安全边界后 6/6 PASS；`src/ui/components` + game-i 73 文件/561 测试 PASS；TypeScript、构建、定向 ESLint、context-budget 均 exit 0。
- 深/亮隔离 Chromium UI audit 各 exit 0：0 重叠、0 硬/软低对比、0 border-image 坏前提。仅有夹具无 house 贴图的非阻断华丽度提醒；这是字段夹具，不代表 GCI 成品美术评分。浏览器已关闭。
- 本回合全库 `scoped-gate --run` 仍在其他项目 depcruise 32 条违规停下，exit 1；缺 `origin/claude/mainbranch` 比较引用的提示也保留。未把局部绿冒充全库门禁通过。

## 独立复查

非施工者独立复查 **PASS（仅共享 PUI 通用字段）**：

- 独立复跑深/亮 `gci-s6-ui02` 审计均 exit 0，0 重叠、0 低对比；UI 组件 72 文件 551/551、game-i 10/10、TypeScript 与 build 均 exit 0。
- 隔离浏览器实测 Modal 宽 820、边 12px `#5d452e`、圆角 0、内边距 26/40、145° 不透明渐变、遮罩 rgba(0,0,0,.9)+blur 3；Image 702×468 自然尺寸在 702×260 盒内 `cover` 且 `object-position:50% 0%`；Button 16px/700。原生 dialog/aria-modal、Tab 圈定、Escape 单次 close 也实测通过。
- 撤修验红：只读共享源码，以 `object-position:center ${p.position};` 唯一锚点（source=1、内存 transform 命中=1）在隔离 Vite 内存变体改为居中；top-crop 断言转红 exit 1。未改共享源码。
- 已读告警：两套审计的 `house:false`/华丽度 1 是功能夹具的非阻断提示，不代表 GCI 成品视觉；build 的 >500kB chunk 亦为警告。短时浏览器与局部服务均已关闭，未访问 5173/后端。

该判词不代表游戏 S6 整关通过。GCI 游戏候选仍需接线、对照原型、处理真实视觉差异；全库 `scoped-gate` 仍因其他项目的 32 条 depcruise 违规退出 1。未代签 Owner 人门。
