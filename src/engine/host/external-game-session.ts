/**
 * 外部小游戏会话合同。
 *
 * 这里故意不处理 iframe、postMessage 或 DOM：各宿主可各自适配传输层，
 * 但 requestId、初始 seed 和结果只结算一次的语义由引擎统一拥有。
 */

export const EXTERNAL_GAME_SESSION_VERSION = 1 as const;

export type ExternalGameRequest<TInput, TPreset = unknown> = Readonly<{
  /** 外部输入是不可信 JSON，运行时会校验它等于当前协议版本。 */
  version: number;
  requestId: string;
  input: TInput;
  /** 调用方给定时，游戏必须以它作为确定性随机源的初始 seed。 */
  seed?: number;
  /** 调用方已确定结果时携带的不可解释载荷；不会消耗宿主熵。 */
  preset?: TPreset;
}>;

export type ExternalGameResult<TResult> = Readonly<{
  version: typeof EXTERNAL_GAME_SESSION_VERSION;
  requestId: string;
  status: 'settled';
  /** 会话实际使用的 seed；preset-only 会话没有此字段。 */
  seed?: number;
  result: TResult;
}>;

export type ExternalGameRejection = Readonly<{
  version: typeof EXTERNAL_GAME_SESSION_VERSION;
  requestId: string;
  status: 'rejected';
  reason: 'invalid-request' | 'entropy-unavailable' | 'rejected-by-game';
}>;

export type ExternalGameOutput<TResult> = ExternalGameResult<TResult> | ExternalGameRejection;

/** 宿主层的唯一熵端口。游戏层不得直接调用 crypto 或 Math.random。 */
export type SessionEntropy = () => number | undefined;

export type ExternalGameSession<TInput, TResult, TPreset = unknown> = Readonly<{
  request: ExternalGameRequest<TInput, TPreset>;
  /** 已校验并归一为 uint32 的 seed；preset-only 会话为 undefined。 */
  seed: number | undefined;
  /** 第一次 settle/reject 的输出；之后所有调用都返回同一份结果。 */
  complete: (result: TResult) => ExternalGameOutput<TResult>;
  reject: () => ExternalGameOutput<TResult>;
  output: () => ExternalGameOutput<TResult> | undefined;
}>;

export type StartExternalGameSession<TInput, TResult, TPreset = unknown> =
  | Readonly<{ ok: true; session: ExternalGameSession<TInput, TResult, TPreset> }>
  | Readonly<{ ok: false; output: ExternalGameRejection }>;

function reject(requestId: unknown, reason: ExternalGameRejection['reason']): ExternalGameRejection {
  return {
    version: EXTERNAL_GAME_SESSION_VERSION,
    requestId: typeof requestId === 'string' ? requestId : '',
    status: 'rejected',
    reason,
  };
}

function normaliseSeed(seed: unknown): number | undefined {
  if (typeof seed !== 'number' || !Number.isSafeInteger(seed)) return undefined;
  return seed >>> 0;
}

function isValidRequest<TInput, TPreset>(
  request: ExternalGameRequest<TInput, TPreset>,
): boolean {
  return request.version === EXTERNAL_GAME_SESSION_VERSION
    && typeof request.requestId === 'string'
    && request.requestId.trim().length > 0
    && request.requestId.length <= 128
    && (request.seed === undefined || normaliseSeed(request.seed) !== undefined);
}

/**
 * 建立一次可嵌入的小游戏会话。
 *
 * seed 优先于 preset；仅在两者都缺席时向宿主请求一次熵。这样预定结果的
 * 展示不会推进随机序列，而真正随机的对局仍会把可复现的 seed 回传给调用方。
 */
export function startExternalGameSession<TInput, TResult, TPreset = unknown>(
  request: ExternalGameRequest<TInput, TPreset>,
  entropy?: SessionEntropy,
): StartExternalGameSession<TInput, TResult, TPreset> {
  if (!isValidRequest(request)) {
    return { ok: false, output: reject(request?.requestId, 'invalid-request') };
  }

  let seed = normaliseSeed(request.seed);
  if (seed === undefined && request.preset === undefined) {
    seed = normaliseSeed(entropy?.());
    if (seed === undefined) {
      return { ok: false, output: reject(request.requestId, 'entropy-unavailable') };
    }
  }

  let settled: ExternalGameOutput<TResult> | undefined;
  const finish = (next: ExternalGameOutput<TResult>): ExternalGameOutput<TResult> => {
    if (settled === undefined) settled = Object.freeze(next);
    return settled;
  };

  return {
    ok: true,
    session: Object.freeze({
      request: Object.freeze({ ...request, seed }),
      seed,
      complete: (result: TResult) => finish({
        version: EXTERNAL_GAME_SESSION_VERSION,
        requestId: request.requestId,
        status: 'settled',
        ...(seed === undefined ? {} : { seed }),
        result,
      }),
      reject: () => finish(reject(request.requestId, 'rejected-by-game')),
      output: () => settled,
    }),
  };
}
