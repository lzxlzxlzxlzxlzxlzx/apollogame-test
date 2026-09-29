import assert from "node:assert/strict";
import test from "node:test";
import {
  createAppClient, createAppHost, createAppsClientExtension, createAppsHostExtension,
} from "../src/index.js";

function clientFixture() {
  const sent = [], listeners = new Set();
  const parent = { postMessage(message) { sent.push(message); } };
  const scope = { parent,
    addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); },
  };
  const client = createAppClient({ appId: 'fixture', instanceId: 'instance-1', targetOrigin: 'https://game.example', scope });
  const receive = (input, overrides = {}, origin = 'https://game.example') => {
    for (const listener of listeners) listener({ source: parent, origin, data: {
      type: 'dokiworld-app-init', protocol: 'dokiworld.app', protocolVersion: 2,
      appId: 'fixture', instanceId: 'instance-1', runId: 'run-1', messageId: 'init-1',
      payload: { input }, ...overrides,
    } });
  };
  return { client, receive, sent };
}

test('initialization exposes detached input, rejects invalid origins/contracts, and cannot be overwritten', async () => {
  const { client, receive, sent } = clientFixture();
  try {
    client.connect();
    const pending = client.whenReady();
    const input = { contract: 'doki.check-reveal.input', version: 1, data: { roll: 15 } };
    receive(input, {}, 'https://attacker.example');
    receive({ ...input, version: 0 });
    assert.equal(client.input, null);
    assert.equal(client.runId, null);
    receive(input);
    assert.deepEqual(await pending, input);
    const copy = client.input;
    copy.data.roll = 1;
    receive({ ...input, data: { roll: 20 } });
    receive(input, { runId: 'run-2' });
    assert.equal(client.runId, 'run-1');
    assert.equal(client.input.data.roll, 15);
    assert.deepEqual(await client.whenReady(), input);
    client.requestExit();
    assert.equal(sent.at(-1).type, 'dokiworld-app-request-exit');
    assert.equal(sent.at(-1).runId, 'run-1');
  } finally { client.dispose(); }
});

test('initialization timeout and disposal settle waiters; timed-out callers can retry', async () => {
  const { client, receive } = clientFixture();
  client.connect();
  await assert.rejects(client.whenReady({ timeoutMs: 5 }), /timed out/);
  await assert.rejects(client.whenReady({ timeoutMs: 0 }), /Invalid/);
  const retried = client.whenReady();
  receive({ contract: 'input', version: 1, data: {} });
  assert.equal((await retried).contract, 'input');
  client.dispose();
  await assert.rejects(client.whenReady(), /disposed/);
  const fixture = clientFixture();
  const pending = fixture.client.whenReady();
  fixture.client.dispose();
  await assert.rejects(pending, /disposed/);
});

function pair() {
  const appListeners = new Set();
  const hostListeners = new Set();
  const app = {
    send(type, payload) { for (const listener of hostListeners) void listener({ type, payload }); },
    onMessage(listener) { appListeners.add(listener); return () => appListeners.delete(listener); },
  };
  const host = {
    send(type, payload) { for (const listener of appListeners) void listener({ type, payload }); },
    onMessage(listener) { hostListeners.add(listener); return () => hostListeners.delete(listener); },
  };
  return { app, host };
}

test("launch returns a versioned result and reports cancellation", async () => {
  const { app, host } = pair();
  const adapter = createAppsHostExtension(host, {
    launch: ({ appId }) => appId === "game" ? {
      status: "completed", output: { contract: "doki.game.result", version: 1, data: { score: 42 } },
    } : { status: "cancelled" },
  });
  const apps = createAppsClientExtension(app);
  try {
    assert.deepEqual(await apps.launch({ appId: "game", input: { contract: "doki.game.input", version: 1, data: {} } }), {
      status: "completed", output: { contract: "doki.game.result", version: 1, data: { score: 42 } },
    });
    assert.deepEqual(await apps.launch({ appId: "other", input: { contract: "doki.game.input", version: 1, data: {} } }), { status: "cancelled" });
  } finally { apps.dispose(); adapter.dispose(); }
});

