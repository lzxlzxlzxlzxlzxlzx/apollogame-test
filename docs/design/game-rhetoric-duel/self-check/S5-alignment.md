# game-rhetoric-duel｜W5 demo 视觉对齐单

## W5-0 冻结基准

- 引擎基线：`a7f28048f5f3921ce18e28230557cd0e3b12dfa7`
- 对齐局：`gatekeeper-shi`，seed `7`
- ApolloGame 与 demo 内容安全区：`1440 × 900`
- 固定捕获阶段：`ready`、`card-flight`、`impact`、`enemy-intent`、`result`
- 规则基准：W4 snapshot/hash；W5 只改 render-only 资产与投影。

### demo 文件指纹（SHA-256）

| 文件 | SHA-256 |
|---|---|
| `src/free-roam/ui/CardConflictView.tsx` | `1664043828d562c34cd06a542e4e9e6809e17f4c86e52de64e6ef726fc8615a1` |
| `src/free-roam/ui/card-conflict.css` | `85fbbaa3de92b34e8d6f8ac019e128f58cf38b835dc2ffaa4c49ecf52fc9d622` |
| `src/free-roam/ui/useConflictPresentation.ts` | `8d32fd231566f47e989a5b547a95a999f537a006046de62b762282e1d73144a0` |
| `public/assets/fanren_qiyuan/room-outer.png` | `ca829e108b62ac89c9f0fd8ba68eaec318061c11baf331a3ef09ea743eaadc8e` |
| `public/assets/fanren_qiyuan/npc-sun-laizi.png` | `e7aee7d5a7ce9185c0077c32c161f03f6033d29f1c2807525649cfae6774a660` |
| `cards/argue.svg` | `4eecc9b2630d6fea303178e6133fd833937a965b1be902c647989b649597b60e` |
| `cards/calm.svg` | `658738d114bdf21f0cbd5366684fd7419cef23984c8dc73b2bc6176aadccf5f1` |
| `cards/dex.svg` | `a12b60c74daae2ab9ec4601dabe62e36695ef21ff6dee07a5dcc6a9e3583af4c` |
| `cards/feint.svg` | `1bc8a4175291aaa6310121afa77f3fba1b5d54884ac52a06053d352459452c1a` |
| `cards/grit.svg` | `2847ba286b089af19e71a01fafaa872910e301c9c5cc1337588b8f6c9ca1323d` |
| `cards/insight.svg` | `02fea8b8e8e5be77c3a0cac1768dd83f9b69d61f8ee7ac0cde733dc8136a5477` |
| `cards/juqi.svg` | `7037584df50e1ea8a45754a9b08e7d6b7e321569a53a53735d83acde36f737f8` |
| `cards/observe.svg` | `acc0df1bd440eb7e1a56278dc1718979c8dedc628f00301fda5f51b76ed13093` |
| `cards/press.svg` | `a5b2132a00b92d506bb869da9bc7d68c99882a5fcbdb3bd32d274e560227523e` |
| `cards/steady.svg` | `e9dfc962a5c9591cff11b2190301625c16000ff16f495d44a79649ca4bc1c3da` |
| `cards/strong.svg` | `7dd78881f7b0663017021e99bb6593185b4637f9df4e42372da2679d461713d4` |
| `cards/trust.svg` | `54ec1849985cdaf6a2a7070ca4d515be1d1166e8abc3ea2895071d210cdd32a9` |

## W5 对齐项目

