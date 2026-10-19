// @vitest-environment happy-dom
// 打字机逐字显（收编 VN DialogBox）：mountUI 挂载时把带 data-typewriter 的 Label 逐字揭示；teardown 清定时器。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountUI } from './server.js';
import type { LayoutNode } from './types.js';
import { validateLayoutNode } from './validate.js';

describe('UI Components · mountUI 打字机逐字显', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const tree: LayoutNode = {
    type: 'Panel', id: 'box', props: {}, children: [
      { type: 'Label', id: 'line', props: { text: '赤壁', typewriter: 20 } }, // 2 字 · 20ms/字
    ],
  };

  it('挂载后逐字揭示；满后停', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);
    const el = (): HTMLElement => host.querySelector('#line') as HTMLElement;

    expect(el().textContent).toBe(''); // 初始清空

    vi.advanceTimersByTime(20);
    expect(el().textContent).toBe('赤');   // 第 1 字

    vi.advanceTimersByTime(20);
    expect(el().textContent).toBe('赤壁');  // 第 2 字（满）

    vi.advanceTimersByTime(100);
    expect(el().textContent).toBe('赤壁');  // 满后不再变（interval 已清）

    teardown();
    host.remove();
  });

  it('teardown 清定时器（之后推进不再改 DOM）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const teardown = mountUI(host, tree);
    vi.advanceTimersByTime(20); // 揭 1 字
    teardown();                 // 清掉
    // teardown 后 host 已清空；再推进不应抛错/不应有定时器残留
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    host.remove();
  });

  it('StoryRef token 自然完成恰通知一次；首击显全不推进，次击推进', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const seen: string[] = [];
    const line: LayoutNode = { type: 'dialog', id: 'say', props: {
      text: '赤壁', typewriter: 20, typewriterSignal: { token: 'ch1:n1:rev1', action: 'story.presented' }, advanceAction: 'story.advance',
    } };
    const off = mountUI(host, line, { 'story.presented': arg => seen.push(`done:${arg}`), 'story.advance': () => seen.push('advance') });
    host.querySelector('#say')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(host.querySelector('#say-tx')!.textContent).toBe('赤壁');
    expect(seen).toEqual(['done:ch1:n1:rev1']);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual(['done:ch1:n1:rev1']);
    host.querySelector('#say')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen).toEqual(['done:ch1:n1:rev1', 'advance']);
    off(); host.remove();
  });

  it('自然结束后仅发一次；换行、回滚或读档重投影使旧 token 失效', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const seen: string[] = [];
    const line = (token: string, text: string): LayoutNode => ({ type: 'Label', id: 'say', props: {
      text, typewriter: 20, typewriterSignal: { token, action: 'story.presented' },
    } });
    const off = mountUI(host, line('ch1:n1:rev1', '旧句'), { 'story.presented': arg => seen.push(arg ?? '') });
    vi.advanceTimersByTime(20);
    off.update(line('ch1:n2:rev2', '新句'));
    vi.advanceTimersByTime(40);
    expect(seen).toEqual(['ch1:n2:rev2']);
    off.update(line('ch1:n1:rev3', '旧句'));
    vi.advanceTimersByTime(40);
    expect(seen).toEqual(['ch1:n2:rev2', 'ch1:n1:rev3']);
    vi.advanceTimersByTime(100);
    expect(seen).toHaveLength(2);
    off(); host.remove();
  });

  it('受限信号校验拒绝无速度、额外字段与自由动作', () => {
    const good: LayoutNode = { type: 'Label', id: 'say', props: { text: 'a', typewriter: 20,
      typewriterSignal: { token: 'ch1:n1:rev1', action: 'story.presented' } } };
    expect(validateLayoutNode(good)).toEqual([]);
    expect(validateLayoutNode({ ...good, props: { ...good.props, typewriter: -1 } }).some(i => i.kind === 'bad-typewriter-signal')).toBe(true);
    expect(validateLayoutNode({ ...good, props: { ...good.props, typewriter: 0 } })).toEqual([]);
    expect(validateLayoutNode({ ...good, props: { ...good.props, typewriterSignal: { token: 'x', action: 'x;evil' } } }).some(i => i.kind === 'bad-typewriter-signal')).toBe(true);
    expect(validateLayoutNode({ ...good, props: { ...good.props, spans: [{ text: 'a' }] } }).some(i => i.kind === 'bad-typewriter-signal')).toBe(true);
  });

  it('0ms 与空句立即显示并各通知一次，旧 0ms 无信号路径不变', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const seen: string[] = [];
    const line = (text: string, ms: number, token: string): LayoutNode => ({ type: 'Label', id: 'line', props: {
      text, typewriter: ms, typewriterSignal: { token, action: 'story.presented' },
    } });
    const off = mountUI(host, line('立即', 0, 'g1'), { 'story.presented': arg => seen.push(arg ?? '') });
    expect(host.querySelector('#line')!.textContent).toBe('立即');
    expect(seen).toEqual(['g1']);
    off.update(line('', 20, 'g2'));
    expect(seen).toEqual(['g1', 'g2']);
    vi.advanceTimersByTime(200);
    expect(seen).toEqual(['g1', 'g2']);
    off(); host.remove();
    expect(validateLayoutNode({ type: 'Label', id: 'old', props: { text: '旧', typewriter: 0 } })).toEqual([]);
  });

  it('无本地 handler 时走 ActionSink；卸载后旧 token 不再通知', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const received: Array<[string, unknown]> = [];
    const line: LayoutNode = { type: 'Label', id: 'line', props: { text: '🔑好', typewriter: 20,
      typewriterSignal: { token: 'chapter:node:g1', action: 'story.presented' } } };
    const off = mountUI(host, line, {}, undefined, { enqueueAction: (action, payload) => received.push([action, payload]) });
    vi.advanceTimersByTime(20);
    expect(host.querySelector('#line')!.textContent).toBe('🔑');
    off();
    vi.advanceTimersByTime(100);
    expect(received).toEqual([]);
    host.remove();
  });
});
