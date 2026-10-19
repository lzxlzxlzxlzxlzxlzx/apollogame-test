import { mulberry32 } from '@engine/logic/index.js';
import {
  EXTERNAL_GAME_SESSION_VERSION,
  startExternalGameSession,
  type ExternalGameOutput,
  type ExternalGameRequest,
  type ExternalGameSession,
} from './external-game-session.js';

/** 外部嵌入式骰子允许的标准面数。 */
export type DiceSides = 4 | 6 | 8 | 20;
export type DiceSpec = Readonly<{ sides: DiceSides }>;
/** 可由调用方选择的悬浮骰窗皮肤；它只影响 DokiWorld 上层的 UI 外观，不影响规则。 */
export type DiceBackdrop = 'arcane-vault' | 'royal-velvet' | 'moonlit-ruins' | 'infernal-forge';
/** 一段闭区间对应一个调用方定义的结果标签。区间命中的是修正后的总点数。 */
export type DiceOutcomeBand = Readonly<{ min: number; max: number; outcome: string }>;
export type DiceJudgement = Readonly<{ bands: readonly DiceOutcomeBand[] }>;
export type DiceRollInput = Readonly<{
  dice: readonly DiceSpec[];
  modifier?: number;
  judgement?: DiceJudgement;
  backdrop?: DiceBackdrop;
  /** 悬浮窗上方的本次检定名称，例如“智力检定”。 */
  title?: string;
  /** 标准阈值模式的难度；未传 judgement.bands 时，finalTotal >= difficulty 即成功。 */
  difficulty?: number;
  /** 修正值的来源，例如“智力”或“装备”。 */
  modifierSource?: string;
}>;
export type DicePreset = Readonly<{ values: readonly number[] }>;
export type DiceJudgementResult = Readonly<{
  modifier: number;
  finalTotal: number;
  outcome?: string;
  difficulty?: number;
  passed?: boolean;
}>;
export type DiceRollResult = Readonly<{
  dice: readonly Readonly<{ sides: DiceSides; value: number }>[];
  total: number;
  randomSource: 'preset' | 'seed';
} & Partial<DiceJudgementResult>>;
export type DiceRollRequest = ExternalGameRequest<DiceRollInput, DicePreset>;

export const DICE_BRIDGE_ROLL = 'apollo:dice:roll';
export const DICE_BRIDGE_RESULT = 'apollo:dice:result';

const SUPPORTED_SIDES = new Set<number>([4, 6, 8, 20]);
const SUPPORTED_BACKDROPS = new Set<DiceBackdrop>(['arcane-vault', 'royal-velvet', 'moonlit-ruins', 'infernal-forge']);
const MAX_DICE = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : undefined;
}

/** 将 JSON 输入收束为可用骰池；不接受未知面数、空骰池或超过三颗骰子。 */
export function normalizeDiceInput(value: unknown): DiceRollInput | undefined {
  if (!isRecord(value) || !Array.isArray(value.dice) || value.dice.length === 0 || value.dice.length > MAX_DICE) return undefined;
  const dice: DiceSpec[] = [];
  for (const entry of value.dice) {
    const sides = typeof entry === 'number' ? entry : isRecord(entry) ? entry.sides : undefined;
    if (typeof sides !== 'number' || !SUPPORTED_SIDES.has(sides)) return undefined;
    dice.push({ sides: sides as DiceSides });
  }
  const backdrop = value.backdrop;
  if (backdrop !== undefined && (typeof backdrop !== 'string' || !SUPPORTED_BACKDROPS.has(backdrop as DiceBackdrop))) return undefined;
  const modifier = value.modifier === undefined ? undefined : value.modifier;
  if (modifier !== undefined && (typeof modifier !== 'number' || !Number.isSafeInteger(modifier))) return undefined;
  const title = value.title === undefined ? undefined : normalizedText(value.title, 48);
  if (value.title !== undefined && !title) return undefined;
  const modifierSource = value.modifierSource === undefined ? undefined : normalizedText(value.modifierSource, 24);
  if (value.modifierSource !== undefined && !modifierSource) return undefined;
  const difficulty = value.difficulty === undefined ? undefined : value.difficulty;
  if (difficulty !== undefined && (typeof difficulty !== 'number' || !Number.isSafeInteger(difficulty) || difficulty < 0 || difficulty > 9999)) return undefined;
  const judgement = normalizeDiceJudgement(value.judgement, dice, modifier ?? 0);
  if (value.judgement !== undefined && !judgement) return undefined;
  return {
    dice,
    ...(modifier === undefined ? {} : { modifier }),
    ...(judgement ? { judgement } : {}),
    ...(backdrop === undefined ? {} : { backdrop: backdrop as DiceBackdrop }),
    ...(title ? { title } : {}),
    ...(difficulty === undefined ? {} : { difficulty }),
    ...(modifierSource ? { modifierSource } : {}),
  };
}

