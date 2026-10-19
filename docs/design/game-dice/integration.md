# 《轻掷》嵌入调用合同

卡带标识：`game-dice`。它是在 DokiWorld 之上居中的悬浮判定窗：外层保持透明，让宿主场景透出；调用方在 iframe / WebView 中装载，并以纯数据声明判定规则。

公共输入输出的规范真相见 [`docs/sdk/dice-contracts-v1.md`](../../sdk/dice-contracts-v1.md)。DokiWorld 调用方使用 `doki.game.dice-input/1 → doki.game.result/1`；下文 `apollo:dice:*` 消息仅说明卡带内部的物理覆盖层桥接，不能替代 App SDK。

## 内部桥接：发起一次掷骰

卡带就绪后，父页面向 iframe 发送：

```ts
frame.contentWindow!.postMessage({
  type: 'apollo:dice:roll',
  request: {
    version: 1,
    requestId: 'action-42',
    input: {
      dice: [{ sides: 6 }, { sides: 20 }],
      modifier: 2,
      modifierSource: '智力',
      title: '智力检定',
      difficulty: 18,
      backdrop: 'arcane-vault',
    },
  },
}, 'https://调用方域名');
```

`sides` 仅允许 `4 | 6 | 8 | 20`，一次 1–3 颗骰子。`modifier` 是可选安全整数，缺省为 `0`。标准阈值模式使用 `difficulty`：`total + modifier >= difficulty` 返回 `success`，否则返回 `failure`。

需要“大失败 / 失败 / 成功 / 大成功”等自定义结果时，调用方可改传 `judgement.bands`。它是一组不重叠的 `{min,max,outcome}` 闭区间，必须覆盖所有可能的修正后点数。自定义区间优先于标准阈值；不内置天然 1/20 特权。

`title` 和 `modifierSource` 是纯展示数据。`difficulty` 既显示在画框顶部，也在未传 `judgement.bands` 时作为标准成功阈值。

`backdrop` 可选 `arcane-vault`、`royal-velvet`、`moonlit-ruins` 或 `infernal-forge`。它只影响**悬浮窗本身**的皮肤、边框与内衬，不会创建 3D 地台或遮住 DokiWorld。四种皮肤均使用 1024×1536、带真实 Alpha 外缘的 AI 生成不规则 PNG 主画框，并各自绑定同风格的独立修正卡，因此切换皮肤不改变合同、文字布局或结果。

D20 使用 `d20-numbered-v1.stl` 的真实凹刻数字。素材的二十个主面已经逐面渲染核对，1–20 各出现一次；运行时把模型法线校准到标准二十面凸包，并用显式面值表读取结果，绝不按 STL 三角面顺序猜点数。

调用方**不得**传 `seed` 或预定点数；卡带由宿主 Web Crypto 为抛掷初速度取熵，Cannon 物理世界在骰子完全停止后读取实际朝上的面。非法请求会明确拒绝。

## 内部桥接：接收结算

卡带在动画落定后向**发起消息的同一 origin**回传：

```ts
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'apollo:dice:result') return;
  // event.data.output
  // {
  //   version: 1, requestId: 'action-42', status: 'settled', seed: 123456,
  //   result: {
  //     dice: [{ sides: 6, value: 3 }, { sides: 20, value: 17 }],
  //     total: 20, modifier: 2, finalTotal: 22,
  //     difficulty: 18, passed: true, outcome: 'success',
  //     randomSource: 'physics'
  //   }
  // }
});
```

非法请求、调用方指定 seed / 点数或无可用熵时返回 `status: 'rejected'`。同一会话只能结算一次；重复结算不会改写首个结果。骰子停稳后依次演出“原始点数 → 原始点数 ± 修正 → 最终点数 → 成功/失败”，每阶段约保留 0.9 秒；成功为绿色，失败为红色，两者都使用同色柔光而非紫色外发光。最终判定已经渐入后才向宿主回传结果。

抛出前后使用同一镜头 FOV，骰子不会因为投掷状态改变显示比例。飞行高度由物理围栏限制在画布内。若多颗骰子上下叠压且长时间无法休眠，覆盖层会先执行一次轻量分离；极端情况下启用 7 秒硬超时结算，避免宿主会话永久挂起。

DokiWorld App SDK 对外返回标准 `doki.game.result`：标准阈值成功时 `outcome: 'win'`，失败时 `outcome: 'loss'`。`metrics` 中同时包含 `roll`、`total`、`modifier`、`finalTotal`、`difficulty`、`passed` 和 `diceOutcome`，调用方不需要根据画面文字反推结果。

## 本地验证

在游戏库打开“轻掷 Dice Overlay”，或使用独立构建：

```powershell
$env:VITE_TARGET_GAME='game-dice'
npm run build:cartridge
```

独立产物会把 `html`、`body` 与 `#game-root` 设为透明，适合在 Doki 上层显示。

## 导入当前 DokiWorlds public/apps

当前 loader 直接读取 `frontend/public/apps/<app-id>/manifest.json`。先执行本仓 build，然后把
`dokiworld/game-physics-dice/dist` **里面的全部内容**复制到
`C:\Users\24652\Desktop\projects\dokiworlds\frontend\public\apps\game-physics-dice\`；不要再包一层 `dist`。
成品必须包含 `manifest.json`、`index.html`、`assets/`、`games/`、`ui-fonts/`、
`ASSET-CLOSURE.json` 与 `SHA256SUMS.txt`，且不得出现旧 `app.manifest.json`。

## 旧 dokiworlds-apps 同步器（历史）

DokiWorld 发布包的唯一开发源仍是本仓 `games/game-dice`。同步器先在
`dokiworld/game-physics-dice/dist` 构建自包含 App，再把经过哈希校验的静态包写入目标仓库
`apps/game-physics-dice/exported`；目标仓的 `npm run build` 只负责把该目录复制为 `dist`，不再编译一份
独立骰子实现。

```powershell
node dokiworld/game-physics-dice/scripts/build.mjs
node dokiworld/game-physics-dice/scripts/sync-to-dokiworld-apps.mjs C:\path\to\dokiworlds-apps\apps\game-physics-dice
```

该同步器只服务旧的独立 `dokiworlds-apps` 仓路线，会核对目标 `app.manifest.json` 的 `id`，并在覆盖顶层清单和包配置前备份到
`.zerocraft-sync-backup/`。旧 `src/`、`public/` 与 Vite 配置不会被删除，但不再进入构建；这样既避免两边
继续分叉，也不会在无法检查目标 Git 状态时破坏 owner 的在途文件。

### 5173 调试面板

开发环境在 URL 中加上 `diceDebug=1` 即可打开 LayoutNode 调试面板：

```text
http://127.0.0.1:5173/?game=game-dice&diceDebug=1&dice=d20,d6&title=智力检定&difficulty=10&modifier=1&source=智力&backdrop=arcane-vault
```

面板可即时调整 1–3 颗骰子、每颗的 D4/D6/D8/D20 类型、画框皮肤、标题、难度、修正值和修正来源。每次修改都会同步到当前 URL，可以直接复制链接保存或分享一组调试参数。此面板只在开发模式启用，不进入生产导出。
