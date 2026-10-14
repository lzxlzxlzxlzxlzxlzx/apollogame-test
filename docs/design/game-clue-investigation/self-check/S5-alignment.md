# S5 UI 对齐与自检 · 2026-10-13

施工范围为纯 manifest 的 presentation.ui；未改世界规则、输入动作、原型或正式资产。S1–S4 Owner 已批准。本单是自检证据，不代替独立复查与 S5 人门。

## 同画布逐项对照

| # | GDD 承诺 | 结论 | 证据 / 说明 |
|---|---|---|---|
| 1 | 1440×900 舞台等比缩放，档案条不推移现场 | ✅ | `shots/S5-01-idle.png`、`S5-02-flavor.png`、`S5-11-narrow.png`；浏览器矩形前后都是 (0,0,1440,900)，窄屏为 (0,175,720,450)。 |
| 2 | HUD 目标/进度与清单、退出入口保持 S4 信息层级 | ✅ | `S5-00-prototype-idle.png` ↔ `S5-01-idle.png`；主体锚点保持，标题/数值使用 cnwen；查看记录能开合，0/2→2/2 可见。 |
| 3 | 普通调查下方档案条含物名、描述与继续入口 | ✅ | `S5-00-prototype-flavor.png` ↔ `S5-02-flavor.png`；178px 固定条，补物名标题，鼠标/触屏均到达，清单在此态收起。 |
| 4 | 证物标题、大影像槽、说明、收录按钮清楚可读 | ✅ | `S5-00-prototype-reveal.png` ↔ `S5-03-lock-reveal.png`；纸面实底/深字、青灰影像槽、金按钮，七态深亮主题均无低对比；照片未接入须看第 9 条，不能把占位算实物。 |
| 5 | 收录印章和进度反馈与完成态可分辨 | ✅ | `S5-04-lock-collected.png`、`S5-05-completed.png`；红褐印章380ms与深青完成卡600ms，保留 S4 世界提交与完成顺序。 |
| 6 | 退出取消不是失败；两个终局都能重开并再次调查 | ✅ | `S5-07-exit-confirm.png`→`S5-08-cancelled.png`→`S5-09-post-cancel-playable.png`；完成→`S5-06-restarted.png`，真实点击重开并见0/2、再查窗锁。 |
| 7 | 键鼠触控可见反馈、减少动态效果仍可操作 | ✅ | `S5-01c-cup-hover.png`、`S5-01d-cup-pressed.png`、`S5-10-keyboard-reveal.png`、`S5-12-touch-flavor.png`、`S5-13-reduced-motion.png`。computed animationDuration 正常0.24s、reduce=0s；reduce下档案条=0s且正文可见。 |
| 8 | 模态实底、文字可读、无意外重叠 | ✅ | `s5-reveal.audit.ts` 七态×深亮14轮均重叠0、硬失败0、AA告警0；仅 Modal 自身声明意图覆盖，普通面板没有全局豁免。 |
| 9 | 真实背景、七件 AI PNG、透明洞同源反馈、证物照片 | ⚠ S6 正式素材 | 裁决去向：沿已批准阶段划分交 S6 资产接线与 Owner 来源/许可/审美审批。当前 Shape 灰盒和“证物影像”槽不得当作真实 PNG 验收。 |
| 10 | 原型框皮、纸张纹理、准确字体观感/按钮材质、完整视觉与演出1:1 | ⚠ S6 框皮与演出终验 | 本轮已改善纸面/字体/状态反馈；正式仍有 house Modal 深色外框、切角金按钮，原型为方形纸框，不能称逐像素相同。裁决去向：S6 正式框皮/资产接线后由 Owner 目击最终同画布关键帧；本单不批准偏离原型。 |

## 实跑输出

