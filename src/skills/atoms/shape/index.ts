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
      '参与碰撞检测或占位的实体需要形状。box 用 width/height，circle 用 radius。overlap-detect 读取此原子做相交测试。',
    examples: ['玩家碰撞箱：kind="box", width=32, height=48', '子弹：kind="circle", radius=4', '触发区域：kind="box", width=100, height=100'],
  },

  components: {
    provides: {
      Shape: {
        category: 'config',
        describe: '碰撞几何。kind=box 用 width/height；kind=circle 用 radius。纯数据。',
        fields: {
          kind: { type: 'string', describe: "形状种类：'box' / 'circle' / 'polygon'" },
          width: { type: 'number', describe: 'box 宽度（kind=box 时有效）' },
          height: { type: 'number', describe: 'box 高度（kind=box 时有效）' },
          radius: { type: 'number', describe: 'circle 半径（kind=circle 时有效）' },
          vertices: { type: 'number[]', describe: "kind='polygon'：扁平局部凸包顶点 [x0,y0,x1,y1,…]（不含旋转）" },
          category: { type: 'number', describe: '碰撞层：本体所属层位掩码（缺省全 1）' },
          mask: { type: 'number', describe: '碰撞层：愿与哪些层相碰的位掩码（缺省全 1·Box2D 双向语义）' },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    kind: { type: 'select', default: 'box', describe: '形状种类', question: '碰撞形状是矩形还是圆？', ui: { control: 'chips', options: ['box', 'circle'] } },
    width: { type: 'number', default: 32, describe: 'box 宽度', question: '矩形宽度？', ui: { control: 'slider', min: 1, max: 500, step: 1 } },
    height: { type: 'number', default: 32, describe: 'box 高度', question: '矩形高度？', ui: { control: 'slider', min: 1, max: 500, step: 1 } },
    radius: { type: 'number', default: 16, describe: 'circle 半径', question: '圆半径？', ui: { control: 'slider', min: 1, max: 250, step: 1 } },
  },

  systems: [],
});
