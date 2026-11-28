// Toasts: short notices in the bottom-right corner, shared by every panel page and plugin UI.
//   toast({ title, message?, tone?: 'info'|'ok'|'warn'|'err'|'rebuild', actions?: [{ label, onClick? , href? }], id?, timeoutMs? }) -> { close }
// A toast with the same `id` replaces the previous one. Info and success fade after a few seconds (paused while hovered);
// an error with actions stays until it is acted on or closed. Server code raises the same toast with a `toast` event.
import { iconSvg } from './design-system.js';

const open = new Map();
const TONES = new Set(['info', 'ok', 'warn', 'err', 'rebuild']);

function host(doc) {
  let layer = doc.querySelector('.xrb-toasts');
  if (!layer) {
    layer = doc.createElement('div'); layer.className = 'xrb-toasts'; layer.setAttribute('role', 'region'); layer.setAttribute('aria-label', 'Notifications');
    if (typeof layer.showPopover === 'function') layer.setAttribute('popover', 'manual');
    doc.body.append(layer);
    // Stay visible over a fullscreen viewer and above dialogs: a manual popover lives in the top layer.
    const show = () => { try { layer.hidePopover?.(); layer.showPopover?.(); } catch {} };
    show(); doc.addEventListener('fullscreenchange', show);
    doc.addEventListener('xrb-dialog-open', show);
  }
  return layer;
}

export function toast({ title, message = '', tone = 'info', actions = [], id = null, timeoutMs } = {}, doc = globalThis.document) {
  if (!doc || !title) return { close() {} };
  const layer = host(doc);
  if (id && open.has(id)) open.get(id).close(true);
  const card = doc.createElement('div');
  card.className = 'xrb-toast'; if (id) card.dataset.toastId = String(id); card.dataset.tone = TONES.has(tone) ? tone : 'info';
  card.setAttribute('role', tone === 'err' || tone === 'warn' || tone === 'rebuild' ? 'alert' : 'status');
  const dot = doc.createElement('span'); dot.className = 'xrb-toast-dot'; dot.setAttribute('aria-hidden', 'true');
  const body = doc.createElement('div'); body.className = 'xrb-toast-body';
  const heading = doc.createElement('strong'); heading.textContent = String(title).slice(0, 120);
  body.append(heading);
  if (message) { const text = doc.createElement('span'); text.textContent = String(message).slice(0, 400); body.append(text); }
  const valid = (Array.isArray(actions) ? actions : []).filter(a => a && typeof a.label === 'string' && (typeof a.onClick === 'function' || typeof a.href === 'string')).slice(0, 2);
  if (valid.length) {
    const row = doc.createElement('div'); row.className = 'xrb-toast-actions';
    for (const action of valid) {
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'small'; button.textContent = action.label.slice(0, 32);
      button.addEventListener('click', () => { handle.close(); if (action.onClick) action.onClick(); else doc.defaultView.location.assign(action.href); });
      row.append(button);
    }
    body.append(row);
  }
  const closeButton = doc.createElement('button'); closeButton.type = 'button'; closeButton.className = 'xrb-icon-button xrb-toast-close';
  closeButton.setAttribute('aria-label', 'Dismiss'); closeButton.dataset.noTooltip = ''; closeButton.innerHTML = iconSvg('close');
  card.append(dot, body, closeButton);
  layer.append(card);
  const sticky = (card.dataset.tone === 'err' || card.dataset.tone === 'rebuild') && valid.length > 0;
  const life = Number.isFinite(timeoutMs) ? timeoutMs : sticky ? 0 : card.dataset.tone === 'err' || card.dataset.tone === 'warn' ? 8000 : 5000;
  let timer = null, closed = false;
  const arm = () => { clearTimeout(timer); if (life > 0) timer = setTimeout(() => handle.close(), life); };
  const handle = {
    close(immediate = false) {
      if (closed) return; closed = true; clearTimeout(timer);
      if (id && open.get(id) === handle) open.delete(id);
      if (immediate) card.remove(); else { card.dataset.leaving = ''; setTimeout(() => card.remove(), 180); }
    },
  };
  card.addEventListener('pointerenter', () => clearTimeout(timer));
  card.addEventListener('pointerleave', arm);
  closeButton.addEventListener('click', () => handle.close());
  if (id) open.set(id, handle);
  arm();
  return handle;
}

/** Closes the toast with this id, if it is showing. */
export function closeToast(id) { open.get(id)?.close(); }

/** Shows toasts the server sends as `toast` events (title, message, tone, id, actions with href). */
export function listenForToasts(events) {
  events.addEventListener('toast', event => {
    try { const t = JSON.parse(event.data); toast({ title: t.title, message: t.message, tone: t.tone, id: t.id, actions: (t.actions ?? []).filter(a => typeof a?.href === 'string' && a.href.startsWith('/')) }); } catch {}
  });
}
