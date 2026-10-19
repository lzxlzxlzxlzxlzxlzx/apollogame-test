# GAL-UI-03E 剧情屏局部 S4 对齐单

范围仅为 `GAL-UI-03E` 无皮剧情屏结构，不代表整个 GAL S4/S5/S6 阶段完成。基准是 Owner 定稿 `../gal-ui-complete-v2.dc.html` 第 15–16 行；证据为同画布 1440×900 静态真浏览器截图与 `../review/GAL-UI-03E.md` 独立复查。

| # | GDD 承诺 | 结论 | 证据 / 说明 |
|---|---|---|---|
| 1 | 【03E-01】对话框 x20..1420、y555..900、高345 | ✅ | 八态无皮真浏览器均 `[20,555,1400,345]`；`../review/gal-ui-03e-normal-dark.png`。 |
| 2 | 【03E-02】姓名/台词/底部提示按 V2 锚点可读 | ✅ | 实测姓名 `[122,625]`、台词 `[126,698]`、提示 `[60,867]`；长台词未撞提示，`../review/gal-ui-03e-long-light.png`。原型台词入场动画采样时可暂移 7px，不算静态结构漂移。 |
| 3 | 【03E-03】立绘容器 x675/y38、高845，不能盖菜单 | ✅ | 无皮外框 `[675,38,563,845]`，有图 Panel/Image 同盒；`../review/gal-ui-03e-art-dark.png`。 |
| 4 | 【03E-04】选项 note 与两键在 x365..1075、台词框上方 | ✅ | note `[365,265,710,16/17]`，按钮列 `[365,296,710,147]`，底 443 < 对话框顶 555；`../review/gal-ui-03e-choice-dark.png`。 |
| 5 | 【03E-05】点击台词框推进，选支后可回滚重选，读取/设置主链不退化 | ✅ | `gal-ui-slice-host.test.ts` 真 DOM click→yes→wheel rollback→no；静态真浏览器 `verify-gal-03e-action-live.mjs` 实走 intro→choice→yes→rollback→no→读取槽页→设置页，七帧见 `../review/gal-ui-03e-action-*.png`；定向 Vitest 35/35。 |
| 6 | 【03E-06】无皮深/亮主题无硬重叠、硬低对比 | ✅ | normal-dark/choice-dark/long-light 三态 `ui-audit` 阻断 0；亮主题姓名 23px 金字 3.57:1 满足大字 3:1，普通文本门槛提示留在独立 Review。 |
| 7 | 【ART-01A/S1】原始皮图叠加后视觉与 V2 1:1 | ⚠ 归 `GAL-ART-01A/S1` Owner A/B 裁决 | `../review/gal-ui-03e-art-{dark,light}.png`：有图 dialogue 外框 `[20,555,1398,343]` 比无皮缩 2px，light 字在深皮上低对比；本票不签 S5 视觉。 |

迭代记录：第 1 轮修对话/立绘/选项锚点；第 2 轮真渲发现按钮高与底部提示重叠并修正；第 3 轮亮主题审计暴露根背景语义错误，改为 `sunken` 后归零；第 4 轮有图立绘去实底占位，复拍后仅保留 ART-01A/S1 的原图裁切/亮主题问题。由于这是 GAL 模板局部票、并非 `games/<slug>` 的整关 S4，未调用 `align-count --game ... --stage S4` 去伪造整阶段收敛。
