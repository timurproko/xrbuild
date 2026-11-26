const key = source => source ? `${source.owner}/${source.id}` : '';
/** Only acquisition controls: no source writes, status paragraphs, recorder or adjustment editor. */
export function mountHandsLiveControls({ session, view, load, provider = document.getElementById('hands-provider') }) {
  const root = document.getElementById('hands-session-actions') ?? document.createElement('div');
  root.id = 'hands-session-actions'; root.className = 'xrb-button-row'; root.hidden = false;
  const button = document.createElement('button'), state = document.createElement('span');
  button.type = 'button'; button.id = 'hands-start-stop'; state.id = 'hands-live-state'; state.className = 'chip'; state.setAttribute('role', 'status');
  root.replaceChildren(button, state); (provider.closest('label') ?? provider).before(root);
  provider.title = 'Provider changes are saved for the next Start or app launch; the active session is not switched.';
  let status = { phase: 'not-started' }, data = null, supported = true, starting = false, stopping = false, closed = false, polling = false, generation = 0;
  const rates = document.getElementById('hands-tracking-fps'), overlay = document.getElementById('hands-view-empty');
  function render() {
    if (closed) return;
    const active = session.active || starting, phase = status.phase;
    const source = data?.providers?.find(p => key(p) === provider.value);
    const unavailable = !supported ? 'Standalone Hands currently supports Windows x64 only.' : !view?.profile ? 'Wait for the shared SDK view and valid profile.' : !source ? 'Choose an available skeleton provider.' : source.transport !== 'native' ? 'WebXR requires its explicit app XR session.' : !source.available ? source.reason : '';
    const stoppingNow = stopping || session.stopping || phase === 'stopping';
    button.textContent = stoppingNow ? 'Stopping…' : active ? 'Stop' : 'Start';
    button.disabled = stoppingNow || !active && (!!unavailable || phase === 'occupied' || !!view?.replaying);
    const labels = { 'not-started': 'Not started', starting: 'Starting…', waiting: 'Waiting', running: 'Running', 'no-hands': 'No hands', stalled: 'Stalled', stopping: 'Stopping…', stopped: 'Stopped', failed: 'Failed', occupied: 'Busy' };
    let label = labels[phase] ?? 'Not started';
    if (active && status.source && key(status.source) !== provider.value) label += ` · ${status.source.label}`;
    if (state.textContent !== label) state.textContent = label;
    state.classList.toggle('warn', ['failed', 'occupied', 'stalled'].includes(phase));
    const detail = status.reason || (active && status.source ? `Active provider: ${status.source.label}` : unavailable || 'Opening this page starts no capture.');
    button.title = state.title = detail;
    const fps = Number.isFinite(status.trackingFps) && ['running', 'no-hands'].includes(phase) ? status.trackingFps.toFixed(1) : '—';
    if (rates.textContent !== fps) rates.textContent = fps;
    rates.parentElement.dataset.tooltip = fps === '—' ? 'No fresh live provider frames' : `Unique received frames/s · Capture age ${status.frameAgeMs?.toFixed(1)} ms ± ${status.uncertaintyMs?.toFixed(1)} ms · Delivery gaps ${status.dropped ?? 0} · Provider-reported ${status.reportedHz ?? '—'} Hz`;
    if (!view?.replaying) {
      overlay.hidden = phase === 'running';
      const message = phase === 'no-hands' ? 'No hands detected.' : phase === 'waiting' ? 'Waiting for fresh provider frames…' : phase === 'stalled' ? 'Tracking stalled. Hands and holds cleared.' : phase === 'starting' ? 'Starting provider…' : phase === 'stopping' ? 'Stopping provider…' : phase === 'failed' || phase === 'occupied' ? detail : unavailable || 'Press Start to track the saved provider.';
      if (overlay.firstElementChild.textContent !== message) overlay.firstElementChild.textContent = message;
    }
  }
  function update(next) { status = next.phase === 'retired' ? { ...next, phase: next.reason ? 'failed' : 'stopping' } : next; render(); }
  const unsubscribe = session.subscribeLifecycle(update);
  const changed = () => render(); provider.addEventListener('change', changed);
  const click = async () => {
    if (starting || session.active) {
      generation++;
      stopping = true; starting = false; update({ phase: 'stopping', source: status.source });
      try { await session.stop(); } catch (error) { update({ phase: 'failed', reason: error.message }); }
      finally { stopping = false; if (status.phase === 'stopping' && !session.active && !session.stopping) update({ phase: 'stopped' }); else render(); }
      return;
    }
    const own = ++generation;
    starting = true; update({ phase: 'starting' });
    try {
      data = await load();
      if (closed || own !== generation) return;
      // Works with both reviewed source Save and immediate autosave: never starts a stale picker draft.
      if (key(data.selected) !== provider.value) throw new Error('Wait for the provider choice to save before Start.');
      if (!data.selected) throw new Error('Choose a saved provider before Start.');
      await session.start({ provider: data.selected, revision: data.revision, registryRevision: data.registryRevision });
    } catch (error) { if (!closed && own === generation) update({ phase: 'failed', reason: error.message }); }
    finally { if (own === generation) { starting = false; render(); } }
  };
  button.addEventListener('click', click);
  const poll = async () => {
    if (closed || polling || starting || stopping || session.active) return; polling = true;
    try {
      const [current, saved] = await Promise.all([session.status(), load()]);
      if (closed || starting || stopping || session.active) return;
      data = saved; supported = current.supported !== false;
      update(current.busy ? { phase: 'occupied', reason: current.reason || 'Another Hands page owns acquisition. Stop it there first.' } : current.owns ? current : { phase: 'not-started' });
    } catch (error) { if (!closed && !starting && !session.active) update({ phase: 'failed', reason: error.message }); }
    finally { polling = false; }
  };
  const timer = setInterval(() => { if (session.active) render(); else void poll(); }, 1000);
  render(); void poll();
  return { update, dispose() { closed = true; generation++; clearInterval(timer); unsubscribe(); provider.removeEventListener('change', changed); button.removeEventListener('click', click); root.remove(); } };
}
