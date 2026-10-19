import { defineCapability } from '@engine/core/define-capability.js';
import { t, type Issue } from '@engine/core/schema.js';
import type { Sprite } from '@engine/protocol/components.js';

export type { Sprite };

function refineSprite(value: Record<string, unknown>): Issue[] {
  const hasWidth = value.width !== undefined;
  const hasHeight = value.height !== undefined;
  const hasFit = value.fit !== undefined;
  if (!hasWidth && !hasHeight && !hasFit) return [];

  const issues: Issue[] = [];
  if (!(hasWidth && hasHeight && hasFit)) {
    issues.push({ path: 'width', message: 'width、height 与 fit 必须同时给出；全部省略才使用源矩形原生尺寸', severity: 'error' });
    return issues;
  }
  for (const field of ['width', 'height'] as const) {
    const n = value[field];
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
      issues.push({ path: field, message: '应为有限正数', severity: 'error' });
    }
  }
  return issues;
}

export const spriteCapability = defineCapability({
  id: 'l1-sprite',
  version: '1.0.0',

  describe: {
    name: 'sprite',
    summary: '实体用什么图？渲染层级？',
    semantic: ['render', 'visual'],
    whenToUse:
      '任何需要显示贴图的实体。textureKey 指向资源；anchorX/Y 是 0~1 锚点；zOrder 决定 2D 绘制顺序。可选 width+height+fit 以目标框等比 cover/contain；三者全省略保留源矩形原生尺寸。sampling 可选 smooth，缺省 nearest。渲染层读取此组件绘制。',
    examples: ['玩家：textureKey="player", anchor=(0.5,0.5), zOrder=10', '卡面：textureKey="card", width=260, height=390, fit="cover"', '背景：zOrder=0'],
  },

  components: {
    provides: {
      Sprite: {
        category: 'render',
        describe: '贴图与渲染层级。渲染层每帧读取绘制。',
        fields: {
          textureKey: { type: 'assetKey', assetType: 'texture', describe: '贴图资源键（须在资产清单中，加载期硬校验）' },
          anchorX: { type: 'number', describe: '锚点 X（0~1，0.5 为中心）' },
          anchorY: { type: 'number', describe: '锚点 Y（0~1，0.5 为中心）' },
          zOrder: { type: 'number', describe: '绘制顺序，越大越靠前' },
          width: { type: 'number', describe: '可选目标框宽度；须与 height/fit 同时给出且为有限正数' },
          height: { type: 'number', describe: '可选目标框高度；须与 width/fit 同时给出且为有限正数' },
          fit: { type: 'string', describe: '目标框内等比策略：cover（裁源铺满）或 contain（居中留透明边）' },
          sampling: { type: 'string', describe: '纹理采样：nearest（缺省，像素锐利）或 smooth（平滑缩放）' },
        },
        schema: t.obj({
          textureKey: t.asset('texture', '贴图资源键（须在资产清单中，加载期硬校验）'),
          anchorX: t.num('锚点 X（0~1，0.5 为中心）'),
          anchorY: t.num('锚点 Y（0~1，0.5 为中心）'),
          zOrder: t.num('绘制顺序，越大越靠前'),
          width: t.opt(t.num('目标框宽度')),
          height: t.opt(t.num('目标框高度')),
          fit: t.opt(t.enum(['cover', 'contain'] as const, '目标框内等比策略')),
          sampling: t.opt(t.enum(['nearest', 'smooth'] as const, '纹理采样策略')),
        }),
        refine: refineSprite,
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {
    textureKey: { type: 'string', default: '', describe: '贴图键', question: '用哪张贴图？', ui: { control: 'input' } },
    anchorX: { type: 'number', default: 0.5, describe: '锚点 X', question: '水平锚点（0~1）？', ui: { control: 'slider', min: 0, max: 1, step: 0.01 } },
    anchorY: { type: 'number', default: 0.5, describe: '锚点 Y', question: '垂直锚点（0~1）？', ui: { control: 'slider', min: 0, max: 1, step: 0.01 } },
    zOrder: { type: 'number', default: 0, describe: '绘制层级', question: '绘制层级（越大越靠前）？', ui: { control: 'slider', min: 0, max: 1000, step: 1 } },
  },

  systems: [],
});