/**
 * 骰子判定只解释数据：所有区域由调用方声明，不内置天然 1/20 或任何 RPG 特权规则。
 * 为了让每次合法掷骰一定有结果，区间须覆盖本骰池加修正值后的所有整数总点数。
 */
export function normalizeDiceJudgement(value: unknown, dice: readonly DiceSpec[], modifier: number): DiceJudgement | undefined {
  if (!isRecord(value) || !Array.isArray(value.bands) || value.bands.length === 0) return undefined;
  const bands: DiceOutcomeBand[] = [];
  for (const entry of value.bands) {
    const outcome = isRecord(entry) ? normalizedText(entry.outcome, 48) : undefined;
    if (!isRecord(entry) || typeof entry.min !== 'number' || typeof entry.max !== 'number'
      || !Number.isSafeInteger(entry.min) || !Number.isSafeInteger(entry.max)
      || entry.min > entry.max || !outcome) return undefined;
    bands.push({ min: entry.min, max: entry.max, outcome });
  }
  const sorted = [...bands].sort((left, right) => left.min - right.min || left.max - right.max);
  for (let index = 1; index < sorted.length; index += 1) if (sorted[index - 1]!.max >= sorted[index]!.min) return undefined;
  const minimum = dice.length + modifier;
  const maximum = dice.reduce((sum, die) => sum + die.sides, 0) + modifier;
  let next = minimum;
  for (const band of sorted) {
    if (band.max < next) continue;
    if (band.min > next) return undefined;
    if (band.max >= maximum) return { bands: sorted };
    next = band.max + 1;
  }
  return undefined;
}

/**
 * 对原始总点数应用修正。自定义区间优先；未传区间时，difficulty 启用标准成功/失败阈值。
 * 仅传 modifier 也会返回 finalTotal，供结果动画展示算式。
 */
export function judgeDiceTotal(input: DiceRollInput, total: number): DiceJudgementResult | undefined {
  const judgement = input.judgement;
  const modifier = input.modifier ?? 0;
  const finalTotal = total + modifier;
  if (judgement) {
    const band = judgement.bands.find((candidate) => finalTotal >= candidate.min && finalTotal <= candidate.max);
    if (!band) throw new Error('合法骰子判定必须覆盖本次修正后的总点数');
    return { modifier, finalTotal, outcome: band.outcome };
  }
  if (input.difficulty !== undefined) {
    const passed = finalTotal >= input.difficulty;
    return { modifier, finalTotal, difficulty: input.difficulty, passed, outcome: passed ? 'success' : 'failure' };
  }
  return input.modifier === undefined ? undefined : { modifier, finalTotal };
}

/** 对预定骰面严格验界；非法预设不偷偷改成随机。 */
export function normalizeDicePreset(value: unknown, input: DiceRollInput): DicePreset | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !Array.isArray(value.values) || value.values.length !== input.dice.length) return undefined;
  const values: number[] = [];
  for (let i = 0; i < value.values.length; i += 1) {
    const face = value.values[i];
    const die = input.dice[i];
    if (!die || typeof face !== 'number' || !Number.isInteger(face) || face < 1 || face > die.sides) return undefined;
    values.push(face);
  }
  return { values };
}

/** 从未知桥接载荷读取标准请求；返回 undefined 时调用方应 fail closed。 */
export function normalizeDiceRequest(value: unknown): DiceRollRequest | undefined {
  if (!isRecord(value)) return undefined;
  const input = normalizeDiceInput(value.input);
  if (!input || typeof value.version !== 'number' || typeof value.requestId !== 'string') return undefined;
  const preset = normalizeDicePreset(value.preset, input);
  if (value.preset !== undefined && !preset) return undefined;
  if (value.seed !== undefined && (typeof value.seed !== 'number' || !Number.isSafeInteger(value.seed))) return undefined;
  return {
    version: value.version,
    requestId: value.requestId,
    input,
    ...(value.seed === undefined ? {} : { seed: value.seed }),
    ...(preset === undefined ? {} : { preset }),
  };
}

