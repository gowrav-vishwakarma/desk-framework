export const TAB_QUERY_KEY = 'tab';

/** One segment from `?tab=outer/inner`. Empty or missing becomes `[]`. */
export function splitTabPath(raw: unknown): string[] {
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    return raw.split('/').map((part) => part.trim()).filter((part) => part.length > 0);
  }
  if (Array.isArray(raw)) {
    const parts = raw.filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    if (parts.length === 0) return [];
    if (parts.length === 1) return splitTabPath(parts[0]);
    return parts.map((part) => part.trim());
  }
  return [];
}

export function joinTabPath(ids: readonly string[]): string {
  return ids.filter((id) => id.length > 0).join('/');
}

/**
 * While a child strip is still restoring, do not write a shorter path that would drop its segment.
 */
export function isPendingPrefix(next: string, current: string): boolean {
  if (!current || next === current) return false;
  if (!next) return false;
  return current.startsWith(`${next}/`);
}
