import { describe, expect, it } from 'vitest';
import * as CANNON from 'cannon-es';
import { centeredResultTransform, DICE_CAMERA_VIEW, DICE_RESULT_PHASE_MS, diceFlightCeiling, expandedDiceStageFov, formatDiceResultEquation, LOCAL_D20_FACE_VALUES, stackedDicePairs, targetDieQuaternion } from './three-dice-overlay.js';

describe('three-dice-overlay 叠骰恢复判定', () => {
  it('将指定骰面稳定地对齐到世界上方，偏航不改变顶面', () => {
    const die = { sides: 6 as const, faceNormals: [
      new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(-1, 0, 0), new CANNON.Vec3(0, 1, 0),
      new CANNON.Vec3(0, -1, 0), new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(0, 0, -1),
    ] };
    // LOCAL_D6_FACE_VALUES 中值 6 对应局部 +Y 面。
    const quat = targetDieQuaternion(die, 6, 0.4);
    const top = new CANNON.Vec3(0, 1, 0);
    const world = new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w).vmult(top);
    expect(world.y).toBeCloseTo(1, 8);
  });
  it('只标记水平近似重合且垂直分层的骰子对', () => {
    expect(stackedDicePairs([{ x: 0, y: 0.8, z: 0 }, { x: 0.3, y: 2.1, z: 0.2 }, { x: 3, y: 0.8, z: 0 }])).toEqual([[0, 1]]);
  });

  it('不把并排或同高接触误判为叠压', () => {
    expect(stackedDicePairs([{ x: 0, y: 0.8, z: 0 }, { x: 1.8, y: 0.8, z: 0 }, { x: 0.2, y: 1.1, z: 0.1 }])).toEqual([]);
  });

  it('下载的 D20 模型恰好映射 1–20 每个刻字一次', () => {
    expect([...LOCAL_D20_FACE_VALUES].sort((left, right) => left - right)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it('所有骰池都保留顶部安全边距，D20 再按更大的外接球追加余量', () => {
    expect(diceFlightCeiling([20])).toBeCloseTo(2.2);
    expect(diceFlightCeiling([6])).toBeCloseTo(2.45);
    expect(diceFlightCeiling([20, 6])).toBeCloseTo(2.4);
    expect(diceFlightCeiling([6, 6])).toBeCloseTo(2.65);
  });

  it('顶部安全视口以固定 FOV 补偿扩展画布，不在投掷中改变骰子尺寸', () => {
    expect(expandedDiceStageFov(28, 250)).toBeGreaterThan(28);
    expect(expandedDiceStageFov(28, 500)).toBeLessThan(expandedDiceStageFov(28, 250));
    expect(expandedDiceStageFov(28, 250, 0)).toBeCloseTo(28);
  });

  it('D20 机位为保留立体感的近俯视，便于读取朝上数字', () => {
    const [, eyeY, eyeZ] = DICE_CAMERA_VIEW.eye;
    const [, targetY, targetZ] = DICE_CAMERA_VIEW.target;
    const vertical = eyeY - targetY;
    const horizontal = Math.abs(eyeZ - targetZ);
    const elevation = Math.atan2(vertical, horizontal) * 180 / Math.PI;
    expect(elevation).toBeGreaterThanOrEqual(72);
    expect(elevation).toBeLessThanOrEqual(80);
  });

  it('将原始值、修正和最终值压缩为一条算式，再进入判定阶段', () => {
    expect(formatDiceResultEquation(9, 2, 11)).toBe('9 + 2 = 11');
    expect(formatDiceResultEquation(9, -2, 7)).toBe('9 − 2 = 7');
    expect(formatDiceResultEquation(9, 0, 9)).toBe('9');
    expect(DICE_RESULT_PHASE_MS).toBeGreaterThanOrEqual(700);
  });

  it('用舞台中心锚点展示任意宽度的结算文本', () => {
    expect(centeredResultTransform(.82)).toBe('translate(-50%, -50%) scale(0.82)');
    expect(centeredResultTransform(1)).toBe('translate(-50%, -50%) scale(1)');
  });
});
