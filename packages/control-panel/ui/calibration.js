import { mountToolNavigation, rebuildHostInPlace } from './navigation.js';
import { enhanceSelects, installDropdowns, installTooltips, installOverlayScrollbars } from './design-system.js';
import { toast, closeToast } from './toast.js';
const disposers = [mountToolNavigation(document.getElementById('calibration-menu-button'), document.getElementById('calibration-menu'), { origin: location.origin, current: 'calibration' }), installDropdowns(), installTooltips(), installOverlayScrollbars(document)];
let disposed = false;
/** Why calibration cannot run, as a toast that stays until it is resolved or dismissed, with its recovery action. */
function notice(value) {
  if (value?.available !== false) { closeToast('calibration-availability'); return; }
  const actions = ['rebuild', 'plugins'].includes(value.recovery) ? [{
    label: value.recovery === 'rebuild' ? 'Rebuild' : 'Plugins',
    onClick: () => {
      if (value.recovery === 'plugins') { location.assign('/plugins/'); return; }
      void rebuildHostInPlace(location.origin, { onComplete(job) { if (job?.state === 'done' && !disposed) location.reload(); } });
    },
  }] : [];
  toast({ id: 'calibration-availability', title: 'Cameras unavailable', message: value.reason, tone: 'warn', actions, timeoutMs: 0 });
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
