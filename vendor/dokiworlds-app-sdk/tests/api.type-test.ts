import { createAppClient, type AppLaunchResult } from "../src/index.js";

const client = createAppClient({ appId: "my-app" });
const result: Promise<AppLaunchResult<{ score: number }>> = client.apps.launch<{}, { score: number }>({
  appId: "game", input: { contract: "input", version: 1, data: {} },
});
void result;
const initialized = client.whenReady({ timeoutMs: 500 });
void initialized;
const input: unknown = client.input?.data;
void input;
client.requestExit();

