import type { WorldBlueprint } from '@zerocraft/engine/assembly/demo.assembly.js';
import { colorCapability, shapeCapability, spriteCapability, transformCapability } from '@zerocraft/engine/atom-skills/index.js';
import { angularGestureCapability } from '@zerocraft/engine/skills/tier2/angular-gesture.js';
import { dragPlaceCapability } from '@zerocraft/engine/skills/tier2/drag-place.js';
import { clickableCapability } from '@zerocraft/engine/skills/tier2/clickable.js';
import { keybindCapability } from '@zerocraft/engine/skills/tier2/keybind.js';
import { orderedActionSessionCapability } from '@zerocraft/engine/skills/tier2/ordered-action-session.js';
import { pointOnEllipse } from '@zerocraft/engine/skills/tier2/angular-gesture.js';
import { POTION_SIGNALS, addSignal, type PotionRound } from './recipe.js';
import { ingredientArtKey, POTION_ART } from './art.js';

const POT_X = 760;
const LIQUID_Y = 423;
const ROD_RX = 105;
const ROD_RY = 43;

/** 配方只填数据：步骤由 G1 解释，手势与投放分别由 G2/G3 解释。 */
export function buildPotionBlueprint(round: PotionRound): WorldBlueprint {
  const acceptedActions = [
    ...round.recipe.ingredients.map((ingredient) => addSignal(ingredient.ingredientId)),
    POTION_SIGNALS.clockwise, POTION_SIGNALS.counterclockwise,
  ];
  const steps = round.recipe.steps.map((step) => ({
    expectedAction: step.kind === 'add' ? addSignal(step.ingredientId) : POTION_SIGNALS[step.direction],
    requiredCount: step.kind === 'add' ? 1 : step.turns,
  }));
  const rodAt = pointOnEllipse(POT_X, LIQUID_Y, ROD_RX, ROD_RY, 0);
  return {
    meta: { tickRate: 60 },
    capabilities: [
      transformCapability, shapeCapability, colorCapability, spriteCapability,
      dragPlaceCapability, clickableCapability, keybindCapability,
      angularGestureCapability, orderedActionSessionCapability,
    ],
    entities: {
      cauldron: {
        Transform: { x: POT_X, y: 500, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'polygon', vertices: [-169, -30, 169, -30, 167, 54, 139, 133, 94, 174, -94, 174, -139, 133, -167, 54] },
        Color: { tint: 0x332b39, alpha: 1 },
        // 独立透明锅图保留锅口镂空；棒的渐隐入水端另在前景绘制。
        Sprite: { textureKey: POTION_ART.cauldron, anchorX: 0.5, anchorY: 0.5, zOrder: 4, width: 398, height: 398, fit: 'contain', sampling: 'smooth' },
        OrderedActionSession: {
          id: round.brewingId, acceptedActions, steps,
          successSignal: POTION_SIGNALS.success, failureSignal: POTION_SIGNALS.failure,
        },
      },
      'cauldron-mouth': {
        Transform: { x: POT_X, y: LIQUID_Y, rotation: 0, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'box', width: 246, height: 106 },
        DropZone: { hitShape: 'ellipse' },
        Color: { tint: 0xa9dce7, alpha: 0 },
      },
      rod: {
        Transform: { x: rodAt.x, y: rodAt.y, rotation: 0.25, scaleX: 1, scaleY: 1 },
        Shape: { kind: 'polygon', vertices: [-7, 2, 7, 2, 33, -181, 19, -187] },
        Color: { tint: 0xc69b68, alpha: 1 },
        // 轴心仍是唯一权威角度；贴图只替换扁平碰撞形状的呈现。
        Sprite: { textureKey: POTION_ART.rod, anchorX: 0.5, anchorY: 1, zOrder: 5, width: 58, height: 205, fit: 'contain' },
        AngularGesture: {
          id: 'brew-rod', centerX: POT_X, centerY: LIQUID_Y,
          radiusX: ROD_RX, radiusY: ROD_RY, angleMilliDegrees: 0,
          grabTolerance: 0.2, centerDeadZone: 0.16,
          grabSegment: { startX: 47, startY: -188, endX: 2, endY: -12, radius: 21 },
          maxJumpMilliDegrees: 129600, jitterMilliDegrees: 500,
          fullTurnMilliDegrees: 330000,
          clockwiseSignal: POTION_SIGNALS.clockwise,
          counterclockwiseSignal: POTION_SIGNALS.counterclockwise,
          sessionEntity: 'cauldron',
        },
      },
      ...Object.fromEntries(acceptedActions.map((action, index) => [
        `input:${index}`,
        { KeyBinding: { key: action, signal: action } },
      ])),
      'input:exit': { KeyBinding: { key: 'brew.ui.requestExit', signal: 'brew.ui.requestExit' } },
      ...Object.fromEntries(round.recipe.ingredients.map((ingredient, index) => [
        `ingredient:${ingredient.ingredientId}`,
        {
          Transform: { x: 1180 + (index % 2) * 145, y: 272 + Math.floor(index / 2) * 186, rotation: 0, scaleX: 1, scaleY: 1 },
          // 同一个 Draggable 命中区覆盖材料图和卡面大半；拖拽与点击仍走 G3 的权威命中。
          Shape: { kind: 'box', width: 124, height: 164 },
          Color: { tint: [0x9ebac5, 0xd8bf8b, 0xbda0ad, 0x9ebda0, 0xd3a77a][index]!, alpha: 1 },
          // 原型原创图只作 render-only 外观；未知宿主材料仍安全退回占位几何。
          Sprite: { textureKey: ingredientArtKey(ingredient.ingredientId), anchorX: 0.5, anchorY: 0.5, zOrder: 1, width: 80, height: 88, fit: 'contain' },
          Draggable: { onlyFlag: 'never-enabled' },
          Clickable: { action: addSignal(ingredient.ingredientId), onlyFlag: 'never-enabled' },
        },
      ])),
    },
  };
}
