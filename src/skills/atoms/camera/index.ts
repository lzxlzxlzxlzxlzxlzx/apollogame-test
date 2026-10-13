import { defineCapability } from '@engine/core/define-capability.js';
import { t, type Issue } from '@engine/core/schema.js';
import type { Camera } from '@engine/protocol/components.js';

export type { Camera };

function refineCamera(value: Record<string, unknown>): Issue[] {
  const zone = value.followDeadZone;
  if (zone === undefined || typeof zone !== 'object' || zone === null || Array.isArray(zone)) return [];
  const issues: Issue[] = [];
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const inset = (zone as Record<string, unknown>)[edge];
    if (typeof inset === 'number' && (!Number.isFinite(inset) || inset < 0 || inset >= 0.5)) {
      issues.push({ path: `followDeadZone.${edge}`, message: '应为有限数且满足 0 <= value < 0.5', severity: 'error' });
    }
  }
  return issues;
}

export const cameraCapability = defineCapability({
  id: 'l5-camera',
  version: '1.1.0',

  describe: {
    name: 'camera',
    summary: '观察窗口参数与数据驱动跟随调谐；世界到屏幕的映射基准。',
    semantic: ['render', 'view'],
    whenToUse:
      '定义视口如何观察世界。camera 实体同时挂 Transform 决定世界位置，Camera 描述投影参数。震屏=改 offset，缩放=改 zoom。',
    examples: ['跟随玩家：Transform 跟随 + zoom=1', '震屏：offsetX/Y 抖动', '放大特写：zoom=2'],
  },

  components: {
    provides: {
      Camera: {
        category: 'render',
        describe: '投影参数。与同实体的 Transform 共同决定世界→屏幕映射。',
        fields: {
          zoom: { type: 'number', describe: '缩放倍数（1 为原始）' },
          offsetX: { type: 'number', describe: '屏幕 X 偏移（震屏/平移）' },
          offsetY: { type: 'number', describe: '屏幕 Y 偏移' },
          rotation: { type: 'number', describe: '视口旋转（弧度）' },
          viewportW: { type: 'number', describe: '视口宽度（像素）' },
          viewportH: { type: 'number', describe: '视口高度（像素）' },
          followMargin: { type: 'number', describe: '可选跟随贴合总边距；缺省 80 世界单位' },
          followMinZoom: { type: 'number', describe: '可选跟随最小缩放；缺省 0.25' },
          followMaxZoom: { type: 'number', describe: '可选跟随最大缩放；缺省 1' },
          followOffsetX: { type: 'number', describe: '可选跟随目标 X 锚点偏移；缺省 0' },
          followOffsetY: { type: 'number', describe: '可选跟随目标 Y 锚点偏移；缺省 0' },
          followDeadZone: { type: 'string', describe: '可选屏幕比例安全区 {left,right,top,bottom}；各边 0<=值<0.5' },
        },
        schema: t.obj({
          zoom: t.num('缩放倍数'),
          offsetX: t.num('相机中心 X'),
          offsetY: t.num('相机中心 Y'),
          rotation: t.num('视口旋转弧度'),
          viewportW: t.num('视口宽度'),
          viewportH: t.num('视口高度'),
          followMargin: t.opt(t.num('跟随贴合总边距')),
          followMinZoom: t.opt(t.num('最小跟随缩放')),
          followMaxZoom: t.opt(t.num('最大跟随缩放')),
          followOffsetX: t.opt(t.num('跟随焦点 X 偏移')),
          followOffsetY: t.opt(t.num('跟随焦点 Y 偏移')),
          followDeadZone: t.opt(t.obj({
            left: t.num('左侧安全区内缩比例'), right: t.num('右侧安全区内缩比例'),
            top: t.num('上侧安全区内缩比例'), bottom: t.num('下侧安全区内缩比例'),
          }, '屏幕比例安全区')),
        }),
        sim: false,
        refine: refineCamera,
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    zoom: { type: 'number', default: 1, describe: '缩放', question: '初始缩放倍数？', ui: { control: 'slider', min: 0.1, max: 10, step: 0.1 } },
    offsetX: { type: 'number', default: 0, describe: 'X 偏移', question: '屏幕 X 偏移？', ui: { control: 'slider', min: -500, max: 500, step: 1 } },
    offsetY: { type: 'number', default: 0, describe: 'Y 偏移', question: '屏幕 Y 偏移？', ui: { control: 'slider', min: -500, max: 500, step: 1 } },
    rotation: { type: 'number', default: 0, describe: '视口旋转', question: '视口旋转（弧度）？', ui: { control: 'slider', min: -3.14159, max: 3.14159, step: 0.01 } },
    viewportW: { type: 'number', default: 800, describe: '视口宽', question: '视口宽度？', ui: { control: 'slider', min: 1, max: 4096, step: 1 } },
    viewportH: { type: 'number', default: 600, describe: '视口高', question: '视口高度？', ui: { control: 'slider', min: 1, max: 4096, step: 1 } },
  },

  systems: [],
});
