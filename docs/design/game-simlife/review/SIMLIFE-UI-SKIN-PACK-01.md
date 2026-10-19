# SIMLIFE-UI-SKIN-PACK-01｜独立复查导航

施工：BDM程序。复查：模拟经营策划。状态：**通过（2026-10-15）**。

合同：[UI skin pack v1](../ui-skin-pack-v1.md)。自检与实测：[施工自检](../self-check/SIMLIFE-UI-SKIN-PACK-01.md)。

## 范围

- `src/authoring/life-host-descriptor-core.ts` 和 descriptor 测试：四个严格槽、artSlug 精确绑定、闭集切片、legacy canonical 兼容。
- `src/engine/host/life-hud.ts`：一个解析接缝，三处 HUD Panel 和三个 Drawer 内 Panel 实际消费。
- `src/engine/host/life-game-host.ts` 与测试：AssetManager loaded texture URL；切换抽屉、pointer 透传、旧存档跨换皮兼容。
- `src/engine/host/life-ui-skin.{test,fixture}.ts`、`scripts/audits/life-ui-skin*.ts`、`scripts/{tsconfig.life-ui-skin.json,life-ui-skin.sabotage.config.ts}`：夹具与验证入口。

## 独立核证

1. 按自检命令重跑 119 项定向测试及严格定向 tsc；独立检查全库 tsc 的当前实况，不能采信施工人自陈。最终全库 tsc 已为 0；既有 33 条 depcruise 违规仍在，未伪称整个 scoped-gate 全绿。
2. 独立跑深浅 UI 审计（带四个 skin-measure），确认资源仍为 placeholder、动态标签仍可更新、三类面板都有真实框皮。复核深色 10 处非硬对比告警，浅色最终为 0。
3. 两种 sabotage 均须输出唯一锚点命中并分别精确转红；正常 config 恢复绿。PowerShell 中只给该命令进程设置 LIFE_UI_SKIN_SABOTAGE，不修改共享文件。
4. 实查无 uiSkin/缺图时树与 HTML 相等；加载 atlas 或未加载 texture 不获得皮肤。真实按钮仍可开启/关闭三类 Drawer。
5. 复验零写入 materializer plan。检查施工文件范围未侵入 UI 基座、真实 AssetIndex、正式游戏 JSON 或审批。
6. 以 `life-ui-skin` 的 save-compatibility 测试确认 skin 选择、替换和移除都可恢复同一个旧存档；本单只在 Host 向存档适配器交接时去掉 uiSkin，不改保存系统。

### 撤修命令

```powershell
$env:LIFE_UI_SKIN_SABOTAGE='foreign-key'
npm.cmd exec vitest run -- --config scripts/life-ui-skin.sabotage.config.ts src/authoring/life-host-descriptor.test.ts
$env:LIFE_UI_SKIN_SABOTAGE='panel-frame'
npm.cmd exec vitest run -- --config scripts/life-ui-skin.sabotage.config.ts src/engine/host/life-ui-skin.test.ts src/engine/host/life-game-host.test.ts
Remove-Item Env:LIFE_UI_SKIN_SABOTAGE
```

预期两次退出码均为 1；此为命中真实守卫的红证据，不是机器门 PASS。使用正常配置重新跑回归后才可出具独立结论。

## 独立复查结论

**Verdict：PASS。** 本次复查未修改被审实现或测试，也没有把候选素材、正式游戏或存档写入测试环境。

- 独立重跑 `life-host-descriptor`、`life-ui-skin`、`life-host`、`life-game-host` 与 `life-save`：**5 files / 119 tests PASS**；随后重跑 `src/ui/components`：**76 files / 573 tests PASS**；全库 `npx.cmd tsc --noEmit` 与本单定向 tsc 均为 exit 0。
- 深色与浅色审计均以真实 `buildLifeStandardUi` 树执行；1060×760 下无重叠、无硬对比阻断、无 `border-image` 阻断，追踪任务与三个真实 Drawer 内 Panel 的四处九宫格 source/display 边框实测通过。深色 Onyx 保留 10 条 `sub/quiet` 次级文字 4.24 的非硬告警：它们来自既有主题级文字 token，而非本单新增颜色或自由样式；首个真实皮肤完成接线后的视觉对照与可读性审阅仍须再次确认，不能把本结论当作美术验收。
- 两个撤修探针由独立进程执行：`foreign-key` 精确 3 红、`panel-frame` 精确 4 红，均命中唯一锚点且退出码为 1；随后正常 119 项回归恢复 PASS。
- 实查 `life-game-host.ts` 在构造 `LifeHostSaveAdapter` 前剔除 render-only `uiSkin`，并由换皮、换 id、移除皮肤仍恢复同一旧存档的测试覆盖。该合同不会修改 World、快照或保存 schema。
- 重新执行 `life-materialize --plan-update`，结果为 `writesPerformed=false`、无冲突，canonical/current hash 同为 `sha256:0baf1bfcb4096113b12c6b65f1117172fe389bc39e21f7677d5eda905040e5af`；未进行物化。

范围裁定：`game-demon-castle` 已只声明两项已批准并登记的槽（`panelFrame`、`worldStatusRibbon`）；其余两槽保持可选而未产生悬空 key。真实 UI 素材的审美与运行时真机游玩继续受素材审核与 Host Playtest 人门约束，不由本次代码复查代签。
