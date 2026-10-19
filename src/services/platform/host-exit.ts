/**
 * 宿主退出意图。此端口只能由明确拥有当前游戏窗口的宿主注入；Web 和
 * 其他游戏默认没有退出能力。返回 accepted 仅表示宿主已接收请求，
 * 不表示窗口已关闭。这里不探测全局对象，也不触及 World 或存档。
 */
export type HostExitResult = 'accepted' | 'unavailable' | 'rejected';

export interface HostExitPort {
  requestExit(): HostExitResult | Promise<HostExitResult>;
}

/** 宿主级审计事件；不携带存档、剧情或墙钟数据。 */
export type HostExitAuditEvent = 'request' | HostExitResult;
export type HostExitAudit = (event: HostExitAuditEvent) => void;

export interface HostExitController {
  /** 只有显式注入端口才为 true，不从运行环境猜测。 */
  readonly available: boolean;
  /** 同一待决请求合并；首次 accepted 后永不重复投递。失败可重试。 */
  requestExit(): Promise<HostExitResult>;
}

export function createHostExitController(
  port?: HostExitPort,
  audit?: HostExitAudit,
): HostExitController {
  let pending: Promise<HostExitResult> | undefined;
  let accepted = false;
  const record = (event: HostExitAuditEvent): void => {
    try { audit?.(event); } catch { /* 审计故障不可改变退出结果 */ }
  };

  return {
    available: typeof port?.requestExit === 'function',
    requestExit(): Promise<HostExitResult> {
      if (accepted) return Promise.resolve('accepted');
      if (pending) return pending;
      pending = Promise.resolve()
        .then(() => typeof port?.requestExit === 'function' ? port.requestExit() : 'unavailable')
        .then((value): HostExitResult => {
          if (value === 'accepted' || value === 'unavailable' || value === 'rejected') return value;
          return 'rejected';
        }, (): HostExitResult => 'rejected')
        .then((result) => {
          if (result === 'accepted') accepted = true;
          record(result);
          return result;
        })
        .finally(() => { pending = undefined; });
      record('request');
      return pending;
    },
  };
}
