import { describe, expect, it } from 'vitest';
import { createAppClient, createAppHost, type AppContract } from 'dokiworlds-app-sdk';
import { CardRevealSession } from '../../../games/game-card-reveal/session.js';
import type { Shape } from '@zerocraft/engine/engine/protocol/components.js';
import { stageTicks } from '../../../games/game-card-reveal/timing.js';
import { ACTION } from '../../../games/game-card-reveal/tracks.js';
import { CompletionGate } from '../src/completion.js';
import { CARD_REVEAL_INPUT_CONTRACT, inputFromContract, isEmptyPreview } from '../src/contract.js';

type MessageEventLike = { data: unknown; source: unknown; origin: string };
function bus() {
  const listeners = new Set<(event: MessageEventLike) => void>();
  return {
    addEventListener(_kind: string, listener: (event: MessageEventLike) => void) { listeners.add(listener); },
    removeEventListener(_kind: string, listener: (event: MessageEventLike) => void) { listeners.delete(listener); },
    emit(event: MessageEventLike) { for (const listener of [...listeners]) listener(event); },
    count() { return listeners.size; },
  };
}
const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `card-${i}`, faceImageUrl: `https://cards.example/${i}.webp` }));
function connectedHost(data: unknown, onComplete: (output: AppContract) => { status: 'accepted' | 'rejected' } | Promise<{ status: 'accepted' | 'rejected' }> = () => ({ status: 'accepted' }), version = 1) {
  const trace: string[] = [];
  const hostScope = bus();
  const childScope = bus();
  const childTarget = { postMessage(message: unknown) { queueMicrotask(() => childScope.emit({ data: message, source: parentTarget, origin: 'null' })); } };
  const parentTarget = { postMessage(message: unknown) { queueMicrotask(() => hostScope.emit({ data: message, source: childTarget, origin: 'null' })); } };
  const appScope = { ...childScope, parent: parentTarget };
  let hostId = 0;
  let appId = 0;
  const input = { contract: CARD_REVEAL_INPUT_CONTRACT, version, data };
  const host = createAppHost({ appId: 'game-card-reveal', runId: 'run-1', target: childTarget as unknown as Window, input, scope: hostScope as unknown as Window, createId: () => `host-${++hostId}` });
  const disconnectHost = host.connect({ onComplete(output) { trace.push('complete'); return onComplete(output); }, onRequestExit() { trace.push('requestExit'); } });
  trace.push('host.connect');
  const app = createAppClient({ appId: 'game-card-reveal', scope: appScope as unknown as Window, targetOrigin: '*', instanceId: 'instance-1', createId: () => `app-${++appId}`, readyRetryMs: 1000 });
  const disconnectApp = app.connect();
  trace.push('app.connect');
  return { app, trace, hostScope, childScope, close() { disconnectApp(); app.dispose(); disconnectHost(); host.dispose(); trace.push('dispose'); } };
}

