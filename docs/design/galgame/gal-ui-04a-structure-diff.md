# GAL-UI-04A · 设置页局部结构对拍与阶段差异

2026-10-10，在同一台短生命周期、隔离配置的无头 Edge 上，以 1440×900 分别打开 owner 定稿的 V2 `.dc.html` 和 GAL LayoutNode 静态宿主。验收脚本为 `src/services/gal-ui/verify-gal-04a-live.mjs`；浏览器已经关闭，临时构建已清理。本单只签四页设置的部分 S4 信息结构和六确认真实接线，不签完整 V2 的 S4 结构 1:1、S5/S6 视觉演出或桌面退出。

| 目标 | 原型 | 04A 实际 | 判定 |
| --- | --- | --- | --- |
| 共用系统框 | x18 y61，1404×824 | x18 y61，1404×824 | 四轴吻合 |
| 标题区 | x84 y109，1272×61 | x84 y109，1272×52 | 锚点/宽度吻合；高度少 9px |
| 四页签区 | x84 y185，1272×44 | x84 y185，1272×31 | 锚点/宽度吻合；高度少 13px |
| 设置卡网格 | x84 y244，1272×320（文本/声音） | 相同 | 四轴吻合 |
| 两列卡 | x84 / x729，宽各 627；文本/声音高 320，画面/确认高 256 | 四页均相同 | 四轴吻合 |
| 底栏 | x84 y782，1272×51 | x84 y782，1272×31 | 锚点/宽度吻合；高度少 20px |

对拍截图：文本 [原型](review/gal-ui-04a-prototype-text.png) / [实际](review/gal-ui-04a-text.png)，声音 [原型](review/gal-ui-04a-prototype-audio.png) / [实际](review/gal-ui-04a-audio.png)，画面 [原型](review/gal-ui-04a-prototype-display.png) / [实际](review/gal-ui-04a-display.png)，确认 [原型](review/gal-ui-04a-prototype-confirm.png) / [实际](review/gal-ui-04a-confirm.png)。[页签 hover](review/gal-ui-04a-tab-hover.png)、[pressed](review/gal-ui-04a-tab-pressed.png)、[保存失败回滚](review/gal-ui-04a-failure.png) 另有关键帧。

04A 的有意差异：原型的花卉金框、卡面纹样、素材、发光、字体和按钮皮没有在本票复制或补临时自由 DOM/CSS；这属于 S5/S6 与资产接线。未接入真实消费者的文本播放、声音试听、显示与输入设置只读/禁用并标“待接入”，全局恢复默认可见但禁用；不能把这些状态说成已实现功能。原型里顶端场景导航位于框外，当前 LayoutNode 共用场景导航在框内右上；页签与底栏高度亦尚不 1:1，均为未裁的结构偏差，故本票明确不签完整 S4 结构 1:1。

真实链验收：四页切换与来源返回、六个具名 Toggle 的 Profile V2 独立持久化、失败时 native checked 回到旧值、设置期间故事滚轮不透传；空位保存、覆盖、可读槽读取、有进度新游戏、返回标题五类已有宿主操作分别按对应开关改变弹窗而不改变操作合法性。`exitGame` 只验证持久化与纯政策，浏览器无退出端口，实际退出控件禁用。隔离浏览器脚本退出 0。

UI 主题审计：四页 × 深/亮八次均退出 0，`validateLayoutNode` 四页零 issue。亮色 36px 标题对比 3.57:1，是大文本达标但审计器按普通正文 4.5:1 报的非阻断警告；深色 house/华丽件数量警告是阶段性的 S5/S6 视觉债，不是本票的结构或交互完成证据。亮色完整主页/剧情的旧低对比问题不在这八次设置页隔离审计覆盖内。全库 `tsc` 退出 1，诊断在非 GAL 的 game-card-reveal、game-dice、game-simlife、game-theft、launcher；不可声称整体门禁全绿。
