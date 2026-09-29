# dokiworlds-app-sdk 使用指南

适用版本：工作区 `dokiworlds-app-sdk@0.2.0`（本次未发布 npm）。主要入口是 `createAppClient`、`client.whenReady`、`client.input`、`client.apps.launch`、`client.complete` 和 `client.requestExit`；宿主侧可用 `createAppHost` 和 `createAppsHostExtension`。协议仍为 v2。

`0.1.0` 的客户端没有初始化输入读取 API，不能直接用于下面的检定演出插槽。

## 安装与运行条件

在 App 的源码项目中安装工作区包（Windows 示例，按本机仓库位置调整）：

```bash
npm install D:/GameDev/dokiworlds/packages/dokiworlds-app-sdk
```

SDK 是浏览器端 ESM。App 必须运行在支持 `postMessage` 的 iframe 中，由实现 `dokiworld.app` v2 的宿主加载；`apps.launch` 另外要求宿主允许拉起子 App。`npm install` 只提供 SDK，不会自行创建 App 目录、列表或弹窗。若 App 以静态文件放在 `public/apps`，请用自己的构建工具把 `dokiworlds-app-sdk` 打包进浏览器脚本；浏览器不能直接从静态页面解析 `import ... from 'dokiworlds-app-sdk'` 这个 npm 裸包名。异地交付也可以在包目录运行 `npm pack`，将生成的 tgz 交给同事安装；这不等于发布 npm。

## 检定演出插槽：给 App 作者

第一版只有 `check_reveal`，用于展示已经由游戏结算的检定。App 不掷新骰、不改变成功/失败、不发奖励，也不负责推进任务。制作、开锁等影响结果的操作小游戏尚未接入此插槽。

启动输入是 `doki.check-reveal.input` v1：

```json
{
  "contract": "doki.check-reveal.input",
  "version": 1,
  "data": {
    "presentationId": "本次演出唯一标识",
    "locale": "zh-CN",
    "title": "说得孙癞子自己松口",
    "check": { "attribute": "CHA", "roll": 15, "modifier": 1, "total": 16, "dc": 11, "passed": true }
  }
}
```

按原值展示 `check`；`attribute` 是内容中的属性标识，不要求一定为示例中的 `CHA`。完成输出必须且只能包含本次 `presentationId` 与 `status: 'viewed'`：

```js
import { createAppClient } from 'dokiworlds-app-sdk';

// 填游戏宿主的实际 origin；跨域时不能写小游戏自己的 window.location.origin。
const client = createAppClient({ appId: 'fortune-reveal', targetOrigin: 'https://game.example' });
client.connect();
window.addEventListener('pagehide', () => client.dispose(), { once: true });

const input = await client.whenReady({ timeoutMs: 10_000 });
if (input.contract !== 'doki.check-reveal.input' || input.version !== 1) {
  client.requestExit();
  throw new Error('Unsupported input contract');
}
const { presentationId, title, check, locale } = input.data;
// App 在这里使用 title、check、locale 播放自己的演出。
// 只有演出真实结束或玩家点击 App 内“看完”时，才调用这个函数。
async function finishPresentation() {
  const acknowledgement = await client.complete({
    contract: 'doki.check-reveal.result', version: 1,
    data: { presentationId, status: 'viewed' },
  });
  if (acknowledgement !== 'accepted') throw new Error('Presentation rejected');
  client.dispose();
}
// iframe 中的按键不会冒泡到游戏：App 应把 Escape/自己的退出按钮接到 requestExit。
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') client.requestExit();
});
```

`client.input` 在初始化前为 `null`，初始化后为输入副本；修改副本不会改变宿主输入。`whenReady` 可在 connect 前后订阅，已经初始化时立即返回；超时和 dispose 会拒绝等待。App 也应处理自己的加载/播放错误并调用 `requestExit`。