- `npx vitest run src/ui/components games/game-clue-investigation/s3-skeleton.test.ts games/game-clue-investigation/s4-interaction.test.ts`：exit 0，70文件、537测试通过（含游戏9条、LayoutNode校验）。最初沙箱 realpath EPERM 为环境失败，重跑才计有效结果。
- `node tools/ui-audit.mjs docs/design/game-clue-investigation/self-check/s5-reveal.audit.ts --w 1440 --h 900`：以 `VITE_GCI_AUDIT_STATE=idle/flavor/reveal/collected/completed/exit/cancelled` 和 `VITE_GCI_AUDIT_LIGHT` 空/1 顺序跑14轮，exit 0、无重叠/对比硬失败/AA告警/border-image缺前提。house识别显示“否”是入口静态检测未识别条件参数，不是运行主题缺失；生产 manifest 明确 apolloOnyx，亮主题仅审计。
- `node docs/design/game-clue-investigation/self-check/s4-browser-probe.mjs --s5`：exit 0，原型6图、正式16图；键鼠、触控、完成与取消后的重开、窄屏、reduce 动效断言通过，console/pageerror 0。
- 测试地址 `http://localhost:5720/?game=lib:game-clue-investigation`，任务级无头浏览器和局部 Vite 均在 finally 关闭；没有启动整套系统或使用 Owner 浏览器资料。
- 最终数据复验：本游戏9/9、manifest-check严格装载 `warnings:[]`、能力棘轮PASS（S6无美术台账仍WARN）、`tsc --noEmit` exit0、Vite build exit0（公共chunk >500kB告警保留）、DOCS-REF及CONTEXT-BUDGET PASS。`scoped-gate --run` 的ESLint过、随后因其它项目32条depcruise错误exit1；未跑到全库Vitest，不能称全库绿。旧记录的6条TS错误本次未重现。
- 审计限制：library目录没有可用的S5前完整版本快照；“未改世界规则”为本轮施工范围记录，独立复查应以S4映射/已存截图/真实行为重新核证，不把Git差异缺失当成无差异证明。
- 最终指纹 `ca2c25d386490316`：S3机器门10:04、S4机器门10:09均exit0，S2 CONCERNS/S3 PASS/S4 PASS由异人重核落账。S5机器门10:19 exit0，但明确“纯数据卡带免审计；无标准照基准未比对”；本轮14轮实测审计和22图不能伪称golden-shot通过，未自行bless基准。时间均UTC。

## 迭代记录

1. 对照原型，将纸面、深青完成卡、物名标题、字体与按钮反馈接入既有闭集数据；未动世界玩法。
2. 初次审计发现 Modal 意图覆盖 HUD 被计重叠，仅 Modal 标注 allowOverlap；亮主题抓到5处文字硬失败、后续1处AA告警，修为主题语义色/固定材质配对深字后14轮归零。
3. flyIn/pop 不覆盖 reduce 的旧预设改用已有 transformFrom：普通反馈220ms、证物240ms、印章380ms、完成600ms。真浏览器测0.24s→0s，不向共享层加代码。
4. 重玩、重截22图；2条差异明确留在 S6，不伪造素材/框皮已定稿。
5. 非施工复查发现本轮把继续/收录/重开按钮缩小、证物槽缩窄，违反S5不改布局；返修恢复继续按钮210×58及原锚点、收录225×58、重开220×62、影像710宽、纸面padding8/gap14。再次真实旅程exit0；新增稳定态包围盒断言，证物300ms后transform归零。原即刻截图捕捉了入场位移，现用稳定态重截，不以过渡帧误判布局。返修版深亮14轮由独立复查者复跑，详见独立复查单，不冒充施工者重复执行。

## 玩家视角八问

1. 首要信息是右上必需线索与目标；可在0/2、1/2、2/2之间辨认，证物名字独立大标题。
2. 悬停/按下有名称与轮廓反馈；调查有档案条/证物卡，收录有印章，不只靠数字变化。
3. 完成与取消用不同文案/屏，未把取消叫失败。
4. 必需与可选明确；可选不增加两项必需进度，世界测试继续约束。
5. 当前阶段由现场/证物/已归档/完成标题表达，没有虚构倒计时。
6. 各出口是有动词的文字按钮；世界物件初始灰盒识别不足仍是S6素材欠项。
7. 键盘Enter/Escape、鼠标、触控均真操作；终局唯一出口已点并重进调查。
8. 本次进度与当前证物有归属；重开清零，收录回看不重复，未残留上一局状态。

## 好玩三问

- 再玩意愿：调查链已可读，但固定两条线索与灰盒仍限制氛围；不能据UI合格宣称最终体验完成。
- 关键反馈：纸面特写、红褐收录与深青完成层级区别明显；真实PNG透明洞须S6再实拍。
- 困惑/干等：关闭和重开都可达；无新加规则等待。完整素材/框皮和最终演出精确1:1仍未交付。
# S6 后的新鲜度注记 · 2026-10-13

下文为 S5 历史记录，保留当时灰盒/证物占位说明。S6 已接正式八图及同源mask，UI图片经 `resolveCartSkins` 消费并重新跑七态深亮14轮审计，全零重叠/对比失败；本轮证据见 [S6-alignment.md](S6-alignment.md)。原第9条真实素材待办已由本轮接线覆盖；第10条框皮及原型证物裁切差异仍待Owner视觉裁决，不宣称全部1:1。本注不代替流程CLI机器/异人复查刷新。

