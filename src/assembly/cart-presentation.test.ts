import { describe, expect, it } from 'vitest';
import { parseCartPresentation } from './cart-presentation.js';
import { parseManifestDetailed } from './manifest.js';
import type { EntityBlueprint } from './demo.assembly.js';
import { Engine } from '../runtime/engine.js';

const entities: Record<string, EntityBlueprint> = {
  score: { Resource: { id: 'score', current: 1, min: 0, max: 5 } },
  phase: { GameFlow: { id: 'scene', current: 'open', states: [{ id: 'open' }] } },
  flag: { Flag: { id: 'ready', active: true } },
  action: { KeyBinding: { key: 'inspect', signal: 'inspect', phase: 'action' } },
  hotspot: { Transform: { x: 15, y: 20 }, Clickable: { action: 'inspect', phase: 'down' } },
};

function presentation() {
  return {
    viewport: { width: 1440, height: 900 }, theme: 'apolloOnyx',
    flags: { selected: { kind: 'resource-equals', id: 'score', value: 1 }, opened: { kind: 'flow-is', id: 'scene', value: 'open' } },
    ui: { type: 'Panel', id: 'root', props: {}, children: [
      { type: 'Label', id: 'score-label', props: { text: 'Score ', bind: 'score' }, visibleWhen: 'opened' },
      { type: 'Button', id: 'go', props: { label: 'Inspect', action: 'inspect' }, visibleWhen: 'selected' },
    ] },
  };
}

