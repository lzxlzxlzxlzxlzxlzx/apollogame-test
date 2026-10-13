import type { LifeGamePackage } from '@engine/protocol/life-sim.js';
import { validateLifeGamePackage, type LifePackageIssue, type LifePackageValidationReport } from './life-package-validate.js';

export class LifePackageValidationError extends Error {
  constructor(public readonly issues: readonly LifePackageIssue[]) {
    super(issues.map((x) => `${x.path}: ${x.message}`).join('; '));
    this.name = 'LifePackageValidationError';
  }
}

/** Fail-closed parser for pure LifeGamePackage author input. */
export function parseLifeGamePackage(raw: unknown): LifeGamePackage {
  const report = validateLifeGamePackage(raw);
  if (!report.ok) throw new LifePackageValidationError(report.issues);
  return JSON.parse(JSON.stringify(raw)) as LifeGamePackage;
}

export { validateLifeGamePackage };
export type { LifePackageIssue, LifePackageValidationReport };
