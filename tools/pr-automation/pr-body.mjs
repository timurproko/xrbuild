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

function markdownRecords(body) {
  let fence = null, comment = false, offset = 0; const records = [];
  for (const raw of String(body ?? '').match(/[^\n]*(?:\n|$)/g).filter(Boolean)) {
    const line = raw.replace(/\r?\n$/, ''), blank = ' '.repeat(line.length);
    if (fence) {
      const close = /^[ \t]*(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      records.push({ text: blank, offset }); offset += raw.length; continue;
    }
    // Code spans and escaped comment markers remain ordinary notation, not hidden HTML.
    let visible = '', inline = 0;
    for (let i = 0; i < line.length;) {
      if (comment) {
        if (line.startsWith('-->', i)) { visible += '   '; i += 3; comment = false; }
        else { visible += ' '; i++; }
      } else if (line[i] === '`') {
        const run = /^`+/.exec(line.slice(i))[0];
        inline = inline === run.length ? 0 : inline || run.length; visible += run; i += run.length;
      } else if (!inline && line.startsWith('<!--', i) && line[i - 1] !== '\\') { visible += '    '; i += 4; comment = true; }
      else visible += line[i++];
    }
    const opening = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(visible);
    if (opening) { fence = opening[1]; records.push({ text: blank, offset, info: opening[2].trim() }); }
    else records.push({ text: visible, offset });
    offset += raw.length;
  }
  return records;
}

/** Ignore fenced examples and HTML comments without interpreting prose vocabulary or notation. */
export function structuralText(body = '') {
  return markdownRecords(String(body).replaceAll('\r\n', '\n')).map(record => record.text).join('\n') + '\n';
}

export function deliverySections(body) {
  const text = structuralText(body);
  const headings = [...text.matchAll(/^## (Proposal|Implementation|Acceptance|Automation)[ \t]*$/gm)];
  const sections = {};
  for (let i = 0; i < headings.length; i++) sections[headings[i][1]] = text.slice(headings[i].index + headings[i][0].length, headings[i + 1]?.index ?? text.length);
  return { order: headings.map(hit => hit[1]), sections, headings };
}

export function acceptanceOf(body) {
  return deliverySections(body).sections.Acceptance?.trim() ?? '';
}

/** Repository body validation shared by local inspection and trusted promotion. No prose/style/count heuristics. */
export function inspectBodyProgress(body, tasks, { legacy = false } = {}) {
  const parsed = parseLink(body);
  if (parsed.error) return { status: 'blocked', reason: parsed.error };
  const { order, sections, headings } = deliverySections(body);
  const items = (sections.Implementation ?? '').split('\n').filter(line => /^\s*[-*] /.test(line));
  const completeItems = items.length > 0 && items.every(line => /^\s*[-*] \[[xX]\] \S/.test(line));
  if (order.join(',') !== 'Proposal,Implementation,Acceptance,Automation') {
    const checked = structuralText(body).match(/^\s*[-*] \[[ xX]\] /gm) ?? [];
    const claimsComplete = checked.length > 0 && checked.every(line => /\[[xX]\]/.test(line));
    return { status: new Set(order).size !== order.length || claimsComplete ? 'blocked' : 'incomplete', reason: 'Proposal, Implementation, Acceptance and Automation must be in order' };
  }
  if (!sections.Proposal.trim()) return { status: 'blocked', reason: 'Proposal must describe the change' };
  if (!items.length || items.some(line => !/^\s*[-*] \[[ xX]\] \S/.test(line))) {
    if (legacy && items.length && items.every(line => /^\s*[-*] \S/.test(line))) return { status: 'legacy' };
    return { status: 'blocked', reason: 'Implementation needs meaningful outcome checkboxes' };
  }
  if (!completeItems) return { status: 'incomplete', reason: 'Implementation has open items' };
  const outcomes = sections.Acceptance.split('\n').filter(line => /^\s*[-*] /.test(line));
  if (!outcomes.length || outcomes.some(line => !/^\s*[-*] (?!\[[ xX]\])\S/.test(line))) return { status: 'blocked', reason: 'Acceptance needs plain implementation outcomes' };
  // The machine link must be located in the final Automation section, not an example elsewhere.
  const automation = headings.find(heading => heading[1] === 'Automation');
  if (!parsed.linked || !automation || !parseLink(body.replaceAll('\r\n', '\n').slice(automation.index)).linked) return { status: 'blocked', reason: 'Automation must contain one valid implementation link' };
  const taskItems = (tasks ?? '').split(/\r?\n/).filter(line => /^\s*[-*]\s+\[[ xX]\]\s+\S/.test(line));
  if (!taskItems.length) return { status: 'blocked', reason: 'tasks.md has no checkable tasks' };
  const open = taskItems.filter(line => /^\s*[-*]\s+\[ \]/.test(line));
  return open.length ? { status: 'blocked', reason: `pre-ready-tasks-open: ${open.length} open task(s) in tasks.md despite checked Implementation outcomes` } : { status: 'complete' };
}
const CHANGE_ID = /^[a-z0-9][a-z0-9-]*$/;
const BLOCK = /(^|\n)([ \t]*)(`{3,}|~{3,})openspec-implementation[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?\2\3[ \t]*(?=\r?\n|$)/;

function linkMatch(body) {
  const text = String(body ?? '');
  const openings = markdownRecords(text).filter(record => record.info === FENCE).map(record => record.offset);
  if (openings.length > 1) return { error: `multiple ${FENCE} blocks are ambiguous` };
  if (!openings.length) return {};
  const match = BLOCK.exec(text.slice(openings[0]));
  if (!match || match.index !== 0) return { error: `unterminated ${FENCE} block` };
  match.index += openings[0];
  return { match };
}

/**
 * Reads the link. Returns `{ linked: false }` with no block or an empty one (the template's), `{ linked: true, link }`
 * for a valid one, and `{ linked: false, error }` for a malformed one.
 */
export function parseLink(body) {
  const { match: m, error } = linkMatch(body);
  if (error) return { linked: false, error };
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
  const { match: m, error } = linkMatch(body);
  if (error) throw new Error(error);
  if (!m) throw new Error(`no ${FENCE} block in the PR body`);
  const [whole, lead, indent, fence] = m;
  const eol = whole.includes('\r\n') ? '\r\n' : '\n';
  const replaced = `${lead}${indent}${fence}${FENCE}${eol}${indent}${JSON.stringify(link)}${eol}${indent}${fence}`;
  return body.slice(0, m.index) + replaced + body.slice(m.index + whole.length);
}