describe('data cartridge presentation opt-in', () => {
  it('accepts strict house UI and keeps presentation out of WorldBlueprint/hash input', () => {
    const raw = { capabilities: ['f1-resource', 'f2-flag', 't2-keybind', 't3-flow'], entities, presentation: presentation() };
    const parsed = parseManifestDetailed(raw);
    expect(parsed.presentation?.viewport).toEqual({ width: 1440, height: 900 });
    expect(parsed.blueprint).not.toHaveProperty('presentation');
    const legacy = parseManifestDetailed({ capabilities: raw.capabilities, entities });
    expect(parsed.blueprint.entities).toEqual(legacy.blueprint.entities);
    const hash = (blueprint: typeof parsed.blueprint) => { const e = new Engine(); e.load(blueprint); e.world.tick(); e.world.tick(); return e.hash(); };
    expect(hash(parsed.blueprint)).toBe(hash(legacy.blueprint));
  });

  it('no presentation means no changed legacy contract', () => {
    expect(parseCartPresentation(undefined, entities)).toBeUndefined();
  });

  it('accepts declared keyboard focus mirrors and contextual Escape only for real actions/flags', () => {
    const parsed = parseCartPresentation({ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Inspect hotspot', action: 'inspect', when: 'ready' }], shortcuts: [{ key: 'Escape', action: 'inspect', when: 'opened' }], pointerFeedback: { tone: 'cyan', pressedMs: 145 } }, entities);
    expect(parsed?.focusTargets?.[0].entity).toBe('hotspot');
    expect(parsed?.shortcuts?.[0].key).toBe('Escape');
    expect(parsed?.pointerFeedback).toEqual({ tone: 'cyan', pressedMs: 145 });
  });

  it('accepts bounded above-label geometry and per-target tone without changing WorldBlueprint', () => {
    const opts = { ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Inspect hotspot', action: 'inspect', labelPlacement: 'above', labelGap: 8, labelSize: 14, tone: 'gold' }], pointerFeedback: { tone: 'cyan', pressedMs: 145 } };
    const parsed = parseManifestDetailed({ capabilities: ['f1-resource', 'f2-flag', 't2-keybind', 't3-flow'], entities, presentation: opts });
    expect(parsed.presentation?.focusTargets?.[0]).toEqual({ entity: 'hotspot', label: 'Inspect hotspot', action: 'inspect', labelPlacement: 'above', labelGap: 8, labelSize: 14, tone: 'gold' });
    expect(parsed.blueprint).not.toHaveProperty('presentation');
  });

  it('accepts installed YaHei slot and bounded render-local pointer optics without changing blueprint', () => {
    const opts = { ...presentation(), font: 'system-yahei', focusTargets: [{ entity: 'hotspot', label: 'Inspect', action: 'inspect' }],
      pointerFeedback: { tone: 'cyan', pressedMs: 145, visual: { colors: { cyan: '#40dce8' }, hoverAlpha: 0.24, pressedAlpha: 0.6, hoverGlowBlur: 9, pressedGlowBlur: 15, pressedBrightness: 1.45 } } };
    const parsed = parseManifestDetailed({ capabilities: ['f1-resource', 'f2-flag', 't2-keybind', 't3-flow'], entities, presentation: opts });
    expect(parsed.presentation?.font).toBe('system-yahei');
    expect(parsed.presentation?.pointerFeedback?.visual).toEqual(opts.pointerFeedback.visual);
    expect(parsed.blueprint).not.toHaveProperty('presentation');
  });

  it('checks node-valued prop subtrees and rejects bindings the runtime cannot project', () => {
    const staticBack = { ...presentation(), ui: { type: 'PlayingCard', id: 'card', props: { rank: 'A', suit: '♠',
      backFace: { type: 'Label', id: 'card-back', props: { text: 'Evidence' } },
    } } };
    expect(parseCartPresentation(staticBack, entities)?.ui.id).toBe('card');
    const dynamicBack = { ...presentation(), ui: { type: 'PlayingCard', id: 'card', props: { rank: 'A', suit: '♠',
      backFace: { type: 'Label', id: 'card-back', props: { text: 'Score ', bind: 'score' } },
    } } };
    expect(() => parseCartPresentation(dynamicBack, entities)).toThrow(/node 型 props 暂不支持/);
    const nestedDynamicBack = { ...presentation(), ui: { type: 'PlayingCard', id: 'card', props: { rank: 'A', suit: '♠',
      backFace: { type: 'Panel', id: 'card-back', props: {}, children: [
        { type: 'Label', id: 'card-back-score', props: { text: 'Score ', bind: 'score' } },
      ] },
    } } };
    expect(() => parseCartPresentation(nestedDynamicBack, entities)).toThrow(/node 型 props 暂不支持/);
    const duplicateBack = { ...presentation(), ui: { type: 'PlayingCard', id: 'card', props: { rank: 'A', suit: '♠',
      backFace: { type: 'Label', id: 'card', props: { text: 'Duplicate' } },
    } } };
    expect(() => parseCartPresentation(duplicateBack, entities)).toThrow(/重复节点 id/);
  });

  it.each([
    [{ ...presentation(), viewport: { width: 0, height: 900 } }, /viewport/],
    [{ ...presentation(), theme: 'customCss' }, /theme/],
    [{ ...presentation(), font: 'url(remote-font.woff)' }, /font/],
    [{ ...presentation(), flags: { selected: { kind: 'resource-equals', id: 'missing', value: 1 } } }, /Resource 不存在/],
    [{ ...presentation(), ui: { type: 'Button', id: 'x', props: { label: 'x', action: 'unknown' } } }, /KeyBinding/],
    [{ ...presentation(), ui: { type: 'Label', id: 'x', props: { text: 'x', bind: 'missing' } } }, /无 Resource/],
    [{ ...presentation(), ui: { type: 'Panel', id: 'x', props: { style: 'position:fixed' } } }, /DOM\/CSS/],
    [{ ...presentation(), ui: { type: 'NoSuchWidget', id: 'x', props: {} } }, /未知组件/],
    [{ ...presentation(), ui: { type: 'Panel', id: 'x', props: {}, children: [{ type: 'Label', id: 'x', props: { text: 'duplicate' } }] } }, /重复节点 id/],
    [{ ...presentation(), shortcuts: [{ key: 'Escape', action: 'missing' }] }, /KeyBinding/],
    [{ ...presentation(), focusTargets: [{ entity: 'score', label: 'Score', action: 'inspect' }] }, /Transform\/Clickable/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'other' }] }, /Clickable.action 不同/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect', labelPlacement: 'bottom' }] }, /labelPlacement/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect', labelGap: 8 }] }, /labelGap/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect', labelPlacement: 'above', labelGap: Infinity }] }, /JSON 数据|labelGap/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect', labelSize: 33 }] }, /labelSize/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect', tone: 'red;display:none' }] }, /tone/],
    [{ ...presentation(), pointerFeedback: { tone: 'cyan', pressedMs: 145 } }, /需要至少一个 focusTargets/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect' }], pointerFeedback: { tone: 'raw-css', pressedMs: 145 } }, /语义色闭集/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect' }], pointerFeedback: { tone: 'cyan', pressedMs: 5000 } }, /1\.\.300/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect' }], pointerFeedback: { tone: 'cyan', pressedMs: 145, visual: { colors: { cyan: 'url(x)' } } } }, /colors\.cyan/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect' }], pointerFeedback: { tone: 'cyan', pressedMs: 145, visual: { hoverAlpha: 2 } } }, /hoverAlpha/],
    [{ ...presentation(), focusTargets: [{ entity: 'hotspot', label: 'Hotspot', action: 'inspect' }], pointerFeedback: { tone: 'cyan', pressedMs: 145, visual: { pressedBrightness: 3 } } }, /pressedBrightness/],
  ])('rejects malformed opt-in presentation before runtime load', (bad, reason) => {
    expect(() => parseCartPresentation(bad, entities)).toThrow(reason);
  });
});
