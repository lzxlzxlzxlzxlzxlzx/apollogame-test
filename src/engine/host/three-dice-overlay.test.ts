import { describe, expect, it } from 'vitest';
import { DICE_CAMERA_VIEW, diceFlightCeiling, LOCAL_D20_FACE_VALUES, stackedDicePairs } from './three-dice-overlay.js';

describe('three-dice-overlay 叠骰恢复判定', () => {
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

  it('D20 机位为保留立体感的近俯视，便于读取朝上数字', () => {
    const [, eyeY, eyeZ] = DICE_CAMERA_VIEW.eye;
    const [, targetY, targetZ] = DICE_CAMERA_VIEW.target;
    const vertical = eyeY - targetY;
    const horizontal = Math.abs(eyeZ - targetZ);
    const elevation = Math.atan2(vertical, horizontal) * 180 / Math.PI;
    expect(elevation).toBeGreaterThanOrEqual(72);
    expect(elevation).toBeLessThanOrEqual(80);
  });
});
