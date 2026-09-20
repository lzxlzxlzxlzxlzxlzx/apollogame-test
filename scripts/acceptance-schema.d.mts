export interface ScenarioError { path: string; msg: string; line?: number; col?: number }
export type ScenarioAssertion =
  | ({ res: string } & ({ eq: number } | { gte: number } | { lte: number }))
  | { flag: string; eq: boolean }
  | { sv: string; eq: string }
  | { comp: { entity: string; component: string; field: string }; eq: unknown };
export type ScenarioStep =
  | { signal: string; args?: Record<string, unknown>; by?: string }
  | { tick: number }
  | { expect: ScenarioAssertion[] }
  | { waitUntil: ScenarioAssertion[]; cap: number };
export interface AcceptanceScenario {
  name: string;
  game: string;
  seed: number;
  config?: Record<string, unknown>;
  steps: ScenarioStep[];
}
export class JsoncSyntaxError extends Error {
  constructor(msg: string, line: number, col: number);
  line: number;
  col: number;
}
export function parseJsonc(text: string): unknown;
export function locOf(node: unknown): { line: number; col: number } | undefined;
export function validateScenario(value: unknown): { ok: boolean; errors: ScenarioError[] };
export function parseAndValidate(text: string): { ok: boolean; value?: AcceptanceScenario; errors: ScenarioError[] };
export function formatErrors(errors: ScenarioError[]): string;
