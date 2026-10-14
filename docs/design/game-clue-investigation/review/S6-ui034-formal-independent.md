# S6 UI03/04 正式接线独立复查 · 2026-10-14

复查人：`s6_asset_candidate_review`，非施工者。

**结论：本批 UI03/04 数据接线与行为局部 PASS；整页原型 1:1 FAIL / 需返修。S6 整关未完成。** 不接受把整页对齐红项直接改绿。未执行阶段复查落账、人门或任何审批。

## 冻结与范围核对

- 正式 SHA256 `0f2ac23cb81e0d7a40fea571c83fbb84b9d370c381834565bd01e04e7768d48a`，检查前后相同。
- 导航 `../self-check/S6-ui034-formal-freeze.md`，before `../self-check/S6-ui034-before.json`。实际独立复跑测试：只剔除 presentation 的 ui/font/focusTargets/pointerFeedback 后全部 JSON 深等；另对 entities 全量深等。不是豁免整个 presentation 或世界。
- PNG / mask / Transform / fit / anchors 冻结测试通过；资产 verify exit0，8 PNG、7 mask、2,753,452 alpha 像素核对，8 台账行、8 key、0 孤儿、0 缺来源、0 approved。没有伪造审批。
- 原型本轮未新增修改；前轮已独立证明唯一变化是获准浅纸小标题深青。该色两端对比 8.642 / 4.995。

## 独立实际执行

| 项目 | 实际输出 |
| --- | --- |
| 游戏 Vitest，03:46 与撤修清理后 03:51 | 3 文件 22/22（4+5+13），测试 exit0 |
| manifest-check + 真 art index | exit0，ok=true，inferredCapabilities=false，warnings=[]；真引擎装载/tick |
| s6-browser-probe.mjs | exit0，42 正反命中、完整主链、无 console/page error |
| s6-visual-map.mjs --fixture | exit0，冻结 hash 正确，正式分支几何/字体/焦点/动效硬断言通过 |
| s6-import-assets.mjs --verify | exit0，PNG/遮罩与台账核对全部通过 |
| 最终隔离 7 态×深浅 UI 审计 | 14/14 exit0，重叠0、硬对比0、AA警告0、border-image0 |

一次汇总 PowerShell 命令末尾 Get-NetTCPConnection 无监听使外层 exit1；此前 Vitest 明确输出22/22，未把外层状态冒称测试失败或吞掉实际失败。后续清理核对见末节。

### 浏览器真实行为

访问隔离 `http://localhost:5726/?game=lib:game-clue-investigation` 和 5728 visual-map。读取冻结正式 manifest 的 library fixture，实际 art 不拦截；provider 空列表与精确 localhost:4000/api/status null 只用于缺工作台后端的局部环境。不是 Owner5173 live 验证，不改其启动状态/账户/存档。

- 7 物件 × 3 viewport（1440×900、720×800、1920×1080）×透明/实心 =42，通过；hover/pressed、DPR2触控、Enter/Escape通过。
- Canvas 收录前后 RGBA 完全相同；idle/flavor 均(0,0,1440,900)，窄屏(0,175,720,450)。收录不移除 PNG，不改变实形几何。
- 真 busy：3 物理点击+3 Enter，必要进度1→1，clickable commits31→31，仍处clue-collected。不是稳定disabled预览，不代表所有世界事件计数。
- letter/lock/prints 三回看无重复按钮/计数；完成与取消两终局重开可玩；取消1次Tab到restart，Enter重开。
- Escape 后焦点仍 BODY，不能称恢复至原热点。随后Escape能打开退出确认。

### 新字段的实渲染证据

- CDP 真 glyph：标题 MicrosoftYaHei-Bold 4，正文 MicrosoftYaHei 21，印章 MicrosoftYaHei-Bold 3；非仅看 CSS 字体串。
- 图框7px、描述lineHeight30.4px，图片cover/top、6个矩形与原型误差<0.1px。
- 印章5px rgb(171,61,50)边、rgba(0,0,0,0)中心、weight900；完成动画后包围盒(977.3969,196.99745,111.20624,75.00511)，与原型误差<0.1px。
- 七物件×两viewport标签anchor/above间距/14px/语义色，共14实测；锁/杯用contain透明留白补偿后等于原型槽顶部减8。
- 真Tab/Shift+Tab触发focus-visible：按钮2px常态边，rgb(19,156,164)3px外圈，offset3px；未靠取消focusRing通过。
- 证物整个dialog0/120/240ms：opacity0/.946079/1，transform由scale.94+y44至单位；完成dialog0/300/600ms同轨迹，12px半透明外环实测存在。
- 主链真实时间证物dialog .24s / reduced0s、内内容0s；没有重复内内容lift。完成reduced-motion未在本游戏主链单独量测，不能把证物检查扩称所有终局减少动画都已独立测。

