/** Isolate and recursively freeze scalar metadata snapshots. */
export function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (v: unknown): void => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(copy); return copy;
}
