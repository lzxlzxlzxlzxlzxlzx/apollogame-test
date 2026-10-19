// Game I 画廊冒烟测试（契约 DoD：renderNode 串测·结构/主题/转义）。
// 验证「填数据即出 UI」：整棵画廊数据经引擎纯函数渲染，应含全部控件标记、且文本转义防 XSS。

import { describe, it, expect } from 'vitest';
import { renderNode, resolveBindings } from '@zerocraft/engine/ui/components/index.js';
import type { UIDataSource } from '@zerocraft/engine/ui/components/index.js';
import { buildGallery } from './gallery.js';
import { THEMES, onyx } from './themes.js';

describe('Game I gallery', () => {
  it('keeps one live icon-only Button example on the known emoji path', () => {
    const html = renderNode(buildGallery('onyx', 'mod-ui'), onyx);
    expect(html.match(/<button type="button" id="btn-icon-only"/g)).toHaveLength(1);
    expect(html).toContain('/games/game-i/art/emoji/1f392.png');
    expect(html).not.toContain('/games/game-i/art/icons/backpack.png');
  });
  it('落地展台 = 积木墙（Hub·点 Card 进模块）', () => {
    const html = renderNode(buildGallery('onyx'), onyx);
    expect(html).toContain('id="gameui-root"');     // Screen 根
    expect(html).toContain('"hub-grid-2d"');        // 2D 区积木 grid
    expect(html).toContain('"hub-grid-3d"');        // 3D 区积木 grid
    expect(html).toContain('"hub-mod-ui"');         // UI 模块积木（2D）
    expect(html).toContain('"hub-mod-3d-nav"');     // 3D 寻路模块积木（3D）
    expect(html).toContain('data-action="enterModule"'); // 点积木进模块
  });

  it('renders the UI module gallery as an HTML string', () => {
    const html = renderNode(buildGallery('onyx', 'mod-ui'), onyx);
    expect(html).toContain('id="gameui-root"');          // Screen 根
    expect(html).toContain('data-tabs="gallery-tabs"');  // Tabs 分页
    // 五个 UI 分页都在（声音/输入已拆为独立模块）
    expect(html).toContain('data-tabpage="tab-layout"');
    expect(html).toContain('data-tabpage="tab-display"');
    expect(html).toContain('data-tabpage="tab-input"');
    expect(html).toContain('data-tabpage="tab-3dui"');   // 3D UI 表达（专属 tab）
    expect(html).toContain('data-tabpage="tab-shop"');   // 组合演示·商店
    expect(html).toContain('data-tabpage="tab-pick"');   // 组合演示·选牌
    expect(html).toContain('data-action="exitModule"');  // 顶栏返回展台
  });

  it('3D UI tab carries real CSS-3D controls (cover-flow rotateY + z·真 3D 翻面卡)', () => {
    const html = renderNode(buildGallery('onyx', 'mod-ui'), onyx);
    expect(html).toContain('data-tabpage="tab-3dui"');
    expect(html).toContain('id="3dui-carousel"');        // 3D 旋转木马
    expect(html).toContain('perspective(720px)');        // 共享父 perspective → 真 3D 合成
    expect(html).toMatch(/rotateY\(-?55deg\)/);          // cover-flow 两翼强旋（±55）
    expect(html).toContain('data-flipcard');             // 真 3D 翻面卡（flipOnHover）
    expect(html).toContain('preserve-3d');               // 景深叠层子层 3D 合成
  });

  it('lists ALL 30 engine components (showcase coverage gate)', () => {
    // 30 控件全在 UI 模块；模态/抽屉需开启态才入树 → modalOpen=drawerOpen=true 覆盖 Modal/Drawer。
    const html = renderNode(buildGallery('onyx', 'mod-ui', true, true), onyx);
    // 渲染器分发表认识的全部 30 个控件，展示款里一个都不能漏。
    for (const id of [
      'topbar',              // Panel
      'gameui-root',         // Screen
      'gallery-tabs',        // Tabs
      'demo-table',          // Table
      'app-title',           // Label
      'app-engine',          // Badge
      'img-cover',           // Image
      'signal-once',         // Image.signal emission live sample
      'top-div',             // Divider
      'btn-p',               // Button
      'in-text',             // Input
      'dd-diff',             // Dropdown
      'cb-tutorial',         // Checkbox
      'tg-sound',            // Toggle
      'tg-sound-disabled',   // Toggle.disabled（保持 checked 外观、不可交互）
      'tg-measured-visual',  // Toggle.visual（原型级几何与两态闭集色）
      'tg-measured-caption', // 外置可见行名；Toggle.visual.showLabel:false 保留 aria-label
      'rg-speed',            // RadioGroup
      'sl-volume',           // Slider
      'sk-9-separate',       // 9-slice 源裁边与显示边宽分离
      'pb-accent',           // ProgressBar
      'tag-all',             // Tag
      'demo-modal-overlay',  // Modal
      'toast-ok',            // Toast（静态预览节点）
      'tip-top',             // Tooltip
      'demo-accordion',      // Accordion
      'av-circle',           // Avatar
      'card-1',              // Card
      'seg-view',            // Segmented
      'stp-qty',             // Stepper
      'cb-city',             // Combobox
      'demo-drawer-overlay', // Drawer
      'rt-stars',            // Rating
      'demo-vlist',          // VirtualList
      'demo-ctxmenu',        // ContextMenu
    ]) {
      expect(html).toContain(`"${id}"`);
    }
  });

  it('overlays the Modal only when modalOpen=true', () => {
    expect(renderNode(buildGallery('onyx', 'mod-ui', false), onyx)).not.toContain('demo-modal-overlay');
    expect(renderNode(buildGallery('onyx', 'mod-ui', true), onyx)).toContain('demo-modal-overlay');
  });

  it('keeps the measured Modal, cover-top Image, and native Button typography visible in the gallery', () => {
    const html = renderNode(buildGallery('onyx', 'mod-ui', true), onyx);
    expect(html).toContain('id="img-cover-top"');
    expect(html).toContain('object-position:center top;');
    expect(html).toContain('id="btn-measured-label"');
    expect(html).toContain('font-size:16px;');
    expect(html).toContain('width:820px;max-width:100%');
    expect(html).toContain('backdrop-filter:blur(3px);');
    expect(html).toContain('border:12px solid #82623A;border-radius:8px;');
  });

  it('exercises every input control with an action signal', () => {
    const html = renderNode(buildGallery('onyx', 'mod-ui', true, true), onyx);
    for (const action of [
      'click', 'setText', 'setNum', 'setDifficulty',
      'setFlag', 'setSound', 'setSpeed', 'setVolume', 'setTheme', 'switchTab',
      'pickRow', 'pickTag', 'openModal', 'closeModal', 'showToast',
      'pickCard', 'setView', 'setQty', 'toggleAcc',
      'setRating', 'openDrawer', 'closeDrawer', 'hurt', 'heal',
      'pickVRow', 'ctxAction',
    ]) {
      expect(html).toContain(`data-action="${action}"`);
    }
    // Combobox 走引擎内建 data-combo（非 data-action）→ 单独断言
    expect(html).toContain('data-combo="setCity"');
  });

  it('demonstrates world-binding: resolveBindings fills bound HUD nodes', () => {
    const ds: UIDataSource = {
      resource: (id) => (id === 'hp' ? { current: 42, max: 100 } : id === 'gold' ? { current: 999 } : undefined),
    };
    const resolved = resolveBindings(buildGallery('onyx', 'mod-ui'), ds);
    const html = renderNode(resolved, onyx);
    // 绑定后：Label 把 current 接在 text 后；ProgressBar value 取 current。
    expect(html).toContain('生命值 42');
    expect(html).toContain('金币 999');
    // 未绑定渲染时 HUD 不含解析值（bind 占位）
    expect(renderNode(buildGallery('onyx', 'mod-ui'), onyx)).not.toContain('生命值 42');
  });

  it('reflects the active theme in the theme picker', () => {
    const html = renderNode(buildGallery('brocade', 'mod-ui'), THEMES['brocade']!);
    // 暖金主题的主色应出现在渲染串里（令牌驱动·非内联死色）
    expect(html).toContain('#e0b964');
  });

  it('renders identical structure across themes (data-driven re-skin)', () => {
    const a = renderNode(buildGallery('onyx', 'mod-ui'), THEMES['onyx']!);
    const b = renderNode(buildGallery('onyx', 'mod-ui'), THEMES['frost']!);
    // 同一棵数据、不同令牌 → 结构锚点一致，仅颜色变
    expect(a).toContain('data-tabs="gallery-tabs"');
    expect(b).toContain('data-tabs="gallery-tabs"');
    expect(a).not.toBe(b);
  });
});
