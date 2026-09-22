# 《轻掷》嵌入调用合同

卡带标识：`game-dice`。它是透明 Canvas 覆盖层；Doki 侧无需修改，未来由其调用方在 iframe / WebView 中装载即可。

## 发起一次掷骰

卡带就绪后，父页面向 iframe 发送：

```ts
frame.contentWindow!.postMessage({
  type: 'apollo:dice:roll',
  request: {
    version: 1,
    requestId: 'action-42',
    input: { dice: [{ sides: 6 }, { sides: 20 }] },
  },
}, 'https://调用方域名');
```

`sides` 仅允许 `4 | 6 | 8 | 20`，一次 1–3 颗骰子。调用方**不得**传 `seed` 或预定点数；卡带由宿主 Web Crypto 为抛掷初速度取熵，Cannon 物理世界在骰子完全停止后读取实际朝上的面。非法指定结果会明确拒绝。

## 接收结算

卡带在动画落定后向**发起消息的同一 origin**回传：

```ts
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'apollo:dice:result') return;
  // event.data.output
  // {
  //   version: 1, requestId: 'action-42', status: 'settled', seed: 123456,
  //   result: {
  //     dice: [{ sides: 6, value: 3 }, { sides: 20, value: 17 }],
  //     total: 20,
  //     randomSource: 'physics'
  //   }
  // }
});
```

非法请求、调用方指定 seed / 点数或无可用熵时返回 `status: 'rejected'`。同一会话只能结算一次；重复结算不会改写首个结果。骰子停止时，画面中央会显示大号总点数约 1.8 秒后淡出。

## 本地验证

在游戏库打开“轻掷 Dice Overlay”，或使用独立构建：

```powershell
$env:VITE_TARGET_GAME='game-dice'
npm run build:cartridge
```

独立产物会把 `html`、`body` 与 `#game-root` 设为透明，适合在 Doki 上层显示。
