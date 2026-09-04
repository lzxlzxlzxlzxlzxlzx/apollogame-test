/** Typed public surface of the JavaScript acceptance runner for TypeScript tests. */
export interface AcceptanceScenarioResult {
  ok: boolean;
  failures: unknown[];
  trace: unknown[];
  error?: string;
}

export interface AcceptanceScenarioRun {
  name: string;
  file: string;
  ok: boolean;
  res?: AcceptanceScenarioResult;
  schemaErrors?: unknown;
}

export interface AcceptanceGameRun {
  slug: string;
  ok: boolean;
  error?: string;
  scenarios: AcceptanceScenarioRun[];
}

export function runGame(root: string, slug: string): Promise<AcceptanceGameRun>;
