// Optional desktop setup, entered only by an explicit Rebuild action. No startup installers.
import {iconSvg} from './design-system.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {ready:'Ready',missing:'Missing',blocked:'Blocked',installing:'Installing', 'restart-required':'Restart required'};
const controllers = new WeakMap();
const installAction = step => step.state === 'missing' && ['toolchain','native-deps'].includes(step.action) ? step.action : null;
// Fixed workflow positions: status changes must never move the row the user just installed.
const stepPriority = step => step.id === 'native-deps' ? 0 : 1;
const terminal = job => ['done','failed'].includes(job?.state);
const rowAction = step => step.id === 'native-deps' ? 'native-deps' : ['cmake','compiler','sdk'].includes(step.id) ? 'toolchain' : null;
export function desktopChecklistHtml(status) {
  const steps = status.steps.filter(step => step.id !== 'runtime').sort((a, b) => stepPriority(a) - stepPriority(b));
  const tools = steps.filter(step => rowAction(step) === 'toolchain');
  const stateBadge = raw => {
    const state = Object.hasOwn(labels, raw) ? raw : 'blocked';
    return `<span class="state ${state === 'ready' ? 'ok' : state === 'blocked' ? 'err' : 'neutral'}">${labels[state]}</span>`;
  };
  const installButton = (action, label = 'Install') => `<button type="button" class="xrb-setup-install" data-desktop-install="${action}" data-desktop-size-label="${esc(labels.missing)}"><span>${label}</span></button>`;
  const check = (step, compact = false) => {
    const state = Object.hasOwn(labels, step.state) ? step.state : 'blocked';
    const action = compact ? null : installAction(step);
    const label = compact ? `<span class="xrb-setup-label">${esc(step.label)}</span>` : `<strong class="xrb-setup-label">${esc(step.label)}</strong>`;
    if (!compact) {
      const diagnostic = ['blocked','restart-required'].includes(state) ? `<p class="xrb-help">${esc(step.detail)}</p>` : '';
      return `<li class="xrb-setup-step xrb-setup-card" data-desktop-step="${esc(step.id)}"><header class="xrb-setup-group-header"><div class="xrb-setup-heading">${label}<div class="xrb-setup-state">${action ? installButton(action) : stateBadge(state)}</div></div>${diagnostic}</header></li>`;
    }
    return `<li class="xrb-setup-step" data-desktop-step="${esc(step.id)}"><div class="xrb-setup-main">${label}</div><div class="xrb-setup-state">${stateBadge(state)}</div></li>`;
  };
  const buildTools = () => {
    const available = tools.some(step => installAction(step) === 'toolchain');
    const diagnostics = [...new Set(tools.filter(step => ['blocked','restart-required'].includes(step.state)).map(step => step.detail))];
    return `<li class="xrb-setup-group" data-desktop-group="toolchain"><section aria-labelledby="desktop-build-tools-title"><header class="xrb-setup-group-header"><div class="xrb-setup-heading"><h4 id="desktop-build-tools-title">Build tools</h4>${available ? installButton('toolchain', tools.some(step => step.state === 'ready') ? 'Repair' : 'Install') : ''}</div>${diagnostics.map(detail => `<p class="xrb-help">${esc(detail)}</p>`).join('')}</header><ul class="xrb-setup-checks">${tools.map(step => check(step, true)).join('')}</ul></section></li>`;
  };
  return `<ol class="xrb-setup-list">${steps.map(step => rowAction(step) === 'toolchain' ? step === tools[0] ? buildTools() : '' : check(step)).join('')}</ol>`;
}

