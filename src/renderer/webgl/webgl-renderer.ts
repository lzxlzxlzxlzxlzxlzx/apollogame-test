// ═══════════════════════════════════════════════════════════════
//  webgl/webgl-renderer —— WebGL2 实例化批渲后端（REQ-3D-RENDER-EFFICIENCY 增量②·原型）。
//
//  与 CanvasRenderer 同契约（RendererBackend init/sync/destroy·消费同一份 `collectRenderables`）——
//  纯属**渲染器换后端**，游戏数据零改动。差别＝提交方式：canvas2D 每实体一次 drawImage/fillRect（上千实体
//  时提交本身成瓶颈）；本后端把同纹理相邻实体并成一批 `drawArraysInstanced`，N 实体 → 少数几次 draw。
//
//  规划（哪些实体并成哪批·逐实例属性）全在纯函数 `sprite-batch.ts`（node 可单测）；本文件只是 GL 胶水：
//  编译实例化四边形着色器、每批 upload 实例缓冲、绑纹理、instanced draw。`readStats()` 出 draw/实例/批数。
//
//  ⚠ 原型边界（诚实记档·非静默）：只批 **精灵 + 实心方/圆**；**文本 / 多边形 / 未就绪精灵不画**（planner
//  记 `skipped`）。瓦片地图、文本 HUD 仍是 canvas 后端的活——本原型证的是「上千同类 play-field 实体的
//  批渲吞吐」，不是全功能替换。真图集打包（跨纹理并批）+ 文本/瓦片支持 = 后续增量。
// ═══════════════════════════════════════════════════════════════

import type { IWorld, RendererBackend } from '@engine/core/types.js';
import type { AssetManager } from '@assets/index.js';
import { isImageHandle } from '@assets/index.js';
import { collectRenderables, getCameraView } from '../renderable.js';
import { deviceBase } from '../canvas-transform.js';
import { buildSpriteBatches, STRIDE, WHITE_TEXID, type TexResolver, type TexResolve } from './sprite-batch.js';

export interface WebGLRendererOptions {
  width?: number;
  height?: number;
  background?: string; // 'transparent' 或 '#rrggbb'
  assets?: AssetManager;
}

export interface WebGLRenderStats {
  drawCalls: number;   // 本帧 instanced draw 次数（= 批数·核心指标）
  instances: number;   // 本帧被批渲的实例数
  batches: number;     // 同 drawCalls（语义别名）
  skipped: number;     // 原型不支持而未画的实体数（text/polygon/未就绪精灵）
}

const VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 a_unit;   // 单位四边形角 (0..1)
layout(location=1) in vec3 i_row0;   // 仿射行0 (a,c,e)：device_x = a·u + c·v + e
layout(location=2) in vec3 i_row1;   // 仿射行1 (b,d,f)：device_y = b·u + d·v + f
layout(location=3) in vec4 i_uv;     // u0,v0,uw,vh（图集子矩形）
layout(location=4) in vec4 i_color;  // rgba（0..1）
layout(location=5) in float i_mode;  // 0 纹理 / 1 方 / 2 圆
uniform vec2 u_viewport;             // 设备像素 (canvas.width, canvas.height)
out vec2 v_uv; out vec4 v_color; out float v_mode; out vec2 v_local;
void main(){
  vec3 p = vec3(a_unit, 1.0);
  float dx = dot(i_row0, p), dy = dot(i_row1, p);         // 烤进仿射 → 设备像素
  vec2 clip = vec2(dx / u_viewport.x * 2.0 - 1.0, 1.0 - dy / u_viewport.y * 2.0); // px→clip（y 下正翻上正）
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = i_uv.xy + a_unit * i_uv.zw;                       // 图集内插值 UV
  v_color = i_color; v_mode = i_mode; v_local = a_unit;
}`;

const FRAG = /* glsl */ `#version 300 es
precision mediump float;
in vec2 v_uv; in vec4 v_color; in float v_mode; in vec2 v_local;
uniform sampler2D u_tex;
out vec4 frag;
void main(){
  vec4 c = v_color;
  if (v_mode < 0.5) {                       // 纹理：采样图集 × tint
    c *= texture(u_tex, v_uv);
  } else if (v_mode > 1.5) {                // 圆：单位四边形内圆遮罩
    vec2 d = v_local - vec2(0.5);
    if (dot(d, d) > 0.25) discard;
  }                                          // 方：纯色直出
  if (c.a <= 0.003) discard;
  frag = c;
}`;

export class WebGLRenderer implements RendererBackend {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private instBuf: WebGLBuffer | null = null;
  private uViewport: WebGLUniformLocation | null = null;
  private whiteTex: WebGLTexture | null = null;
  private readonly texByImage = new Map<HTMLImageElement | ImageBitmap, { texId: number; tex: WebGLTexture }>();
  private readonly texById: WebGLTexture[] = []; // texId(≥0) → GL 纹理
  private readonly assets?: AssetManager;
  private dpr = 1;
  private logicalW = 640;
  private logicalH = 400;
  private lastStats: WebGLRenderStats = { drawCalls: 0, instances: 0, batches: 0, skipped: 0 };

  constructor(private readonly opts: WebGLRendererOptions = {}) {
    this.assets = opts.assets;
  }

  init(container: HTMLElement): void {
    const canvas = document.createElement('canvas');
    this.logicalW = this.opts.width ?? 640;
    this.logicalH = this.opts.height ?? 400;
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(this.logicalW * this.dpr);
    canvas.height = Math.round(this.logicalH * this.dpr);
    canvas.style.width = `${this.logicalW}px`;
    canvas.style.height = `${this.logicalH}px`;
    container.appendChild(canvas);
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL2 不可用（本后端需 WebGL2·退回 CanvasRenderer）');
    this.gl = gl;
    this.program = linkProgram(gl, VERT, FRAG);
    this.uViewport = gl.getUniformLocation(this.program, 'u_viewport');
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_tex'), 0); // 采样器绑 unit 0·常量·建一次（免每帧 getUniformLocation 查询·GL 查询会同步 stall）
    this.setupGeometry(gl);
    this.whiteTex = makeSolidTexture(gl, 255, 255, 255, 255); // 实心形状批用（不采样·占位绑定）
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  // 单位四边形（triangle-strip 4 角）静态缓冲 + 实例缓冲（每批重传）·全绑进一个 VAO。
  private setupGeometry(gl: WebGL2RenderingContext): void {
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const S = STRIDE * 4; // 字节步长
    const defs: [number, number, number][] = [ // [location, size, floatOffset]
      [1, 3, 0], [2, 3, 3], [3, 4, 6], [4, 4, 10], [5, 1, 14],
    ];
    for (const [loc, size, off] of defs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, S, off * 4);
      gl.vertexAttribDivisor(loc, 1); // 逐实例推进
    }
    gl.bindVertexArray(null);
  }

  sync(world: IWorld): void {
    const gl = this.gl;
    if (!gl || !this.program) return;
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    const bg = this.opts.background ?? '#16213e';
    if (bg === 'transparent') gl.clearColor(0, 0, 0, 0);
    else { const [r, g, b] = hexToRgb(bg); gl.clearColor(r, g, b, 1); }
    gl.clear(gl.COLOR_BUFFER_BIT);

    const base = deviceBase(this.dpr, getCameraView(world), this.logicalW, this.logicalH);
    const plan = buildSpriteBatches(collectRenderables(world), base, this.texResolver());

    gl.useProgram(this.program);
    gl.uniform2f(this.uViewport, this.canvas!.width, this.canvas!.height);
    gl.bindVertexArray(this.vao);
    // 采样器 u_tex=unit0 + activeTexture(TEXTURE0) 已在 init 设一次（常量·不必每帧查 getUniformLocation）。

    let draws = 0;
    for (const b of plan.batches) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, b.data, gl.DYNAMIC_DRAW);
      const tex = b.texId === WHITE_TEXID ? this.whiteTex : this.texById[b.texId];
      gl.bindTexture(gl.TEXTURE_2D, tex ?? this.whiteTex);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, b.count);
      draws++;
    }
    gl.bindVertexArray(null);
    this.lastStats = { drawCalls: draws, instances: plan.instanceCount, batches: plan.batches.length, skipped: plan.skipped };
  }

  // planner 的纹理解析：textureKey(+帧) → 底层图像的 GL 纹理 texId + 图集内 UV 子矩形。
  //  按**图像对象身份**建 GL 纹理（多 key 共享一张 atlas 图 → 同 texId → 能并批·UV 取子矩形）。
  private texResolver(): TexResolver {
    const gl = this.gl!;
    return (key, frame): TexResolve | null => {
      const r = this.assets?.resolve(key, frame);
      if (!r || !isImageHandle(r.asset.handle)) return null;
      const img = r.asset.handle.image as HTMLImageElement | ImageBitmap;
      let entry = this.texByImage.get(img);
      if (!entry) {
        const tex = uploadTexture(gl, img);
        entry = { texId: this.texById.length, tex };
        this.texById.push(tex);
        this.texByImage.set(img, entry);
      }
      const iw = img.width, ih = img.height;
      return { texId: entry.texId, u0: r.sx / iw, v0: r.sy / ih, uw: r.sw / iw, vh: r.sh / ih, sw: r.sw, sh: r.sh };
    };
  }

  readStats(): WebGLRenderStats { return this.lastStats; }

  destroy(): void {
    const gl = this.gl;
    if (gl) {
      for (const t of this.texById) gl.deleteTexture(t);
      if (this.whiteTex) gl.deleteTexture(this.whiteTex);
      if (this.instBuf) gl.deleteBuffer(this.instBuf);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.texById.length = 0;
    this.texByImage.clear();
    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
  }
}

// ── GL 小工具 ──────────────────────────────────────────────────────────────
function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`shader 编译失败：${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program 链接失败：${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

function uploadTexture(gl: WebGL2RenderingContext, img: TexImageSource): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // 像素画风放大用最近邻（同 canvas imageSmoothing=false）
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function makeSolidTexture(gl: WebGL2RenderingContext, r: number, g: number, b: number, a: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
  return tex;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}
