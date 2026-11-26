import { mountToolNavigation } from './navigation.js';
import { enhanceSelects, installDropdowns, installTooltips, installOverlayScrollbars } from './design-system.js';
const disposers = [mountToolNavigation(document.getElementById('calibration-menu-button'), document.getElementById('calibration-menu'), { origin: location.origin, current: 'calibration' }), installDropdowns(), installTooltips(), installOverlayScrollbars(document)];
const status = document.getElementById('calibration-availability');
let disposed = false;
addEventListener('pagehide', () => { disposed = true; disposers.reverse().forEach(dispose => dispose?.()); }, { once: true });
try {
  const response = await fetch('/api/calibration', { cache: 'no-store' });
  const value = await response.json();
  if (!response.ok || !value.available) throw new Error(value.reason || value.error || 'Calibration plugin is unavailable.');
  const { mountCalibration } = await import(value.module);
  if (!disposed) {
    const dispose = await mountCalibration(document.getElementById('calibration-root'), { capture: value.capture });
    if (disposed) { dispose?.(); } else {
      disposers.push(dispose);
      document.getElementById('calibration-root').hidden = false;
      status.textContent = ''; status.hidden = true;
      disposers.push(enhanceSelects());
    }
  }
} catch (error) { if (!disposed) { status.textContent = error.message; status.hidden = false; } }
finally { document.getElementById('calibration-loading').hidden = true; }
