// @vitest-environment happy-dom
// GAL-PUI-02B：Modal 的大框闭集与完整键盘/焦点合同。
import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { mountUI } from './server.js';
import { validateLayoutNode } from './validate.js';
import type { LayoutNode } from './types.js';

const modal = (props: Record<string, unknown> = {}): LayoutNode => ({
  type: 'Modal', id: 'modal', props: { title: '确认操作', closeAction: 'close', ...props }, children: [
    { type: 'Button', id: 'cancel', props: { label: '取消', action: 'close' } },
    { type: 'Button', id: 'confirm', props: { label: '确定', action: 'confirm' } },
  ],
});

function key(target: HTMLElement, keyName: string, shiftKey = false): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, shiftKey, bubbles: true, cancelable: true }));
}

describe('Modal closed sizes and dialog semantics', () => {
  it('keeps sm/md/lg widths and adds xl / wide as fixed closed sizes', () => {
    expect(renderNode(modal({ size: 'sm' }))).toContain('width:320px');
    expect(renderNode(modal({ size: 'md' }))).toContain('width:460px');
    expect(renderNode(modal({ size: 'lg' }))).toContain('width:640px');
    expect(renderNode(modal({ size: 'xl' }))).toContain('width:800px');
    const wide = renderNode(modal({ size: 'wide', skin: '/art/frame.png', skinSlice: 18 }));
    expect(wide).toContain('width:1080px');
    expect(wide).toContain('min-height:610px');
    expect(wide).toContain('box-sizing:border-box');
    expect(wide).toContain("border-image:url('/art/frame.png') 18 fill / 18px / 0 stretch");
  });

  it('renders labelled modal dialog semantics and accepts only closed size tokens', () => {
    const html = renderNode(modal({ size: 'xl' }));
    expect(html).toContain('data-modal-scrim');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="modal-title"');
    expect(validateLayoutNode(modal({ size: 'wide' }))).toEqual([]);
    expect(validateLayoutNode(modal({ size: 'freeform' }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'bad-enum' }),
    ]));
  });
});

describe('Modal mountUI keyboard and focus contract', () => {
  it('moves focus in, traps Tab in the dialog, and sends Escape through closeAction', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const host = document.createElement('div');
    document.body.appendChild(host);
    let closed = 0;
    const teardown = mountUI(host, modal(), { close: () => { closed++; } });
    const x = host.querySelector<HTMLElement>('button[aria-label="close"]')!;
    const cancel = host.querySelector<HTMLElement>('#cancel')!;
    const confirm = host.querySelector<HTMLElement>('#confirm')!;
    expect(document.activeElement).toBe(x);

    confirm.focus();
    key(confirm, 'Tab');
    expect(document.activeElement).toBe(x);
    x.focus();
    key(x, 'Tab', true);
    expect(document.activeElement).toBe(confirm);
    key(confirm, 'Escape');
    expect(closed).toBe(1);

    teardown(); host.remove(); trigger.remove();
    expect(cancel).toBeTruthy();
  });

  it('returns focus after data state closes the dialog and blocks background clicks', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const closed: LayoutNode = { type: 'Panel', id: 'root', props: {}, children: [
      { type: 'Button', id: 'background', props: { label: '背景', action: 'background' } },
    ] };
    const opened: LayoutNode = { ...closed, children: [...closed.children!, modal()] };
    const host = document.createElement('div');
    document.body.appendChild(host);
    let background = 0;
    const handle = mountUI(host, closed, { background: () => { background++; } });
    trigger.focus();
    handle.update(opened);
    const bg = host.querySelector<HTMLElement>('#background')!;
    bg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(background).toBe(0);
    handle.update(closed);
    expect(document.activeElement).toBe(trigger);

    handle(); host.remove(); trigger.remove();
  });
});
