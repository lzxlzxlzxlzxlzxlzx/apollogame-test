export const APP_PROTOCOL = "dokiworld.app";
export const APP_PROTOCOL_VERSION = 2;
export const DEFAULT_APP_LAUNCH_TIMEOUT_MS = 60 * 60 * 1_000;

const MAX_ID_LENGTH = 200;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_PAYLOAD_DEPTH = 12;
const MAX_PAYLOAD_NODES = 2_000;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
const defaultId = (kind) => `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

function isBoundedValue(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { return false; }
  if (encoded === undefined || new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES) return false;
  let nodes = 0;
  const visit = (item, depth) => {
    if (++nodes > MAX_PAYLOAD_NODES || depth > MAX_PAYLOAD_DEPTH) return false;
    if (item === null || typeof item === "string" || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (Array.isArray(item)) return item.every((child) => visit(child, depth + 1));
    return isRecord(item) && Object.entries(item).every(([key, child]) => key.length <= MAX_ID_LENGTH && visit(child, depth + 1));
  };
  return visit(value, 0);
}

const isContract = (value) => isRecord(value) && isId(value.contract)
  && Number.isInteger(value.version) && value.version > 0
  && Object.hasOwn(value, "data") && isBoundedValue(value.data);
const isLaunchResult = (value) => isRecord(value) && (
  (value.status === "completed" && isContract(value.output))
  || (value.status === "cancelled" && value.output === undefined)
);

export class AppsCapabilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AppsCapabilityError";
    this.code = code;
  }
}

export class AppsCapabilityTimeoutError extends AppsCapabilityError {
  constructor() {
    super("timeout", "DokiWorlds apps.launch timed out");
    this.name = "AppsCapabilityTimeoutError";
  }
}

/** Attach the apps.launch capability to an established app session channel. */
export function createAppsClientExtension(client, { createId = defaultId, launchTimeoutMs = DEFAULT_APP_LAUNCH_TIMEOUT_MS } = {}) {
  if (typeof client?.send !== "function" || typeof client?.onMessage !== "function") throw new Error("Invalid app session channel");
  if (!Number.isFinite(launchTimeoutMs) || launchTimeoutMs <= 0) throw new Error("Invalid App launch timeout");
  const pending = new Map();
  let disposed = false;
  const finish = (requestId, outcome) => {
    const request = pending.get(requestId);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(requestId);
    outcome instanceof Error ? request.reject(outcome) : request.resolve(outcome);
  };
  const unsubscribe = client.onMessage((message) => {
    if (!isRecord(message) || message.type !== "dokiworld-app-apps-response" || !isRecord(message.payload)) return;
    const { requestId, operation, status, result, error } = message.payload;
    if (!isId(requestId) || !pending.has(requestId) || operation !== "launch") return;
    if (status === "fulfilled") {
      if (isBoundedValue(result) && isLaunchResult(result)) finish(requestId, result);
      else finish(requestId, new AppsCapabilityError("invalid-host-result", "DokiWorlds returned an invalid apps.launch result"));
    } else if (status === "rejected" && isRecord(error) && isId(error.code) && typeof error.message === "string") {
      finish(requestId, new AppsCapabilityError(error.code, error.message));
    }
  });
  return Object.freeze({
    launch(input) {
      if (disposed) return Promise.reject(new AppsCapabilityError("disposed", "The apps capability was disposed"));
      if (!isRecord(input) || !isId(input.appId) || !isContract(input.input) || !isBoundedValue(input)) {
        return Promise.reject(new AppsCapabilityError("invalid-request", "Invalid apps.launch request"));
      }
      const requestId = createId("apps-request");
      if (!isId(requestId) || pending.has(requestId)) {
        return Promise.reject(new AppsCapabilityError("invalid-request-id", "Invalid or duplicate request id"));
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(requestId, new AppsCapabilityTimeoutError()), launchTimeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        try { client.send("dokiworld-app-apps-request", { requestId, operation: "launch", input }); }
        catch (error) { finish(requestId, error instanceof Error ? error : new Error(String(error))); }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      for (const requestId of pending.keys()) finish(requestId, new AppsCapabilityError("disposed", "The apps capability was disposed"));
    },
  });
}

/** Host adapter: the host decides which App may launch and handles its lifecycle. */
export function createAppsHostExtension(host, { launch } = {}) {
  if (typeof host?.send !== "function" || typeof host?.onMessage !== "function") throw new Error("Invalid app host channel");
  let disposed = false;
  const inFlight = new Map();
  const unsubscribe = host.onMessage(async (message) => {
    if (disposed || !isRecord(message) || message.type !== "dokiworld-app-apps-request" || !isRecord(message.payload)) return;
    const { requestId, operation, input } = message.payload;
    if (!isId(requestId) || operation !== "launch" || !isRecord(input) || !isId(input.appId) || !isContract(input.input) || !isBoundedValue(input)) return;
    let outcome = inFlight.get(requestId);
    if (!outcome) {
      outcome = Promise.resolve().then(async () => {
        if (typeof launch !== "function") return { status: "rejected", error: { code: "unsupported-operation", message: "DokiWorlds does not provide apps.launch" } };
        try {
          const result = await launch(input);
          return isBoundedValue(result) && isLaunchResult(result)
            ? { status: "fulfilled", result }
            : { status: "rejected", error: { code: "invalid-host-result", message: "DokiWorlds returned an invalid apps.launch result" } };
        } catch (error) {
          return { status: "rejected", error: { code: isRecord(error) && isId(error.code) ? error.code : "operation-failed", message: "DokiWorlds could not complete apps.launch" } };
        }
      });
      inFlight.set(requestId, outcome);
    }
    host.send("dokiworld-app-apps-response", { requestId, operation, ...await outcome });
  });
  return Object.freeze({ dispose() { if (!disposed) { disposed = true; unsubscribe(); inFlight.clear(); } } });
}

/** Host side of the minimal v2 lifecycle used by locally embedded Apps. */
export function createAppHost({ appId, runId, target, input, scope = globalThis.window, expectedOrigin = "null", createId = defaultId } = {}) {
  if (!isId(appId) || !isId(runId) || !target?.postMessage || !scope?.addEventListener || !scope?.removeEventListener || !isContract(input)) {
    throw new Error("Invalid app host configuration");
  }
  if (expectedOrigin !== "null") {
    let parsed;
    try { parsed = new URL(expectedOrigin); } catch { throw new Error("Invalid app host origin"); }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== expectedOrigin) throw new Error("Invalid app host origin");
  }
  let instanceId = null;
  let disposed = false;
  let connected = false;
  const listeners = new Set();
  const send = (type, payload) => {
    if (!instanceId) throw new Error("The app has not sent ready");
    const messageId = createId("message");
    if (!isId(messageId)) throw new Error("Invalid app message id");
    target.postMessage({ type, protocol: APP_PROTOCOL, protocolVersion: APP_PROTOCOL_VERSION, appId, instanceId, runId, messageId, payload }, expectedOrigin === "null" ? "*" : expectedOrigin);
  };
  const onMessage = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  const handleMessage = async (event) => {
    if (disposed || !connected || event.source !== target || event.origin !== expectedOrigin || !isRecord(event.data)) return;
    const message = event.data;
    if (message.protocol !== APP_PROTOCOL || message.protocolVersion !== APP_PROTOCOL_VERSION || message.appId !== appId || !isId(message.instanceId)) return;
    if (message.type === "dokiworld-app-ready") {
      if (instanceId !== message.instanceId) instanceId = message.instanceId;
      send("dokiworld-app-init", { locale: "en", grantedScopes: [], context: {}, input });
      return;
    }
    if (message.instanceId !== instanceId || message.runId !== runId || !isId(message.messageId) || !isRecord(message.payload)) return;
    if (message.type === "dokiworld-app-complete") {
      const { resultId, output } = message.payload;
      if (!isId(resultId) || !isContract(output)) return;
      let decision = { status: "accepted" };
      try { decision = await handlers.onComplete?.(output) ?? decision; }
      catch { decision = { status: "rejected" }; }
      send("dokiworld-app-complete-ack", { resultId, status: decision.status === "accepted" ? "accepted" : "rejected" });
      return;
    }
    if (message.type === "dokiworld-app-request-exit") {
      handlers.onRequestExit?.();
      return;
    }
    for (const listener of listeners) listener(message);
  };
  let handlers = {};
  scope.addEventListener("message", handleMessage);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scope.removeEventListener("message", handleMessage);
    listeners.clear();
  };
  return Object.freeze({
    send, onMessage,
    connect(nextHandlers = {}) {
      if (disposed || connected) throw new Error("The app host is disposed or already connected");
      connected = true;
      handlers = nextHandlers;
      return dispose;
    },
    dispose,
  });
}

/** Minimal protocol-v2 client for an App embedded in a DokiWorlds host. */
export function createAppClient({ appId, scope = globalThis.window, targetOrigin = "*", instanceId = defaultId("instance"), createId = defaultId, readyRetryMs = 500 } = {}) {
  if (!isId(appId) || !isId(instanceId) || !scope?.parent?.postMessage || !scope?.addEventListener || !scope?.removeEventListener) throw new Error("Invalid app client identity or window");
  if (!Number.isFinite(readyRetryMs) || readyRetryMs <= 0) throw new Error("Invalid App ready retry interval");
  let runId = null;
  let input = null;
  const initializationWaiters = new Set();
  let connected = false;
  let disposed = false;
  let readyTimer = null;
  const listeners = new Set();
  const acknowledgements = new Map();
  const sendReady = () => {
    const message = { type: "dokiworld-app-ready", protocol: APP_PROTOCOL, protocolVersion: APP_PROTOCOL_VERSION, appId, instanceId };
    if (scope.ReactNativeWebView?.postMessage) scope.ReactNativeWebView.postMessage(JSON.stringify(message));
    else scope.parent.postMessage(message, targetOrigin);
  };
  const send = (type, payload) => {
    if (disposed) throw new Error("The app client was disposed");
    if (!runId) throw new Error("The app has not received init");
    const messageId = createId("message");
    if (!isId(messageId)) throw new Error("Invalid app message id");
    const message = { type, protocol: APP_PROTOCOL, protocolVersion: APP_PROTOCOL_VERSION, appId, instanceId, runId, messageId, payload };
    if (scope.ReactNativeWebView?.postMessage) scope.ReactNativeWebView.postMessage(JSON.stringify(message));
    else scope.parent.postMessage(message, targetOrigin);
    return message;
  };
  const onMessage = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  const apps = createAppsClientExtension({ send, onMessage }, { createId });
  const handleMessage = (event) => {
    if (disposed || !connected || event.source !== scope.parent || !isRecord(event.data)) return;
    if (targetOrigin !== "*" && event.origin !== targetOrigin) return;
    const message = event.data;
    if (message.protocol !== APP_PROTOCOL || message.protocolVersion !== APP_PROTOCOL_VERSION || message.appId !== appId || message.instanceId !== instanceId) return;
    if (message.type === "dokiworld-app-init" && isId(message.runId) && isId(message.messageId)) {
      if (!isRecord(message.payload) || !isContract(message.payload.input)) return;
      if (runId) {
        if (runId === message.runId) send("dokiworld-app-initialized", {});
        return;
      }
      runId = message.runId;
      input = structuredClone(message.payload.input);
      if (readyTimer !== null) { clearInterval(readyTimer); readyTimer = null; }
      send("dokiworld-app-initialized", {});
      for (const pending of initializationWaiters) {
        clearTimeout(pending.timer);
        pending.resolve(structuredClone(input));
      }
      initializationWaiters.clear();
      return;
    }
    if (runId && message.runId === runId && isId(message.messageId) && isRecord(message.payload)) {
      if (message.type === "dokiworld-app-complete-ack") {
        const pending = isId(message.payload.resultId)
          && (message.payload.status === "accepted" || message.payload.status === "rejected")
          ? acknowledgements.get(message.payload.resultId)
          : null;
        if (pending) {
          clearTimeout(pending.timer);
          acknowledgements.delete(message.payload.resultId);
          pending.resolve(message.payload.status);
        }
        return;
      }
      for (const listener of listeners) listener(message);
    }
  };
  scope.addEventListener("message", handleMessage);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scope.removeEventListener("message", handleMessage);
    if (readyTimer !== null) clearInterval(readyTimer);
    apps.dispose();
    for (const pending of initializationWaiters) { clearTimeout(pending.timer); pending.reject(new Error("The app client was disposed")); }
    initializationWaiters.clear();
    for (const pending of acknowledgements.values()) { clearTimeout(pending.timer); pending.reject(new Error("The app client was disposed")); }
    acknowledgements.clear();
    listeners.clear();
  };
  return Object.freeze({
    appId, instanceId, get runId() { return runId; }, get input() { return input === null ? null : structuredClone(input); }, apps,
    whenReady({ timeoutMs = 10_000 } = {}) {
      if (disposed) return Promise.reject(new Error("The app client was disposed"));
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error("Invalid initialization timeout"));
      if (input !== null) return Promise.resolve(structuredClone(input));
      return new Promise((resolve, reject) => {
        const pending = { resolve, reject, timer: null };
        pending.timer = setTimeout(() => { initializationWaiters.delete(pending); reject(new Error("App initialization timed out")); }, timeoutMs);
        initializationWaiters.add(pending);
      });
    },
    requestExit() { send("dokiworld-app-request-exit", {}); },
    complete(output) {
      if (disposed) return Promise.reject(new Error("The app client was disposed"));
      if (!isContract(output)) return Promise.reject(new Error("Invalid app output"));
      const resultId = createId("result");
      if (!isId(resultId) || acknowledgements.has(resultId)) return Promise.reject(new Error("Invalid or duplicate app result id"));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { acknowledgements.delete(resultId); reject(new Error("App completion acknowledgement timed out")); }, 3_000);
        acknowledgements.set(resultId, { resolve, reject, timer });
        try { send("dokiworld-app-complete", { resultId, output }); }
        catch (error) { clearTimeout(timer); acknowledgements.delete(resultId); reject(error); }
      });
    },
    connect() {
      if (disposed || connected) throw new Error("The app client is disposed or already connected");
      connected = true;
      sendReady();
      readyTimer = setInterval(() => { if (!runId) sendReady(); }, readyRetryMs);
      return dispose;
    },
    dispose,
  });
}

