export declare const APP_PROTOCOL: "dokiworld.app";
export declare const APP_PROTOCOL_VERSION: 2;
export declare const DEFAULT_APP_LAUNCH_TIMEOUT_MS: number;

export interface AppContract<Data = unknown> {
  contract: string;
  version: number;
  data: Data;
}
export interface AppLaunchRequest<Input = unknown> {
  appId: string;
  input: AppContract<Input>;
}
export type AppLaunchResult<Output = unknown> =
  | { status: "completed"; output: AppContract<Output> }
  | { status: "cancelled"; output?: never };

export interface AppSessionMessage {
  type: string;
  protocol: typeof APP_PROTOCOL;
  protocolVersion: typeof APP_PROTOCOL_VERSION;
  appId: string;
  instanceId: string;
  runId: string;
  messageId: string;
  payload: Record<string, unknown>;
}
export interface AppSessionChannel {
  send(type: string, payload: Record<string, unknown>): unknown;
  onMessage(listener: (message: AppSessionMessage) => void | Promise<void>): () => void;
}
export declare class AppsCapabilityError extends Error {
  readonly code: string;
}
export declare class AppsCapabilityTimeoutError extends AppsCapabilityError {}
export interface AppsClientExtension {
  launch<Input = unknown, Output = unknown>(input: AppLaunchRequest<Input>): Promise<AppLaunchResult<Output>>;
  dispose(): void;
}
export declare function createAppsClientExtension(
  client: AppSessionChannel,
  options?: { createId?: (kind: string) => string; launchTimeoutMs?: number },
): AppsClientExtension;
export declare function createAppsHostExtension(
  host: AppSessionChannel,
  handlers?: { launch?: (input: AppLaunchRequest) => AppLaunchResult | Promise<AppLaunchResult> },
): { dispose(): void };
export interface AppHost extends AppSessionChannel {
  connect(handlers?: {
    onComplete?: (output: AppContract) => { status: "accepted" | "rejected" } | Promise<{ status: "accepted" | "rejected" }>;
    onRequestExit?: () => void;
  }): () => void;
  dispose(): void;
}
export declare function createAppHost(options: {
  appId: string;
  runId: string;
  target: Window;
  input: AppContract;
  scope?: Window;
  expectedOrigin?: string;
  createId?: (kind: string) => string;
}): AppHost;

export interface AppClientOptions {
  appId: string;
  scope?: Window & { ReactNativeWebView?: { postMessage(message: string): void } };
  targetOrigin?: string;
  instanceId?: string;
  createId?: (kind: string) => string;
  readyRetryMs?: number;
}
export interface AppClient {
  readonly appId: string;
  readonly instanceId: string;
  readonly runId: string | null;
  /** Validated initialization input; each read is a detached copy. */
  readonly input: AppContract | null;
  readonly apps: AppsClientExtension;
  whenReady(options?: { timeoutMs?: number }): Promise<AppContract>;
  requestExit(): void;
  complete(output: AppContract): Promise<"accepted" | "rejected">;
  connect(): () => void;
  dispose(): void;
}
export declare function createAppClient(options: AppClientOptions): AppClient;

