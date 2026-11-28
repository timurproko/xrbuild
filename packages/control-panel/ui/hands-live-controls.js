import { handsLog, clearHandsLog } from './hands-log.js';
import { isPanelUnavailable } from './navigation.js';
import { toast, closeToast } from './toast.js';
const key = source => source ? `${source.owner}/${source.id}` : '';
/** Only acquisition controls: no source writes, status paragraphs, recorder or adjustment editor. */
export function mountHandsLiveControls({ session, view, load, provider = document.getElementById('hands-provider') }) {
  const root = document.getElementById('hands-session-actions') ?? document.createElement('div');
  root.id = 'hands-session-actions'; root.className = 'hands-session-actions'; root.hidden = false;
  // Adopt the page's Start and status (shown disabled before this loads) so nothing appears or disappears.
  const button = document.getElementById('hands-start-stop') ?? document.createElement('button'), state = document.getElementById('hands-live-state') ?? document.createElement('span'), diagnostic = document.getElementById('hands-log') ?? document.createElement('small');
  diagnostic.id ||= 'hands-live-diagnostic'; diagnostic.hidden = true;
  button.type = 'button'; button.id = 'hands-start-stop'; button.className = 'primary'; state.id = 'hands-live-state'; state.className = 'chip'; state.setAttribute('role', 'status');
  // Start/Stop leads the viewer toolbar; the status sits in the header; diagnostics stay beside the provider.
  const header = document.getElementById('hands-header-status');
  root.replaceChildren(button); if (!root.isConnected) (provider.closest('label') ?? provider).before(root);
  if (header) header.replaceChildren(state); else root.append(state);
  if (!diagnostic.isConnected) (provider.closest('label') ?? provider).before(diagnostic);
  // Diagnostics and reasons become timestamped lines in the Log tab (newest last, bounded), never repeated back to back.
  // Diagnostics and reasons become rows in the Log tab through the shared Hands log.
  const append = (text, options = {}) => handsLog(text, { ...options, target: diagnostic });
  const logEvent = text => append(text);
  const log = (text, level = 'warn') => append(text, { source: 'session', level });
  document.getElementById('hands-log-clear')?.addEventListener('click', () => clearHandsLog(diagnostic));
  // Start and Stop share one width, the size of Reset, so the toolbar never shifts between them.
  const lockWidth = () => { if (!button.isConnected || button.style.minWidth) return; const current = button.textContent; let widest = 0;
    for (const label of ['Start', 'Stop']) { button.textContent = label; widest = Math.max(widest, button.getBoundingClientRect().width); }
    widest = Math.max(widest, document.getElementById('hands-view-reset')?.getBoundingClientRect().width ?? 0);
    button.textContent = current; if (widest) button.style.minWidth = `${widest}px`; };
  provider.title = 'Provider changes are saved for the next Start or app launch; the active session is not switched.';
  let status = { phase: 'not-started' }, data = null, supported = true, starting = false, stopping = false, closed = false, polling = false, generation = 0, lastDiagnostic = '';
  const rates = document.getElementById('hands-tracking-fps');
  function render() {
    if (closed) return;
    lockWidth();
    const active = session.active || starting, phase = status.phase;
    document.body.dataset.handsSession = active ? 'live' : '';
    lastDiagnostic = status.diagnostic || lastDiagnostic;
    logLifecycle(phase);
    const failing = ['failed', 'occupied', 'cleanup'].includes(status.phase) && status.reason;
    log(failing ? status.reason : lastDiagnostic, status.phase === 'failed' ? 'err' : 'warn');
    const source = data?.providers?.find(p => key(p) === provider.value);
    const unavailable = !supported ? 'Standalone Hands currently supports Windows x64 only.' : !view?.profile ? 'Wait for the shared SDK view and valid profile.' : !source ? 'Choose an available skeleton provider.' : source.transport !== 'native' ? 'WebXR requires its explicit app XR session.' : !source.available ? source.reason : '';
    const cleanupPending = session.blocked || status.cleanupPending;
    const stoppingNow = stopping || session.stopping || phase === 'stopping';
    button.textContent = cleanupPending && !stopping ? 'Retry cleanup' : stoppingNow ? 'Stop' : active ? 'Stop' : status.takeoverAvailable ? 'Take over' : 'Start';
    button.disabled = stopping || !cleanupPending && (stoppingNow || !active && (!!unavailable || phase === 'occupied' && !status.takeoverAvailable || !!view?.replaying));
    explainBlocked(!active && !cleanupPending && data && view?.profile ? unavailable : '');
    const labels = { 'not-started': 'Not started', starting: 'Starting…', waiting: 'Waiting', running: 'Running', 'no-hands': 'No hands', rejected: 'Observation dropped', stalled: 'Stalled', stopping: 'Stopping…', stopped: 'Stopped', failed: 'Failed', cleanup: 'Cleanup', occupied: 'Busy' };
    let label = labels[phase] ?? 'Not started';
    if (active && status.source && key(status.source) !== provider.value) label += ` · ${status.source.label}`;
    if (state.textContent !== label) state.textContent = label;
    state.classList.toggle('warn', ['failed', 'occupied', 'stalled'].includes(phase));
    const fps = Number.isFinite(status.trackingFps) && ['running', 'no-hands'].includes(phase) ? status.trackingFps.toFixed(1) : '—';
    if (rates.textContent !== fps) rates.textContent = fps;
    rates.parentElement.dataset.tooltip = fps === '—' ? 'No fresh live provider frames' : `Unique received frames/s · Capture age ${status.frameAgeMs?.toFixed(1)} ms ± ${status.uncertaintyMs?.toFixed(1)} ms · Delivery gaps ${status.dropped ?? 0} · Provider-reported ${status.reportedHz ?? '—'} Hz`;
  }
  // Why Start cannot be used, as a lasting notice in the corner: shown once the page has loaded, replaced when the reason
  // changes and closed when Start becomes usable. A dismissed notice stays closed until the reason changes.
  let blockedReason = '';
  function explainBlocked(reason) {
    button.title = reason;
    if (reason === blockedReason) return;
    blockedReason = reason;
    if (!reason) { closeToast('hands-start-blocked'); return; }
    const setup = document.querySelector('.hands-adjustment-tabs [data-tab="setup"]');
    toast({ id: 'hands-start-blocked', title: "Hands can't start", message: reason, tone: 'warn', timeoutMs: 0,
      actions: setup ? [{ label: 'Open Setup', onClick: () => setup.click() }] : [] });
  }
  // Provider lifecycle in the Log: one line per start, start confirmation and stop, not per running/no-hands flip.
  const LIVE = ['waiting', 'running', 'no-hands', 'rejected', 'stalled'];
  let lastPhase = 'not-started';
  function logLifecycle(phase) {
    if (phase === lastPhase) return;
    const name = status.source?.label ?? provider.selectedOptions?.[0]?.textContent ?? 'Provider', was = lastPhase; lastPhase = phase;
    if (phase === 'starting') logEvent(`Starting ${name}…`);
    else if (LIVE.includes(phase) && !LIVE.includes(was)) logEvent(`${name} started`);
    else if (phase === 'stopping') logEvent(`Stopping ${name}…`);
    else if (['stopped', 'not-started'].includes(phase) && (LIVE.includes(was) || was === 'stopping' || was === 'starting')) logEvent(`${name} stopped`);
  }
  function update(next) { status = next.phase === 'retired' ? { ...next, phase: next.reason ? 'failed' : 'stopping' } : next; render(); }
  const unsubscribe = session.subscribeLifecycle(update);
  const changed = () => render(); provider.addEventListener('change', changed);
  const click = async () => {
    if (status.cleanupPending && !session.active && !session.blocked) {
      generation++; stopping = true; render();
      try { update(await session.recover(status.sessionId)); } catch (error) { update({ ...status, phase: 'failed', reason: error.message, cleanupPending: true }); }
      finally { stopping = false; render(); }
      return;
    }
    if (starting || session.active || session.blocked) {
      generation++;
      stopping = true; starting = false; update({ phase: 'stopping', source: status.source });
      try { await session.stop(); } catch (error) { update({ phase: 'failed', reason: error.message }); }
      finally { stopping = false; if (status.phase === 'stopping' && !session.active && !session.stopping) update({ phase: 'stopped' }); else render(); }
      return;
    }
    const own = ++generation, takeoverSessionId = status.takeoverAvailable ? status.sessionId : undefined;
    starting = true; update({ phase: 'starting' });
    try {
      data = await load();
      if (closed || own !== generation) return;
      // Works with both reviewed source Save and immediate autosave: never starts a stale picker draft.
      if (key(data.selected) !== provider.value) throw new Error('Wait for the provider choice to save before Start.');
      if (!data.selected) throw new Error('Choose a saved provider before Start.');
      await session.start({ provider: data.selected, revision: data.revision, registryRevision: data.registryRevision, ...(takeoverSessionId ? { takeoverSessionId } : {}) });
    } catch (error) { if (!closed && own === generation) update({ phase: 'failed', reason: error.message }); }
    finally { if (own === generation) { starting = false; render(); } }
  };
  button.addEventListener('click', click);
  const poll = async () => {
    if (closed || polling || starting || stopping || session.active) return; polling = true; const own = generation;
    try {
      const [current, saved] = await Promise.all([session.status(), load()]);
      if (closed || own !== generation || starting || stopping || session.active) return;
      data = saved; supported = current.supported !== false;
      update(current.busy ? current.owns || current.cleanupPending
        ? { ...current, phase: 'cleanup', cleanupPending: true, reason: current.reason || 'Previous owned Hands acquisition is draining; retry cleanup before Start.' }
        : { ...current, phase: 'occupied', reason: current.reason || 'Another live Hands page owns acquisition. Take over stops it before starting here.' }
        : current.owns ? current : { phase: 'not-started', diagnostic: current.diagnostic });
    } catch (error) { if (!closed && own === generation && !starting && !session.active && !isPanelUnavailable(error)) update({ phase: 'failed', reason: error.message }); }
    finally { polling = false; }
  };
  const timer = setInterval(() => { if (session.active) render(); else void poll(); }, 1000);
  render(); void poll();
  return { update, dispose() { closed = true; generation++; clearInterval(timer); closeToast('hands-start-blocked'); unsubscribe(); provider.removeEventListener('change', changed); button.removeEventListener('click', click); root.remove(); } };
}
