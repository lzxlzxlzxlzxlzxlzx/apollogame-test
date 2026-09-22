import type { Command, InputSource, RawInputData } from '../commands.js';

// 队列输入源 —— 把异步到达的"原始输入事件"(指针/点击/UI onClick)缓冲，在 tick 边界确定性释放（R3）。
// 这就是 PB 要的"React 事件 → 当帧 input source"接缝：UI 侧 enqueue，引擎按 tick 取走写进单例 InputQueue。
// 异步事件归并到具体 tick 的命令集 = 确定性注入（与键盘源同一 InputSource 契约，可被 MultiInputSource 合并）。
export class QueuedInputSource implements InputSource {
  private queue: RawInputData[] = [];

  constructor(private readonly playerId: string) {}

  /** UI/指针回调调用：压入一条原始输入事件，下一 tick 释放。 */
  enqueue(data: RawInputData): void {
    this.queue.push(data);
  }

  /** 便捷：压入一个语义动作（如选项点击 'choice:2'）。arg=带参动作的字符串参数（买哪件/拖放 id/下拉值），透传进 Signal.arg。 */
  enqueueAction(name: string, value?: { x?: number; y?: number; arg?: string }): void {
    this.queue.push({ source: this.playerId, key: name, x: value?.x, y: value?.y, arg: value?.arg, phase: 'action' });
  }

  commandsForTick(tick: number): Command[] {
    if (this.queue.length === 0) return [];
    const actions = this.queue;
    this.queue = [];
    return [{ playerId: this.playerId, tick, move: { dx: 0, dy: 0 }, actions }];
  }
}

// 视口坐标 → canvas 像素坐标（纯函数，可测）。e.clientX/Y 是相对浏览器视口的，需减去 canvas 的
// BoundingRect 偏移，再按「buffer 尺寸 / CSS 显示尺寸」缩放（canvas 被 CSS 拉伸时二者不等）。
// 不做这步，Q5 的屏幕→世界逆投影会全盘错位（Gemini 代码级 #2）。
export function canvasPointerToScreen(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  bufferW: number,
  bufferH: number,
): { x: number; y: number } {
  return {
    x: (clientX - rect.left) * (bufferW / rect.width),
    y: (clientY - rect.top) * (bufferH / rect.height),
  };
}

// 拖拽合成（REQ-F-045，纯函数可测）：down→up 距离超过阈值 → 合成一条 drag 动作
// {key:'drag', x/y:起点世界坐标, values:[终点x,终点y]}；阈值内=点击（既有 clickable 路径不变）。
// 世界坐标已在采集期逆投影（与 pointer 同纪律）→ 命令流确定、lockstep 安全。
export function synthesizeDrag(
  source: string,
  down: { x: number; y: number },
  up: { x: number; y: number },
  threshold = 6,
): RawInputData | null {
  const dx = up.x - down.x, dy = up.y - down.y;
  if (dx * dx + dy * dy < threshold * threshold) return null;
  return { source, key: 'drag', x: down.x, y: down.y, values: [up.x, up.y], phase: 'drag' };
}

// 浏览器指针输入源 —— 监听 canvas 的 pointer 事件，映射为 canvas 像素坐标后按 tick 确定性注入。
// 仅浏览器；headless/测试用 QueuedInputSource。
//
// 确定性铁律（Gemini 致命级修正）：**屏幕→世界逆投影在此（本地、入网前）完成**，注入的是**世界坐标**。
// 传 worldFromScreen（用本地相机做 screenToWorld）→ 世界坐标进 Command/网络 → 多端一致；sim 内绝不再读相机/视口
// （否则 1080p vs 720p 两端同一指令算出不同出生点 → desync）。不传则注入 canvas 像素（无相机时 = 世界，identity）。
export class PointerInputSource extends QueuedInputSource {
  private downAt: { x: number; y: number } | null = null; // REQ-F-045：拖拽起点（down 记录、up 合成）

  private readonly onPointer = (e: PointerEvent) => {
    const phase = e.type === 'pointerdown' ? 'down' : e.type === 'pointerup' ? 'up' : 'move';
    const rect = this.canvas.getBoundingClientRect();
    // 高分屏修复：渲染器把 canvas.width 设成「逻辑尺寸×devicePixelRatio」(Retina 字糊根治, c105b92)，
    // 但 worldFromScreen 逆投影按**逻辑**尺寸算 → 必须把指针映射回逻辑像素(÷dpr)，否则落点偏 dpr 倍、点击全空。
    // canvas.style.width 钉的是逻辑尺寸；逻辑宽 = canvas.width / dpr。dpr=1(headless/jsdom)逐位不变。
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const p = canvasPointerToScreen(e.clientX, e.clientY, rect, this.canvas.width / dpr, this.canvas.height / dpr);
    const w = this.opts.worldFromScreen ? this.opts.worldFromScreen(p.x, p.y) : p; // 采集期逆投影 → 世界坐标
    // REQ-F-053 点拖互斥：'up' 与 drag 二选一——超阈值=拖（只发 drag，裸 up 吞掉），阈值内=真点击（发 up）。
    // 否则拖拽起手的 down/收手的 up 会被 clickable 当点击消费（按住即卖、落点误点）。可拖又可点的实体
    // （席位 marker 等）配 Clickable{phase:'up'}：down 永不触发、真点击靠 up、拖拽不产 up → 天然互斥。
    // 判定全在本地采集期、入流前完成（与逆投影/drag 合成同纪律）→ 命令流确定、lockstep 安全。
    if (phase === 'up' && this.downAt) {
      const d = synthesizeDrag(this.pid, this.downAt, { x: w.x, y: w.y }, this.opts.dragThreshold);
      if (d) this.enqueue(d);
      else this.enqueue({ source: this.pid, x: w.x, y: w.y, phase });
      this.downAt = null;
      return;
    }
    this.enqueue({ source: this.pid, x: w.x, y: w.y, phase });
    if (phase === 'down') this.downAt = { x: w.x, y: w.y }; // REQ-F-045：拖拽起点
  };

  constructor(
    private readonly pid: string,
    private readonly canvas: HTMLCanvasElement,
    // worldFromScreen：本地相机逆投影 (canvas 像素 → 世界)。带相机的游戏必须传，保证联机确定性。
    private readonly opts: { move?: boolean; dragThreshold?: number; worldFromScreen?: (sx: number, sy: number) => { x: number; y: number } } = {},
  ) {
    super(pid);
    canvas.addEventListener('pointerdown', this.onPointer as EventListener);
    canvas.addEventListener('pointerup', this.onPointer as EventListener);
    if (opts.move) canvas.addEventListener('pointermove', this.onPointer as EventListener);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointer as EventListener);
    this.canvas.removeEventListener('pointerup', this.onPointer as EventListener);
    this.canvas.removeEventListener('pointermove', this.onPointer as EventListener);
  }
}
