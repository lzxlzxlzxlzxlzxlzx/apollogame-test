// GA 棋枰全量数据化重写撞到的 3 个 UI 缺口（owner 2026-06-28 推翻豁免后）·主程裁决：
//  ① REQ-UI-容器可点：Panel.action（组合容器可点·棋盘格/门）——接受。
//  ② REQ-UI-fx源泉消退：fx kind 'fade'（半透明淡出消失）——接受（owner 点名）。
//  ③ REQ-UI-fx控件叠层②：导出 ensureUiKeyframes（renderNode-only 屏自注入·不再隐式依赖 mountUI）——接受。
//    （①data-fx 不达控件 = 误诊，实测已落 <button>·见 ui-fx 既有覆盖·此处不重复。）
import { describe, it, expect } from 'vitest';
import { renderNode, validateLayoutNode, ensureUiKeyframes } from './index.js';
import type { LayoutNode } from './index.js';

describe('① Panel.action —— 组合容器可点（棋枰格/门/卡片区）', () => {
  it('有 action → 整个容器渲 data-action + data-arg + cursor:pointer', () => {
    const h = renderNode({ type: 'Panel', id: 'slot', props: { bare: true, action: 'deploy', actionArg: 'lane2-cell5' }, children: [{ type: 'Label', id: 'l', props: { text: '兵' } }] } as LayoutNode);
    expect(h).toContain('data-action="deploy"');
    expect(h).toContain('data-arg="lane2-cell5"');
    expect(h).toContain('cursor:pointer');
    expect(h).toContain('id="l"'); // children 仍在
  });
  it('无 action → 不渲 data-action（向后兼容）', () => {
    expect(renderNode({ type: 'Panel', id: 'p', props: { bare: true } } as LayoutNode)).not.toContain('data-action');
  });
  it('catalog + 校验器认 Panel.action（合法零 issue）', () => {
    expect(validateLayoutNode({ type: 'Panel', id: 'p', props: { action: 'x' } } as LayoutNode)).toEqual([]);
  });
});

describe('② fx kind fade —— 半透明淡出消失', () => {
  it('fade → opacity 淡出动画（forwards 停末态）', () => {
    const h = renderNode({ type: 'Panel', id: 'seg', props: { bare: true }, layout: { fx: [{ kind: 'fade', ms: 500 }] } } as LayoutNode);
    expect(h).toMatch(/animation:apollo-fx-fade \d+ms ease-out forwards/);
  });
  it('校验器认 fade（闭集已含）', () => {
    expect(validateLayoutNode({ type: 'Panel', id: 'p', layout: { fx: [{ kind: 'fade' }] } } as LayoutNode)).toEqual([]);
  });
});

describe('③ ensureUiKeyframes —— renderNode-only 屏自注入关键帧（幂等·含 fx CSS）', () => {
  it('幂等注入一次 + 内容含 fx/anim 关键帧与皮肤 Slider 的 reduced-motion 覆盖', () => {
    const made: Array<{ id: string; textContent: string }> = [];
    const byId: Record<string, { id: string; textContent: string }> = {};
    const fakeDoc = {
      getElementById: (id: string) => byId[id] ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: (el: { id: string; textContent: string }) => { byId[el.id] = el; made.push(el); } },
    } as unknown as Document;
    ensureUiKeyframes(fakeDoc);
    ensureUiKeyframes(fakeDoc); // 再调 → 幂等不重复
    expect(made.length).toBe(1);
    expect(made[0]!.textContent).toContain('apollo-fx-fade');
    expect(made[0]!.textContent).toContain('apollo-fx-flash');
    expect(made[0]!.textContent).toContain('data-fx~="sheen"');
    expect(made[0]!.textContent).toContain('prefers-reduced-motion:reduce');
    expect(made[0]!.textContent).toContain('[data-skin-slider-thumb]');
  });
});
