import { describe, expect, it } from 'vitest';
import { renderNode } from './render.js';
import { validateLayoutNode } from './validate.js';

const skin = '/art/skin.png';

describe('non-9-slice skin layer contract', () => {
  it('renders the V2 dialogue scale and button pseudo-layer without changing legacy cover', () => {
    const panel = renderNode({ type: 'Panel', id: 'dialogue', props: { skin, skinSize: { x: 100, y: 160 }, skinPosition: 'center' }, children: [] });
    const button = renderNode({ type: 'Button', id: 'button', props: { label: '选项', skin, skinSize: { x: 100, y: 220 }, skinPosition: 'center', skinOutset: { x: 8, y: 5 } } });
    expect(panel).toContain("background:url('/art/skin.png') center/100% 160% no-repeat");
    expect(button).toContain('data-ui-skin-layer');
    expect(button).toContain('inset:-5px -8px');
    expect(button).toContain("center/100% 220% no-repeat");
    expect(renderNode({ type: 'Button', id: 'legacy', props: { label: '旧', skin } })).toContain("background:url('/art/skin.png') center/cover no-repeat");
  });
  it('rejects detached, sliced, free-position and unsafe layer input', () => {
    const invalid = [
      { skinSize: { x: 100, y: 160 } }, { skin, skinSlice: 8, skinSize: { x: 100, y: 160 } },
      { skin, skinSize: { x: 100, y: 160 }, skinPosition: 'left' }, { skin, skinSize: { x: 100, y: 0 } },
      { skin, skinSize: { x: 100, y: 160 }, skinOutset: { x: -1, y: 5 } },
    ];
    for (const props of invalid) expect(validateLayoutNode({ type: 'Button', id: 'bad', props: { label: 'x', ...props } } as never).some((i) => i.kind === 'bad-skin-layer')).toBe(true);
  });
  it('does not add a layout wrapper around Panel children', () => {
    const html = renderNode({ type: 'Panel', id: 'p', props: { skin, skinSize: { x: 100, y: 160 }, skinOutset: { x: 8, y: 5 } }, layout: { direction: 'column' }, children: [{ type: 'Label', id: 'copy', props: { text: '正文' } }, { type: 'Button', id: 'normal', props: { label: '按钮' } }] });
    expect(html).toContain('isolation:isolate');
    expect(html).toContain('z-index:-1');
    expect(html).not.toContain('z-index:1"><span id="copy"');
  });
});

describe('Modal.titleColor', () => {
  it('uses LabelColor safely while retaining title semantics and legacy fallback', () => {
    const custom = renderNode({ type: 'Modal', id: 'm', props: { title: '标题', titleColor: { custom: '#F4EEFF' } }, children: [] });
    expect(validateLayoutNode({ type: 'Modal', id: 'm', props: { title: '标题', titleColor: { custom: '#F4EEFF' } }, children: [] })).toEqual([]);
    expect(custom).toContain('aria-labelledby="m-title"');
    expect(custom).toContain('color:#F4EEFF');
    expect(renderNode({ type: 'Modal', id: 'old', props: { title: '标题' }, children: [] })).toContain('color:#e6e6f4');
  });
  it('rejects naked or injected title colors', () => {
    for (const titleColor of ['#fff', { custom: '#fff;color:red' }]) {
      expect(validateLayoutNode({ type: 'Modal', id: 'm', props: { title: 'x', titleColor }, children: [] } as never).length).toBeGreaterThan(0);
    }
  });
});

describe('Button.labelColor', () => {
  it('changes only the explicit native Button text color while retaining ghost, action, disabled and skin-off semantics', () => {
    const node = { type: 'Button' as const, id: 'ghost', props: {
      label: '工具栏', kind: 'ghost' as const, skin: '', labelColor: { custom: '#F4EEFF' },
      action: 'story.auto', disabled: true,
    } };
    const html = renderNode(node);
    expect(validateLayoutNode(node)).toEqual([]);
    expect(html).toContain('background:rgba(255,255,255,0.03);color:');
    expect(html).toContain('border:1px solid');
    expect(html).toContain(';color:#F4EEFF');
    expect(html).toContain('data-action="story.auto"');
    expect(html).toContain(' disabled');
    expect(html).not.toContain('data-apollo-skin');
  });

  it('keeps the legacy Button output when labelColor is omitted and accepts semantic tokens', () => {
    const legacy = renderNode({ type: 'Button', id: 'old', props: { label: '旧 ghost', kind: 'ghost', skin: '' } });
    const colored = renderNode({ type: 'Button', id: 'gold', props: { label: '金色', kind: 'ghost', labelColor: 'gold' } });
    expect(legacy).toContain('color:#9b9ec2');
    expect(legacy).not.toContain('data-apollo-skin');
    expect(colored).toContain(';color:#d4bd8a');
    expect(validateLayoutNode({ type: 'Button', id: 'gold', props: { label: '金色', labelColor: 'gold' } })).toEqual([]);
  });

  it('rejects naked, injected, empty and multi-key button label colors', () => {
    for (const labelColor of ['#F4EEFF', { custom: '#fff;color:red' }, { custom: ' ' }, { custom: '#fff', extra: true }]) {
      const issues = validateLayoutNode({ type: 'Button', id: 'bad', props: { label: 'x', labelColor } } as never);
      expect(issues.some((issue) => issue.kind === 'bad-custom-color' || issue.kind === 'bad-enum')).toBe(true);
    }
  });
});