/** 同一 seed 与骰池总会生成同一结果；视觉动画不参与此结算。 */
export function resolveDiceResult(input: DiceRollInput, seed: number | undefined, preset: DicePreset | undefined): DiceRollResult {
  const values = preset
    ? [...preset.values]
    : (() => {
      if (seed === undefined) throw new Error('随机骰局必须有宿主 seed');
      const random = mulberry32(seed);
      return input.dice.map((die) => Math.floor(random() * die.sides) + 1);
    })();
  const dice = input.dice.map((die, index) => ({ sides: die.sides, value: values[index]! }));
  const total = values.reduce((sum, value) => sum + value, 0);
  const judgement = judgeDiceTotal(input, total);
  return { dice, total, randomSource: preset ? 'preset' : 'seed', ...(judgement ?? {}) };
}

/** 仅由宿主调用 Web Crypto，游戏层永远没有熵 API。 */
export function webCryptoSeed(): number | undefined {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return undefined;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

type ActiveSession = {
  request: DiceRollRequest;
  session: ExternalGameSession<DiceRollInput, DiceRollResult, DicePreset>;
  targetOrigin?: string;
  targetWindow?: Window;
  result?: DiceRollResult;
};

type DieMotion = { x: number; y: number; rotation: number; spin: number; wobble: number };

function drawDie(ctx: CanvasRenderingContext2D, die: DiceSpec, value: number, motion: DieMotion, scale: number): void {
  const radius = scale * (die.sides === 20 ? 0.82 : die.sides === 8 ? 0.88 : 0.92);
  const vertices = die.sides === 4 ? 3 : die.sides === 6 ? 4 : die.sides === 8 ? 4 : 5;
  ctx.save();
  ctx.translate(motion.x, motion.y);
  ctx.rotate(motion.rotation);
  ctx.shadowColor = 'rgba(33, 17, 82, 0.36)';
  ctx.shadowBlur = 18 * scale / 92;
  ctx.shadowOffsetY = 11 * scale / 92;
  ctx.beginPath();
  for (let i = 0; i < vertices; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / vertices;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(-radius, -radius, radius, radius);
  gradient.addColorStop(0, '#fffaff');
  gradient.addColorStop(0.47, '#d9ccff');
  gradient.addColorStop(1, '#8e78da');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(2, scale / 36);
  ctx.strokeStyle = '#5a4697';
  ctx.stroke();

  // 刻面只影响观感：结果来自 seed/preset，不从 canvas 的朝向反推。
  ctx.strokeStyle = 'rgba(91, 68, 153, 0.28)';
  ctx.lineWidth = Math.max(1, scale / 80);
  for (let i = 0; i < vertices; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / vertices;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); ctx.stroke();
  }
  ctx.fillStyle = '#2a1758';
  ctx.font = `800 ${Math.round(radius * 0.72)}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(value), 0, radius * (die.sides === 4 ? 0.14 : 0.04));
  ctx.restore();
}

function rejectionFor(requestId: string): ExternalGameOutput<DiceRollResult> {
  return { version: EXTERNAL_GAME_SESSION_VERSION, requestId, status: 'rejected', reason: 'invalid-request' };
}

/**
 * 可嵌入骰子舞台：背景始终透明。
 *
 * 接口：向 iframe `postMessage({type:'apollo:dice:roll', request}, origin)`；结算后同源回
 * `apollo:dice:result`，detail 为通用 ExternalGameOutput。非 iframe 场景还会派发同名 CustomEvent。
 */
export function mountDiceOverlay(container: HTMLElement, initial?: DiceRollRequest): () => void {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '掷骰子。点击或拖动以投掷。');
  canvas.tabIndex = 0;
  canvas.style.cssText = 'display:block;width:100%;height:100%;background:transparent;touch-action:none;cursor:grab;outline:none';
  container.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('此浏览器不支持 Canvas 2D');

  let active: ActiveSession | undefined;
  let rolling = false;
  let animationFrame = 0;
  let startedAt = 0;
  let pointerStart: { x: number; y: number } | undefined;
  let motions: DieMotion[] = [];
  let standaloneSequence = 0;

  const standaloneRequest = (): DiceRollRequest => ({
    version: EXTERNAL_GAME_SESSION_VERSION,
    requestId: `standalone-dice-${++standaloneSequence}`,
    input: { dice: [{ sides: 6 }] },
  });

  const emit = (output: ExternalGameOutput<DiceRollResult>, target?: Window, origin?: string): void => {
    window.dispatchEvent(new CustomEvent(DICE_BRIDGE_RESULT, { detail: output }));
    if (target && target !== window) target.postMessage({ type: DICE_BRIDGE_RESULT, output }, origin ?? '*');
  };

  const open = (raw: unknown, target?: Window, origin?: string): void => {
    const request = normalizeDiceRequest(raw);
    if (!request) {
      const requestId = isRecord(raw) && typeof raw.requestId === 'string' ? raw.requestId : '';
      emit(rejectionFor(requestId), target, origin);
      return;
    }
    const started = startExternalGameSession<DiceRollInput, DiceRollResult, DicePreset>(request, webCryptoSeed);
    if (!started.ok) { emit(started.output, target, origin); return; }
    active = { request, session: started.session, targetOrigin: origin, targetWindow: target };
    rolling = false;
    motions = request.input.dice.map((_, index) => ({ x: 0, y: 0, rotation: index * 0.22, spin: 0, wobble: 0 }));
    render();
  };

  const layout = (): { w: number; h: number; dpr: number } => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h, dpr };
  };

  const render = (): void => {
    const { w, h } = layout();
    ctx.clearRect(0, 0, w, h);
    const dice = active?.request.input.dice ?? [];
    const gap = Math.min(170, w / Math.max(2, dice.length + 1));
    const scale = Math.min(142, Math.max(70, Math.min(w / Math.max(2.8, dice.length * 1.3), h * 0.34)));
    const shown = active?.result?.dice.map((item) => item.value)
      ?? dice.map((die, index) => rolling && active?.session.seed !== undefined
        ? (Math.floor(mulberry32((active.session.seed + index + Math.floor((performance.now() - startedAt) / 62)) >>> 0)() * die.sides) + 1)
        : 1);
    dice.forEach((die, index) => {
      const motion = motions[index] ?? { x: 0, y: 0, rotation: 0, spin: 0, wobble: 0 };
      const center = (w / 2) + (index - (dice.length - 1) / 2) * gap;
      drawDie(ctx, die, shown[index] ?? 1, { ...motion, x: center + motion.x, y: h * 0.47 + motion.y }, scale);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(48, 31, 100, 0.88)';
    ctx.font = '700 14px ui-rounded, system-ui, sans-serif';
    const instruction = rolling ? '骰子正在落下…' : active?.result ? `总点数 ${active.result.total}` : '点击或拖动掷骰';
    ctx.fillText(instruction, w / 2, h - 34);
    if (active) {
      ctx.fillStyle = 'rgba(79, 54, 146, 0.58)'; ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(active.request.input.dice.map((die) => `d${die.sides}`).join(' · '), w / 2, 28);
    }
  };

  const finishRoll = (): void => {
    if (!active) return;
    active.result = resolveDiceResult(active.request.input, active.session.seed, active.request.preset);
    const output = active.session.complete(active.result);
    rolling = false;
    motions = motions.map((motion) => ({ ...motion, y: 0, spin: 0, wobble: 0 }));
    render();
    emit(output, active.targetWindow, active.targetOrigin);
  };

  const animate = (now: number): void => {
    if (!rolling || !active) return;
    const progress = Math.min(1, (now - startedAt) / 900);
    const bounce = Math.sin(progress * Math.PI) * (1 - progress * 0.18);
    motions = active.request.input.dice.map((_, index) => ({
      x: Math.sin(progress * 9 + index * 1.8) * 18 * (1 - progress),
      y: -bounce * (80 + index * 14) + Math.sin(progress * 21 + index) * 8 * (1 - progress),
      rotation: progress * (8.5 + index * 1.7) + index * 0.33,
      spin: 0,
      wobble: 0,
    }));
    render();
    if (progress >= 1) finishRoll(); else animationFrame = requestAnimationFrame(animate);
  };

  const roll = (): void => {
    if (rolling) return;
    if (!active || active.session.output()) open(standaloneRequest());
    if (!active) return;
    rolling = true;
    active.result = undefined;
    startedAt = performance.now();
    animationFrame = requestAnimationFrame(animate);
  };

  const onPointerDown = (event: PointerEvent): void => {
    pointerStart = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onPointerUp = (event: PointerEvent): void => {
    canvas.style.cursor = 'grab';
    if (pointerStart) roll();
    pointerStart = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); roll(); }
  };
  const onMessage = (event: MessageEvent<unknown>): void => {
    if (!isRecord(event.data) || event.data.type !== DICE_BRIDGE_ROLL) return;
    open(event.data.request, event.source instanceof Window ? event.source : undefined, event.origin);
  };
  const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(render);
  resizeObserver?.observe(container);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('keydown', onKeyDown);
  window.addEventListener('message', onMessage);
  // 直开卡带时，宿主可在脚本加载前注入全局初始请求；iframe 场景则通常在 mount 后 postMessage。
  open(initial ?? window.__APOLLO_DICE_REQUEST__ ?? standaloneRequest());

  return () => {
    cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('message', onMessage);
    container.replaceChildren();
  };
}
