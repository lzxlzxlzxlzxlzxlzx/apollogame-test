import { defineCapability } from '@engine/core/define-capability.js';
import type { Component } from '@engine/core/types.js';
import { t } from '@engine/core/schema.js';

// ═══════════════════════════════════════════════════════════════
//  l7-vfx2d —— 2D 粒子特效通道（render-only 原子·owner 2026-09-09 令补齐·底层评审 §3.2 B-1）
//
//  3D 线有 Vfx3D，2D 面此前只能靠 spawn 一堆 Shape 实体当粒子（进 sim·进 hash·进存档·白花 tick）。
//  本原子 = 纯表现：实体挂 Vfx2D，渲染层（src/renderer/vfx2d.ts）每帧读它 + 实体 Transform + 同实体 Signal，
//  在渲染器自己的粒子池里发射/推进/绘制——**sim 零感知**：组件在 NON_DETERMINISTIC（不进快照 hash）、无 system、
//  渲染层永不写世界。粒子随机用渲染层自持的 mulberry32（种子 = 实体 id 哈希），与 sim 种子无关。
//    · burst：`trigger` 信号在本实体出现那一帧 → 一次放 count 颗（受击/拾取/爆炸）
//    · pop：组件被渲染层首次看见那一帧放一次（出生特效·无需信号）
//    · ring：trigger 时放一圈扩张环（冲击波/落地）
//    · stream：每秒 count 颗持续喷（推进器/喷泉）；填 trigger 则仅信号在场的帧喷（level 模式按键=按住才喷）
//    · trail：同 stream 但零初速、跟随实体留尾（拖影/尾焰）
//  游戏层只写这张数据表，不许自画 canvas；要新粒子形态走 requests.md 扩枚举。
// ═══════════════════════════════════════════════════════════════

export type Vfx2DKind = 'burst' | 'pop' | 'ring' | 'stream' | 'trail';
export type Vfx2DShape = 'circle' | 'square' | 'line';

export interface Vfx2D extends Component {
  readonly type: 'Vfx2D';
  kind: Vfx2DKind;
  trigger?: string; // Signal 名（挂在本实体上）：burst/ring 触发；stream/trail 门控
  count?: number; // burst/pop/ring：每次颗数；stream/trail：每秒颗数（缺省 12）
  life?: number; // 粒子寿命(秒·缺省 0.6)
  lifeVar?: number; // 寿命随机幅度 0..1（缺省 0.3）
  speed?: number; // 初速(世界单位/秒·缺省 80；ring = 环扩张速度)
  speedVar?: number; // 初速随机幅度 0..1（缺省 0.5）
  angle?: number; // 发射中心方向(弧度·缺省 0=+x)
  spread?: number; // 扩散半角(弧度·缺省 π=全向)
  size?: number; // 起始尺寸(缺省 4；ring = 线宽)
  sizeEnd?: number; // 寿终尺寸(缺省 0)
  color?: number; // 0xRRGGBB(缺省 0xffffff)
  colorEnd?: number; // 寿终颜色(缺省 = color)
  gravity?: number; // +y 加速度(单位/秒²·缺省 0)
  drag?: number; // 阻尼(每秒比例·缺省 0)
  shape?: Vfx2DShape; // 粒子形状(缺省 circle；line=沿速度方向短线·火花)
  blend?: 'add' | 'alpha'; // 混合(缺省 add=发光)
  max?: number; // 活粒子上限(缺省 256)
  offsetX?: number; // 发射点相对实体偏移
  offsetY?: number;
}

