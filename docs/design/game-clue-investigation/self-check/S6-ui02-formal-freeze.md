# S6 UI-02 正式接线冻结 · 2026-10-14

结论：**本批已支持数据接线完成，交独立复查；S6 整关未完成。** UI-03 在途接口未消费。本文替代旧候选状态作为当前导航，不覆盖历史结果。

## 精确版本

- 正式 `library/game-clue-investigation/manifest.json` SHA256：`1585fc239e45e1c4e703a501f0c074932e38f70862d800aeaf156a30c3b84eea`。
- 候选 `S6-ui02.candidate.json` SHA256：`a984e33222bc5cf7b43c12bc0d806bcc4dcbf8d6f162102de247182d0712b2dd`。候选与正式**不全等**：正式追加证物/完成内内容240/600ms变换(y44/scale.94)，并将完成重开按钮padding设0，防原生默认水平padding挤换行。最后修改后又跑游戏21项和完整浏览器链。
- authoring脚本`s6-ui02-candidate.mjs`仍仅从旧source `8a7306…` 转候选；正式已推进后hash硬断言会阻止直接重跑，不能把它当随时覆盖正式的工具。其候选几何可追溯，后续若再改应先核新基线而非放宽hash。
- 非UI内容保留：规则、全部具名信号、旗标、快捷键、8 Sprite/7 mask、Transform/fit/anchors、art目录不变。只用LayoutNode数据，无新游戏runtime。

## 本批变化

纸框820×560、12px棕边、原型145°不透明渐变、scrim0.9+blur3；证物框716×274、图片702×260 cover/top；收录108×47右下；删除额外X/返回按钮而保留Escape。已收录回看为同位置单一“回到现场”按钮，沿用investigation.close。

HUD标题/进度/清单/utility、档案条文字与92×41继续按钮、690宽完成框与520宽退出框已按实测重排；移除额外progress-bar和主题header。取消视觉改底部档案条，保留cancelled状态与restart动作；原型本来就在此区域覆盖HUD清单，因此意图叠层逐节点标注，不用allowOverlap掩盖其他误撞。

Owner授权纸底眉题从浅青改深青`#123E43`：原型仅新增`.evidence > .eyebrow`限定选择器，正式同色；最差纸渐变端对比4.995，另一端8.642。原型备注C1保留历史Owner判词；截图`shots/S6-ui02-prototype-color-reveal.png`。

## 最新实跑（非旧基线）

- 严格manifest-check+真实art index：exit0，warnings=[]；新正式游戏Vitest：3文件21/21，最后01:40:54运行PASS。S4测试验证LayoutNode零issue；S6测试守七实形及UI cover/top/108×47/16px700。
- UI组件：73文件556/556 PASS（01:33，共享树当时含在途UI-03测试；通过不代表本游戏消费UI-03，也不代替其独立review）。
- 7态×深浅候选审计最终14项均exit0、0重叠/硬对比/AA告警/border-image。完成/取消最后4项在修几何及真实叠层标注后单独复跑；这是候选布局证据，不把它冒称后续正式演出/padding变化后的14轮重跑。华丽度3–4，house静态分析仍“否”，正式theme字段apolloOnyx。
- `s6-browser-probe.mjs`读取**最新正式**，隔离5726 exit0：42真实PNG透明/实心检查（三viewport）、hover/press、Canvas收录前后RGBA不变、全完成/取消重开、DPR2触控、Enter/Escape；原型6图+正式16图。最新`S6-*.png`由该轮覆盖，非旧候选图。
- 真实busy补验：首次lock收录后仍处于clue-collected，3次物理点击+3次Enter后required进度1→1，只读clickable commit31→31，没有新提交。`S6-04-lock-collected.png`是此瞬态；**不是**原型stateSelect的稳定disabled预览，不声称九态视觉已全绿。
- 三线索回看：`revisitChecks=[letter,lock,prints]`，跨两个正常新局操作，回看只有返回按钮、无重复收录按钮、计数不加。最后仍正常找齐两必需物件完成，不绕过完成相位。
- 取消档案条：`cancelTabCount=1`，真实Tab到restart、Enter后回0/2，再点击线索可玩。Escape关闭reveal后焦点回BODY，随后Escape能打开exit；已记录现状，不声称焦点已精准回到原物件。
- 动效：no-preference证物内内容0.24s，reduce0s；档案条reduce0s。整Modal外纸框还未与内容一起升起，不能把内内容时长PASS冒充完整演出1:1。
- `s6-visual-map.mjs --fixture`只读实际字体CDP：原型标题4glyph使用MicrosoftYaHei-Bold，正式4glyph使用Noto-Sans-SC-Bold；不是仅凭CSS font-family推测差异。该测量版本fb13fa…仅比最终版少完成按钮padding0，标题字体证据不受影响。

## 待续与超当前范围差异（集中交主聊天）

本轮单独执行 `node scripts/align-count.mjs --game game-clue-investigation --stage S6`：exit1，11绿/2红/0警告。第12/13条已更新为上述实际新版本差异，不再用旧contain/800宽说明当前状态。最终完成截图再次目击：重开按钮六字单行，padding0修复生效。

1. **UI-03已裁A但未独立PASS**：lineHeight/weight900、印章/图框可控边、hover标签顶部/gap/字号/每物件tone，等待通知后消费。当前精确图像位置已对，图框仍1px主题边+6pxpadding，不是7px原型棕边；印章未成透明红边框。
2. **外金环/阴影**：完成12px半透明外环仍缺；UI02 fill/border只不透明安全hex，透明外框重组不成立；Modal固定shadow及overflow-y:auto阻止向外装饰。未改art或凭空注册框皮。
3. **字体真实不同**：实际glyph为YaHei vs Noto，影响文字行高/宽度；不自行加任意font-family或下载字体。完成重开按钮的实际换行已用合法padding0消除，无需为此新增字段。
4. **按钮焦点与边宽**：常态border已实测#51371E，白色为原生focus-visible的3px内圈(theme.text/offset-3)，非stateColors漏接。原型为cyan外圈offset+3，常态2px；当前Button不可配宽/焦点色偏移。没有用focusRing:false抹掉无障碍。
5. **精确feedback光晕**：旧renderer固定cyan/gold palette、alpha70/150及边255、blur10/15，原型色值/24%/blur9/brightness1.45不同；.95按下轮廓缩放已存在，无需新字段。UI03每对象tone解决类型区分，不自动等于逐像素光晕对齐。
6. **动效整体**：证物/完成内容已有变换，外框仍静态；印章并行淡入/缩放与既有忙期、原型preview稳定回看要分时间点比较。世界规则/忙期/完成等待本批未改。

清理：5726/5728最终无监听、隔离浏览器finally关闭；未启动Owner5173系统、未远程写、未代签人门。没有声称全库门禁绿。当前交回点为本批异人复查，后续UI-03与上述超范围差异由主聊天统一协调。
