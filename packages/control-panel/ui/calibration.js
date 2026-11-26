import { mountToolNavigation } from './navigation.js';
import { enhanceSelects, installTooltips, installOverlayScrollbars } from './design-system.js';
const disposers = [mountToolNavigation(document.getElementById('calibration-menu-button'), document.getElementById('calibration-menu'), { origin: location.origin, current: 'calibration' }), installTooltips(), installOverlayScrollbars(document)];
const status = document.getElementById('calibration-availability');
let disposed = false;
try {
  const response = await fetch('/api/calibration', { cache: 'no-store' });
  const value = await response.json();
  if (!response.ok || !value.available) throw new Error(value.reason || value.error || 'Calibration plugin is unavailable.');
  const { mountCalibration } = await import(value.module);
  if (!disposed) {
    disposers.push(await mountCalibration(document.getElementById('calibration-root'), { capture: value.capture }));
    document.getElementById('calibration-root').hidden = false;
    status.textContent = value.capture?.reason || '';
    disposers.push(enhanceSelects());
  }
} catch (error) { status.textContent = error.message; }
addEventListener('pagehide', () => { disposed = true; disposers.reverse().forEach(dispose => dispose?.()); }, { once: true });
