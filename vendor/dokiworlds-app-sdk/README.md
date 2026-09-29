# dokiworlds-app-sdk

中文完整使用说明见 [GUIDE.md](./GUIDE.md)。

Workspace version 0.2.0 (not published by this change) adds `whenReady()`, the `input` getter, and `requestExit()` to the v2 client. An embedded App can read its versioned input, return a completion, and request another App when the host grants that capability. The host controls catalog lookup, permissions, presentation, and lifecycle. See GUIDE.md for the check-reveal slot contract and local package installation.

```js
import { createAppClient } from "dokiworlds-app-sdk";

const client = createAppClient({ appId: "my-app", targetOrigin: "https://host.example" });
client.connect();
const input = await client.whenReady();

const result = await client.apps.launch({
  appId: "other-app",
  input: { contract: "doki.example.input", version: 1, data: { level: 1 } },
});

if (result.status === "completed") console.log(result.output);
client.dispose();
```

`launch` resolves to `{ status: "completed", output }` or `{ status: "cancelled" }`. A completed output has a versioned `{ contract, version, data }` envelope. Invalid requests, host failures, disposal, and the default one-hour timeout reject the promise with an `AppsCapabilityError` (`code` describes the failure). You can set `launchTimeoutMs` when attaching the capability to a custom channel via `createAppsClientExtension`.

The package uses the `dokiworld.app` protocol v2 handshake and `dokiworld-app-apps-request`/`dokiworld-app-apps-response` session messages from the original `@dokiworld/app-sdk`. A host with an established session channel can register `createAppsHostExtension(host, { launch })`; that session must allow the `apps` module. Installing this package alone does not add an App catalog or launch UI to the DokiWorlds host.

## Local development in this repository

Place an App at `frontend/public/apps/<app-id>/index.html`, then open a game in a development build and use the **APPS** button. IDs use lowercase letters, digits, dots, and hyphens. An optional `manifest.json` can provide `entry` (a relative HTML path), `locales.en.name`, and `runtime.input` (`contract` and `version`); otherwise `index.html`, the folder name, and the `doki.dev.launch` v1 input contract are used. Local Apps run with the host origin so module scripts and local assets load normally; only put trusted development Apps in this directory. A nested `apps.launch` may target another App in the same local catalog; its completion output is returned to the caller, while closing the child returns `{ status: "cancelled" }`.

