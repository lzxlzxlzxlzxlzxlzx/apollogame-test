import { describe, it, expect } from 'vitest';
import { canvasPointerToScreen } from './queued-input.js';

describe('canvasPointerToScreen — 视口坐标 → canvas 像素坐标（Gemini 代码级 #2）', () => {
  it('减去 canvas 偏移', () => {
    // canvas 在视口 (50,30) 处，buffer 与 CSS 同尺寸 640x400
    const rect = { left: 50, top: 30, width: 640, height: 400 };
    expect(canvasPointerToScreen(50, 30, rect, 640, 400)).toEqual({ x: 0, y: 0 });
    expect(canvasPointerToScreen(370, 230, rect, 640, 400)).toEqual({ x: 320, y: 200 });
  });

  it('CSS 拉伸时按 buffer/显示尺寸缩放', () => {
    // buffer 640x400，但被 CSS 显示为 320x200（半尺寸）
    const rect = { left: 0, top: 0, width: 320, height: 200 };
    expect(canvasPointerToScreen(160, 100, rect, 640, 400)).toEqual({ x: 320, y: 200 });
  });
});
