# S6 正式 PNG 接线与自证 · 2026-10-13

本轮完成范围：正式卡带八张原型图片消费、七件 alpha 实形命中、证物/收录图同源接线；不是整个 S6 的视觉 1:1 终验或人门。原型与正式游戏均本轮真渲染。施工者不代签素材逐行复核，独立复查由主聊天另派。

## 2026-10-14 当前冻结导航

本轮已消费独立PASS的UI02，原型纸底眉题经Owner许可改深青；最新正式hash与21测试/42实形/三回看/取消键盘/真实busy证据见`S6-ui02-formal-freeze.md`。下表第12/13项仍红，不因纸框几何局部通过就称S6完成：UI03已裁A仍等独立PASS后消费，外金环/真实glyph/焦点描边/整体演出等差异集中报主聊天。历史hash、旧geometry和ratio保留在本单迭代，不代表当前版本。

## 对齐单

| # | GDD 承诺 | 结论 | 证据 / 说明 |
|---|---|---|---|
| 1 | 原型背景与七件真实 PNG 入正式现场 | ✅ | `shots/S6-00-prototype-idle.png` ↔ `shots/S6-01-idle.png`；8 Sprite 只持 key，本地 index 预载；没有新增自由运行时代码。 |
| 2 | 固定 1440×900、背景 cover、七物件 contain，位置不漂移 | ✅ | `s6-alpha.test.ts` 冻结八组 Transform、Shape、Sprite 宽高及 anchor/fit；三视口 1440×900、720×800、1920×1080 真手势。 |
| 3 | PNG 透明区域不点击、不显示该物件 hover | ✅ | `s6-browser-probe.mjs --live` 七物件×三视口透明反例 21 条；样本从最终 PNG 解码 alpha=0 的 17px 邻域独立选择，不使用引擎映射作预期。 |
| 4 | 不规则实体像素能调查对应物件 | ✅ | 同脚本七物件×三视口实心正例 21 条，alpha≥200 稳定邻域；线索检查对应 Image ID，普通物件打开档案条。另单测 contain/cover、缩放与镜像逐像素 oracle。 |
| 5 | hover/press 仍有同源可见反馈 | ✅ | `shots/S6-01c-cup-hover.png`、`S6-01d-cup-pressed.png`，真实 mouse move/down/up 与 data-pointer-feedback-state 断言。 |
| 6 | 普通反馈覆盖进入，不推走现场 | ✅ | `S6-02-flavor.png`；Canvas 前后矩形均 (0,0,1440,900)，继续按钮仍 (1151,817,210,58)。 |
| 7 | 证物与收录面板显示同一实物，不是文字占位 | ✅ | `S6-03-lock-reveal.png`、`S6-04-lock-collected.png`；6 个 Image 的 asset:key 与对应场景 Sprite key 一致，filled texture 严格断言，实际 naturalWidth>0。 |
| 8 | 收录后实物留在现场，不扣图、不染绿 | ✅ | 首次收录前后读取 Canvas 自身 RGBA buffer 逐字节相同；不把带进度 HUD 的整页截图误当背景像素。 |
| 9 | 完成和取消后都能重开继续调查 | ✅ | `S6-05-completed.png`→`S6-06-restarted.png`；`S6-07-exit-confirm.png`→`S6-08-cancelled.png`→`S6-09-post-cancel-playable.png`，真实点击终局出口、0/2与再开特写。 |
| 10 | 键盘/触控/reduced-motion 可玩 | ✅ | `S6-10-keyboard-reveal.png`、`S6-12-touch-flavor.png`、`S6-13-reduced-motion.png`；隔离触控上下文 DPR=2，Enter/Escape；证物动画0.24s→0s，档案条reduce=0s。 |
| 11 | LayoutNode 无重叠/糊字/透穿 | ✅ | `s6-reveal.audit.ts` 通过 resolveCartSkins+真实 index 消费资产；七态×深亮14轮均 exit0：重叠0、对比硬失败0、AA告警0、border-image问题0。 |
| 12 | 原型证物图片裁切逐像素一致 | ✅ | UI03/04最终正式：slot716×274、image702×260 cover/top、7px #7A6345棕框及原型坐标硬断言通过；真实素材同key。见 `S6-ui034-formal-freeze.md` 和最终测量JSON，不再沿用旧contain/1px差异。 |
| 13 | 原型框皮、字体与完整演出观感1:1 | ❌ 整体待复核 | 本批YaHei实glyph、透明印章900/5px边、30.4行高、外金环、真实Tab焦点及dialog整体240/600ms已落实且实测。仍不能把字段通过当整页像素通过；原生dialog焦点轮廓、HUD边缘与hover标签chrome需独立按当前截图核对，stable disabled不等于busy快照。集中导航 `S6-ui034-formal-freeze.md`；本批停在异人正式游戏复查门。 |

## 实跑结果与边界