describe('S8 vendored SDK fake-host lifecycle', () => {
  it('v2 settlement batch reaches the same P5/result contract with mixed face geometry', async () => {
    const data = { presentationId: 'settlement-1', locale: 'zh-CN',
      pack: { packId: 'preview', title: '哈利·波特', coverImageUrl: null, titleLogoUrl: null },
      cards: [
        { id: 'event-1', kind: 'event', name: '纪念', description: '完成主线', rarity: 'epic', imageUrl: null, worldTitle: '哈利·波特' },
        { id: 'item-1', kind: 'item', name: '道具', description: '', rarity: 'rare', imageUrl: null, worldTitle: '哈利·波特' },
      ] };
    const fixture = connectedHost(data, () => ({ status: 'accepted' }), 2);
    try {
      const input = inputFromContract(await fixture.app.whenReady({ timeoutMs: 10_000 }));
      const session = new CardRevealSession(input.cards);
      expect(session.engine.world.getComponent<Shape>('card-0', 'Shape')).toMatchObject({ width: 260, height: 390 });
      expect(session.engine.world.getComponent<Shape>('card-1', 'Shape')).toMatchObject({ width: 390, height: 260 });
      session.tick(); session.action(ACTION.skip);
      for (let i = 0; i < stageTicks('standard', 2).total + 2 && session.view().status !== 'terminal'; i++) session.tick();
      expect(session.view()).toEqual({ status: 'terminal', phase: 'P5', completion: 'skipped' });
      const gate = new CompletionGate(input, false);
      gate.markP5Terminal('skipped');
      expect(await gate.complete((output) => fixture.app.complete(output))).toBe(true);
      expect(fixture.trace).toContain('complete');
    } finally { fixture.close(); }
  });
  for (const n of [1, 3, 5]) for (const completion of ['natural', 'skipped'] as const) {
    it(`N${n} ${completion}: connect → ready → real P5 → one accepted complete`, async () => {
      const fixture = connectedHost({ presentationId: `pack-${n}`, cards: cards(n) });
      try {
        const input = inputFromContract(await fixture.app.whenReady({ timeoutMs: 10_000 }));
        fixture.trace.push('ready');
        expect(input.cards.map((card) => card.id)).toEqual(cards(n).map((card) => card.id));
        const session = new CardRevealSession(input.cards);
        if (completion === 'skipped') { session.tick(); session.action(ACTION.skip); }
        for (let i = 0; i < stageTicks('standard', n).total + 2 && session.view().status !== 'terminal'; i++) session.tick();
        expect(session.view()).toEqual({ status: 'terminal', phase: 'P5', completion });
        const gate = new CompletionGate(input, false);
        gate.markP5Terminal(session.view().completion!);
        expect(await gate.complete((output) => fixture.app.complete(output))).toBe(true);
        expect(await gate.complete((output) => fixture.app.complete(output))).toBe(false);
        expect(fixture.trace).toEqual(['host.connect', 'app.connect', 'ready', 'complete']);
      } finally { fixture.close(); }
      expect(fixture.trace.at(-1)).toBe('dispose');
      expect(fixture.hostScope.count()).toBe(0);
      expect(fixture.childScope.count()).toBe(0);
    });
  }

  it('empty host data stays preview and requestExit is cancelled, never viewed', async () => {
    const fixture = connectedHost({});
    try {
      const envelope = await fixture.app.whenReady({ timeoutMs: 10_000 });
      expect(isEmptyPreview(envelope.data)).toBe(true);
      fixture.app.requestExit();
      await Promise.resolve(); await Promise.resolve();
      expect(fixture.trace).toContain('requestExit');
      expect(fixture.trace).not.toContain('complete');
    } finally { fixture.close(); }
  });

  it('host rejection retains the identical output for retry and accepts only once', async () => {
    let calls = 0;
    const outputs: AppContract[] = [];
    const fixture = connectedHost({ presentationId: 'retry', cards: cards(1) }, (output) => {
      outputs.push(output); calls++;
      return { status: calls === 1 ? 'rejected' : 'accepted' };
    });
    try {
      const input = inputFromContract(await fixture.app.whenReady({ timeoutMs: 10_000 }));
      const gate = new CompletionGate(input, false);
      gate.markP5Terminal('skipped');
      expect(await gate.complete((output) => fixture.app.complete(output))).toBe(false);
      gate.markP5Terminal('natural');
      expect(await gate.complete((output) => fixture.app.complete(output))).toBe(true);
      expect(await gate.complete((output) => fixture.app.complete(output))).toBe(false);
      expect(outputs).toHaveLength(2);
      expect(outputs[0]).toEqual(outputs[1]);
      expect(outputs[1].data).toEqual({ presentationId: 'retry', outcome: 'viewed', completion: 'skipped' });
    } finally { fixture.close(); }
  });

  it('pending acknowledgement cannot overlap and a rejected request retries the frozen output', async () => {
    let settle!: (answer: { status: 'accepted' | 'rejected' }) => void;
    let calls = 0;
    const outputs: AppContract[] = [];
    const fixture = connectedHost({ presentationId: 'pending', cards: cards(1) }, (output) => {
      outputs.push(output); calls++;
      return calls === 1 ? new Promise((resolve) => { settle = resolve; }) : { status: 'accepted' };
    });
    try {
      const input = inputFromContract(await fixture.app.whenReady({ timeoutMs: 10_000 }));
      const gate = new CompletionGate(input, false);
      gate.markP5Terminal('natural');
      const first = gate.complete((output) => fixture.app.complete(output));
      for (let i = 0; i < 10 && calls === 0; i++) await Promise.resolve();
      expect(calls).toBe(1);
      expect(await gate.complete((output) => fixture.app.complete(output))).toBe(false);
      expect(calls).toBe(1);
      settle({ status: 'rejected' });
      expect(await first).toBe(false);
      expect(await gate.complete((output) => fixture.app.complete(output))).toBe(true);
      expect(outputs).toHaveLength(2);
      expect(outputs[0]).toEqual(outputs[1]);
    } finally { fixture.close(); }
  });

  it('invalid host payload is rejected by the real parser, then exits without complete', async () => {
    const fixture = connectedHost({ presentationId: 'bad', cards: cards(1), extra: true });
    try {
      const envelope = await fixture.app.whenReady({ timeoutMs: 10_000 });
      expect(() => inputFromContract(envelope)).toThrow();
      fixture.app.requestExit();
      await Promise.resolve(); await Promise.resolve();
      expect(fixture.trace).toContain('requestExit');
      expect(fixture.trace).not.toContain('complete');
    } finally { fixture.close(); }
  });
});
