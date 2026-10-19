/** Icon-only Button accepts only resolved, local image URLs or bounded raster data URLs. */
export function safeButtonIconUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return undefined;
  if (/^\/(?!\/)[a-zA-Z0-9/_~.%+-]+$/.test(value) && !value.split('/').includes('..')) return value;
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}$/.test(value)) return value;
  return undefined;
}
