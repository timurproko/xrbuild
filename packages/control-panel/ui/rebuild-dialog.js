// One framework-neutral host rebuild dialog for Control Panel, Plugins Manager and registered tools.
import {iconSvg, sentenceText} from './design-system.js';
import {desktopSetupBeforeRebuild} from './desktop-setup.js';

export const REBUILD_AUTOCLOSE_KEY = 'panel.rebuildAutoclose';
const controllers = new WeakMap();

function storedAutoclose(storage) {
  try { return storage?.getItem(REBUILD_AUTOCLOSE_KEY) === '1'; } catch { return false; }
}
function saveAutoclose(storage, checked) {
  try { storage?.setItem(REBUILD_AUTOCLOSE_KEY, checked ? '1' : '0'); } catch { /* Storage can be unavailable in a restricted tool page. */ }
}
function safePanelOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port
      && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

export function rebuildPresentation(job, error = '') {
  const running = !error && (!job || job.state === 'running' || job.state === 'queued');
  const failed = !!error || job?.state === 'failed';
  const setup = job?.kind === 'desktop-setup';
  const restart = setup && job?.result?.restartRequired === true;
  const phase = [...(job?.lines ?? [])].reverse().find((line) => line.startsWith('plugin '));
  return {
    state: running ? 'running' : failed ? 'failed' : 'done',
    title: setup ? running ? 'Installing desktop prerequisites' : failed ? 'Setup failed' : restart ? 'Restart required' : 'Setup complete' : running ? 'Rebuilding' : failed ? 'Rebuild failed' : 'Rebuilt',
    message: error || (setup ? running ? sentenceText(job.title || 'Installing desktop prerequisites').replace(/\.$/u, '…') : failed ? job.error || 'Review setup output and retry explicitly.' : restart ? 'Restart Windows when convenient, then refresh Desktop setup.' : 'Setup completed and readiness checks passed.' : running
      ? `Building ${phase ? phase.slice('plugin '.length) : 'xrb-host'}…`
      : failed ? job?.error || 'See build output below.' : 'The host and workspace plugins are ready.'),
    output: job?.lines?.length ? job.lines.slice(-20).join('\n')
      : error ? 'The job could not start.' : 'Waiting for build output…',
    running,
    succeeded: !running && !failed && !restart,
    viewJobDisabled: job?.id == null,
  };
}

export function rebuildProgressDialog({document: documentRef = globalThis.document, storage = globalThis.localStorage, onViewJob} = {}) {
  if (!documentRef) throw new Error('A document is required for rebuild progress');
  const existing = controllers.get(documentRef);
  if (existing) {
    existing.setViewJob(onViewJob);
    return existing;
  }

  const dialog = documentRef.createElement('dialog');
  dialog.className = 'xrb-dialog xrb-progress-dialog xrb-rebuild-dialog';
  dialog.dataset.xrbRebuildDialog = '';
  dialog.setAttribute('aria-labelledby', 'xrb-rebuilding-title');
  dialog.setAttribute('aria-describedby', 'xrb-rebuilding-message');
  dialog.innerHTML = `<div class="xrb-progress-status"><span class="xrb-progress-status-icon" data-xrb-rebuild-status data-state="running" aria-hidden="true">
    <span class="xrb-spinner xrb-spinner-accent xrb-progress-running"></span>
    <span class="xrb-progress-check">${iconSvg('check-circle')}</span>
    <span class="xrb-progress-error">${iconSvg('error-circle')}</span>
  </span><div><h3 id="xrb-rebuilding-title" data-xrb-rebuild-title>Rebuilding</h3>
    <p id="xrb-rebuilding-message" class="muted" data-xrb-rebuild-message role="status">Starting update…</p></div></div>
  <pre class="log" data-xrb-rebuild-output aria-label="Build output">Waiting for build output…</pre>
  <div class="row ask-buttons is-building" data-xrb-rebuild-actions><label class="toggle"><input type="checkbox" data-xrb-rebuild-autoclose> Autoclose on finish</label><span class="spacer"></span>
    <button type="button" class="action-button" data-xrb-rebuild-view>View job</button>
    <button type="button" class="action-button primary" data-xrb-rebuild-close>Close</button>
  </div>`;
  const status = dialog.querySelector('[data-xrb-rebuild-status]');
  const title = dialog.querySelector('[data-xrb-rebuild-title]');
  const message = dialog.querySelector('[data-xrb-rebuild-message]');
  const output = dialog.querySelector('[data-xrb-rebuild-output]');
  const actions = dialog.querySelector('[data-xrb-rebuild-actions]');
  const autoclose = dialog.querySelector('[data-xrb-rebuild-autoclose]');
  const view = dialog.querySelector('[data-xrb-rebuild-view]');
  let currentJob = null;
  let viewJob = onViewJob;

  autoclose.checked = storedAutoclose(storage);
  autoclose.addEventListener('change', () => saveAutoclose(storage, autoclose.checked));
  dialog.querySelector('[data-xrb-rebuild-close]').addEventListener('click', () => dialog.close());
  view.addEventListener('click', () => {
    if (!currentJob || view.disabled) return;
    dialog.close();
    viewJob?.(currentJob);
  });
  dialog.addEventListener('cancel', (event) => { if (actions.classList.contains('is-building')) event.preventDefault(); });
  documentRef.body.append(dialog);

  const controller = {
    element: dialog,
    setViewJob(callback) { viewJob = callback; },
    render(job, error = '') {
      currentJob = job ?? null;
      const presentation = rebuildPresentation(job, error);
      status.dataset.state = presentation.state;
      title.textContent = presentation.title;
      message.textContent = presentation.message;
      output.textContent = presentation.output;
      output.scrollTop = output.scrollHeight;
      actions.classList.toggle('is-building', presentation.running);
      view.disabled = presentation.viewJobDisabled;
      if (presentation.succeeded && autoclose.checked && dialog.open) dialog.close();
      return presentation;
    },
    show(job = null, error = '') {
      this.render(job, error);
      if (!dialog.open) dialog.showModal();
    },
    close() { if (dialog.open) dialog.close(); },
  };
  controllers.set(documentRef, controller);
  return controller;
}

export async function rebuildHostInPlace(origin = globalThis.location?.origin, options = {}) {
  const safe = safePanelOrigin(origin);
  if (!safe) throw new Error('Invalid local panel origin');
  const defaultViewJob = (job) => {
    const destination = new URL('/', safe);
    destination.searchParams.set('job', String(job.id));
    globalThis.location?.assign(destination.href);
  };
  const progress = rebuildProgressDialog({onViewJob: options.onViewJob ?? defaultViewJob});
  let started;
  try {
    if (!await desktopSetupBeforeRebuild(safe, {progress,onJob:options.onJob})) return null;
    progress.show();
    const response = await fetch(new URL('/api/host/rebuild', safe), {method: 'POST'});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Rebuild failed (${response.status})`);
    started = body;
    progress.render(started);
    options.onJob?.(started);
  } catch (error) {
    progress.show(null, error instanceof Error ? error.message : String(error));
    return null;
  }

  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(new URL('/api/jobs', safe), {cache: 'no-store'});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Rebuild status failed (${response.status})`);
      const job = body.jobs?.find((candidate) => candidate.id === started.id);
      if (!job) continue;
      progress.render(job);
      options.onJob?.(job);
      if (job.state !== 'running') {
        options.onComplete?.(job);
        return job;
      }
    } catch (error) {
      progress.render(started, error instanceof Error ? error.message : String(error));
      return null;
    }
  }
  progress.render(started, 'The rebuild is taking longer than expected.');
  return null;
}
