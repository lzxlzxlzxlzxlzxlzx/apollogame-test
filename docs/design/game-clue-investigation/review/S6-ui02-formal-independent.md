# S6 UI02 正式接线独立复查 · 2026-10-14

判词：**UI02 已冻结接线行为局部 PASS；S6 整关仍未完成，视觉完整性 CONCERNS。** 复查人 `s6_asset_candidate_review` 非施工者。未执行阶段 gate/review、Owner 签核或素材审批。

## 版本与边界

- 导航为 `../self-check/S6-ui02-formal-freeze.md`，导航只用于定位，以下均独立执行。
- 正式 manifest SHA256：`1585fc239e45e1c4e703a501f0c074932e38f70862d800aeaf156a30c3b84eea`，复查前后相同。
- 剔除且仅剔除 `presentation.ui`，与原始 `S6-manifest.candidate.json` 进行 Node assert.deepEqual：PASS。世界规则、信号、资产与实形几何没有随 UI02 改变。
- 原型 diff 只有 `.evidence > .eyebrow { color:#123e43; }`；独立断言锚点命中一次，移除这一行后与 HEAD 原型归一换行逐字相等。颜色仅限纸框小标题，暗底标题仍保留青色。
- 独立 WCAG sRGB 计算：深青 `#123e43` 对纸色 `#e7ddc2` 为 8.6419479，对 `#bba875` 为 4.9954271。两端 RGB 各分量单调，固定不透明前景的此渐变中间值不低于最暗端。旧青色对应 1.0518817 / 1.6446447。此计算不替代最终所有状态实渲染审计。

## 独立复跑输出

1. `npx vitest run games/game-clue-investigation`：01:50 与撤修清理后 01:53 各 exit0，3 文件、21/21（4 skeleton + 5 interaction + 12 alpha），无 WARN。初步预审曾遇 sandbox realpath EPERM；当作环境失败，受控本地权限重跑后才计入 PASS。
2. `Get-Content library/game-clue-investigation/manifest.json -Raw | npx vite-node scripts/manifest-check.mjs --art-index library/game-clue-investigation/art/index.json`：exit0，`ok:true, inferredCapabilities:false, warnings:[]`。读取真索引、mask 绑定、引擎装载与 tick，而非宽松 JSON 解析。
3. `node docs/design/game-clue-investigation/self-check/s6-browser-probe.mjs`：exit0，真实 Edge、隔离 Vite `http://localhost:5726/?game=lib:game-clue-investigation`。随后隔离脚本副本额外监听 desktop/touch console warning，完整重跑仍 exit0，未输出 warning，无 console/page error。副本已删除。

浏览器真实结果：

- 七物件 × 1440×900 / 720×800 / 1920×1080 × 透明/实心 = 42 检查均通过。采样从实际 PNG alpha 推导，不复用引擎命中计算。透明处无 hover/点击反应，实心进入对应 UI；另有 hover/pressed 与 DPR2 触控茶杯旅程。
- 收录前后现场 Canvas RGBA 完全相同，未抠图、染色或绿幕；idle/flavor Canvas 均 `(0,0,1440,900)`；窄屏 `(0,175,720,450)`。
- 真 `clue-collected` 忙期，3 次物理点击 + 3 次 Enter：进度 `1→1`，clickable commits `31→31`，且检查时仍在忙期。不是稳定 disabled 预览，也不是所有世界事件的总计数。
- 三物件回看 `[letter,lock,prints]`，跨正常新局，无重复收录按钮、不加必要进度；完整完成、重开、取消、重开后可再次点线索。
- 取消后 1 次 Tab 到 restart，Enter 回 0/2。键盘 Enter 打开证物，Escape 关闭；焦点实际回 BODY，随后 Escape 可打开退出确认。**未声称焦点回原物件。**
- 证物内内容动效实测 no-preference `0.24s` / reduce `0s`；减少动态效果下档案条 `0s`。不是整个 Modal 外框演出的证明。
- 6 原型图 + 16 正式图由本轮复跑生成；已目击 `../self-check/shots/S6-03-lock-reveal.png`：纸框、深色小标题、裁切证物、右下矩形按钮真实显示，图框仍是未完的细金边。

隔离边界：fixture 从冻结正式文件读取 library/manifest，实际 art 请求不拦截；仅 providers 空列表及精确 `http://localhost:4000/api/status` DevTools 元信息空 null 为局部环境 fixture。不是 Owner5173 live 验证，不掩盖此前 live 拒连事实。浏览器 finally 关闭，5726 无监听；未启动整套系统或碰用户浏览器资料。

## 唯一锚点隔离撤修验红

在临时测试副本中，对内存 manifest 遍历查 `evidence-lock-image`，先断言恰好一个、原值 `position=top`，再仅改为 center。生产文件未写。

`npx vitest run games/game-clue-investigation/s6-ui02-independent-mutation.test.ts`：exit1，**1 failed / 11 passed**；失败为同源证物图约束，`expected 'center' to be 'top'`，命中位置断言。已删除临时副本，恢复基线 21/21，正式 hash 不变。此撤修证明本轮 top 消费回退会被挡住，不冒充共享渲染器全字段的撤修覆盖。

## 保留问题与盲点

- **UI 审计尚未独立重跑最终正式版**：共享固定临时目录由引擎复查独占，遵守协调未运行。施工 14 轮是候选，不冒称当前正式审计；本报告局部 PASS 只覆盖以上数据/行为。
- UI03 尚未消费：原型7px棕图框、印章边/weight900/行高/标签反馈仍待后续；完成外金环/阴影、按钮2px边与焦点色偏移、真实字体不同、整纸框 lift、精确光晕未由此局部测试消除。
- Escape 回 BODY 是已复现的焦点恢复欠缺；不能当作精准返回原热点的无障碍通过。
- 42 点是稳健正反采样，不是每个边缘像素或任意重叠点的浏览器穷举；单测另用解码 alpha 网格覆盖 contain/cover/缩放/镜像。
- 三态回看、忙期与终局行为真实通过，但未比对所有九态的逐像素与动画关键帧；无全库绿灯、无 S6 整关结论，旧 S2 Resource/j1-state CONCERNS 不消除。