| # | 可见承诺 | 结论 | 证据 / 裁决去向 |
|---:|---|---|---|
| 1 | 同 seed 固定局可稳定捕获五个关键阶段 | ✅ | seed 7 的 D01–D14 已重跑；`D03-opening-ready.png`、`D05-card-flight.png`、`D06-progress-impact.png`、`D08-enemy-intent.png`、`D11-victory.png`/`D12-loss.png` 覆盖 ready、飞牌、冲击、敌方意图和双终局。 |
| 2 | 正式资产只走 index → skinMap/AssetManager → 槽位 | ✅ | `art.test.ts` 校验 17 个命名空间 key；运行时由 `createArtAssets/loadGameArtInto/loadGameArtOverrides` 装载，单槽失败测试只回退该槽。index 与 ledger 各 17 行、零孤儿。 |
| 3 | 桌面五区构图、轻浮层与 demo 信息层级一致 | ✅ | `D03-opening-ready.png` 与 `demo-ready.png` 同为 1440×900；`compare-ready-side-by-side.png`、`compare-ready-overlay-50.png`、`compare-ready-difference.png` 留存并排、50% 叠图及差分。左上交锋、右上敌情、中央人物、左下资源、底部手牌/命令五区成立。 |
| 4 | 十张米黄纸牌在单一卡面边界内字段齐全 | ✅ | `ui.test.ts` 逐张断言费用、名称、来源“言弹”、中文效果、文案、图 key、快捷键与禁用原因；`D03-opening-ready.png`、`D04-card-hover.png` 显示纸面双框与完整字段，无英文资源 ID。 |
| 5 | 真立绘与几何后备互斥，真背景不改变规则 | ✅ | `rhetoricOpponentVisibility` 测试断言互斥；`D03-opening-ready.png` 为真图路径，`D13-fallback.png` 为全资源请求失败后的完整几何回退；装载前后 snapshot/hash 相等测试通过。 |
| 6 | 飞牌与手牌同构，终局保留场景和人物 | ✅ | `D05-card-flight.png` 的飞牌复用同一 skin key，并显示费用、名称与效果；`D11-victory.png`、`D12-loss.png` 保留背景和人物，左下细金线结果区只有主出口。 |
| 7 | 竖屏重排 | ⚠ owner 已裁决去向 | owner 明确本次只施工 W5-0 至 W5-5、W5-7，排除 W5-6；响应式 LayoutNode variant/live-region 共享 PUI 接缝留在独立工单，当前固定舞台不宣称响应式通过。 |

## 自证迭代记录

- 第 1 轮：固定 `gatekeeper-shi` / seed 7，建立 ApolloGame 与 demo 同视口基线；发现暗紫占位卡、几何人物和厚重框层与 demo 不符，桌面项剩 5 条 `❌`。
- 第 2 轮：接通命名空间皮肤链，asset-manager 导入第一批旧巷/石七/十张卡图/牌背；真渲染发现飞牌仍只有文字投影，桌面项剩 1 条 `❌`。
- 第 3 轮：asset-manager 完成罗掌柜/姜教习和两张场景；飞牌改为同图标、费用、名称、效果，补齐真图与全失败回退、胜负终局、reduced-motion 证据；桌面项 `❌` 归零。

## W5-7 门禁记录

> 以下退出码由最终工作树直接复跑；独立复查结果另见 `review/W5-demo-parity.md`。

| 门禁 | 退出码 | stderr / 告警裁决 |
|---|---:|---|
| game-rhetoric-duel 定向测试 | 0 | 7 文件、53 项通过；无测试告警。 |
| LayoutNode validate / 组件测试 | 0 | 59 文件、466 项通过；本游戏树的 validate/id 唯一性也在 `ui.test.ts` 通过。 |
| TypeScript `--noEmit` | 0 | 无输出、无诊断。 |
| 生产构建 | 0 | 685 modules transformed；仅有仓库既存的 >500 kB chunk 建议，不涉及本游戏正确性或资产回退。 |
| UI audit（ready + busy） | 0 / 0 | 两态均为 overlap 0、contrast hard/warn 0、border-image 0。审计器未从展开对象识别 house 主题并在 busy 态提示华丽件偏少；实查 `theme.ts` 明确 `...apolloBrocade` 且复用 `STARTER_THEME.buttonSkins`，D01–D14 真图/卡面/演出已目击，判为启发式非阻断提示。 |
| asset index / ledger strict | 0 / 0 | art guard：black households/dead accounts/missing provenance 均 0；ledger：17/17 可消费、orphans 0。 |
| game-skill-audit | 0 | 未覆盖红旗 0、缺失防线 0、ratchet PASS。 |
| scoped-gate | 待 owner 回传 | `scoped-gate` 会读取 Git；受 Owner 本机操作禁令约束，必须由 owner 亲自运行并回传真实退出码。 |
| align-count S5 | 0 | `✅ 6 / ⚠ 1 / ❌ 0`；唯一 ⚠ 已写明 owner 裁决去向。 |
