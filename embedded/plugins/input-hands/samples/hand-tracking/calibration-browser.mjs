/** Calibration-only mount. Acquisition and persistence are explicit operations. */
export async function mountCalibration(root, { capture }) {
  root.querySelector('#cal-connect').disabled = !capture?.available;
  root.querySelector('#cal-capture-status').textContent = capture?.reason || 'Not connected.';
  return () => {};
}
