// One on/off switch behaviour for every plugin and layer toggle. A click moves the switch to the requested side, locks it
// and shows the requested state at once; the switch unlocks only when the page confirms that state through sync(), or
// returns to the confirmed side when the request fails. A repaint in between can never move it back, so nothing flashes.

/**
 * @param {HTMLInputElement} input checkbox with role="switch"
 * @param {{ commit: (next: boolean) => Promise<unknown>, label?: HTMLElement | null, labels?: [string, string],
 *   onPending?: (next: boolean | null) => void, onError?: (error: unknown) => void }} options
 */
export function pendingSwitch(input, { commit, label = null, labels = ['Off', 'On'], onPending = () => {}, onError = () => {} }) {
  let pending = null, confirmed = input.checked, lockedByOwner = input.disabled;
  const show = value => { input.checked = value; if (label) label.textContent = labels[value ? 1 : 0]; };
  const lock = on => { input.disabled = on || lockedByOwner; input.toggleAttribute('aria-busy', on); input.closest('.xrb-switch')?.classList.toggle('is-pending', on); };
  input.addEventListener('change', async () => {
    if (pending !== null) { show(pending); return; }
    pending = input.checked; show(pending); lock(true); onPending(pending);
    try { await commit(pending); }
    catch (error) {
      // Failed: back to the last confirmed side, unlocked, and the caller reports why.
      pending = null; show(confirmed); lock(false); onPending(null); onError(error);
    }
  });
  return {
    /** The requested side while a change is in flight, else null. */
    get pending() { return pending; },
    /** The side to present: the request while pending, else the last confirmed state. */
    get value() { return pending ?? confirmed; },
    /**
     * Applies the confirmed state from the page's data and the owner's own lock. A pending request stays shown and
     * locked until the confirmed state reaches it; then the switch unlocks.
     */
    sync(value, { disabled = false } = {}) {
      confirmed = !!value; lockedByOwner = disabled;
      if (pending !== null && confirmed !== pending) { show(pending); lock(true); return pending; }
      if (pending !== null) { pending = null; onPending(null); }
      show(confirmed); lock(false); return confirmed;
    },
  };
}
