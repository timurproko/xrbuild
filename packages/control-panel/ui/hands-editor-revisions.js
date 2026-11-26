// File hashes identify snapshots, not ordering: a foreign edit can legitimately restore an older hash.
export function handsEditorRevisions() {
  const unseen = new Set(); let current = null;
  const valid = revision => typeof revision === 'string' && /^[a-f0-9]{64}$/.test(revision);
  return {
    incorporate(revision, reviewed = false) {
      if (!valid(revision)) return;
      current = revision;
      unseen.delete(revision);
      if (reviewed === true) unseen.clear();
      else if (reviewed) for (const previous of reviewed) unseen.delete(previous);
    },
    changed(revision) {
      if (valid(revision) && current === revision) return false;
      if (unseen.size > 128) { unseen.clear(); unseen.add(null); } // Require review after an excessive unseen backlog.
      unseen.add(valid(revision) ? revision : null); return true;
    },
    reviewToken() { return new Set(unseen); },
    get revision() { return current; },
    get stale() { return unseen.size > 0; },
  };
}
