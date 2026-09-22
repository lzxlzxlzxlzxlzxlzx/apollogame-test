# DokiWorld App SDK 3.1.1 reference

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
