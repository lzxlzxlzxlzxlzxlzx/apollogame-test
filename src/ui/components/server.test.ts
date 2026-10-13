import { describe, it, expect } from 'vitest';
import { renderNode } from './render.js';
import { settingsScreen } from './demo.js';
import { SHELL } from '../shell-theme.js';
import type { LayoutNode } from './types.js';

describe('UI Components · renderNode', () => {
  it('Button: label + data-action + data-arg', () => {
    const node: LayoutNode = {
      type: 'Button',
      id: 'btn1',
      props: { label: 'Buy', kind: 'primary', action: 'buy', actionArg: 'item-1' },
    };
    const html = renderNode(node);
    expect(html).toContain('id="btn1"');
    expect(html).toContain('>Buy<');
    expect(html).toContain('data-action="buy"');
    expect(html).toContain('data-arg="item-1"');
    expect(html).toMatch(/<button/);
    expect(html).toContain('font-weight:600');  // primary style
  });

  it('Button: disabled 无 action 触发', () => {
    const node: LayoutNode = {
      type: 'Button',
      id: 'btn-dis',
      props: { label: 'Locked', disabled: true },
    };
    const html = renderNode(node);
    expect(html).toContain('disabled');
    expect(html).toContain('not-allowed');
    expect(html).toContain('opacity:0.4');
  });

  it('Label: size/color/bold/mono 正确映射', () => {
    const node: LayoutNode = {
      type: 'Label',
      id: 'lbl1',
      props: { text: 'Hello', size: 'lg', color: 'jade', bold: true, mono: false },
    };
    const html = renderNode(node);
    expect(html).toContain('>Hello<');
    expect(html).toContain('font-size:16px');   // lg
    expect(html).toContain(SHELL.jade);          // 主色令牌（不 pin 字面 hex·随品牌换色不脆）
    expect(html).toContain('font-weight:700');
  });

  it('Label: 默认 size=md color=text', () => {
    const node: LayoutNode = { type: 'Label', id: 'lbl2', props: { text: 'X' } };
    const html = renderNode(node);
    expect(html).toContain('font-size:13px');
    expect(html).toContain(SHELL.text);  // 正文色令牌（不 pin 字面 hex）
  });

  it('Dropdown: options + value selected + action', () => {
    const node: LayoutNode = {
      type: 'Dropdown',
      id: 'dd1',
      props: {
        options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }],
        value: 'b',
        action: 'pick',
      },
    };
    const html = renderNode(node);
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
    expect(html).toContain('value="b" selected');
    expect(html).toContain('data-action="pick"');
    expect(html).toMatch(/<select/);
  });

  it('Dropdown: placeholder 在无 value 时 selected', () => {
    const node: LayoutNode = {
      type: 'Dropdown',
      id: 'dd2',
      props: { options: [{ value: 'x', label: 'X' }], placeholder: '选择…', action: 'go' },
    };
    const html = renderNode(node);
    expect(html).toContain('选择…');
    expect(html).toContain('selected');
  });

  it('Badge: ok/warn/dim tone 颜色正确', () => {
    const ok   = renderNode({ type: 'Badge', id: 'b1', props: { text: 'OK',   tone: 'ok'   } });
    const warn = renderNode({ type: 'Badge', id: 'b2', props: { text: 'WARN', tone: 'warn' } });
    const dim  = renderNode({ type: 'Badge', id: 'b3', props: { text: 'DIM',  tone: 'dim'  } });
    expect(ok).toContain('#84c7a4');    // SHELL.ok
    expect(warn).toContain('#d6b277');  // SHELL.warn
    expect(dim).toContain(SHELL.dim);   // 弱化色令牌（不 pin 字面 hex）
  });

  it('Input: placeholder + value + data-action', () => {
    const node: LayoutNode = {
      type: 'Input',
      id: 'in1',
      props: { placeholder: '搜索…', value: 'test', action: 'search' },
    };
    const html = renderNode(node);
    expect(html).toContain('placeholder="搜索…"');
    expect(html).toContain('value="test"');
    expect(html).toContain('data-action="search"');
    expect(html).toMatch(/<input/);
  });

  it('Label typewriter: 加 data-typewriter 锚点（收编 VN 逐字显）', () => {
    expect(renderNode({ type: 'Label', id: 'd', props: { text: '主公，赤壁已备', typewriter: 30 } })).toContain('data-typewriter="30"');
    expect(renderNode({ type: 'Label', id: 'd', props: { text: 'x' } })).not.toContain('data-typewriter'); // 无则不加
  });

  it('Divider: 渲染 hr 带分隔线色', () => {
    const html = renderNode({ type: 'Divider', id: 'hr1', props: {} });
    expect(html).toMatch(/<hr/);
    expect(html).toContain('border-top');
  });

  it('Panel: 嵌套子节点并包含 title', () => {
    const node: LayoutNode = {
      type: 'Panel',
      id: 'p1',
      props: { title: 'SECTION' },
      layout: { direction: 'row', gap: 12, padding: 8 },
      children: [
        { type: 'Label', id: 'lc1', props: { text: 'Child A' } },
        { type: 'Button', id: 'lc2', props: { label: 'Go', action: 'go' } },
      ],
    };
    const html = renderNode(node);
    expect(html).toContain('SECTION');
    expect(html).toContain('Child A');
    expect(html).toContain('>Go<');
    expect(html).toContain('flex-direction:row');
    expect(html).toContain('gap:12px');
    expect(html).toContain('padding:8px');
  });

  it('Panel: scroll=true 加 overflow-y:auto', () => {
    const node: LayoutNode = {
      type: 'Panel', id: 'ps', props: { scroll: true }, children: [],
    };
    expect(renderNode(node)).toContain('overflow-y:auto');
  });

  it('Panel grid 模式: auto-fill 自适应网格（卡牌格/货架）+ minCol 列宽 + title 跨整行', () => {
    const node: LayoutNode = {
      type: 'Panel', id: 'shelf', props: { title: 'SHELF' },
      layout: { direction: 'grid', minCol: 120, gap: 10 },
      children: [
        { type: 'Label', id: 'c1', props: { text: 'A' } },
        { type: 'Label', id: 'c2', props: { text: 'B' } },
        { type: 'Label', id: 'c3', props: { text: 'C' } },
      ],
    };
    const html = renderNode(node);
    expect(html).toContain('display:grid');
    expect(html).toContain('grid-template-columns:repeat(auto-fill,minmax(120px,1fr))');
    expect(html).toContain('gap:10px');
    expect(html).toContain('grid-column:1/-1'); // title 跨整行
    expect(html).toContain('>A<'); expect(html).toContain('>B<'); expect(html).toContain('>C<'); // 子项为格
    expect(html).not.toContain('flex-direction'); // grid 模式不走 flex
  });

  it('Panel grid 模式: minCol 缺省 96', () => {
    const html = renderNode({ type: 'Panel', id: 'g', props: {}, layout: { direction: 'grid' }, children: [] });
    expect(html).toContain('minmax(96px,1fr)');
  });

  it('layout x/y 触发绝对定位', () => {
    const node: LayoutNode = {
      type: 'Button', id: 'abs', props: { label: 'Pin' },
      layout: { x: 100, y: 200 },
    };
    const html = renderNode(node);
    expect(html).toContain('left:100px');
    expect(html).toContain('top:200px');
    expect(html).toContain('position:absolute');
  });

  it('layout flex 注入 flex:N', () => {
    const node: LayoutNode = {
      type: 'Label', id: 'fl', props: { text: 'Stretch' },
      layout: { flex: 1 },
    };
    expect(renderNode(node)).toContain('flex:1');
  });

  it('XSS: 文本内容被 HTML 转义', () => {
    const node: LayoutNode = {
      type: 'Label', id: 'xss', props: { text: '<script>alert(1)</script>' },
    };
    const html = renderNode(node);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('XSS: action/arg 属性被 HTML 转义', () => {
    const node: LayoutNode = {
      type: 'Button', id: 'xss2',
      props: { label: 'X', action: 'a"b', actionArg: 'x"y' },
    };
    const html = renderNode(node);
    expect(html).not.toContain('"b"');       // 未转义的 " 会破坏属性
    // 至少不含未转义的原始引号破坏属性
    expect(html).not.toMatch(/data-action="a"b"/);
  });

  it('未知 type 输出注释而不抛出', () => {
    const node = { type: 'Unknown' as never, id: 'u', props: {} } as LayoutNode;
    const html = renderNode(node);
    expect(html).toContain('unknown');
  });

  it('demo settingsScreen: 完整数据树渲染无异常', () => {
    const html = renderNode(settingsScreen);
    expect(html).toContain('settings-root');
    expect(html).toContain('Game Settings');
    expect(html).toContain('Volume');
    expect(html).toContain('data-action="setVolume"');
    expect(html).toContain('data-action="save"');
    expect(html).toContain('data-action="close"');
    expect(html).toContain('UI Server v0.1');
  });

  // ── 新增 6 个控件 ──────────────────────────────────────────

  it('Checkbox: checked=true 显示勾选标记 + hidden input + label', () => {
    const node: LayoutNode = { type: 'Checkbox', id: 'cb1', props: { label: 'Sound', checked: true, action: 'toggle' } };
    const html = renderNode(node);
    expect(html).toContain('Sound');
    expect(html).toContain('✓');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-action="toggle"');
    expect(html).toContain('checked');
    expect(html).toContain('for="cb1-i"');
  });

  it('Checkbox: checked=false 无勾选标记', () => {
    const html = renderNode({ type: 'Checkbox', id: 'cb2', props: { label: 'Mute', checked: false } });
    expect(html).not.toContain('✓');
    expect(html).not.toContain(' checked');
  });

  it('Toggle: on=true jade 轨道 + knob 靠右', () => {
    const node: LayoutNode = { type: 'Toggle', id: 'tg1', props: { label: 'FX', checked: true, action: 'fx' } };
    const html = renderNode(node);
    expect(html).toContain('FX');
    expect(html).toContain('data-action="fx"');
    expect(html).toContain('left:18px');
    expect(html).toContain(SHELL.jade);
  });

  it('Toggle: on=false knob 靠左 暗色轨道', () => {
    const html = renderNode({ type: 'Toggle', id: 'tg2', props: { label: 'BGM', checked: false } });
    expect(html).toContain('left:2px');
    expect(html).not.toContain(SHELL.jade);
  });

  it('RadioGroup: 选项渲染 + 选中项 jade dot + action', () => {
    const node: LayoutNode = {
      type: 'RadioGroup', id: 'rg1',
      props: { name: 'diff', options: [{ value: 'easy', label: '简单' }, { value: 'hard', label: '困难' }], value: 'easy', action: 'setDiff' },
    };
    const html = renderNode(node);
    expect(html).toContain('简单');
    expect(html).toContain('困难');
    expect(html).toContain('name="diff"');
    expect(html).toContain('data-action="setDiff"');
    expect(html).toContain('value="easy" checked');
    expect(html).toContain(SHELL.jade);
  });

  it('Image: src/alt/fit/radius 正确输出', () => {
    const node: LayoutNode = { type: 'Image', id: 'img1', props: { src: '/logo.png', alt: 'Logo', fit: 'cover', radius: 8 } };
    const html = renderNode(node);
    expect(html).toContain('src="/logo.png"');
    expect(html).toContain('alt="Logo"');
    expect(html).toContain('object-fit:cover');
    expect(html).toContain('border-radius:8px');
    expect(html).toMatch(/<img/);
  });

  it('Image: XSS src 被转义', () => {
    const html = renderNode({ type: 'Image', id: 'img2', props: { src: '" onerror="alert(1)' } });
    expect(html).not.toContain('" onerror=');
    expect(html).toContain('&quot;');
  });

  it('Screen: 全屏容器 + 自定义 bg + center', () => {
    const node: LayoutNode = {
      type: 'Screen', id: 'scr1',
      props: { bg: '#001122', center: true },
      children: [{ type: 'Label', id: 'l', props: { text: 'Hello' } }],
    };
    const html = renderNode(node);
    expect(html).toContain('min-height:100vh');
    expect(html).toContain('background:#001122');
    expect(html).toContain('align-items:center');
    expect(html).toContain('Hello');
  });

  it('Screen: 默认 pageBg 渐变', () => {
    const html = renderNode({ type: 'Screen', id: 'scr2', props: {}, children: [] });
    expect(html).toContain(SHELL.pageBg);
  });

  it('Slider: min/max/value/label/action 正确', () => {
    const node: LayoutNode = { type: 'Slider', id: 'sl1', props: { min: 0, max: 10, step: 1, value: 7, label: 'Vol', action: 'vol' } };
    const html = renderNode(node);
    expect(html).toContain('type="range"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="10"');
    expect(html).toContain('value="7"');
    expect(html).toContain('data-action="vol"');
    expect(html).toContain('Vol');
    expect(html).toContain('accent-color');
  });

  it('Slider: 无 label 时不渲染 header', () => {
    const html = renderNode({ type: 'Slider', id: 'sl2', props: { value: 50 } });
    expect(html).not.toContain('justify-content:space-between');
  });

  it('Table: 列头 + 行数据 + 固定列宽/对齐 + 可点行 + tone 着色', () => {
    const html = renderNode({
      type: 'Table', id: 'lb', props: {
        title: '天梯榜',
        columns: [{ key: 'rank', label: '名次', width: 50 }, { key: 'name', label: '玩家' }, { key: 'score', label: '积分', align: 'right' }],
        rows: [
          { id: 'r1', cells: { rank: '1', name: '不翻就赢', score: '2380' }, tone: 'accent' },
          { id: 'r2', cells: { rank: '2', name: '常胜将军', score: '2210' }, action: 'viewRow' },
        ],
      },
    });
    expect(html).toContain('天梯榜');
    expect(html).toContain('>名次<'); expect(html).toContain('>玩家<'); expect(html).toContain('>积分<');
    expect(html).toContain('不翻就赢'); expect(html).toContain('2380');
    expect(html).toContain('flex:0 0 50px');      // 固定列宽
    expect(html).toContain('text-align:right');    // 列对齐
    expect(html).toContain('data-action="viewRow"'); expect(html).toContain('data-arg="r2"'); // 整行可点
    expect(html).toContain('#d4bd8a');             // accent tone = SHELL.gold
  });

  it('Table: 空行显示 empty 占位', () => {
    const html = renderNode({ type: 'Table', id: 'lbe', props: { columns: [{ key: 'a', label: 'A' }], rows: [], empty: '暂无记录' } });
    expect(html).toContain('暂无记录');
  });

  it('Tabs: nav 标签 + 各页 data-tabpage + 两页全渲染(仅 active 显示)', () => {
    const html = renderNode({
      type: 'Tabs', id: 'tt',
      props: { tabs: [{ id: 'a', label: '牌谱' }, { id: 'b', label: '榜单' }], active: 'b' },
      children: [
        { type: 'Label', id: 'pa', props: { text: 'PAGE-A' } },
        { type: 'Label', id: 'pb', props: { text: 'PAGE-B' } },
      ],
    });
    expect(html).toContain('data-tabs="tt"');
    expect(html).toContain('data-tab="a"'); expect(html).toContain('data-tab="b"');
    expect(html).toContain('>牌谱<'); expect(html).toContain('>榜单<');
    expect(html).toContain('PAGE-A'); expect(html).toContain('PAGE-B'); // 两页都渲染→切页只 toggle display·不重建
    expect(html).toMatch(/data-tabpage="b"[^>]*display:block/);  // active=b 显示
    expect(html).toMatch(/data-tabpage="a"[^>]*display:none/);   // 非 active 隐藏
  });

  it('Tabs: 缺省 active = 第一页', () => {
    const html = renderNode({ type: 'Tabs', id: 't2', props: { tabs: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] }, children: [{ type: 'Label', id: 'lx', props: { text: 'X' } }, { type: 'Label', id: 'ly', props: { text: 'Y' } }] });
    expect(html).toMatch(/data-tabpage="x"[^>]*display:block/);
    expect(html).toMatch(/data-tabpage="y"[^>]*display:none/);
  });

  it('ProgressBar: value/max → 填充宽度% + tone 着色 + 标签/数值', () => {
    const html = renderNode({ type: 'ProgressBar', id: 'hp', props: { value: 30, max: 120, tone: 'danger', label: '生命', showValue: true } });
    expect(html).toContain('width:25%');      // 30/120 = 25%
    expect(html).toContain('生命');
    expect(html).toContain('30/120');         // showValue 显 value/max
  });

  it('ProgressBar: max 缺省 1（value 当 0..1 比例）+ showValue 显百分比 + 钳位', () => {
    expect(renderNode({ type: 'ProgressBar', id: 'p', props: { value: 0.5, showValue: true } })).toContain('width:50%');
    expect(renderNode({ type: 'ProgressBar', id: 'p', props: { value: 0.5, showValue: true } })).toContain('50%');
    expect(renderNode({ type: 'ProgressBar', id: 'p', props: { value: 9, max: 3 } })).toContain('width:100%'); // 超满钳 100
    expect(renderNode({ type: 'ProgressBar', id: 'p', props: { value: -2, max: 3 } })).toContain('width:0%');  // 负值钳 0
  });

  it('ProgressBar: barHeight 只加厚线性轨道，缺省仍保持 8px', () => {
    expect(renderNode({ type: 'ProgressBar', id: 'thin', props: { value: 0.5 } })).toContain('height:8px');
    expect(renderNode({ type: 'ProgressBar', id: 'thick', props: { value: 0.5, barHeight: 34 } })).toContain('height:34px');
    expect(renderNode({ type: 'ProgressBar', id: 'cap', props: { value: 0.5, barHeight: 999 } })).toContain('height:80px');
  });

  it('ProgressBar: fillColor 对线性条生效并平滑过渡，缺省仍按 tone', () => {
    const custom = renderNode({ type: 'ProgressBar', id: 'custom', props: { value: 0.6, fillColor: 'rgb(120,160,80)' } });
    expect(custom).toContain('background:rgb(120,160,80)');
    expect(custom).toContain('transition:width .2s,background .35s linear');
    const semantic = renderNode({ type: 'ProgressBar', id: 'solid', props: { value: 0.6, tone: 'danger' } });
    expect(semantic).not.toContain('background:rgb(120,160,80)');
    expect(semantic).toContain('background:');
  });

  it('ProgressBar: fillGlow 使用同一填充色投柔光，缺省不增加阴影', () => {
    const glowing = renderNode({ type: 'ProgressBar', id: 'glow', props: { value: 0.6, fillColor: '#46d17a', fillGlow: true } });
    expect(glowing).toContain('box-shadow:0 0 10px #46d17a,0 0 22px #46d17a');
    expect(glowing).toContain('overflow:visible');
    expect(renderNode({ type: 'ProgressBar', id: 'plain', props: { value: 0.6, fillColor: '#46d17a' } })).not.toContain('box-shadow:0 0 10px');
  });

  it('Tag: 可点(data-action+arg) + active 高亮 + removable 加 ×', () => {
    const html = renderNode({ type: 'Tag', id: 'tg', props: { label: '黑桃', active: true, action: 'filterSuit', actionArg: 'spade', removable: true } });
    expect(html).toContain('data-action="filterSuit"');
    expect(html).toContain('data-arg="spade"');
    expect(html).toContain('cursor:pointer');
    expect(html).toContain('黑桃');
    expect(html).toContain('×');
  });

  it('Tag: 无 action 则不可点（无 data-action / cursor:pointer）', () => {
    const html = renderNode({ type: 'Tag', id: 'tg', props: { label: '只读' } });
    expect(html).not.toContain('data-action');
    expect(html).not.toContain('cursor:pointer');
  });

  it('Modal: 遮罩居中 + 标题 + ×(closeAction) + 弹窗体 + size 宽度 + 遮罩关闭锚点', () => {
    const html = renderNode({
      type: 'Modal', id: 'm', props: { title: '返回大厅？', size: 'sm', closeAction: 'close' },
      children: [{ type: 'Label', id: 'b', props: { text: '进度将丢失' } }],
    });
    expect(html).toContain('position:fixed');           // 满屏遮罩
    expect(html).toContain('data-modal-close="close"');  // 遮罩关闭锚点（mountUI 用）
    expect(html).toContain('data-action="close"');       // × 按钮信号
    expect(html).toContain('width:320px');               // size=sm
    expect(html).toContain('返回大厅？');
    expect(html).toContain('进度将丢失');                 // 弹窗体子节点
  });

  it('Modal: closable=false 不渲染 ×（但遮罩关闭锚点仍在）', () => {
    const html = renderNode({ type: 'Modal', id: 'm', props: { closable: false, closeAction: 'x' }, children: [] });
    expect(html).not.toContain('aria-label="close"');
    expect(html).toContain('data-modal-close="x"');
  });

  it('Toast: tone 着色药丸 + 文本', () => {
    const ok = renderNode({ type: 'Toast', id: 't', props: { text: '保存成功', tone: 'ok' } });
    expect(ok).toContain('保存成功');
    const danger = renderNode({ type: 'Toast', id: 't', props: { text: '错误', tone: 'danger' } });
    expect(danger).toContain('错误');
    expect(ok).not.toBe(danger); // 不同 tone 渲染不同
  });

  it('Tooltip: 包裹 child 触发元素 + 隐藏气泡(content/placement) + 显隐锚点', () => {
    const html = renderNode({
      type: 'Tooltip', id: 'tip', props: { content: '该牌掷命翻正概率', placement: 'bottom' },
      children: [{ type: 'Badge', id: 'b', props: { text: '?' } }],
    });
    expect(html).toContain('data-tooltip');              // 触发锚点（mountUI hover 用）
    expect(html).toContain('data-tooltip-bubble');       // 气泡
    expect(html).toContain('该牌掷命翻正概率');           // content
    expect(html).toMatch(/data-tooltip-bubble[^>]*display:none/); // 缺省隐藏
    expect(html).toContain('top:calc(100% + 6px)');      // placement=bottom 在下方
    expect(html).toContain('>?<');                       // child 触发元素
  });

  it('Card: 媒体/标题/副标/角标 + 可点(action+arg) + accent 边框', () => {
    const html = renderNode({ type: 'Card', id: 'c', props: { media: '🃏', title: '同袍', sub: '🪙 16', corner: '稀有', tone: 'accent', action: 'buy', actionArg: 'comrade' } });
    expect(html).toContain('🃏'); expect(html).toContain('同袍'); expect(html).toContain('🪙 16'); expect(html).toContain('稀有');
    expect(html).toContain('data-action="buy"'); expect(html).toContain('data-arg="comrade"');
    expect(html).toContain('cursor:pointer');
  });

  it('Card: locked 暗化；children 非空则替默认排版', () => {
    expect(renderNode({ type: 'Card', id: 'c', props: { title: 'X', tone: 'locked' } })).toContain('opacity:.55');
    const custom = renderNode({ type: 'Card', id: 'c', props: { title: '默认' }, children: [{ type: 'Label', id: 'l', props: { text: '自定义体' } }] });
    expect(custom).toContain('自定义体'); expect(custom).not.toContain('默认'); // 有 children 不渲染默认 title
  });

  it('Stepper: ± 按钮 data-arg=钳位新值；到界禁用', () => {
    const html = renderNode({ type: 'Stepper', id: 's', props: { value: 3, min: 0, max: 5, step: 1, action: 'qty' } });
    expect(html).toContain('data-arg="2"'); // − → 2
    expect(html).toContain('data-arg="4"'); // + → 4
    expect(html).toContain('>3<');          // 当前值
    const atMax = renderNode({ type: 'Stepper', id: 's', props: { value: 5, max: 5, action: 'qty' } });
    expect(atMax).toMatch(/disabled[^>]*>\+</); // 到上界 + 禁用
  });

  it('Segmented: 选中段高亮 + 点段 action(arg=value)', () => {
    const html = renderNode({ type: 'Segmented', id: 'sg', props: { options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }], value: 'b', action: 'pick' } });
    expect(html).toContain('data-arg="a"'); expect(html).toContain('data-arg="b"');
    expect(html).toContain('甲'); expect(html).toContain('乙');
  });

  it('Avatar: 有 src 渲 img；无 src 取 name 首字 + shape 圆角', () => {
    expect(renderNode({ type: 'Avatar', id: 'a', props: { src: 'x.png', name: '关羽' } })).toContain('<img');
    const initial = renderNode({ type: 'Avatar', id: 'a', props: { name: '关羽', shape: 'square', size: 50 } });
    expect(initial).toContain('>关<'); // 首字
    expect(initial).toContain('width:50px'); expect(initial).toContain('border-radius:0px'); // square
  });

  it('Accordion: 标题 + 折叠体(open 决定 display) + 切换锚点', () => {
    const closed = renderNode({ type: 'Accordion', id: 'ac', props: { title: '高级设置' }, children: [{ type: 'Label', id: 'l', props: { text: '内容' } }] });
    expect(closed).toContain('data-accordion-head'); expect(closed).toContain('data-accordion-body');
    expect(closed).toContain('高级设置'); expect(closed).toContain('内容');
    expect(closed).toMatch(/data-accordion-body[^>]*display:none/); // 缺省收起
    expect(renderNode({ type: 'Accordion', id: 'ac', props: { title: 'X', open: true }, children: [] })).toMatch(/data-accordion-body[^>]*display:block/);
  });

  it('Rating: ≤value 点亮(★)、其余空(☆)；有 action 每颗可点(arg=颗数)', () => {
    const html = renderNode({ type: 'Rating', id: 'r', props: { value: 3, max: 5, action: 'rate' } });
    expect((html.match(/★/g) || []).length).toBe(3); // 3 颗亮
    expect((html.match(/☆/g) || []).length).toBe(2); // 2 颗空
    expect(html).toContain('data-arg="1"'); expect(html).toContain('data-arg="5"'); // 每颗带颗数
    expect(renderNode({ type: 'Rating', id: 'r', props: { value: 2 } })).not.toContain('data-action'); // 无 action 只读
  });

  it('Combobox: 输入框 + 选项面板(缺省隐) + 选项带 value/label + 回填选中', () => {
    const html = renderNode({ type: 'Combobox', id: 'cb', props: { options: [{ value: 'gx', label: '关羽' }, { value: 'zf', label: '张飞' }], value: 'zf', action: 'pickHero' } });
    expect(html).toContain('data-combo="pickHero"');        // action 挂根
    expect(html).toMatch(/data-combo-panel[^>]*display:none/); // 面板缺省隐
    expect(html).toContain('data-combo-opt="gx"'); expect(html).toContain('data-combo-label="关羽"');
    expect(html).toContain('value="张飞"');                  // 选中回填输入框
  });

  it('Drawer: 贴边面板 + 遮罩(复用 data-modal-close) + side 方位 + ×', () => {
    const html = renderNode({ type: 'Drawer', id: 'dw', props: { side: 'left', title: '设置', closeAction: 'closeDrawer' }, children: [{ type: 'Label', id: 'l', props: { text: '抽屉体' } }] });
    expect(html).toContain('data-modal-close="closeDrawer"'); // 复用遮罩关闭
    expect(html).toContain('data-action="closeDrawer"');      // × 信号
    expect(html).toContain('left:0;bottom:0');                // side=left 贴左
    expect(html).toContain('设置'); expect(html).toContain('抽屉体');
  });

  it('VirtualList: 仅渲可视窗口的行(非全部) + spacer 总高 + 行 data-arg=row.id', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, cells: { name: `第 ${i} 行` } }));
    const html = renderNode({ type: 'VirtualList', id: 'vl', props: { rows, rowHeight: 20, height: 100, columns: [{ key: 'name', label: '名' }], action: 'pickRow' } });
    expect(html).toContain('height:10000px');                 // spacer 总高 = 500×20
    expect(html).toContain('第 0 行');                         // 窗口含首行
    expect(html).not.toContain('第 400 行');                   // 远处行不渲（虚拟化）
    const rendered = (html.match(/data-vlist-row=/g) || []).length;
    expect(rendered).toBeLessThan(20);                        // 只渲一窗口(~9 行)·非 500
    expect(html).toContain('data-arg="r0"');                  // 行可点
  });

  it('ContextMenu: 包裹触发元素 + 隐藏菜单(items 带 action) + 弹出锚点', () => {
    const html = renderNode({ type: 'ContextMenu', id: 'cm', props: { items: [{ id: 'del', label: '删除', action: 'doDelete' }] }, children: [{ type: 'Label', id: 'l', props: { text: '右键我' } }] });
    expect(html).toContain('data-ctxmenu');                   // 触发锚点
    expect(html).toMatch(/data-ctxmenu-pop[^>]*display:none/); // 菜单缺省隐
    expect(html).toContain('data-ctxmenu-item');
    expect(html).toContain('data-action="doDelete"'); expect(html).toContain('data-arg="del"');
    expect(html).toContain('右键我'); expect(html).toContain('删除');
  });
});

