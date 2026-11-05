const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** Returns the requested SemVer-style release increment, or null for a pending invalid version. */
export function bumpPackageVersion(version, kind) {
  const match = VERSION.exec(String(version).trim());
  if (!match || !['patch', 'minor', 'major'].includes(kind)) return null;
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) return null;
  if (kind === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (kind === 'minor') { parts[1]++; parts[2] = 0; }
  else parts[2]++;
  return parts.join('.');
}

/** Orders two stable three-part versions; a malformed value sorts first. */
export function compareVersions(a, b) {
  const pa = VERSION.exec(String(a).trim())?.slice(1).map(Number) ?? [-1, -1, -1];
  const pb = VERSION.exec(String(b).trim())?.slice(1).map(Number) ?? [-1, -1, -1];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/**
 * The next publication version to offer: the saved draft while it still exceeds every retained version, else
 * the patch after the highest retained version (also after a rollback), else `0.1.0` without semantic history.
 */
export function nextPublicationVersion(draft, retainedVersions) {
  const top = retainedVersions.filter((v) => typeof v === 'string' && bumpPackageVersion(v, 'patch')).sort(compareVersions).at(-1) ?? null;
  if (draft && bumpPackageVersion(draft, 'patch') && (!top || compareVersions(draft, top) > 0)) return String(draft).trim();
  return top ? bumpPackageVersion(top, 'patch') : '0.1.0';
}
