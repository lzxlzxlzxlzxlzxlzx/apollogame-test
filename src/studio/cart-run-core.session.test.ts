// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBlueprintInto, type CartHostVisualSession, type CartTerminalSnapshot } from './cart-run-core.js';
import type { WorldBlueprint } from '../assembly/demo.assembly.js';

const blueprint = (entities: WorldBlueprint['entities'] = {}): WorldBlueprint => ({ capabilities: [], entities });

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('runBlueprintInto — host visual session and terminal boundary', () => {
  it('binds the validated host session to probe and formal World, then disposes it on stop', () => {
    const div = document.createElement('div');
    document.body.append(div);
    const unbind = vi.fn();
    const session: CartHostVisualSession = { bindWorld: vi.fn(() => unbind), dispose: vi.fn() };
    const snapshots: CartTerminalSnapshot[] = [];

    const stop = runBlueprintInto(div, blueprint({
      case: { GameFlow: { id: 'investigation', current: 'active' } },
      ledger: { Resource: { id: 'required-clues', current: 1, min: 0, max: 3 } },
      marker: { Flag: { id: 'letter-collected', active: true } },
      private: { Resource: { id: 'unselected', current: 99, min: 0, max: 99 } },
    }), { w: 1440, h: 900 }, undefined, undefined, {
      hostVisualSession: session,
      terminal: {
        flowIds: ['investigation'], resourceIds: ['required-clues'], flagIds: ['letter-collected'],
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      },
    });

    expect(session.bindWorld).toHaveBeenCalledTimes(2);
    expect(unbind).toHaveBeenCalledTimes(1); // probe is unbound once its fail-fast load has passed
    expect(snapshots).toEqual([{
      flows: [{ id: 'investigation', current: 'active' }],
      resources: [{ id: 'required-clues', current: 1, min: 0, max: 3 }],
      flags: [{ id: 'letter-collected', active: true }],
    }]);
    expect(Object.isFrozen(snapshots[0])).toBe(true);
    expect(JSON.stringify(snapshots[0])).not.toContain('unselected');

    stop();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(unbind).toHaveBeenCalledTimes(2); // formal World is released by session.dispose
    expect(div.innerHTML).toBe('');
  });

  it('fails closed and disposes the host session when the session rejects probe binding', () => {
    const div = document.createElement('div');
    document.body.append(div);
    const session: CartHostVisualSession = { bindWorld: vi.fn(() => { throw new Error('host mask bind failed'); }), dispose: vi.fn() };

    expect(() => runBlueprintInto(div, blueprint(), undefined, undefined, undefined, {
      hostVisualSession: session,
    })).toThrow('host mask bind failed');
    expect(session.bindWorld).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(div.innerHTML).toBe('');
  });

  it('does not install input listeners when formal host binding rejects after probe validation', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const div = document.createElement('div');
    document.body.append(div);
    let binds = 0;
    const session: CartHostVisualSession = {
      bindWorld: vi.fn(() => {
        binds += 1;
        if (binds === 2) throw new Error('formal host bind failed');
        return () => {};
      }),
      dispose: vi.fn(),
    };

    expect(() => runBlueprintInto(div, blueprint({ player: { Controllable: { playerId: 'p1' } } }), undefined, undefined, undefined, {
      hostVisualSession: session,
    })).toThrow('formal host bind failed');
    expect(session.bindWorld).toHaveBeenCalledTimes(2);
    expect(add.mock.calls.filter(([name]) => ['keydown', 'keyup', 'blur'].includes(name))).toHaveLength(0);
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(div.innerHTML).toBe('');
  });

  it('rejects an unscoped terminal rather than exposing a whole World snapshot', () => {
    const div = document.createElement('div');
    document.body.append(div);
    const session: CartHostVisualSession = { bindWorld: vi.fn(() => () => {}), dispose: vi.fn() };

    expect(() => runBlueprintInto(div, blueprint(), undefined, undefined, undefined, {
      hostVisualSession: session,
      terminal: { onSnapshot: () => {} },
    })).toThrow('cart terminal requires at least one declared id');
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it('cleans up installed input listeners when the initial terminal callback rejects', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const div = document.createElement('div');
    document.body.append(div);

    expect(() => runBlueprintInto(div, blueprint({
      player: { Controllable: { playerId: 'p1' } },
      selected: { Flag: { id: 'selected', active: true } },
    }), undefined, undefined, undefined, {
      terminal: { flagIds: ['selected'], onSnapshot: () => { throw new Error('terminal rejected'); } },
    })).toThrow('terminal rejected');

    const installed = add.mock.calls.filter(([name]) => ['keydown', 'keyup', 'blur'].includes(name));
    expect(installed).toHaveLength(3);
    for (const [name, handler] of installed) {
      expect(remove.mock.calls.some(([removedName, removedHandler]) => name === removedName && handler === removedHandler)).toBe(true);
    }
    expect(div.innerHTML).toBe('');
  });
});
