// @vitest-environment happy-dom
// mount-host 宿主骨架 helper 的契约测试（REQ-AUDIT-守门 C 件）：容器结构 / 定尺缩放 / teardown。
import { describe, it, expect, beforeEach } from 'vitest';
import { mountExternalAppFrame, mountHost, resolveSceneBg } from './mount-host.js';

function makeContainer(w?: number, h?: number): HTMLElement {
  const c = document.createElement('div');
  if (w !== undefined) Object.defineProperty(c, 'clientWidth', { value: w, configurable: true });
  if (h !== undefined) Object.defineProperty(c, 'clientHeight', { value: h, configurable: true });
  document.body.appendChild(c);
  return c;
}

describe('mountHost（引擎公用宿主骨架）', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('建五容器且嵌套正确：container > wrapper > scene > [top/bottom/overlay]', () => {
    const container = makeContainer();
    const h = mountHost(container, { fieldW: 800, fieldH: 600, topBarH: 40, bottomBarH: 80 });
    expect(h.wrapper.parentElement).toBe(container);
    expect(h.scene.parentElement).toBe(h.wrapper);
    expect(h.topHost.parentElement).toBe(h.scene);
    expect(h.bottomHost.parentElement).toBe(h.scene);
    expect(h.overlayHost.parentElement).toBe(h.scene);
    // 恰三个 HUD host 挂在 scene 下（画布由调用方后挂·此时 scene 只有三 host）。
    expect(h.scene.children.length).toBe(3);
  });

  it('wrapper 用 overflow:clip 而非 hidden（REQ-FOCUSSCROLL·hidden 挡不住程序化 focus-scroll 的 scrollLeft/Top 位移）', () => {
    const container = makeContainer();
    const h = mountHost(container, { fieldW: 800, fieldH: 600 });
    expect(h.wrapper.style.overflow).toBe('clip');
    expect(h.wrapper.style.cssText).not.toContain('hidden');
  });

  it('容器骨架样式：定尺 scene / 分层 z-index / overlay 默认不吃指针 / 背景注入', () => {
    const container = makeContainer();
    const h = mountHost(container, {
      fieldW: 720, fieldH: 480, topBarH: 30, bottomBarH: 60,
      sceneBackground: '#123456', wrapperBackground: '#000000',
    });
    expect(h.scene.style.width).toBe('720px');
    expect(h.scene.style.height).toBe('480px');
    expect(h.scene.style.transformOrigin).toBe('center center');
    expect(h.scene.style.background).toContain('#123456');
    expect(h.wrapper.style.background).toContain('#000000');
    expect(h.topHost.style.zIndex).toBe('10');
    expect(h.bottomHost.style.zIndex).toBe('10');
    expect(h.topHost.style.height).toBe('30px');
    expect(h.bottomHost.style.height).toBe('60px');
    expect(h.overlayHost.style.zIndex).toBe('20');
    expect(h.overlayHost.style.pointerEvents).toBe('none');
  });

  it('省略背景/栏高：不设 background·host 高 0', () => {
    const container = makeContainer();
    const h = mountHost(container, { fieldW: 100, fieldH: 100 });
    expect(h.scene.style.background).toBe('');
    expect(h.wrapper.style.background).toBe('');
    expect(h.topHost.style.height).toBe('0px');
    expect(h.bottomHost.style.height).toBe('0px');
  });

  it('定尺缩放：等比取容器/场景较小比 → scene.transform=scale(k)', () => {
    // 容器 400×300·场景 800×600 → k=min(0.5,0.5)=0.5。
    const container = makeContainer(400, 300);
    const h = mountHost(container, { fieldW: 800, fieldH: 600 });
    expect(h.scene.style.transform).toBe('scale(0.5)');
    // 非等比容器取较小边：600×600·场景 800×400 → min(0.75, 1.5)=0.75。
    const c2 = makeContainer(600, 600);
    const h2 = mountHost(c2, { fieldW: 800, fieldH: 400 });
    expect(h2.scene.style.transform).toBe('scale(0.75)');
  });

  it('缩放回退：容器 0 尺寸（未布局）→ 用场景定尺兜底 → scale(1)', () => {
    const container = makeContainer(0, 0);
    const h = mountHost(container, { fieldW: 500, fieldH: 500 });
    expect(h.scene.style.transform).toBe('scale(1)');
  });

  it('fit() 手动补触发：容器尺寸变后重算', () => {
    const container = makeContainer(800, 600);
    const h = mountHost(container, { fieldW: 800, fieldH: 600 });
    expect(h.scene.style.transform).toBe('scale(1)');
    Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true });
    h.fit();
    expect(h.scene.style.transform).toBe('scale(0.5)');
  });

  // ── 背景皮肤槽（REQ-ART-可消费槽铁律 ②·render-only）─────────────────────────
  describe('sceneBgSkin 背景皮肤槽', () => {
    it('有生成图（单层·无回退）：图落进 scene 背景 + 打 data-scene-bg-skin', () => {
      // 单层 url() happy-dom 可解析回读（多层 shorthand 是 happy-dom 解析盲区·多层字符串正确性
      // 由下方 resolveSceneBg 单元测覆盖·此处只验 mountHost 把解析结果真装进 scene 背景）。
      const container = makeContainer();
      const h = mountHost(container, {
        fieldW: 800, fieldH: 600,
        sceneBgSkin: { skinKey: 'game-a/scene/bg-menu', imageUrl: '/games/game-a/art/bg/menu.svg' },
      });
      const bg = h.scene.style.background;
      expect(bg).toContain('menu.svg');
      expect(bg).toContain('no-repeat');
      expect(h.scene.dataset.sceneBgSkin).toBe('game-a/scene/bg-menu');
    });

    it('有生成图 + 有程序化回退（多层）：data 属性标可换槽（多层背景串正确性见 resolveSceneBg 单元测）', () => {
      const container = makeContainer();
      const h = mountHost(container, {
        fieldW: 800, fieldH: 600,
        sceneBackground: 'radial-gradient(#31201a, #160e0a)',
        sceneBgSkin: { skinKey: 'game-a/scene/bg-menu', imageUrl: '/games/game-a/art/bg/menu.svg' },
      });
      expect(h.scene.dataset.sceneBgSkin).toBe('game-a/scene/bg-menu');
    });

    it('无生成图（imageUrl 空/缺）：回退纯程序化背景·仍打 data 属性标可换槽', () => {
      const container = makeContainer();
      const h = mountHost(container, {
        fieldW: 800, fieldH: 600,
        sceneBackground: '#123456',
        sceneBgSkin: { skinKey: 'game-a/scene/bg-menu', imageUrl: null },
      });
      expect(h.scene.style.background).toContain('#123456');
      expect(h.scene.style.background).not.toContain('url(');
      expect(h.scene.dataset.sceneBgSkin).toBe('game-a/scene/bg-menu');
    });

    it('resolveSceneBg 单元：fit 变体 / 无回退 / 无图', () => {
      expect(resolveSceneBg('#000', { skinKey: 'k', imageUrl: '/a.png', fit: 'contain' }))
        .toBe('url("/a.png") center/contain no-repeat, #000');
      expect(resolveSceneBg('#000', { skinKey: 'k', imageUrl: '/a.png', fit: 'stretch' }))
        .toBe('url("/a.png") left top/100% 100% no-repeat, #000');
      // 无回退（sceneBackground 省略）→ 只图
      expect(resolveSceneBg(undefined, { skinKey: 'k', imageUrl: '/a.png' }))
        .toBe('url("/a.png") center/cover no-repeat');
      // 无图 → 原样回退（含 undefined 透传）
      expect(resolveSceneBg('#fff', { skinKey: 'k' })).toBe('#fff');
      expect(resolveSceneBg('#fff', undefined)).toBe('#fff');
      expect(resolveSceneBg(undefined, undefined)).toBeUndefined();
    });

    it('resolveSceneBg：url 里的引号/反斜杠转义（防破坏 style 串）', () => {
      const out = resolveSceneBg(undefined, { skinKey: 'k', imageUrl: '/a"b\\c.png' });
      expect(out).not.toContain('"b'); // 裸引号已转义
      expect(out).toContain('%22');
      expect(out).toContain('%5C');
    });

    it('无皮肤槽：不打 data 属性·背景=旧 sceneBackground 行为（回归）', () => {
      const container = makeContainer();
      const h = mountHost(container, { fieldW: 100, fieldH: 100, sceneBackground: '#abcdef' });
      expect(h.scene.dataset.sceneBgSkin).toBeUndefined();
      expect(h.scene.style.background).toContain('#abcdef');
    });
  });

  it('teardown 干净：移除 wrapper·window resize 不再改 scene', () => {
    const container = makeContainer(800, 600);
    const h = mountHost(container, { fieldW: 800, fieldH: 600 });
    expect(container.children.length).toBe(1);
    h.teardown();
    expect(container.children.length).toBe(0);
    expect(h.wrapper.isConnected).toBe(false);
    // teardown 后改容器尺寸 + 派 resize：监听已摘 → transform 不应更新（仍是卸载前的 scale(1)）。
    Object.defineProperty(container, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 150, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(h.scene.style.transform).toBe('scale(1)');
  });
});

describe('mountExternalAppFrame（外部 Web App 预览宿主）', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('由引擎宿主创建 iframe，游戏层只提供声明式 URL 与标题', () => {
    const container = makeContainer();
    const teardown = mountExternalAppFrame(container, {
      src: '/apps/game-loot-chest/index.html',
      title: '开启宝箱 · Loot Chest',
    });
    const frame = container.querySelector('iframe');
    expect(frame?.title).toBe('开启宝箱 · Loot Chest');
    expect(frame?.getAttribute('src')).toBe('/apps/game-loot-chest/index.html');
    expect(frame?.allow).toBe('fullscreen');
    teardown();
    expect(container.children).toHaveLength(0);
  });

  it('拒绝脚本/data 等非可信 URL，并允许显式 sandbox', () => {
    const container = makeContainer();
    expect(() => mountExternalAppFrame(container, { src: 'javascript:alert(1)', title: 'bad' })).toThrow(/root-relative or HTTPS/);
    mountExternalAppFrame(container, {
      src: 'https://example.com/app', title: 'Hosted App', sandbox: 'allow-scripts allow-same-origin',
    });
    expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
  });
});
