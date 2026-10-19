# 修订02正式Host｜日历中文显示缺口裁决

施工主体：BDM程序；2026-10-16。状态：**Owner已选A，严格实现/受控物化/日历及旧档兼容独立局部PASS**。本程序会话直接回答“A：通用显示名配置（推荐）”，明确允许通用只读名称映射及受控更新Host JSON，不改World规则/存档格式/persistent hash。下文保留裁决前实查，不把其旧反证当作新合同仍未交付。所属仍为RUNTIME-01的新视觉批次，不代表整单通过。

## 已核对的目标与范围

Owner已对[修订02原型](../prototype-approval.md)直接定稿，SHA256为`4c39e9f04dab441945a277bea000ab3db71fd2870996442a1177a4a7d28ee415`。策划随后要求独立原型PASS后立即接正式Host，同时保持PUI、正式游戏JSON、World/save不变。此处仅记录严格1:1中实查发现的authoring缺口，不以原型批准推定已批准新数据合同。

## 实查与反证

已读UI手册/控件catalog/types/render/validate、pick-list、Life authoring约定与相关Host/presenter；实跑`ui-find --type Button --json`及registry `dump-capability-catalog --only t3-life-world`、`--only t2-life-calendar`。共享树当前存在其他人在途改动，未为更新资料进行会改共享树的pull/rebase；直接检查当前PUI最新工作文件和源合同。

- `LifeSeason`原文：`{ id: string; lengthDays: number }`；`calendar.slots`为`string[]`。现有严格世界数据为`eclipse`、`dawn/night`，没有对应显示名称。
- `life-presenter.ts`原文：`date: calendar ? ...humanizeLifeId(calendar.seasonId)... : '—'`；`slot: calendar?.slotId ? humanizeLifeId(calendar.slotId) : '—'`。当前结果含Eclipse/Dawn，不能从ID确定“月相季”的作者意图。
- Host `hud.labels`是date/time-slot等**字段标题**闭集，`date=月相`不是逐season/slot的本地化映射。不能偷换标题语义，把当前仅一季当作永远一季。
- 只读[复现探针](../self-check/DEMON-CASTLE-UI-RUNTIME-02-preflight.probe.ts)实际退出0：在内存副本添加season.titleKey，被拒`$.calendar.seasons[0].titleKey / unknown`；添加Host.hud.calendarLabels，被拒`/hud/calendarLabels / unknown_field`。没有写入任何游戏/World/save文件。
- 去圆盘**不是缺口**：现有`Button.kind:quiet + iconOnly + skin:'' + borderWidth:0 + layout.radius:0`已经validate零issue并保留原生label/缺图回退；不能以此无谓扩PUI。精确hover/pressed运动仍须对照原型核验，不能把现有3D倾斜冒称同一演出。

## A/B（推荐A）

| 路线 | 代价 | 影响面 | 通用性 | 选错代价 |
|---|---|---|---|---|
| A 补共享Host只读日历显示合同 | 增严格可选season/slot ID→显示名数据，校验、投影、回退、测试；准许候选及正式life-host.json经plan/严格受控物化更新 | 仅authoring Host/presenter/显示及该Host配置；不改稳定ID、日历规则、World/save/hash，不碰PUI/资产 | 所有Life自定义季节与时段可复用；旧无配置保持原样 | 校验或回退做错会显示错名，须未知ID/跨季/日期推进/旧包/零hash污染测试与异人复查 |
| B 申请魔王城专用展示代码例外 | 增仅该游戏的eclipse/dawn/night翻译分支，记录例外债并另设测试 | 仍须明确放开游戏专有代码边界；不改正式JSON，但共享Host出现内容特判或专用包装 | 不通用，其他游戏继续缺字段 | 换季/改ID易失效，后续每游戏复制，违背当前纯数据方向；最终仍需迁移A |

建议A：把作者名称留在数据中，而非把内容写死进解释器。Owner仅批准原型不等于已裁决A；策划不能代裁。等待期间可处理独立复查与不依赖名称的布局，不能先写A再追认。此项不是系统权限限制或拒绝本地物化，是新数据合同与“本批不改正式JSON”范围需要明确。

## A获准后的最低验收

准确中文单行使用权威季节/时段ID及真实日数；不得显示固定演示第5天。未知映射有明确回退，不伪造译名；现有无配置Life保持字节/行为兼容。严格Host字段/ID/纯文本/长度校验，零World/save/hash漂移。物化须先plan并核对精确hash/文件，随后重读canonical文件与compiler/discovery；真实Host六视口、鼠标/键盘/断图回退/锚点撤修和非施工者复查，未通过不签整单。

## 交付与边界

实际三名称由Host数据配置：`eclipse→月相季`、`dawn→黎明`、`night→夜晚`。严格schema与真实日历ID交叉校验同时用于discovery、物化和Host mount前边界；投影只读取live ID/day，不改世界季节ID或规则。正式更新仅Host内容变化，四文件group为`sha256:751d4f3f0bf2d38d29fd94b58d77fe747a4f747a6747d41d830b65405ebedca0`，零写入plan及落盘canonical/compiler/discovery均复验。

旧档指纹首轮漏验已真实复现并返修：只在公共adapter中央排除新增render-only字段，旧无字段fingerprint、旧uiSkin语义、存档格式与坏档拒收不变。非施工者最终4文件76项绿、唯一锚点撤修3红恢复76绿，详见[独立局部复查](../review/DEMON-CASTLE-UI-RUNTIME-02-calendar-independent.md)；未测试或修改Owner真实存档。其余HUD/视觉未决项见[当前批差异单](../self-check/DEMON-CASTLE-UI-RUNTIME-02-alignment.md)。
