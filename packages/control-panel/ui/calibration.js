import { mountToolNavigation, rebuildHostInPlace } from './navigation.js';
import { enhanceSelects, installDropdowns, installTooltips, installOverlayScrollbars } from './design-system.js';
const disposers = [mountToolNavigation(document.getElementById('calibration-menu-button'), document.getElementById('calibration-menu'), { origin: location.origin, current: 'calibration' }), installDropdowns(), installTooltips(), installOverlayScrollbars(document)];
const status = document.getElementById('calibration-availability');
let disposed = false;
function notice(value) {
  status.replaceChildren(); status.hidden = value?.available !== false;
  if (status.hidden) return;
  const reason = document.createElement('span'); reason.textContent = value.reason;
  status.title = value.detail || ''; status.append(reason);
  if (['rebuild', 'plugins'].includes(value.recovery)) {
    const action = document.createElement('button'); action.type = 'button';
    action.textContent = value.recovery === 'rebuild' ? 'Rebuild' : 'Plugins';
    action.addEventListener('click', async () => {
      if (value.recovery === 'plugins') { location.assign('/plugins/'); return; }
      action.disabled = true;
      try { await rebuildHostInPlace(location.origin, { onComplete(job) { if (job?.state === 'done' && !disposed) location.reload(); } }); }
      finally { action.disabled = false; }
    });
    status.append(' ', action);
  }
}
addEventListener('pagehide', () => { disposed = true; disposers.reverse().forEach(dispose => dispose?.()); }, { once: true });
try {
  const response = await fetch('/api/calibration', { cache: 'no-store' });
  const value = await response.json();
  if (!response.ok || !value.available) { notice({ ...value, available: false, reason: value.reason || value.error || 'Calibration plugin is unavailable.' }); }
  else {
  const { mountCalibration } = await import(value.module);
  if (!disposed) {
    const dispose = await mountCalibration(document.getElementById('calibration-root'), { capture: value.capture, notice });
    if (disposed) { dispose?.(); } else {
      disposers.push(dispose);
      document.getElementById('calibration-root').hidden = false;
      notice(value.capture);
      disposers.push(enhanceSelects());
    }
  }
  }
} catch (error) { if (!disposed) notice({ available: false, reason: error.message }); }
finally { document.getElementById('calibration-loading').hidden = true; }