## 撤修验红

复制测试为临时文件，仅改内存manifest。唯一 `object-lock` focusTarget，先断言命中1且tone=gold，再改为合法cyan：**exit1，1 failed /12 passed**，新UI03/04用例明确 `expected cyan to be gold`。清理后游戏22/22，生产hash不变。

此前尝试above→below，以及above→center保留gap，各10败3过，分别被枚举/组合守卫阻挡，已读错误；没有把这两次当作合法视觉回退的充分证明，另补上述tone撤修。所有临时测试均删除，没有改共享源。

## 审计污染与读告警

首次使用根`.ui-audit-tmp`虽本方串行，idle-light却出现别游戏 `gal-settings-title / 系统设置 / AA3.57`，随后flavor-light清理ENOTEMPTY。该批**无效且停止**，不能采信退出0。

为避免跨聊天覆盖，使用同目录临时审计副本，唯一锚点断言后只替换 tmp 为 `.ui-audit-gci-independent-tmp`；检查逻辑、阈值、入口均不变。重新完整14轮，元素数深浅一致：idle15、flavor11、reveal18、collected17、completed17、exit17、cancelled12；全部四类问题0。华丽度3–4，house静态识别否保留，正式theme仍apolloOnyx，不是缺主题的运行错误。独立目录由finally清理，脚本已删除。未擅删其他任务根临时目录。

## 原型整页仍未对齐：实际复现项

本人目击本轮生成的原型/正式 idle、reveal、collected、completed 同1440×900截图，并从 `S6-visual-map.measurements.json` 读取真实样式。

1. **HUD边与模糊（需返修）**：case-heading / case-progress / clue-ledger / case-utility 正式1px `#FFCB3D`，原型1px `#8B7652`；正式backdrop-filter blur(10px)，原型none。标题原型左边另5px `#D8AE62`，正式没有。几何相同不能消除明显边缘/背景差异。
2. **清单标题和条目（需返修）**：正式 ledger-title 是(61,740.61,132,21)带 `rgb(26,41,49)`底、1px边、5px圆角按钮，原型是无框summary。正式条目缺原型列表圆点。应保留真实按钮语义和键盘可用，用已有数据表达外观；不能仅因可点击而接受漂移。
3. **完成星形光晕缺失（需返修/明确裁决）**：原型 `.completion .seal` 有 `text-shadow:0 0 23px #edbb5a88`，实截图星形有柔光；正式星形是平面无光晕。完成大框外环已修，不能以外环通过覆盖星形。
4. **收录忙期的白色dialog轮廓（需查明/保留差异）**：正式 `S6-ui034-disabled.png` 纸框有白色焦点轮廓，原型稳定collected没有。双方时相不同，不能直接把忙期缺返回按钮判回归；但现有截图不是九态稳定disabled或回看态等价证据。不能直接删无障碍焦点来追像素。
5. **已授权/合理隔离的差异**：scrim0.9为Owner授权，原型约.79不视为返修项；作者占位措辞与真实现场措辞、宿主返回架上应单独列范围，不能据此豁免HUD等真实样式。完成正文删authoring说明造成行数不同亦属文案范围，不冒称像素全等。

另：场景PNG正式图在时钟/杯/地毯细节有较明显像素颗粒，原型较柔和；尚未做独立滤波/采样根因隔离，**只作待核风险，不宣称引擎回归**。本轮资产hash与几何均通过。

## 交接

本批字段消费、实形适配与核心交互通过；整页1:1保留FAIL，以上可重现差异不能擅自接受。未更新pipeline、未代签Owner、未抹旧S2CONCERNS、未宣称全库绿。5726/5728均无监听，隔离浏览器finally关闭；无整套系统启动、远程写或共享源撤修。
