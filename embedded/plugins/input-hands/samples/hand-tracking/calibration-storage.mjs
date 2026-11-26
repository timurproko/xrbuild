import { CALIBRATION_STORAGE } from './src/live/multiview/viewer.ts';
/** Only this key is staged. Local snapshots change only after the server acknowledges a revision-safe write. */
export function calibrationStorage(request) {
  let revision = null, values = {}, pending = null, problem = null, flushing = null;
  return {
    get ready() { return revision !== null && !problem; },
    async prepare() {
      if (flushing) throw new Error('Wait for the calibration save to finish.');
      try {
        const value = await request('/api/calibration/preferences');
        if (typeof value.revision !== 'string' || !value.values || typeof value.values !== 'object' || Array.isArray(value.values)) throw new Error('Invalid calibration preferences response.');
        revision = value.revision; values = { ...value.values }; pending = null; problem = null;
      } catch (error) { problem = error; throw error; }
    },
    getItem(key) { if (problem) throw problem; if (revision === null) throw new Error('Reload saved calibration preferences first.'); return key === CALIBRATION_STORAGE ? values[key] ?? null : null; },
    setItem(key, value) {
      if (key !== CALIBRATION_STORAGE || typeof value !== 'string' || value.length > 524288) throw new Error('Invalid calibration preference.');
      if (problem) throw problem;
      if (revision === null || flushing) throw new Error('Reload saved calibrations or wait for the current save.');
      pending = value;
    },
    async flush() {
      if (flushing) return flushing;
      if (pending === null) return;
      const value = pending; pending = null;
      flushing = (async () => {
        try {
          const next = await request('/api/calibration/preferences', { method: 'PUT', body: JSON.stringify({ revision, key: CALIBRATION_STORAGE, value }) });
          if (typeof next.revision !== 'string' || next.values?.[CALIBRATION_STORAGE] !== value) throw new Error('Calibration save acknowledgement is invalid. Reload saved results.');
          revision = next.revision; values = { ...next.values };
        } catch (error) { problem = error; throw error; }
      })().finally(() => { flushing = null; });
      return flushing;
    },
  };
}
