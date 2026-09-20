import { defineCapability } from '@engine/core/define-capability.js';
import type { Shape } from '@engine/protocol/components.js';

export type { Shape };

export const shapeCapability = defineCapability({
  id: 'c1-shape',
  version: '1.0.0',

  describe: {
    name: 'shape',
    summary: '实体的碰撞/占位几何形状？',
    semantic: ['geometry', 'collision'],
    whenToUse:
      '参与碰撞检测或占位的实体需要形状。box 用 width/height，circle 用 radius；capsule 用 length/radius，axisX/Y 或 Transform.rotation 决定真实方向。overlap-detect 读取此原子做相交测试。',
    examples: ['玩家碰撞箱：kind="box", width=32, height=48', '子弹：kind="circle", radius=4', '触发区域：kind="box", width=100, height=100'],
  },

  components: {
    provides: {
      Shape: {
        category: 'config',
        describe: '碰撞几何。box 用 width/height；circle 用 radius；polygon 用 vertices；capsule 用 length/radius 和可选 axisX/Y。',
        fields: {
          kind: { type: 'string', describe: "形状种类：'box' / 'circle' / 'polygon' / 'capsule'" },
          length: { type: 'number', describe: 'capsule 两端圆心的间距，围绕 Transform 中心对称；总外廓长 length+2radius' },
          axisX: { type: 'number', describe: 'capsule 可选世界方向X，与axisY归一后优先于Transform.rotation；缺省使用旋转' },
          axisY: { type: 'number', describe: 'capsule 可选世界方向Y；零向量回退朝右' },
          vertices: { type: 'string', describe: 'polygon 局部凸顶点扁平数组 [x0,y0,...]' },
          width: { type: 'number', describe: 'box 宽度（kind=box 时有效）' },
          height: { type: 'number', describe: 'box 高度（kind=box 时有效）' },
          radius: { type: 'number', describe: 'circle 或 capsule 圆端半径；capsule 宽度为2radius' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    kind: { type: 'select', default: 'box', describe: '形状种类', question: '碰撞形状？', ui: { control: 'chips', options: ['box', 'circle', 'polygon', 'capsule'] } },
    length: { type: 'number', default: 32, describe: 'capsule 中心线长度', question: '圆端线段长度？', ui: { control: 'slider', min: 0, max: 500, step: 1 } },
    width: { type: 'number', default: 32, describe: 'box 宽度', question: '矩形宽度？', ui: { control: 'slider', min: 1, max: 500, step: 1 } },
    height: { type: 'number', default: 32, describe: 'box 高度', question: '矩形高度？', ui: { control: 'slider', min: 1, max: 500, step: 1 } },
    radius: { type: 'number', default: 16, describe: 'circle 半径', question: '圆半径？', ui: { control: 'slider', min: 1, max: 250, step: 1 } },
  },

  systems: [],
});
