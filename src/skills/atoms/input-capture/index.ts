import { defineCapability } from '@engine/core/define-capability.js';
import { t } from '@engine/core/schema.js';
import type { RawInput } from '@engine/protocol/components.js';

export type { RawInput };

export const inputCaptureCapability = defineCapability({
  id: 'i1-input-capture',
  version: '1.0.0',

  describe: {
    name: 'input-capture',
    summary: '这帧有什么外部原始信号？',
    semantic: ['input', 'event'],
    whenToUse:
      '需要读取键盘/指针/触摸原始信号时。RawInput 由运行时（DOM 监听等副作用层）每帧注入；action-map(I2) 把它翻译成语义动作。本原子只定义契约，捕获本身是运行时职责。',
    examples: ['键盘：{source:"keyboard", key:"ArrowLeft", phase:"down"}', '指针：{source:"pointer", x:120, y:80, phase:"move"}', '触摸：{source:"touch", x:50, y:50, phase:"down"}'],
  },

  components: {
    provides: {
      // C 治理：InputQueue 是运行时真正注入的输入契约（Engine.step 每拍写·keybind/clickable/dialogue 读），此前零 provider。
      // 在「输入契约」原子登记它（行为仍在运行时·同本原子的 RawInput 口径）；输入三原子重整归上一评审 P3。
      InputQueue: {
        category: 'intent',
        describe: '本拍输入动作队列（单例·运行时每拍整体覆盖·不由 manifest 填写）。actions[] = { key, values?, x?, y?, … } 原始动作。',
        fields: {},
        schema: t.obj({ actions: t.arr(t.any('原始动作 RawInputData')) }),
      },
      RawInput: {
        category: 'event',
        describe: '一帧原始输入信号，由运行时注入、被 action-map 消费。',
        fields: {
          source: { type: 'string', describe: "信号来源：'keyboard' | 'pointer' | 'touch'" },
          key: { type: 'string', describe: '按键名（keyboard 时）' },
          x: { type: 'number', describe: '坐标 X（pointer/touch 时）' },
          y: { type: 'number', describe: '坐标 Y（pointer/touch 时）' },
          phase: { type: 'string', describe: "阶段：'down' | 'up' | 'move'" },
        },
      },
    },
    reads: [],
    writes: [],
    consumes: [],
  },

  config: {},

  systems: [],
});
