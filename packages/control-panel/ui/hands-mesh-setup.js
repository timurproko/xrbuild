// Prerequisite install for a post-processing plugin: show its plan, take explicit consent, run it as a panel job.
import { iconSvg } from './design-system.js';
import { installJobLogCopy } from './job-log.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const size = bytes => bytes >= 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(2)} GB` : `${(bytes / 2 ** 20).toFixed(1)} MB`;

async function post(route, body) {
  const response = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

/** Opens the install dialog for one plugin. Resolves true when its prerequisites were installed. */
export function openMeshSetup({ owner, label, document: doc = globalThis.document }) {
  return new Promise(resolve => {
    const dialog = doc.createElement('dialog');
    dialog.className = 'xrb-dialog xrb-progress-dialog xrb-rebuild-dialog hands-mesh-setup';
    dialog.setAttribute('aria-labelledby', 'hands-mesh-setup-title');
    dialog.innerHTML = `<div class="xrb-progress-status"><span class="xrb-progress-status-icon" data-state="idle" aria-hidden="true">
      <span class="xrb-progress-idle">${iconSvg('settings')}</span>
      <span class="xrb-spinner xrb-spinner-accent xrb-progress-running"></span>
      <span class="xrb-progress-check">${iconSvg('check-circle')}</span>
      <span class="xrb-progress-error">${iconSvg('error-circle')}</span>
    </span><div><h3 id="hands-mesh-setup-title">Install prerequisites</h3><p class="muted" data-setup-message role="status">Reading the setup plan…</p></div></div>
    <div class="xrb-copy-block"><button type="button" class="xrb-icon-button xrb-copy-action" data-setup-copy aria-label="Copy setup log">${iconSvg('copy')}</button><pre class="log" data-setup-output aria-label="Setup details">Reading the setup plan…</pre></div>
    <div class="row ask-buttons"><span class="spacer"></span>
      <button type="button" class="action-button" data-setup-cancel>Cancel</button>
      <button type="button" class="action-button primary" data-setup-install disabled>Install</button></div>`;
    doc.body.append(dialog);
    const status = dialog.querySelector('.xrb-progress-status-icon'), message = dialog.querySelector('[data-setup-message]');
    const output = dialog.querySelector('[data-setup-output]'), cancel = dialog.querySelector('[data-setup-cancel]'), install = dialog.querySelector('[data-setup-install]');
    let plan = null, running = false, done = false;
    installJobLogCopy(dialog.querySelector('[data-setup-copy]'), async () => output.textContent);
    new MutationObserver(() => { message.title = message.textContent; }).observe(message, { childList: true, characterData: true, subtree: true });
    // Same template as Rebuild: a gear while reviewing, then spinner, check or error in the same place.
    const state = value => { status.dataset.state = value; };
    const finish = () => { if (running) return; if (dialog.open) dialog.close(); dialog.remove(); resolve(done); };
    // While installing, Cancel stops the install (its downloads are kept); afterwards it closes the dialog.
    let cancelling = false;
    cancel.addEventListener('click', async () => {
      if (!running) { finish(); return; }
      if (cancelling) return;
      cancelling = true; cancel.disabled = true; message.textContent = `Cancelling ${label}…`;
      try { await post('/api/hands/postprocessing/setup/cancel', {}); } catch { cancelling = false; cancel.disabled = false; }
    });
    dialog.addEventListener('cancel', event => { if (running) event.preventDefault(); else finish(); });
    state('idle');
    (async () => {
      try {
        plan = await post('/api/hands/postprocessing/setup-plan', { owner });
        message.textContent = `${label}: downloads ${size(plan.downloadBytes)} in ${plan.items.length} files, about ${size(plan.installedBytes)} on disk.`;
        output.textContent = [`Destination: ${plan.destination}`, '', ...plan.items.map(i => `${i.publisher} · ${i.name} ${i.version} · ${size(i.bytes)} · ${i.licence}`),
          '', 'Files come from their publishers under the licences listed above.'].join('\n');
        install.disabled = false;
        if (plan.installed) { message.textContent = `${label} is already installed.`; install.textContent = 'Reinstall'; }
      } catch (error) { state('failed'); message.textContent = 'Could not read the setup plan.'; output.textContent = error.message; }
    })();
    install.addEventListener('click', async () => {
      if (!plan || running) return;
      running = true; install.hidden = true; state('running');
      let stepLine = '', stepStarted = Date.now();
      message.textContent = `Installing ${label}…`; output.textContent = 'Starting…';
      try {
        let job = await post('/api/hands/postprocessing/setup', { owner, consent: plan.consent });
        while (job.state === 'running' || job.state === 'queued') {
          await new Promise(r => setTimeout(r, 500));
          const jobs = (await (await fetch('/api/jobs', { cache: 'no-store' })).json()).jobs ?? [];
          job = jobs.find(candidate => candidate.id === job.id) ?? job;
          if (job.lines?.length) { output.textContent = job.lines.slice(-20).join('\n'); output.scrollTop = output.scrollHeight; }
          // The status line names the current step: its percent when the setup reports one, otherwise how long it has run,
          // so a long step such as the self-check visibly keeps going.
          const last = job.lines?.at(-1) ?? '';
          if (last !== stepLine) { stepLine = last; stepStarted = Date.now(); }
          const percent = /\((\d+)%\)/.exec(last)?.[1], step = /^([a-z-]+)(?::|…)/i.exec(last)?.[1];
          const seconds = Math.floor((Date.now() - stepStarted) / 1000), elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
          if (!cancelling) message.textContent = step ? `Installing ${label} · ${step} ${percent ? `${percent}%` : elapsed}` : `Installing ${label}…`;
        }
        done = job.state === 'done';
        if (cancelling && !done) {
          // A cancel is not a failure: back to the plan, ready to continue from the kept downloads.
          state('idle'); message.textContent = `Install cancelled. Install again to continue where it stopped.`;
          install.hidden = false; install.textContent = 'Install';
        } else {
          state(done ? 'done' : 'failed');
          message.textContent = done ? `${label} is ready.` : job.error || 'Install failed; review the output and try again.';
        }
      } catch (error) {
        state('failed');
        const rebuild = /choose Rebuild/i.test(error.message);
        message.textContent = rebuild ? 'Rebuild first, then install.' : 'Install could not start.';
        output.textContent = rebuild ? 'Application components changed since the last Rebuild. Choose Rebuild from the XR Build menu, then press Install again.' : error.message;
      }
      const again = !install.hidden;
      running = false; cancelling = false; cancel.disabled = false;
      cancel.textContent = again ? 'Cancel' : 'Close'; cancel.classList.toggle('primary', !again);
    });
    dialog.showModal();
  });
}
