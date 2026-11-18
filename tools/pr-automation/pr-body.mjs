// The PR body's link to an OpenSpec change: a fenced `openspec-implementation` block in the Automation section,
//
//   ```openspec-implementation
//   {"version":1,"change":"<change-id>"}
//   ```
//
// Finalization adds "archive" (the archived folder) and "finalizedHead" (the finalization commit). Only this module
// reads or rewrites the block; the rest of the body is left byte for byte.

export const FENCE = 'openspec-implementation';
export const VERSION = 1;
const CHANGE_ID = /^[a-z0-9][a-z0-9-]*$/;
const BLOCK = /(^|\n)([ \t]*)(`{3,}|~{3,})openspec-implementation[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?\2\3[ \t]*(?=\r?\n|$)/;

/**
 * Reads the link. Returns `{ linked: false }` with no block or an empty one (the template's), `{ linked: true, link }`
 * for a valid one, and `{ linked: false, error }` for a malformed one.
 */
export function parseLink(body) {
  const m = BLOCK.exec(body ?? '');
  if (!m) return { linked: false };
  const text = (m[4] ?? '').trim();
  if (!text) return { linked: false };
  let link;
  try {
    link = JSON.parse(text);
  } catch (e) {
    return { linked: false, error: `the ${FENCE} block is not valid JSON (${e.message})` };
  }
  if (!link || typeof link !== 'object' || Array.isArray(link)) return { linked: false, error: `the ${FENCE} block must be a JSON object` };
  if (link.version !== VERSION) return { linked: false, error: `the ${FENCE} block has version ${JSON.stringify(link.version)}; expected ${VERSION}` };
  if (typeof link.change !== 'string' || !CHANGE_ID.test(link.change)) {
    return { linked: false, error: `the ${FENCE} block names change ${JSON.stringify(link.change)}, which is not a change folder name (lower case, digits, dashes)` };
  }
  for (const key of ['archive', 'finalizedHead']) {
    if (key in link && typeof link[key] !== 'string') return { linked: false, error: `the ${FENCE} block's "${key}" must be a string` };
  }
  return { linked: true, link };
}

/** The body with the block's JSON replaced by `link` (fence, indent and everything else kept); throws without a block. */
export function writeLink(body, link) {
  const m = BLOCK.exec(body ?? '');
  if (!m) throw new Error(`no ${FENCE} block in the PR body`);
  const [whole, lead, indent, fence] = m;
  const eol = whole.includes('\r\n') ? '\r\n' : '\n';
  const replaced = `${lead}${indent}${fence}${FENCE}${eol}${indent}${JSON.stringify(link)}${eol}${indent}${fence}`;
  return body.slice(0, m.index) + replaced + body.slice(m.index + whole.length);
}