宿主有 10 秒初始化上限、初始化后 30 秒演出上限；始终提供正式结果和继续/跳过入口。关闭、跳过、超时、返回旧演出 ID 或错误契约都不会改变已结算结果。减少动态效果时直接显示正式结果，不加载 App。这个插槽不允许 `apps.launch`，调用会收到 `unsupported-operation`。

## 检定演出插槽：给接入方

1. 同事提供固定 `appId`、可嵌入的部署地址，并实现上述契约。服务器需允许游戏域名嵌入（检查 CSP `frame-ancestors` 和 `X-Frame-Options`）。
2. 在 `frontend/src/lib/app-registry.ts` 的 `APP_REGISTRY` 登记经过审核的地址，例如：

```ts
{ id: 'fortune-reveal', name: '检定演出', url: 'https://apps.example/fortune/', slots: ['check_reveal'] }
```

3. 在剧本源 `pack.yaml` 的现有 `presentation` 中添加以下内容，再经原有编译/版本流程交付：

```yaml
presentation:
  # 保留原有字段
  app_slots:
    check_reveal:
      app_id: fortune-reveal
```

剧本只能引用登记的 ID，不能提供 URL。正式插槽要求与游戏不同源的 HTTPS 地址；开发模式允许独立 localhost/127.0.0.1 端口的 HTTP 服务。独立 App 不应和游戏共享登录凭据。iframe 仅允许脚本、同源资源访问与指针锁，不授予宿主状态、导航或子 App 拉起能力。

未配置插槽时保留原来的抽签/结果界面；配置不存在或不合法时显示正式结果。当前登记表为空，未替任何正式剧本启用 App，也未附带第三方小游戏。

开发 **APPS** 目录扫描仅供调试，不等于正式登记；直接从目录启动时输入为空，不能代替一次真实检定联调。`AppFrame.tsx` 由开发入口与正式插槽共用；正式触发点在 `ContextCard.tsx` 的结果卡。

## 在本仓库启动本地 App

在 `frontend/public/apps/` 下为每个 App 建一个子目录，例如 `frontend/public/apps/hello-app/index.html`。目录名就是 SDK 的 `appId`，只接受小写字母、数字、`.` 和 `-`，且必须以字母或数字开头和结尾。打开游戏后点击 **APPS** 按钮即可启动调试界面：本地开发时可选择本机目录或管理员已发布到 `https://dev.aimeng.ai/api/game-admin/catalog` 的线上 App；部署环境只显示该线上发布目录。

如果入口不是 `index.html`，或需要指定输入契约，可放置 `manifest.json`：

```json
{
  "entry": "index.html",
  "locales": { "en": { "name": "Hello App" } },
  "runtime": { "input": { "contract": "demo.hello.input", "version": 1 } }
}
```

`entry` 必须是目录内的相对文件路径。未提供 manifest 时，宿主使用 `index.html`、目录名作为显示名称，以及 `{ "contract": "doki.dev.launch", "version": 1, "data": {} }` 作为初始输入。manifest 中的 `runtime.input` 只定义 `contract` 和 `version`；从 **APPS** 按钮直接启动时，`data` 是空对象。当前本地宿主只枚举存在入口文件的子目录，最多读取前 100 个合法目录。

本地 App 使用与宿主同源的 iframe，以便加载 ES module 和静态资源。这个调试入口只应放入可信任的开发 App。

## App 请求拉起另一个 App

下面是 App 源码示例。先 `connect()`，等 `runId` 非空后再调用 `apps.launch`；否则 SDK 会拒绝尚未初始化的发送动作。`targetOrigin` 填实际宿主 origin；本地开发时可使用 `window.location.origin`。