- `node node_modules/vitest/vitest.mjs run games/game-clue-investigation`：exit0，3文件20测试（S3=4、S4=5、S6=11），读正式 manifest 而非候选。
- `/check-ui` 组件门 `node node_modules/vitest/vitest.mjs run src/ui/components`：exit0，70文件539测试 PASS；实际游戏树 validateLayoutNode 由本游戏S4测试断言零issue。
- 写盘前核对正式 manifest 与完整 `review/S6-before-manifest.json` 语义相等，严格候选 `manifest-check --art-index` 真装载 exit0、warnings=[] 后才写正式。仅新增 Sprite、hitMaskKey、白色不透明 Color 与证物 Image 数据；未改规则、信号和布局锚点。
- `node docs/design/game-clue-investigation/self-check/s6-browser-probe.mjs --live`：exit0，地址 `http://localhost:5173/?game=lib:game-clue-investigation`。正式库列表/manifest/本地 art 均走 Owner 已启动服务，不以 route fixture 替换正式 manifest；只给无关 provider 列表空夹具。42 透明/实心检查+完整旅程通过，console/pageerror=0；本轮原型6图、正式16图。
- 不带 `--live` 的较早局部5726旅程15透明反例+完整链 exit0；最终42条版本以5173真服务为准。不复用 Owner 浏览器配置，不启动整套系统；finally关闭临时浏览器。5720/5726清理后无监听，Owner5173不停止。
- 14轮审计：`VITE_GCI_AUDIT_STATE=idle/flavor/reveal/collected/completed/exit/cancelled`，`VITE_GCI_AUDIT_LIGHT='' / 1`，`node tools/ui-audit.mjs docs/design/game-clue-investigation/self-check/s6-reveal.audit.ts --w 1440 --h 900`。华丽件3–5处；house静态识别“否”是条件主题参数未被识别，正式数据明确apolloOnyx，非运行缺主题。
- 主聊天本轮实跑（非本施工子代理独立复跑）：tsc exit0；Vite build exit0、786模块、仅公共chunk>500kB提示；depcruise exit1剩32条其他Life/demon-castle在途面、0warning，本游戏5条非法相对依赖已清。不能宣称全库全绿。
- 资产专员建账8 filled、0 approved；来源许可已有Owner具体批准，但平台逐行审美终审仍由Owner本人完成，不代签。
- `game-skill-audit` exit0，RATCHET PASS、无未覆盖红旗；仍报“无美术台账”黄色：该旧审计只查public目录，实际卡带台账位于library。没有把该WARN冒充台账缺失已绿，资产专员以真实library行审计另证。

## 迭代

1. 对照原型真渲染与真实CSS，保留七物件 contain、背景cover、原锚点；正式加入八图与六证物复用图槽。
2. 单测由候选转为正式manifest，补冻结几何/fit与UI同key断言，adapter/S3显式传真实索引；20/20。
3. 首轮15透明反例与完整旅程通过，扩至七件42条并直连Owner5173；收录像素检查初用canvas元素截图（包含叠加HUD）误报，改读Canvas自身像素，成功证明场景保持。
4. 七态深亮14轮审计归零；原型裁切与旧框皮差异未伪装绿，仍等Owner明确视觉裁决。
5. Owner要求继续修复后实查：可表达的七枚Button改用原型矩形/圆角配色，保留geometry/action；正式5173旅程42正反例与完整链exit0、定向21/21。Modal/Image真实词表缺口集中GCI-S6-UI-02，不将能力差异降格为审美终审，故第12/13条现为红；由主聊天统一请求A/B。

当前按钮返修正式 manifest SHA256：`8a7306cb7439875b1a79b320aa66c7303b01534075a77caa0856bb19449f1a9d`。世界/资产目录未改。最新截图同 `S6-*`，已重截。

按钮返修后重新跑14轮深浅UI审计全部exit0、零重叠/对比问题；`align-count`此轮exit1（11绿、2红），原因是GCI-S6-UI-02真实共享能力缺口仍未裁决，不冒称完成。

## 玩家视角八问与节奏

1. 目标/必要线索0/2在顶部，现场占主体；PNG实物可见。
2. hover标签与轮廓、按下反馈和后续档案/特写确认操作。
3. 首收录印章、进度变1/2；找齐显示完成，不需自行推断。
4. 普通查看不涨进度，必要/可选标签与完成语义不同。
5. 特写、收录、完成、退出确认明确分屏；本游戏无倒计时。
6. 物名焦点标签、目标与按钮给出下一步；无隐藏像素猎杀要求。
7. 七件真像素、键盘、触控均能到达；已测两终局出口。
8. 图/标题对应当前选择物，收录状态与现场并存，不误当物件被取走。

好玩三问：探索七件物品的短局信息反馈明确，但固定单场景重玩主要用于验证而非重复挑战；关键确认可见；收录演出约430ms与完成等待属于定稿节奏，未新增空等。原型与正式特写裁切不同仍应让Owner决定，不能以“完整图更合理”自行批准视觉变更。
