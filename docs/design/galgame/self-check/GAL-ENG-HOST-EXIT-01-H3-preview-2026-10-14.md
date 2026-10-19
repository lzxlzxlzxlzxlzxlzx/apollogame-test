# GAL-ENG-HOST-EXIT-01 H3-preview 浏览器退出反馈施工自证（2026-10-14）

状态：**施工自证通过，等待非施工者独立复查**。范围仅 Web 预览；不签桌面退出、H2、S5/S6 或 Owner 人门。

## 变更与边界

- `GalSlicePorts.previewExitFeedback` 是显式 Web 预览能力；缺省 fail closed。仅
  `mountGalBrowserGame` 注入它，未探测 `window`、未调用 `window.close()`，未触及
  `electron/**`、`src/services/platform/**` 或 PUI。
- 首页只有该能力存在时才把既有 `gal-home-exit` 绑定为 `gal.home.exit`；否则仍为
  `gal.unavailable` 禁用态。`exitGame` 沿用唯一的 `requiresGalConfirmation` 政策：
  开启则进入 `exit-game` 确认窗，关闭则直达同一预览反馈。
- 确认接受只显示“浏览器预览不会关闭窗口，桌面版由宿主处理退出”；不写 World、
  手动槽或 Profile，也不保存剧情。取消只关闭待决确认。

## 机器证据

- `npx vitest run src/services/gal-ui/gal-ui-slice-host.test.ts`：38/38 PASS；覆盖
  显式能力、确认开/关、取消、接受、World hash/Profile 不变及缺省 fail closed。
- `node src/services/gal-ui/verify-gal-03e-action-live.mjs --transient-shots`：隔离短时
  Edge PASS。真实点击主页退出、取消并重开接受；前后 World hash 与 Profile 字节相同，
  接受后只显示诚实反馈，随后逐字首击显全/二击推进、选项、回滚、读档与设置链仍 PASS。
  临时构建、浏览器 profile 和浏览器均已清理。
- `node scripts/docs-ref-guard.mjs`、`node scripts/context-budget-guard.mjs`：PASS。
- `node tools/ui-audit.mjs src/services/gal-ui/gal-ui-slice-audit-fixture.ts`：阻断项 0；
  结构夹具的华丽度 0 是既有非阻断 S5 提醒。
- `npx tsc --noEmit`：**未绿，非本票阻断**；共享树现有
  `src/studio/cart-run-core.session.test.ts:56` 的 `NotAComponent` / `EntityBlueprint`
  类型错误。未修改该无关文件。

## 独立复查要求

复查人须独立重跑定点测试和真浏览器链；检查浏览器装配确实显式注入预览能力，且
普通 `GalSliceHost` 默认保持禁用。对一个锚点做隔离撤修验红：移除
`previewExitFeedback` 的主页能力守卫，缺省 fail-closed 断言必须转红；或把
`run('exit-game')` 改为写入状态，World/Profile 不变断言必须转红。复查必须确认
取消、确认关闭、重复点击不产生桌面端口/原生关闭行为，并不得把本票扩称 H2/H3
桌面消费完成。
