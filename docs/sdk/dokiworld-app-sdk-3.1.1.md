# DokiWorld App SDK 3.1.1 reference

> **历史快照，已不用于当前本机 DokiWorlds 接入。** 2026-09-24 起，本地测试接入以
> [`dokiworlds-app-sdk-0.1.0.md`](dokiworlds-app-sdk-0.1.0.md) 和上游
> `C:\Users\24652\Desktop\projects\dokiworlds\packages\dokiworlds-app-sdk` 实码为准。
> 两个包名与 API 不兼容，禁止把本页的 `connect({ onInit })` 套到新包。

This is ApolloGame's development reference. The source-of-record and package-format
guide live in `dokiworlds-apps/docs/sdk/`; keep the copies aligned when the public
protocol changes. Do not copy the SDK implementation: depend on `@dokiworld/app-sdk`.

- Package: `@dokiworld/app-sdk@3.1.1`
- Runtime protocol: `dokiworld.app/2`
- Lifecycle: `createAppClient({ appId })`, then `connect({ onInit, onPrepareExit })`
- Validate `input.contract`, `input.version`, and `input.data` before use.
- Finish ordinary game play with `createGameResult()` and `app.complete()`.

The Host owns cross-window origin, App ID, run ID, and message validation. An App must
not import DokiWorld frontend internals or invent a parallel iframe protocol.