export async function desktopSetupBeforeRebuild(origin, {progress, onJob, document: doc = globalThis.document} = {}) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(url.hostname) || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid local desktop setup origin');
  const request = async (route, body) => {
    const readOnly = body === undefined;
    for (let attempt = 0; ; attempt++) {
      let response, data;
      try {
        response = await fetch(new URL(route, url.origin), readOnly ? {cache:'no-store'} : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        data = await response.json();
      } catch (problem) {
        if (!(problem instanceof TypeError)) throw problem;
        if (readOnly && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1))); continue; }
        throw new Error(readOnly
          ? 'Connection lost. Refresh to reconnect.'
          : 'Setup may have started. Check Jobs before retrying.');
      }
      if (!response.ok) throw new Error(data.error || `Desktop setup failed (${response.status})`);
      return data;
    }
  };
  const status = await request('/api/host/setup');
  if (status.canBuild) return true;
  const current = controllers.get(doc);
  if (current) return current;

  const work = new Promise(resolve => {
    const dialog = doc.createElement('dialog');
    dialog.className = 'xrb-dialog xrb-progress-dialog xrb-rebuild-dialog';
    dialog.dataset.desktopSetup = '';
    dialog.setAttribute('aria-labelledby', 'desktop-setup-title');
    dialog.setAttribute('aria-describedby', 'desktop-setup-message');
    dialog.innerHTML = `<div class="xrb-stack"><header class="xrb-progress-status xrb-setup-dialog-header"><span class="xrb-progress-status-icon" aria-hidden="true">${iconSvg('settings')}</span><div><h3 id="desktop-setup-title">Desktop setup</h3><p id="desktop-setup-message" class="muted">Install missing prerequisites, then rebuild the desktop host.</p></div></header><div data-desktop-steps></div><p class="xrb-help field-error" data-desktop-error role="alert" hidden></p><div class="row xrb-dialog-actions"><button type="button" class="action-button" data-desktop-refresh>Refresh</button><span class="spacer"></span><button type="button" class="action-button" data-desktop-close>Close</button><button type="button" class="action-button primary" data-desktop-build>Rebuild</button></div></div>`;
    doc.body.append(dialog);
    let latest = status, working = false, checking = false, ended = false, lastJob = null;
    const steps = dialog.querySelector('[data-desktop-steps]'), error = dialog.querySelector('[data-desktop-error]');
    const build = dialog.querySelector('[data-desktop-build]'), refresh = dialog.querySelector('[data-desktop-refresh]');
    const readJobs = async () => { const data = await request('/api/jobs'); return data.jobs ?? []; };
    const fail = message => { error.textContent = message; error.hidden = !message; };
    const outcome = job => {
      if (job?.state === 'failed') fail(job.error || 'Setup failed; review its output, then retry explicitly.');
      else {
        const blocked = latest.steps.find(step => step.state === 'blocked');
        fail(blocked ? blocked.detail || 'Setup is blocked. Refresh to recheck.' : '');
      }
    };
    const render = () => {
      steps.innerHTML = desktopChecklistHtml(latest);
      steps.querySelectorAll('[data-desktop-install]').forEach(button => {
        button.disabled = latest.busy || working || checking;
        button.addEventListener('click', () => void install(button.dataset.desktopInstall));
      });
      build.disabled = !latest.canBuild || working || checking;
      refresh.disabled = working || checking;
      refresh.textContent = checking ? 'Checking...' : 'Refresh';
    };
    const show = () => { render(); if (!dialog.open && !ended) dialog.showModal(); };
    const finish = value => { if (ended) return; ended = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(value); };
    dialog.querySelector('[data-desktop-close]').addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', () => finish(false));
    dialog.addEventListener('close', () => { if (!dialog.open && !working && !ended) finish(false); });
    build.addEventListener('click', () => { if (!build.disabled) finish(true); });
    refresh.addEventListener('click', async () => {
      if (checking || working) return;
      checking = true;
      render();
      try {
        latest = await request('/api/host/setup');
        const jobs = await readJobs();
        lastJob = [...jobs].reverse().find(job => job.kind === 'desktop-setup') ?? null;
        outcome(lastJob);
      }
      catch (problem) { fail(problem.message); }
      finally { checking = false; render(); }
    });
    const observe = async started => {
      lastJob = started;
      progress.show(started); onJob?.(started);
      const deadline = Date.now() + 60 * 60_000;
      let job = started;
      while (job.state === 'running' || job.state === 'queued') {
        if (Date.now() > deadline) throw new Error('Setup is taking longer than expected. It may still be running; inspect Jobs and refresh checks before retrying.');
        await new Promise(resolve => setTimeout(resolve, 500));
        const jobs = await readJobs();
        job = jobs.find(candidate => candidate.id === started.id) ?? job;
        lastJob = job;
        progress.render(job); onJob?.(job);
      }
      outcome(job);
    };
    const install = async action => {
      if (working || checking || latest.busy) return;
      working = true; lastJob = null; dialog.close();
      try {
        const job = await request('/api/host/setup', {action,revision:latest.revision,confirm:true});
        await observe(job);
        latest = await request('/api/host/setup');
        outcome(lastJob);
      } catch (problem) {
        fail(problem.message);
        // Never re-enable installer actions from stale pre-install state after a lost response.
        try {
          latest = await request('/api/host/setup');
          const jobs = await readJobs();
          const recovered = jobs.find(job => job.id === lastJob?.id);
          if (terminal(recovered)) { lastJob = recovered; outcome(recovered); }
        } catch { latest = {...latest,busy:true,canBuild:false}; }
      } finally {
        progress.close(); working = false; show();
      }
    };
    outcome(null);
    show();
    void (async () => {
      let resumed = false;
      try {
        const jobs = await readJobs();
        if (ended || working) return;
        const active = jobs.find(job => job.kind === 'desktop-setup' && ['queued','running'].includes(job.state));
        if (status.busy && active) {
          resumed = true; working = true; dialog.close(); await observe(active); latest = await request('/api/host/setup'); outcome(lastJob);
        } else {
          lastJob = [...jobs].reverse().find(job => job.kind === 'desktop-setup') ?? null;
          outcome(lastJob);
          render();
        }
      } catch (problem) { fail(problem.message); }
      finally { if (resumed) { progress.close(); working = false; show(); } }
    })();
  });
  controllers.set(doc, work);
  try { return await work; } finally { controllers.delete(doc); }
}