// R2a（REQ-RENDERCHECK·owner 直令·PUI 域例外）：凡发 action 信号的交互控件渲染时带 data-ui-id（节点 id）+
// data-action（动作名）+ data-arg（有 arg 则带）——给 R2b 真界面走查驱动器一个稳定的机器可寻标签。
// 纯机械叠加·不改既有 data-action/data-arg 字节（既有断言全绿=零行为改动的证据）。
describe('R2a · data-ui-id 机器可寻标签（凡发 action 信号的控件）', () => {
  it('Button/Panel/Tag/Card/PlayingCard/Dropdown/Input/Slider/CoinFlip/Accordion：data-ui-id = 节点 id，与 data-action/data-arg 同现', () => {
    const btn = renderNode({ type: 'Button', id: 'btn-ui', props: { label: 'Buy', action: 'buy', actionArg: 'item-1' } });
    expect(btn).toContain('data-ui-id="btn-ui"'); expect(btn).toContain('data-action="buy"'); expect(btn).toContain('data-arg="item-1"');

    const panel = renderNode({ type: 'Panel', id: 'panel-ui', props: { action: 'clickPanel' } });
    expect(panel).toContain('data-ui-id="panel-ui"'); expect(panel).toContain('data-action="clickPanel"');

    const tag = renderNode({ type: 'Tag', id: 'tag-ui', props: { label: '筛选', action: 'filterSuit', actionArg: 'S' } });
    expect(tag).toContain('data-ui-id="tag-ui"');

    const dd = renderNode({ type: 'Dropdown', id: 'dd-ui', props: { options: [{ value: 'a', label: 'A' }], action: 'setDiff' } });
    expect(dd).toContain('data-ui-id="dd-ui"');

    // 无 action 的控件不长出 data-ui-id（同既有 data-action 门控·非全量贴标）。
    const btnNoAction = renderNode({ type: 'Button', id: 'btn-quiet', props: { label: 'Quiet' } });
    expect(btnNoAction).not.toContain('data-ui-id');
  });

  it('复合子项：Table 行 / Tabs 页签 / VirtualList 行 / ContextMenu 项——data-ui-id 镜像各自的子项 id（非外层节点 id）', () => {
    const table = renderNode({ type: 'Table', id: 'tbl', props: { columns: [{ key: 'n', label: 'N' }], rows: [{ id: 'row-9', cells: { n: '9' }, action: 'viewRow' }] } });
    expect(table).toContain('data-ui-id="row-9"'); expect(table).toContain('data-arg="row-9"');

    const tabs = renderNode({ type: 'Tabs', id: 'tb', props: { tabs: [{ id: 'home', label: '首页' }], action: 'nav' }, children: [{ type: 'Label', id: 'l', props: { text: 'x' } }] });
    expect(tabs).toContain('data-ui-id="home"');

    const vlist = renderNode({ type: 'VirtualList', id: 'vl', props: { rows: [{ id: 'r0', cells: { n: '第0行' } }], rowHeight: 20, action: 'pick' } });
    expect(vlist).toContain('data-ui-id="r0"');

    const ctx = renderNode({ type: 'ContextMenu', id: 'cm', props: { items: [{ id: 'del', label: '删除', action: 'doDelete' }] }, children: [{ type: 'Label', id: 'l', props: { text: 'x' } }] });
    expect(ctx).toContain('data-ui-id="del"');
  });

  it('Checkbox/Toggle/RadioGroup：隐藏 input 自身 DOM id 各不同，但 data-ui-id 统一镜回外层 LayoutNode id', () => {
    const cb = renderNode({ type: 'Checkbox', id: 'cb1', props: { label: '同意', action: 'toggleAgree', checked: true } });
    expect(cb).toContain('id="cb1-i"'); expect(cb).toContain('data-ui-id="cb1"'); expect(cb).toContain('data-action="toggleAgree"');

    const tg = renderNode({ type: 'Toggle', id: 'tg1', props: { label: '静音', action: 'mute' } });
    expect(tg).toContain('id="tg1-i"'); expect(tg).toContain('data-ui-id="tg1"');

    const rg = renderNode({ type: 'RadioGroup', id: 'rg1', props: { name: 'diff', options: [{ value: 'l1', label: 'L1' }, { value: 'l2', label: 'L2' }], action: 'setDiff' } });
    expect(rg).toContain('id="rg1-r0"'); expect(rg).toContain('id="rg1-r1"');
    // 两个选项的 data-ui-id 都镜回 RadioGroup 自己的节点 id（选项本身无独立 LayoutNode id·value 已充当 data-arg）。
    expect((rg.match(/data-ui-id="rg1"/g) || []).length).toBe(2);
  });
});
