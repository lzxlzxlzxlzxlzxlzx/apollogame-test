# SIMLIFE-UI-SKIN-PACK-01｜施工自检（2026-10-15）

施工：BDM程序。状态：施工及定向自检完成，待非施工人独立复查。

## 合同与范围

`uiSkin` 可选且严格闭字段，仅保留 trackedQuestFrame、worldStatusRibbon、panelFrame、hudChrome。key 的 game 段精确等于 artSlug；拒绝 URL、路径、Data URL、空 key、atlas 槽、额外字段及越界/非整数切片。slice 只能引用已声明的对应 slot。

Host 只从 AssetManager 已加载的 texture 取得 URL，使用一个 resolver 交给现有 LayoutNode Panel。三个 Drawer 内部均有真实 panelFrame Panel；当前 DrawerProps 没有 skin 字段，采用 Drawer + Panel 组合已经策划确认。所有文字和数值仍读取当前 ViewModel。

省略 uiSkin 时不加默认字段；解析结果与 canonical hash 保持 legacy 数据。缺图/未加载/错误资产种类回退到原树；三类面板的树与 HTML 有逐字相等测试。Host 向现有保存适配器交接 descriptor 前剔除 render-only uiSkin，换皮/替换/移除皮肤均能恢复同一旧存档，存储 schema、snapshot、hash 与 label 不变。

本次没有修改 src/ui/**、tools/**、真实 art/index、候选素材、游戏 gameplay JSON 或正式 materialize 文件。测试的纹理仅为隔离内存夹具。工作树已有正式 descriptor 的 uiSkin 绑定由其他工作维护，本单只作零写入预检。

## 已执行验证

| 命令/检查 | 实测结果 |
|---|---|
| `npm.cmd exec vitest run -- src/authoring/life-host-descriptor.test.ts src/engine/host/life-ui-skin.test.ts src/engine/host/life-host.test.ts src/engine/host/life-game-host.test.ts src/engine/host/life-save.test.ts` | 5 files / 119 tests PASS |
| `npm.cmd exec vitest run -- src/ui/components` | 76 files / 573 tests PASS |
| `npx.cmd tsc --noEmit --project scripts/tsconfig.life-ui-skin.json` | exit 0；继承原 tsconfig 严格选项，检查本单文件、审计及完整传递依赖 |
| `npx.cmd tsc --noEmit` | 最终复跑 exit 0 |
| 本单 production/test/audit 文件定向 ESLint | exit 0 |
| `git diff --check`（本单已跟踪代码文件） | exit 0；只有 CRLF 提示 |

完整 `npx tsc --noEmit` 早期被共享工作树在途的 GAL 模块错误阻断，本单路径零命中；其他施工更新后，本回合最终复跑已为 exit 0。没有修改这些其他模块来取得绿灯。

`scoped-gate --run` 已执行：缺省基线 origin/claude/mainbranch 不存在，进入共享树 FULL，在 depcruise 失败。最终复跑 depcruise 为既有 33 条跨层依赖；本轮新增审计入口已放到 scripts/audits，未留下新依赖违规。全库 gate 没有通过，本单没有提交或推送。

## 深浅 UI 审计

```powershell
node tools/ui-audit.mjs scripts/audits/life-ui-skin-dark.audit.ts --skin-measure life-host-tracked-quest:8:4,life-host-inventory-frame:12:6,life-host-quest-frame:12:6,life-host-profile-frame:12:6
node tools/ui-audit.mjs scripts/audits/life-ui-skin-light.audit.ts --skin-measure life-host-tracked-quest:8:4,life-host-inventory-frame:12:6,life-host-quest-frame:12:6,life-host-profile-frame:12:6
```

两条命令 exit 0，1060×760：重叠 0、硬对比 0、border-image 阻断 0，四个真实九宫格节点全部通过 computed source/display border 实测。house 主题两套均命中，华丽件深色 12 / 浅色 19。审计夹具调用实际 buildLifeStandardUi，覆盖追踪任务、Calendar/Scene、placeholder 资源、I/J/C 与全部三类面板框皮；审计时将真实 Drawer 的内容框摆在普通流中，真实互斥 Drawer 的点击/关闭另由 Host DOM 测试验证。

告警已读取：Onyx 有 10 处现有 sub/quiet 次级文字 ratio=4.24；starter 最终审计无对比告警。没有硬失败；施工中曾误改的资源 pill 样式与固定 680px ribbon 尺寸已撤掉，恢复本单前默认资源的图标/标题/Badge、容器结构与动态文案，只通过可选 skin 属性加皮。这些 Onyx 告警交独立复查裁定，不宣称 AA 全绿。皮肤为内存生成的无文字测试 SVG，不能代替真实素材美学验收。

审计访问本地 file:// 临时构建文件；无测试服务、无 5173 占用。隔离无头 Edge 浏览器均由工具 finally 关闭，临时构建目录自动清理。沙箱内首次浏览器启动失败后通过已授权的沙箱外短时探针完成审计。

## 零写入物化预检

`npm.cmd run life-materialize -- docs/design/game-demon-castle/bundle.candidate.json --host docs/design/game-demon-castle/life-host.candidate.json --entry docs/design/game-demon-castle/life-launcher.candidate.json --plan-update --workspace-root C:\Users\24652\Desktop\projects\games\ApolloGame-complete\ApolloGame-claude-mainbranch`

exit 0；writesPerformed=false、conflicts=[]，四个 canonical 文件的 filesHash/currentFilesHash 相等：`sha256:0baf1bfcb4096113b12c6b65f1117172fe389bc39e21f7677d5eda905040e5af`。本单未执行 promote/update。

## 带锚点撤修验红

`scripts/life-ui-skin.sabotage.config.ts` 只在独立 Vitest 进程的 transform 中移除修复，不改共享磁盘源码；每次必须打印 anchor hit exactly once，缺锚或多锚立即抛错。

1. `LIFE_UI_SKIN_SABOTAGE=foreign-key`：将 `match[1] !== raw.artSlug` 变为 false；descriptor 测试精确 3 红（两个跨游戏 key 用例和同游戏正反总合同），退出码 1。
2. `LIFE_UI_SKIN_SABOTAGE=panel-frame`：将 `if (!frame) return node;` 变为无条件 return node；三个真实 Drawer 的 LayoutNode 测试与 loaded-texture DOM 用例精确 4 红，退出码 1。
3. 不传 sabotage config 的正常回归重新全绿。上述两种探针不留下任何磁盘破坏态。

## 证据边界

本单完成的是共享合同、真实消费接缝与回退验证；真实素材登记/绑定和 Owner Playtest 仍属于各自工单/人门。独立复查由策划执行，施工人未填写 verdict 或路线图 done。