export const vfx2dCapability = defineCapability({
  id: 'l7-vfx2d',
  version: '1.0.0',

  describe: {
    name: 'vfx2d',
    summary: '2D 粒子特效（纯表现·不进 sim）：爆发/出生/冲击环/持续喷射/拖尾，信号触发或门控。',
    semantic: ['render', 'visual', 'vfx', 'particle', 'juice'],
    whenToUse:
      '2D 游戏要「爆一下」「冒火」「拖尾」时挂 Vfx2D，别 spawn 一堆 Shape 实体当粒子。受击闪爆：Vfx2D{kind:"burst", trigger:"hit", count:16, color:0xff5533}；推进器：Vfx2D{kind:"stream", trigger:"thrust", angle:π, spread:0.3, count:60}；出生：kind:"pop"。触发信号 = 同实体上的 Signal（event-when / keybind / 本实体 Commit 相位产出者皆可）。',
    examples: [
      'Vfx2D{ kind:"burst", trigger:"hit", count:16, life:0.5, speed:120, color:0xff5533, colorEnd:0x331100, size:5, gravity:200 }',
      'Vfx2D{ kind:"stream", trigger:"thrust", angle:3.1416, spread:0.35, count:80, life:0.4, speed:150, color:0x66ccff, shape:"line" }',
      'Vfx2D{ kind:"ring", trigger:"land", speed:220, life:0.35, size:3, color:0xffffff }',
      'Vfx2D{ kind:"trail", count:40, life:0.5, size:6, sizeEnd:0, color:0xffcc00, blend:"add" }',
    ],
  },

  components: {
    provides: {
      Vfx2D: {
        category: 'render',
        describe: '2D 粒子发射器（渲染层读；不进快照 hash；无 system）。',
        fields: {
          kind: { type: 'string', describe: 'burst | pop | ring | stream | trail' },
          trigger: { type: 'string', describe: '同实体 Signal 名：burst/ring 触发·stream/trail 门控' },
          count: { type: 'number', describe: '每次颗数（stream/trail = 每秒颗数）' },
          life: { type: 'number', describe: '粒子寿命(秒)' },
          speed: { type: 'number', describe: '初速(单位/秒)' },
          angle: { type: 'number', describe: '发射中心方向(弧度)' },
          spread: { type: 'number', describe: '扩散半角(弧度)' },
          size: { type: 'number', describe: '起始尺寸' },
          sizeEnd: { type: 'number', describe: '寿终尺寸' },
          color: { type: 'number', describe: '0xRRGGBB' },
          colorEnd: { type: 'number', describe: '寿终颜色' },
          gravity: { type: 'number', describe: '+y 加速度' },
          drag: { type: 'number', describe: '阻尼(每秒比例)' },
          shape: { type: 'string', describe: 'circle | square | line' },
          blend: { type: 'string', describe: 'add | alpha' },
          max: { type: 'number', describe: '活粒子上限' },
        },
        schema: t.obj({
          kind: t.str('burst|pop|ring|stream|trail'), trigger: t.opt(t.str()), count: t.opt(t.num()), life: t.opt(t.num()), lifeVar: t.opt(t.num()),
          speed: t.opt(t.num()), speedVar: t.opt(t.num()), angle: t.opt(t.num()), spread: t.opt(t.num()), size: t.opt(t.num()), sizeEnd: t.opt(t.num()),
          color: t.opt(t.num()), colorEnd: t.opt(t.num()), gravity: t.opt(t.num()), drag: t.opt(t.num()), shape: t.opt(t.str()), blend: t.opt(t.str()),
          max: t.opt(t.num()), offsetX: t.opt(t.num()), offsetY: t.opt(t.num()),
        }),
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    kind: { type: 'select', default: 'burst', describe: '特效形态', question: '爆发、出生、冲击环、持续喷射还是拖尾？', ui: { control: 'chips', options: ['burst', 'pop', 'ring', 'stream', 'trail'] } },
    count: { type: 'number', default: 12, describe: '颗数', question: '一次多少颗（持续型=每秒）？', ui: { control: 'input' } },
    color: { type: 'number', default: 0xffffff, describe: '颜色', question: '粒子颜色？', ui: { control: 'input' } },
  },

  systems: [],
});
