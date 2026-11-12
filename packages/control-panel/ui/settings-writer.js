const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const get = (object, path) => path.reduce((value, key) => value?.[key], object);
function put(object, path, value) {
  let at = object;
  for (const key of path.slice(0, -1)) at = at[key] ??= {};
  if (value === undefined) delete at[path.at(-1)]; else at[path.at(-1)] = structuredClone(value);
}
function changes(before, after, path = [], out = []) {
  if (equal(before, after)) return out;
  if (after && typeof after === 'object' && !Array.isArray(after) && (before === undefined || before && typeof before === 'object' && !Array.isArray(before))) {
    for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) changes(before?.[key], after[key], [...path, key], out);
  } else out.push({ path, before: structuredClone(before), after: structuredClone(after) });
  return out;
}

/** One queue per logical project. Only explicit field intent is replayed, never a stale whole form. */
export class SettingsWriter {
  constructor({ read, write, saved = () => {}, changed = () => {} }) {
    this.read = read; this.write = write; this.saved = saved; this.changed = changed; this.entries = new Map();
  }
  entry(id) { return this.entries.get(id); }
  overlay(id, manifest) {
    const next = structuredClone(manifest);
    for (const edit of this.entry(id)?.edits.values() ?? []) put(next, edit.path, edit.after);
    return next;
  }
  enqueue(id, before, after) {
    let entry = this.entry(id);
    if (!entry) { entry = { edits: new Map(), error: null, running: null }; this.entries.set(id, entry); }
    for (const edit of changes(before, after)) {
      const key = JSON.stringify(edit.path), pending = entry.edits.get(key);
      entry.edits.set(key, { ...edit, before: pending ? pending.before : edit.before });
    }
    entry.error = null;
    return this.drain(id, entry);
  }
  drain(id, entry) {
    if (entry.running) return entry.running;
    // Defer work until running is assigned, so simultaneous controls share exactly one writer.
    entry.running = Promise.resolve().then(async () => {
      try {
        while (entry.edits.size) {
          const batch = [...entry.edits.entries()].map(([key, edit]) => [key, structuredClone(edit)]);
          let result;
          for (let attempt = 0; attempt < 3; attempt++) {
            const latest = await this.read(id), next = structuredClone(latest.manifest);
            for (const [, edit] of batch) {
              const current = get(next, edit.path);
              if (!equal(current, edit.before) && !equal(current, edit.after)) {
                const error = new Error(`Not saved: ${edit.path.join('.')} changed in another editor. Retry to apply your choice, or Reload to use saved settings.`);
                error.field = edit.path.join('.'); throw error;
              }
              put(next, edit.path, edit.after);
            }
            try { result = await this.write(id, next, latest); break; }
            catch (error) { if (error.status !== 409 || error.data?.details?.stale !== 'manifest' || attempt === 2) throw error; }
          }
          for (const [key, edit] of batch) {
            const pending = entry.edits.get(key);
            if (equal(pending?.after, edit.after)) entry.edits.delete(key);
            else if (pending) pending.before = structuredClone(get(result.manifest, pending.path));
          }
          this.saved(id, result);
        }
      } catch (error) { entry.error = error; }
      finally { entry.running = null; this.changed(id); }
    });
    this.changed(id);
    return entry.running;
  }
  async retry(id) {
    const entry = this.entry(id); if (!entry || entry.running) return;
    try {
      const latest = await this.read(id);
      for (const edit of entry.edits.values()) edit.before = structuredClone(get(latest.manifest, edit.path));
      entry.error = null;
      return this.drain(id, entry);
    } catch (error) { entry.error = error; this.changed(id); }
  }
  discard(id) { const entry = this.entry(id); if (entry && !entry.running) { this.entries.delete(id); this.changed(id); } }
}
