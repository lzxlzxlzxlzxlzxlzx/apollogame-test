import { describe, expect, it } from 'vitest';
import { BLOCK_COUNT, BLOCK_LENGTH } from './tower-blueprint.js';
import { EXTRACTION_DISTANCE, STABLE_FRAME_WINDOW, hasFallenFromTower, hasStableTowerWindow, isExtracted, isInitialTowerReady, isTowerBlock, phaseAfterRelease, pullDistanceFromPosition, syncExtractedBlock } from './tower-lifecycle.js';

describe('game-105 tower lifecycle guards', () => {
  it('never lets a late pointer release erase the toppled terminal state', () => {
    expect(phaseAfterRelease('toppled')).toBe('toppled');
    expect(phaseAfterRelease('pulling')).toBe('settling');
  });

  it('opens the initial tower only after every block has reported settled', () => {
    const settled = new Set(Array.from({ length: BLOCK_COUNT - 1 }, (_, index) => `g105-block-${index}`));
    expect(isInitialTowerReady(settled)).toBe(false);
    settled.add('g105-block-final');
    expect(isInitialTowerReady(settled)).toBe(true);
  });

  it('excludes only a fully extracted block from tower-collapse signals', () => {
    const extracted = new Set(['g105-block-12']);
    expect(EXTRACTION_DISTANCE).toBe(BLOCK_LENGTH * 0.92);
    expect(isExtracted(BLOCK_LENGTH * 0.9199)).toBe(false);
    expect(isExtracted(EXTRACTION_DISTANCE)).toBe(true);
    expect(isTowerBlock('g105-block-12', extracted)).toBe(false);
    expect(isTowerBlock('g105-block-13', extracted)).toBe(true);
  });

  it('reinstates a block dragged back into the tower before release', () => {
    const extracted = new Set<string>();
    const axis: [number, number, number] = [1, 0, 0];
    syncExtractedBlock(extracted, 'g105-block-12', pullDistanceFromPosition({ x: 0, z: 0 }, { x: EXTRACTION_DISTANCE + 0.1, z: 0 }, axis));
    expect(isTowerBlock('g105-block-12', extracted)).toBe(false);
    syncExtractedBlock(extracted, 'g105-block-12', pullDistanceFromPosition({ x: 0, z: 0 }, { x: 0.2, z: 0 }, axis));
    expect(isTowerBlock('g105-block-12', extracted)).toBe(true);
  });

  it('requires a continuous full-tower sleep window before reopening input', () => {
    expect(hasStableTowerWindow(STABLE_FRAME_WINDOW - 1)).toBe(false);
    expect(hasStableTowerWindow(STABLE_FRAME_WINDOW)).toBe(true);
  });

  it('only retires a Cannon-synchronised body after both a real drop and lateral departure', () => {
    expect(hasFallenFromTower({ x: 0, y: 4, z: 0 }, { x: .4, y: 3.2, z: 0 }, .7, .42)).toBe(true);
    expect(hasFallenFromTower({ x: 0, y: 4, z: 0 }, { x: .4, y: 3.5, z: 0 }, .7, .42)).toBe(false);
    expect(hasFallenFromTower({ x: 0, y: 4, z: 0 }, { x: .1, y: 3.2, z: 0 }, .7, .42)).toBe(false);
  });
});
