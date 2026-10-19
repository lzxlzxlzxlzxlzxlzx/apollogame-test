// @vitest-environment happy-dom
// GAL-PUI-03B：闭集 Panel.wheel → ActionSink；真实 WheelEvent 不交给 GAL 宿主自由监听。
import { describe, expect, it } from 'vitest';
import { mountUI } from './server.js';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';
import type { ActionSink, LayoutNode } from './types.js';

type Spy = ActionSink & { calls: string[] };
const spySink = (): Spy => ({ calls: [], enqueueAction(name) { this.calls.push(name); } });
const wheelTree = (children: LayoutNode[] = []): LayoutNode => ({
  type: 'Panel', id: 'story', props: { wheel: { upAction: 'narrative.back', downAction: 'narrative.advance' } },
  children: [{ type: 'Label', id: 'story-copy', props: { text: '剧情正文' } }, ...children],
});
const fireWheel = (el: HTMLElement, deltaY: number, deltaMode = 0): WheelEvent => {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaMode });
  el.dispatchEvent(event);
  return event;
};

describe('Panel.wheel closed ActionSink binding', () => {
  it('renders only declared directions and validates the binding shape', () => {
    const html = renderNode(wheelTree());
    expect(html).toContain('data-wheel-region');
    expect(html).toContain('data-wheel-up="narrative.back"');
    expect(html).toContain('data-wheel-down="narrative.advance"');
    expect(validateLayoutNode(wheelTree())).toEqual([]);
    expect(validateLayoutNode({ type: 'Panel', id: 'bad', props: { wheel: {} } } as LayoutNode)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'bad-wheel-binding' }),
    ]));
  });

  it('normalizes physical wheel directions into exactly one ActionSink action', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const sink = spySink(); const handle = mountUI(host, wheelTree(), {}, undefined, sink);
    const story = host.querySelector<HTMLElement>('#story')!;
    expect(fireWheel(story, -120).defaultPrevented).toBe(true);
    expect(fireWheel(story, 120).defaultPrevented).toBe(true);
    expect(sink.calls).toEqual(['narrative.back', 'narrative.advance']);
    handle(); host.remove();
  });

  it('coalesces small trackpad deltas and leaves zero delta untouched', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const sink = spySink(); const handle = mountUI(host, wheelTree(), {}, undefined, sink);
    const story = host.querySelector<HTMLElement>('#story')!;
    expect(fireWheel(story, 0).defaultPrevented).toBe(false);
    fireWheel(story, 20); fireWheel(story, 20);
    expect(sink.calls).toEqual([]);
    fireWheel(story, 20);
    expect(sink.calls).toEqual(['narrative.advance']);
    handle(); host.remove();
  });

  it('gives scroll children and open modals priority, then cleans up on teardown', () => {
    const scroll: LayoutNode = { type: 'Panel', id: 'history', props: { scroll: true }, children: [{ type: 'Label', id: 'history-row', props: { text: '历史行' } }] };
    const modal: LayoutNode = { type: 'Modal', id: 'modal', props: { closeAction: 'close' }, children: [{ type: 'Label', id: 'modal-copy', props: { text: '确认' } }] };
    const host = document.createElement('div'); document.body.appendChild(host);
    const sink = spySink(); const handle = mountUI(host, wheelTree([scroll, modal]), {}, undefined, sink);
    const row = host.querySelector<HTMLElement>('#history-row')!;
    const story = host.querySelector<HTMLElement>('#story')!;
    expect(fireWheel(row, 120).defaultPrevented).toBe(false);
    expect(fireWheel(story, 120).defaultPrevented).toBe(false);
    expect(sink.calls).toEqual([]);
    handle();
    fireWheel(story, 120);
    expect(sink.calls).toEqual([]);
    host.remove();
  });

  it('does not steal a wheel region nested inside a scrolling ancestor', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const sink = spySink();
    const outer: LayoutNode = {
      type: 'Panel', id: 'outer-scroll', props: { scroll: true },
      children: [wheelTree()],
    };
    const handle = mountUI(host, outer, {}, undefined, sink);
    const story = host.querySelector<HTMLElement>('#story')!;
    expect(fireWheel(story, 120).defaultPrevented).toBe(false);
    expect(sink.calls).toEqual([]);
    handle(); host.remove();
  });
});
