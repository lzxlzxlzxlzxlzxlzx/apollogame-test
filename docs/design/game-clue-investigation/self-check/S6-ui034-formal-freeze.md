# S6 UI-03/04 正式消费冻结 · 2026-10-14

本批纯数据施工及自证通过，交非施工者复查；不代签S6，不声称全库或九态逐像素全等。

正式 manifest SHA256：`0f2ac23cb81e0d7a40fea571c83fbb84b9d370c381834565bd01e04e7768d48a`。
旧基线`1585fc…`保存在`S6-ui034-before.json`。`s6-ui034-author.mjs`是受旧hash保护的离线authoring变换，`s6-ui034-button-fit.mjs`是受中间hash保护的按钮修正；二者不是游戏runtime，也不能对最终版本再次执行。UI02候选保持历史，不代表本版本。

## 范围与不变式

只改presentation.ui/font/focusTargets/pointerFeedback。新增测试把其余完整JSON与before深等比较，World/entities、规则、信号、flags、shortcuts、8Sprite/7mask、Transform/fit均未改。原型、art、共享域、控制台、人门未改。

- system-yahei；描述行高30.4、清单23.8；透明中心5px红印章、weight900、380ms独立fade/scale；实测原型旋转包围盒111.21×75.01，55px原始高。
- 图框7px #7A6345，图片仍702×260 cover/top，槽716×274；原坐标不变。
- 证物dialog lift-240、完成dialog lift-600+12px #D2A54C22环，移除内内容重复lift。收录切换不二次lift。
- 原生按钮边与焦点环使用闭集字段；实际字体使旧默认padding挤换行，按原型9/13和11/20内边距修正，不改变外部尺寸。
- 七对象above/14px/语义色；目标是原型槽外8px。共享above读取contain图片顶边，因此lock gap精确36.333333333333336、cup10.462882096069862、其余8，均在0..64。独立PNG尺寸公式与缩放实测断言原型目标相等。
- pointer visual三色、hover/pressed .24、blur9、brightness1.45；保持原mask及.95反馈缩放，不改点击几何。

## 最终版本实际结果

1. `node node_modules/vitest/vitest.mjs run games/game-clue-investigation`：03:42:03，3文件22/22 exit0。严格parser零warnings、LayoutNode零issue、PNG oracle及World冻结断言通过。较早扩大到UI组件合计77文件581/581（560组件+当时21游戏），不是最终22与581混算。
2. 正式` s6-reveal.audit.ts`：idle/flavor/reveal/collected/completed/exit/cancelled × 深/亮14轮，最终全部exit0，重叠/硬低对比/AA警告/border-image均0。初次清单23.8高盒造成1px重叠，保留lineHeight23.8、盒高21后消除。真实截图发现工具按钮换行后修padding并完整再跑14轮，不引用旧候选审计。华丽度3–4；静态house识别否，正式theme仍apolloOnyx。
3. `s6-browser-probe.mjs`最终exit0：42透明/实心反例、三viewport、hover/press、触控DPR2、Enter/Escape、Canvas RGBA收录前后相等。busy时3物理点击+3Enter进度1→1、clickable commit31→31；三物回看无重复计数；取消Tab1→Enter重开并可玩，完成重开可玩。场景始终1440×900原位，窄屏720×450@(0,175)。证物dialog正常.24s/reduce0，内内容0s。
4. `s6-visual-map.mjs --fixture`最终exit0，硬断言已从candidate分支移出：6个精确矩形、cover/top、无多余X；7目标×两viewport anchor/14px/tone；真实Tab/Shift+Tab焦点visible、2px边、rgb(19,156,164)3px外环+3；图框7px/描述30.4也由主链断言。
5. CDP实际字体：标题MicrosoftYaHei-Bold 4glyph、正文MicrosoftYaHei 21glyph、印章MicrosoftYaHei-Bold 3glyph；印章computed900、5px红边、透明bg，最终旋转包围盒与原型误差<.1px。
6. visual-map以浏览器Animation.currentTime取真实CSS关键帧（不写World）：证物0/120/240ms opacity0/.946079/1，transform起.94+y44终单位；完成0/300/600ms同样起/中/终并断言12px环。普通真实时间/reduced-motion由42主链另验。印章瞬态和原型稳定回看不混比，CSS完成后才比较印章几何。

## 证据与限制

最新机器测量`S6-visual-map.measurements.json`含最终hash；截图`shots/S6-ui034-*.png`与全链`S6-*.png`。已目击透明印章、7px图框、完成外金环；最终工具按钮截图用于复查核对单行。

九态导航保留disabled别名只是busy快照，**不声称已产生原型稳定disabled预览**。整页像素全等仍未证明：原型有authoring-only文案，宿主有返回架上；原生dialog焦点轮廓、HUD边缘及hover标签背景等需要异人按当前截图判定，不能把本批字段硬断言等同整关视觉通过。任何后续实际差异先用现有数据重组，不能凭此报告自行扩共享。

审计/5726/5728局部服务与隔离浏览器均finally关闭；不启动5173整套系统，无远程写、无Owner资料或人门操作。本批交回点是异人正式游戏复查。
