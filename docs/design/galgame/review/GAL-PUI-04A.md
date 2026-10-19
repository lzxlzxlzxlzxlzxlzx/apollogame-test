# GAL-PUI-04A · Toggle.disabled 独立复查导航

状态：独立复查 **PASS**（2026-10-10）。初次 CONCERNS 的深/亮主题浏览器审计证据已补齐并经复跑验证；历史与收敛过程保留于下文。

## 施工范围

- `src/ui/components/types.ts`：`ToggleProps.disabled?: boolean`。
- `src/ui/components/catalog.ts`：公开 schema/使用说明。
- `src/ui/components/render.ts`：禁用时保留 checked 外观，输出 native `disabled`、`aria-disabled="true"` 和 `tabindex="-1"`，且不输出 action 接线。
- `src/ui/components/server.ts`：防御性忽略 disabled input 的派发事件。
- `src/ui/components/toggle-disabled.test.ts`：四态、ActionSink、键盘/指针/触控事件与 schema 验证。
- `games/game-i/gallery.ts` 与 `game-i.test.ts`：`t-check` 活范例 `tg-sound-disabled`。
- `docs/playbooks/ui.md`：合同与活范例路标。

未修改 `src/services/gal-ui/**`、数据库、应用服务或 Git 状态。

## 施工者实测

```text
npx vitest run src/ui/components/toggle-disabled.test.ts src/ui/components/catalog-validate.test.ts games/game-i/game-i.test.ts
exit 0 — 3 files / 23 tests passed
```

Windows 沙箱对已安装 Vitest 的 `realpath` 返回 EPERM，提升权限后同一只读测试命令才得以实际运行；没有启动服务。

## 撤修锚点

临时把 `renderToggle` 的 action 参数由 `disabled ? '' : p.action ?? ''` 改成 `p.action ?? ''`，其余禁用属性不变：

```text
npx vitest run src/ui/components/toggle-disabled.test.ts
exit 1 — 2/4 failed
```

两个失败都精确命中 `expect(html).not.toContain('data-action="confirm.toggle"')`，分别覆盖 `checked=false` 与 `checked=true`；恢复 action 隔离后，完整定向集恢复 23/23。未留下撤修代码或临时文件。

## 复查最小步骤

1. 独立检查类型、catalog、render 和 dispatcher 是否只改变 Toggle。
2. 独立复跑上方 23 项定向集，读取全部警告。
3. 以独立副本完成同一锚点撤修验红并复原；确认禁用的 checked 两态仍可视、不能 Tab、零 ActionSink 派发，而缺省/false 仍恰发 `'true'/'false'`。
4. 确认 game-i 活范例和 UI 手册可定位该能力；仅对本 PUI 票给出 PASS/CONCERNS/FAIL，不推断 GAL 设置页或全库门禁状态。

## 独立复查（2026-10-10）

- 类型、catalog、渲染与 dispatcher 的合同一致：禁用 Toggle 保留 checked 两态视觉，原生输入带 `disabled`、`aria-disabled="true"`、`tabindex="-1"`，渲染层移除 `data-action`，dispatcher 对残留 disabled input 亦拒绝派发。
- 独立执行 `npx vitest run src/ui/components/toggle-disabled.test.ts src/ui/components/catalog-validate.test.ts games/game-i/game-i.test.ts`：退出码 `0`，3 files / 23 tests 通过，无测试告警。
- 独立撤修：仅把 `renderToggle` 的 action 参数改回 `p.action ?? ''`；`toggle-disabled.test.ts` 退出码 `1`，恰有 checked=false/true 两个断言失败，均命中意外的 `data-action="confirm.toggle"`。复原后同文件 4/4 通过。
- 复查临时创建了 game-i `tab-input` 的深/亮主题审计入口；`ui-audit` 可完成本地构建，但无法启动其配置的 Chromium（路径 `/opt/pw-browsers/chromium` 在本 Windows 主机不存在）。临时入口已删除，未启动应用服务。

### 初次判词

功能和锚点均通过；初次复查时深/亮主题 UI 审计没有可复现的浏览器 PASS 证据，故暂列为 **CONCERNS**。该限制已在下方收敛。

## CONCERNS 收敛证据（待复查者复跑）

新增隔离审计入口：

- `tools/audits/game-i-toggle-disabled-dark.audit.ts`
- `tools/audits/game-i-toggle-disabled-light.audit.ts`

它们只挂载 game-i 活范例同合同的两个 disabled Toggle（checked true/false），避免把整座画廊已有的亮色低对比欠账误归因本票。`renderToggle` 也已调整为只淡化轨道、保留 label 的可读性。

在本机不设 `UI_AUDIT_CHROMIUM` 的情况下运行：

```text
node tools/ui-audit.mjs tools/audits/game-i-toggle-disabled-dark.audit.ts --w 1060 --h 760
node tools/ui-audit.mjs tools/audits/game-i-toggle-disabled-light.audit.ts --w 1060 --h 760
```

两条均 exit 0：0 重叠、0 硬性低对比、0 border-image 前提缺失。各有一个非阻断的标题次级文字 AA 警告；禁用 Toggle 的 label 不在警告/失败项中。无头浏览器为短生命周期本机 Edge，审计结束已关闭；未启动服务。

为使 Windows 复查可直接复现，`tools/ui-audit.mjs` 现按顺序选择显式 `UI_AUDIT_CHROMIUM`、Playwright bundled、Linux CI Chromium 与本机 Edge 的实际存在路径。该变更不影响 UI 语义。请非施工复查者自行复跑这两条审计和既有 23 项定向集，再更新最终判词。

## 最终独立复查（2026-10-10）

结论：**PASS**，只覆盖通用 `Toggle.disabled` 能力。

- 深色与亮色隔离审计均独立复跑为 exit `0`：0 重叠、0 硬性低对比、0 border-image blocker。各一个标题的次级文字 AA 非阻断提示；两个 Toggle 标签未命中告警。
- 独立重跑 `toggle-disabled`、catalog 与 game-i 定向集：3 files / 23 tests 通过、exit `0`、无测试 WARN。
- 再次只撤 `disabled ? '' : p.action ?? ''` 的 action 隔离：4 项中恰有 checked=false/true 两项转红，均为禁用 input 意外出现 `data-action="confirm.toggle"`；复原后 4/4 通过。

因此初次 CONCERNS 已关闭。无应用服务、数据库或 Git/GitHub 操作；无头 Edge 为审计短生命周期进程，已关闭。
