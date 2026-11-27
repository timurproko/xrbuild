// The Hands Log tab: one row per event with a source badge (provider, session or a plugin's name), the message and the
// time. Newest last, bounded, never the same message twice in a row from one source. Every part of the page logs here.
const LIMIT = 200;
const last = new Map();

const element = () => document.getElementById('hands-log');

/** Adds a row. `source` is the badge text, `level` is '' (info), 'warn' or 'err'; `target` overrides the Log tab element. */
export function handsLog(text, { source = 'provider', level = '' , target = element() } = {}) {
  const log = target; if (!log || !text) return;
  const key = `${log.id}|${source}`;
  if (last.get(key) === text) return;
  last.set(key, text);
  const row = document.createElement('div'); row.className = `entry ${level}`.trim();
  const src = document.createElement('span'), badge = document.createElement('span'), msg = document.createElement('span'), time = document.createElement('span');
  src.className = 'src'; badge.className = 'badge'; badge.textContent = source; src.append(badge);
  msg.className = 'msg'; msg.textContent = text; time.className = 'time'; time.textContent = new Date().toLocaleTimeString([], { hour12: false });
  row.append(src, msg, time); log.append(row);
  while (log.childElementCount > LIMIT) log.firstElementChild.remove();
  log.hidden = false;
  const empty = document.getElementById('hands-log-empty'); if (empty) empty.hidden = true;
  log.scrollTop = log.scrollHeight;
}

/** Empties the log (the tab's clear action). */
export function clearHandsLog(target = element()) {
  const log = target; if (!log) return;
  log.replaceChildren(); log.hidden = true; last.clear();
  const empty = document.getElementById('hands-log-empty'); if (empty) empty.hidden = false;
}