test("host handshakes with an App and acknowledges a completed output", async () => {
  const sent = [];
  const listeners = new Set();
  const target = { postMessage(message, origin) { sent.push({ message, origin }); } };
  const scope = {
    addEventListener(type, listener) { if (type === "message") listeners.add(listener); },
    removeEventListener(type, listener) { if (type === "message") listeners.delete(listener); },
  };
  const host = createAppHost({ appId: "game", runId: "run-1", target, scope, expectedOrigin: "https://host.example", input: { contract: "input", version: 1, data: {} } });
  const outputs = [];
  host.connect({ onComplete: (output) => { outputs.push(output); return { status: "accepted" }; } });
  try {
    for (const listener of listeners) await listener({ source: target, origin: "https://host.example", data: {
      type: "dokiworld-app-ready", protocol: "dokiworld.app", protocolVersion: 2, appId: "game", instanceId: "instance-1",
    } });
    assert.equal(sent[0].message.type, "dokiworld-app-init");
    assert.equal(sent[0].origin, "https://host.example");
    const output = { contract: "result", version: 1, data: { score: 5 } };
    for (const listener of listeners) await listener({ source: target, origin: "https://host.example", data: {
      type: "dokiworld-app-complete", protocol: "dokiworld.app", protocolVersion: 2,
      appId: "game", instanceId: "instance-1", runId: "run-1", messageId: "complete-1",
      payload: { resultId: "result-1", output },
    } });
    assert.deepEqual(outputs, [output]);
    assert.equal(sent.at(-1).message.type, "dokiworld-app-complete-ack");
    assert.equal(sent.at(-1).message.payload.status, "accepted");
  } finally { host.dispose(); }
});

test("invalid input never reaches the host and invalid output is rejected", async () => {
  const { app, host } = pair();
  let calls = 0;
  const adapter = createAppsHostExtension(host, { launch: () => { calls++; return { status: "completed" }; } });
  const apps = createAppsClientExtension(app);
  try {
    await assert.rejects(apps.launch({ appId: "game", input: { contract: "", version: 1, data: {} } }), { code: "invalid-request" });
    assert.equal(calls, 0);
    await assert.rejects(apps.launch({ appId: "game", input: { contract: "doki.game.input", version: 1, data: {} } }), { code: "invalid-host-result" });
  } finally { apps.dispose(); adapter.dispose(); }
});

test("launch timeout and disposal settle pending calls", async () => {
  const { app } = pair();
  const apps = createAppsClientExtension(app, { launchTimeoutMs: 10 });
  await assert.rejects(apps.launch({ appId: "game", input: { contract: "input", version: 1, data: {} } }), { code: "timeout" });
  const pending = apps.launch({ appId: "game", input: { contract: "input", version: 1, data: {} } });
  apps.dispose();
  await assert.rejects(pending, { code: "disposed" });
});

test("embedded client completes the v2 handshake before sending a launch request", async () => {
  const sent = [];
  const listeners = new Set();
  const parent = { postMessage(message) { sent.push(message); } };
  const scope = {
    parent,
    addEventListener(type, listener) { if (type === "message") listeners.add(listener); },
    removeEventListener(type, listener) { if (type === "message") listeners.delete(listener); },
  };
  const client = createAppClient({ appId: "my-app", instanceId: "instance-1", scope });
  try {
    client.connect();
    assert.equal(sent[0].type, "dokiworld-app-ready");
    for (const listener of listeners) listener({ source: parent, origin: "https://host.example", data: {
      type: "dokiworld-app-init", protocol: "dokiworld.app", protocolVersion: 2,
      appId: "my-app", instanceId: "instance-1", runId: "run-1", messageId: "init-1", payload: { input: { contract: "input", version: 1, data: {} } },
    } });
    assert.equal(client.runId, "run-1");
    assert.equal(sent.at(-1).type, "dokiworld-app-initialized");
    const pending = client.apps.launch({ appId: "other-app", input: { contract: "input", version: 1, data: {} } });
    const request = sent.at(-1);
    assert.equal(request.type, "dokiworld-app-apps-request");
    for (const listener of listeners) listener({ source: parent, origin: "https://host.example", data: {
      ...request, type: "dokiworld-app-apps-response", messageId: "response-1",
      payload: { requestId: request.payload.requestId, operation: "launch", status: "fulfilled", result: { status: "cancelled" } },
    } });
    assert.deepEqual(await pending, { status: "cancelled" });
  } finally { client.dispose(); }
});