```js
import { AppsCapabilityError, createAppClient } from 'dokiworlds-app-sdk';

const client = createAppClient({
  appId: 'hello-app',
  targetOrigin: window.location.origin,
});
client.connect();
window.addEventListener('pagehide', () => client.dispose(), { once: true });

await client.whenReady({ timeoutMs: 10_000 });

try {
  const result = await client.apps.launch({
    appId: 'child-app',
    input: {
      contract: 'demo.child.input',
      version: 1,
      data: { level: 1 },
    },
  });

  if (result.status === 'completed') {
    console.log('Child output:', result.output);
  } else {
    console.log('Child App was closed without a result');
  }
} catch (error) {
  if (error instanceof AppsCapabilityError) {
    console.error(`Launch failed: ${error.code}`);
  } else {
    console.error('Launch failed:', error);
  }
}

```

`launch` 返回一个 Promise。子 App 调用 `client.complete(...)` 后，父 App 收到 `{ status: 'completed', output }`；用户关闭子 App 时收到 `{ status: 'cancelled' }`。本地宿主一次最多允许五层 App，会拒绝不存在的 `appId`。

`input` 和 `output` 均使用版本化契约 `{ contract, version, data }`。`contract` 是非空字符串，`version` 是正整数，`data` 必须能序列化为有界 JSON。单条 payload 的 JSON 上限为 64 KiB。调用方应提前与目标 App 约定契约名、版本和数据结构。

## App 返回完成结果

被拉起的 App 可以通过 `complete` 把结果交给宿主：

```js
import { createAppClient } from 'dokiworlds-app-sdk';

const client = createAppClient({
  appId: 'child-app',
  targetOrigin: window.location.origin,
});
client.connect();

// 等待宿主初始化；实际 App 可在自己的 UI 中禁用完成按钮直到初始化成功。
await client.whenReady({ timeoutMs: 10_000 });

// 用户完成操作之后调用。
const acknowledgement = await client.complete({
  contract: 'demo.child.result',
  version: 1,
  data: { score: 42 },
});

if (acknowledgement !== 'accepted') {
  throw new Error('Host rejected the result');
}
client.dispose();
```

这里同样需要先初始化；`0.2.0` 推荐用 `await client.whenReady()` 替代轮询并直接读取返回的输入。`complete` 返回 `'accepted'` 或 `'rejected'`；宿主未在约 3 秒内确认时会拒绝 Promise。关闭 App 前应等待确认，避免结果丢失。

## 宿主侧职责与错误处理

宿主负责选择可用 App、校验是否允许拉起、创建目标 iframe，并处理协议消息。`launch` handler 必须返回 `{ status: 'completed', output }` 或 `{ status: 'cancelled' }`。本仓库的宿主协议实现位于 `frontend/src/lib/dev-app-host.ts`，共用 iframe 位于 `frontend/src/free-roam/ui/AppFrame.tsx`，开发入口位于 `frontend/src/free-roam/ui/DevAppLauncher.tsx`，目录读取位于 `frontend/src/lib/dev-app-catalog.ts`。本项目宿主不依赖公开 SDK 包；外部 App 才安装并使用 `dokiworlds-app-sdk`。

常见的 `AppsCapabilityError.code`：

| code | 含义 |
| --- | --- |
| `invalid-request` | `appId` 或输入契约无效，或 payload 超出限制 |
| `app-unavailable` | 本地目录中没有目标 App |
| `app-limit` | 本地宿主已达到嵌套层数上限 |
| `unsupported-operation` | 宿主没有提供 `apps.launch` handler |
| `invalid-host-result` | 宿主返回的结果不符合契约 |
| `operation-failed` | 宿主处理失败；不会向 App 暴露内部异常文本 |
| `timeout` | 拉起请求超过默认一小时；自定义 channel 可通过 `createAppsClientExtension(..., { launchTimeoutMs })` 调整 |
| `disposed` | 调用前 capability 已释放，或等待期间被释放 |

只有 `result.status === 'completed'` 才读取 `result.output`。`cancelled` 是正常结束分支；上述错误会拒绝 Promise，需要用 `try/catch` 处理。

