# DEMON-CASTLE-UI-RUNTIME-01｜三个入口图标合同局部独立复查

2026-10-16；施工：BDM程序；独立复查：`review_ui_prototype`。**局部 verdict：PASS，仅三个可选图标槽与缺图合同；不是整单、S5、原型1:1或可访问按钮通过。**

## 范围与依据

范围：`src/authoring/life-host-descriptor-core.ts`、`life-host-descriptor.test.ts`，`src/engine/host/life-hud-overlay.ts`、`life-ui-skin.fixture.ts`、`life-ui-skin.test.ts`、`life-game-host.test.ts`；另纳入本轮 `life-host.test.ts:128` 缺 panel 纹理测试调整。只新增本证据，不修改实现、测试、资产、pipeline或Owner gate；共享树并发改动不归入本局部结论。

本会话已完整阅读 AGENTS、onboarding、data-driven-manifesto、生产线索引、game-production、game-requests、game-flow-questions、review-gates、testing、self-check、ui-playbook、ui、assets、art-pipeline；本轮重新读取正式工单、当前自证与 simlife-engine 路线图相关里程碑。判断接受既有闭集能力扩写，无新增解释器或素材批准。

## 独立复跑与撤修

独立执行：

```powershell
npx vitest run src/authoring/life-host-descriptor.test.ts src/engine/host/life-ui-skin.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-host.test.ts
```

第一次 **4 files / 119 tests，exit0**（55+10+23+31）。输入面在并发施工后冻结，撤去下述测试进程变换再执行同一命令：**4 files / 122 tests，exit0**（55+10+26+31）。新增3项来自另批输入接缝，不把其数量混写成本图标改动。恢复轮输出的4条 `[Life keyboard] decision:native-ui` 是主动路由追踪，非WARN；两轮均无stderr告警。

撤修通过 `vitest/node.startVitest` 第四参数注入 `enforce:'pre'` 插件，仅变换 `life-hud-overlay.ts` 的内存源码；先断言唯一锚点 `const icon = iconKey ? resolve(iconKey) : undefined;` 恰好出现1次，再替为 `const icon = undefined;`。未写共享源码或临时实现副本。跑 `life-ui-skin.test.ts` 得 **exit1，4 failed / 6 passed**：七槽同resolver的调用断言失败，以及quest/inventory/profile三个 `binds … entry art …` 的实际icon断言均失败。日志确认 `unique anchor hit` 和 `transforms=1`。退出测试进程即撤去变换，随后上述122项恢复全绿。

复核终态实现/测试SHA-256：

| 文件 | SHA-256 |
|---|---|
| descriptor-core | `a097e5d7f1e809ef9050490bca9d05495c9fd9fd4242a55511a5e4165a212164` |
| descriptor.test | `997a12522c31e906e7d11e1e005a256a2ebb21903f83185e19744a0e059a84fa` |
| hud-overlay | `233e171359419af5c196dfcc59266ed4297b192e169deb44cdbbe8bb0d3e7934` |
| skin.fixture | `c52689b41e13219bf2d7bd11d80b0ff7a0d0b5477487fd9ded2d09242284c410` |
| skin.test | `733db723b9bd75c6d74667a534f7e51605e244ceb5506f03d93f353730177ea5` |
| game-host.test | `1fb8aebff97f655311f143b2714a1533a7a01d65fb941c9926f2e895c0060513` |
| host.test | `24547b5bbc385e74e8cbdc0b656b37499e5c951b916b670a016048c4d8312bbb` |

## 合同核证

- 三槽 `questIcon/inventoryIcon/profileIcon` 为可选的同游戏 `art:<artSlug>:ui:<lowercase-kebab>`；逐槽验证合法、空串/null/数字/URL/data URL/相对路径/跨游戏key/带斜杠key拒收，且三槽均不得配置slice。旧无uiSkin descriptor没有注入默认值，canonical hash保持原合同。
- 入口通过同一resolver填写原生 `Button.icon`，保留原action、可见label和独立键徽；缺某入口纹理时不填icon，保留真实中文label。不是把背景图覆盖到隐藏文字的伪图标按钮。
- 真Host的texture/missing/atlas三个用例独立通过：只有已加载texture输出图片；未加载及atlas不输出fixture URL；三侧栏可开关，World snapshot与persistent hash不变。UI皮选择/替换/移除仍可恢复同一本地测试存档，未向存档写入皮肤id。
- `life-host.test.ts:128` 的测试修改成立。overlay有两个不同前提：全部框皮都不可用时立即返回**完全相同legacy树/HTML**（skin.test的三类参数化测试仍守）；部分框皮就绪而panel缺图时overlay已启用，三侧栏须保留不透明paper与内容，只移除skin/slice/缺失URL。新增断言核了paper `#f6e7c8`、无skin/slice、无panel URL、validate零issue；并非仅删掉失败断言。不能把部分缺图推导为整棵侧栏消失。

## 明确不覆盖

本轮正式入口仅使用Button.icon+可见label过渡。PUI icon-only合同尚未交付，图标轮廓、只有图标的原生名称、最终1:1及整单验收均不在本PASS内。旧24项键盘红在本次复查期间由另一批获授权输入施工处理，其当前实证另记 `DEMON-CASTLE-UI-RUNTIME-01-keyboard-independent.md`，不以图标合同测试冒称键盘已验收。

右上两个权威属性为魔王威仪resource、工匠盟约relationship。本轮不消费两张专属属性图（仍缺）；已批准金币/月晶/月叶三张resource图明确保留不消费，不冒绑两属性、不造第三资源、不改账本或素材批准。素材审批与正式物化来自另外证据，本局部不重批或伪造来源/许可。

未发现本局部须打回的缺陷。路线图/pipeline/Owner gate均未修改；整单保持其真实未完成状态。
