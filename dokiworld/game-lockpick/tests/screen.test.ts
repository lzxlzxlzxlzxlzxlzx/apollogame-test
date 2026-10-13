import { describe, expect, it } from 'vitest';
import { validateLayoutNode, type LayoutNode } from '@zerocraft/engine/ui/components/index.js';
import { buildLockpickErrorScreen, buildLockpickScreen } from '../../../games/game-lockpick/lockpick-screen.js';
import { projectLockpick } from '../../../games/game-lockpick/presentation.js';
import { LockpickSession } from '../../../games/game-lockpick/session.js';

function find(root: LayoutNode, id: string): LayoutNode | undefined { if (root.id === id) return root; for (const child of root.children ?? []) { const found = find(child, id); if (found) return found; } return undefined; }
describe('lockpick LayoutNode projection', () => {
  it.each(['easy', 'normal', 'hard'] as const)('validates %s without exposing a numeric match count', (difficulty) => {
    const session = new LockpickSession(difficulty, 9); const tree = buildLockpickScreen(projectLockpick(session.state()));
    expect(validateLayoutNode(tree)).toEqual([]);
    expect(JSON.stringify(tree)).not.toContain('matchCount');
    expect(find(tree, 'lockpick-tumblers')?.children?.filter((node) => node.type === 'Panel')).toHaveLength(session.state().slotCount);
  });
  it('uses one aggregate-only relay rotor and no signal-light layers', () => {
    const session = new LockpickSession('easy', 9);
    const view = projectLockpick(session.state());
    const rotor = find(buildLockpickScreen(view), 'lockpick-relay-rotor');
    expect(rotor?.props).toMatchObject({ src: expect.stringContaining('lockpick-relay-rotor-retro.png') });
    expect(find(buildLockpickScreen(view), 'lockpick-feedback-lamp-art')).toBeUndefined();
  });
  it('only the confirmation action can give up and terminal states disable but retain tumblers', () => {
    const session = new LockpickSession('easy', 3);
    const confirm = buildLockpickScreen(projectLockpick(session.state()), true);
    expect(find(confirm, 'lockpick-confirm')?.props).toMatchObject({ action: 'lockpick.ui.confirm-give-up' });
    session.giveUp(); session.tick();
    const terminal = buildLockpickScreen(projectLockpick(session.state()));
    expect(find(terminal, 'lockpick-tumblers')).toBeDefined();
    expect(find(terminal, 'lockpick-slider-0')?.props).toMatchObject({ disabled: true });
    expect(find(terminal, 'lockpick-give-up')).toBeUndefined();
  });
  it('renders invalid host configuration as a LayoutNode error screen', () => expect(validateLayoutNode(buildLockpickErrorScreen('bad input'))).toEqual([]));
  it('consumes the shared thumb-only Slider over the matching fixed three-rail board', () => {
    const session = new LockpickSession('easy', 3);
    const tree = buildLockpickScreen(projectLockpick(session.state()));
    const slider = find(tree, 'lockpick-slider-0');
    expect(slider?.type).toBe('Slider');
    expect(slider?.props).toMatchObject({
      min: 0, max: 2, step: 1, thumbSize: 64, trackHeight: 64, thumbInset: 32, releaseSnap: true, motionMs: 150,
      thumbSkin: expect.stringContaining('lockpick-knob-retro.png'),
    });
    expect(find(tree, 'lockpick-console-frame-art')?.props).toMatchObject({ src: expect.stringContaining('lockpick-console-frame-3-retro.png') });
    expect(find(tree, 'lockpick-slot-name-0')).toBeUndefined();
    expect(find(tree, 'lockpick-tumbler-0')?.props).toMatchObject({ bare: true });
  });
});
