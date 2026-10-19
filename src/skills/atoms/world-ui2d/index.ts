import { defineCapability } from '@engine/core/define-capability.js';
import type { WorldUI2D } from '@engine/protocol/components.js';

export type { WorldUI2D };

/** Render-only declaration: the Canvas backend is the interpreter; no simulation system is installed. */
export const worldUi2dCapability = defineCapability({
  id: 'l8-world-ui2d',
  version: '1.0.0',
  describe: {
    name: 'world-ui2d',
    summary: '把 LayoutNode 锚到 2D 世界实体的屏幕投影点。',
    semantic: ['render', 'ui', 'world-space', 'canvas'],
    whenToUse:
      '2D 世界里的头顶提示、名牌、血条或小型交互菜单。实体挂 WorldUI2D + Transform；CanvasRenderer 只投影与挂载。缺省点击穿透；菜单显式 interactive 后，控件仍经 LayoutNode ActionSink/handler 接缝动作。',
    examples: [
      'WorldUI2D{ text:"交谈（E）", offsetY:-1 }',
      'WorldUI2D{ node:{type:"Panel",id:"nearby-menu",children:[...]}, offsetY:-1 }',
    ],
  },
  components: {
    provides: {
      WorldUI2D: {
        category: 'render', sim: false,
        describe: '2D 世界空间 LayoutNode；纯表现，不进 hash，渲染器只读。',
        fields: {
          node: { type: 'string', describe: 'LayoutNode 纯数据树（富内容优先；类型层严格约束）' },
          text: { type: 'string', describe: 'node 缺省时的最小文字回退' },
          offsetX: { type: 'number', describe: '相对实体的世界 X 偏移（Life 场景为格单位）' },
          offsetY: { type: 'number', describe: '相对实体的世界 Y 偏移（Life 场景为格单位）' },
          size: { type: 'string', describe: 'text 回退字号 xs|sm|md|lg' },
          color: { type: 'string', describe: 'text 回退的 UI 语义色' },
          glow: { type: 'boolean', describe: 'text 回退是否发光' },
          interactive: { type: 'boolean', describe: '显式允许 LayoutNode 接收指针；缺省 false 保持世界点击穿透' },
        },
      },
    },
    reads: [], writes: [], consumes: [],
  },
  config: {},
  systems: [],
});
