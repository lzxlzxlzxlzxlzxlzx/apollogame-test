/** Gameplay-only pre-baked binary silhouette; never contains image or canvas bytes. */
export interface HitMaskSpec {
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly threshold: number;
  readonly sourceTextureKey: string;
  readonly rows: readonly string[];
}

/** Strictly reject corrupt, oversized or unsupported mask data. */
export function parseHitMaskSpec(value: unknown): HitMaskSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  const keys = Object.keys(s);
  if (keys.some((k) => !['version', 'width', 'height', 'threshold', 'sourceTextureKey', 'rows'].includes(k))) return null;
  if (s.version !== 1 || !Number.isSafeInteger(s.width) || !Number.isSafeInteger(s.height)
    || (s.width as number) < 1 || (s.height as number) < 1
    || (s.width as number) > 4096 || (s.height as number) > 4096
    || (s.width as number) * (s.height as number) > 1_000_000
    || !Number.isInteger(s.threshold) || (s.threshold as number) < 1 || (s.threshold as number) > 255
    || typeof s.sourceTextureKey !== 'string' || !s.sourceTextureKey
    || !Array.isArray(s.rows) || s.rows.length !== s.height
    || s.rows.some((row) => typeof row !== 'string' || row.length !== s.width || !/^[01]+$/.test(row))) return null;
  return s as unknown as HitMaskSpec;
}
