// XR Build control panel UI: plain ES module, no build step. Talks to the panel server
// (same origin) over JSON and a Server-Sent Events stream.
import { SettingsWriter } from './settings-writer.js';
import { defaultProjectSlug, hasProjectPublishers, renderProjectHero } from './project-workflow.js';
import { platformChoiceOf, platformChoices, refreshedDesktopDisplay, selectPlatform, switchRunSettings } from './platform-choice.js';
import {requestedNavigation,menuKeyboard,renderNavigationMenu,restartPanelInPlace,shouldReportNavigationError} from './navigation.js';
import {rebuildHostInPlace} from './rebuild-dialog.js';
import {enhanceHelpText,iconSvg,installDropdowns,installIcons,installNumberSteppers,installTabs,installTooltips,openFloating,renderField,resumeAnimations,setFieldError,setPageIdentity,setRevealed,stabilizePanelHeight,transitionPanelHeight,updateRebuildChip,updateRestartChip} from './design-system.js';
import {exposedProviderInputs,runtimeProviderInputs} from './provider-choice.js';
import {bumpPackageVersion, nextPublicationVersion} from './package-version.js';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const projectUrl = (id) => `/api/projects/${id.split('/').map(encodeURIComponent).join('/')}`;
const initialNavigationRequest = requestedNavigation(location.href);

const state = {
  projects: [],
  projectProblems: [],
  unregistered: [],
  /** the workspace: { path, exists } */
  workspace: null,
  archived: [],
  layout: { sections: [] },
  view: localStorage.getItem('panel.view') === 'archive' ? 'archive' : 'projects',
  search: null,  // null: search closed; a string: the query (over projects and the archive)
  selected: localStorage.getItem('panel.selected'),
  run: null,
  status: null,
  runLog: [],
  jobs: new Map(),
  publicationOverrides: new Map(),
  publicationEffects: new Map(),
  savingPublication: new Map(),
  publicationJobViews: new Map(),
  /** verified release results shown until the publisher's catalog converges (project \n publisher) */
  releaseOverrides: new Map(),
  /** a retained release chosen in Live version for inspection, not yet deployed (project \n publisher) */
  releaseSelection: new Map(),
  packageSetup: new Map(),
  packageSetupChecks: new Map(),
  packages: [],
  monitors: [],
  host: null,
  /** GET /api/panel: whether this panel's own code changed after it started */
  panel: null,
  managedPlugins: [],
  managedId: localStorage.getItem('panel.managedPlugin'),
  appSettings: { cursor: 'system' },
  settingsFilter: new URLSearchParams(location.search).get('module') || 'all',
  activityTab: localStorage.getItem('panel.activityTab') === 'jobs' ? 'jobs' : 'log',
  page: ['plugins', 'settings'].includes(initialNavigationRequest.page) ? initialNavigationRequest.page : 'projects',
  dashboardScroll: 0,
  fieldErrors: {},
  savingPlatform: null,
  queuedPlatform: null,
  logShow: { info: true, warn: true, err: true, ...JSON.parse(localStorage.getItem('panel.logShow') ?? '{}') },
  jobShow: { queued: true, running: true, done: true, failed: true, ...JSON.parse(localStorage.getItem('panel.jobShow') ?? '{}') },
  logDebugSources: Object.create(null),
};

// ---- API ----------------------------------------------------------------------------------

class ApiError extends Error {
  constructor(status, data) {
    super(data?.error ?? `HTTP ${status}`);
    this.status = status;
    this.data = data;
  }
}

const settingsWriter = new SettingsWriter({
  read: (id) => api('GET', projectUrl(id)),
  write: (id, manifest, current) => api('PUT', `${projectUrl(id)}/manifest`, { manifest, mtimeMs: current.manifestMtimeMs, revision: current.manifestRevision }),
  saved: (id, result) => {
    for (const list of [state.projects, state.archived]) {
      const index = list.findIndex((project) => project.id === id);
      if (index >= 0) list[index] = { ...result, manifest: settingsWriter.overlay(id, result.manifest) };
    }
  },
  changed: (id) => { if (selected()?.id === id) renderSettingsStatus(); },
});

function renderSettingsStatus() {
  const p = selected(), form = $('#settings');
  if (!p || !form) return;
  let status = form.querySelector('[data-settings-status]');
  if (!status) { status = document.createElement('div'); status.dataset.settingsStatus = ''; status.className = 'xrb-stack'; form.append(status); }
  const entry = settingsWriter.entry(p.id);
  if (entry?.error?.data?.fields) showFieldErrors(Object.fromEntries(entry.error.data.fields.map((field) => [field.field, field.message])));
  status.replaceChildren();
  if (!entry?.running && !entry?.error) return;
  const text = document.createElement('span'); text.className = `xrb-help${entry.error ? ' field-error' : ''}`; text.setAttribute('role', 'status');
  text.textContent = entry.error ? `Not saved. ${entry.error.message}` : 'Saving settings…'; status.append(text);
  if (entry.error) for (const [label, run] of [['Retry', async () => { await settingsWriter.retry(p.id); await loadProjects(); }], ['Reload', async () => { settingsWriter.discard(p.id); state.dirty = false; await loadProjects(); renderDetail(true); }]]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'small'; button.textContent = label;
    button.addEventListener('click', action(run)); status.append(button);
  }
}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body instanceof Blob) {
    opts.body = body;
    opts.headers['content-type'] = body.type || 'application/octet-stream';
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['content-type'] = 'application/json';
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Runs a POST that may ask for confirmation (409 + details.needsConfirm), asking each time. */
async function confirmable(path, body = {}) {
  const confirm = [];
  for (;;) {
    try {
      return await api('POST', path, { ...body, confirm });
    } catch (e) {
      const need = e instanceof ApiError && e.status === 409 ? e.data?.details?.needsConfirm : null;
      if (!need || confirm.includes(need)) throw e;
      if (need === 'version' && e.data.details.suggested) {
        const v = await ask({
          title: 'Version already packaged',
          message: e.message,
          input: { label: 'Version to build', value: e.data.details.suggested },
          ok: 'Build package',
        });
        if (v === null) return null;
        if (v !== body.version) body = { ...body, version: v };
        else confirm.push(need);
        continue;
      }
      if (!(await ask({ title: need === 'host' ? 'Host is out of date' : 'Please confirm', message: e.message, ok: 'Continue' }))) return null;
      confirm.push(need);
    }
  }
}

function report(e) {
  console.error(e);
  const rawMessage = String(e?.message ?? e ?? 'Unknown error');
  const blocked = e?.data?.details && typeof e.data.details.reason === 'string' ? e.data.details : null;
  if (blocked?.restart) {
    // Waiting cannot clear this cause; offer the one action that does.
    void ask({ title: 'Restart needed', message: rawMessage, ok: 'Restart', cancel: 'Close' })
      .then((yes) => { if (yes) return restartPanel(); }).catch(report);
    return;
  }
  const rawDetails = !blocked && e?.data?.details && !e.data.details.needsConfirm ? e.data.details : '';
  const data = typeof rawDetails === 'string' ? rawDetails : rawDetails ? JSON.stringify(rawDetails, null, 2) : '';
  const details = [rawMessage, data].filter((value, index, values) => value && values.indexOf(value) === index).join('\n\n');
  ask({ title: 'Something went wrong', message: 'XR Build could not complete this action. Review or copy the details below.', details, closeOnly: true });
}

/**
 * The panel's own dialog (instead of the browser's alert/confirm/prompt). Resolves to true (or
 * the entered text with `input`) on OK, and null on Cancel / Escape.
 */
function ask({ title, message = '', details = '', input = null, link = null, ok = 'OK', cancel = 'Cancel', danger = false, validate = null, closeOnly = false }) {
  const dlg = $('#ask');
  const closeButton = $('#ask-close');
  const actions = $('#ask-actions');
  $('#ask-title').textContent = title;
  closeButton.hidden = !closeOnly;
  actions.hidden = closeOnly;
  const messageElement = $('#ask-message');
  messageElement.textContent = message;
  messageElement.hidden = !message;
  const termsLink = $('#ask-link');
  termsLink.hidden = !link;
  if (link) { termsLink.href = link; termsLink.textContent = 'Read the terms'; }
  const detailsElement = $('#ask-details');
  const detailsBlock = $('#ask-details-block');
  const copyButton = $('#ask-copy');
  const copyStatus = $('#ask-copy-status');
  detailsElement.textContent = details;
  detailsBlock.hidden = !details;
  copyButton.setAttribute('aria-label', 'Copy error details');
  copyStatus.textContent = '';
  let copyReset = 0;
  copyButton.onclick = details ? async () => {
    try {
      await navigator.clipboard.writeText(details);
      copyButton.setAttribute('aria-label', 'Copied');
      copyStatus.textContent = 'Copied to clipboard.';
    } catch (error) {
      console.error(error);
      copyButton.setAttribute('aria-label', 'Copy failed');
      copyStatus.textContent = 'Could not copy to clipboard.';
    }
    clearTimeout(copyReset);
    copyReset = setTimeout(() => {
      copyButton.setAttribute('aria-label', 'Copy error details');
      copyStatus.textContent = '';
    }, 1800);
  } : null;
  const field = $('#ask-field');
  field.hidden = !input;
  const inputElement = $('#ask-input');
  const inputHint = $('#ask-input-hint');
  const inputError = $('#ask-input-error');
  inputHint.textContent = input?.hint ?? '';
  inputHint.hidden = !input?.hint || !!input?.error;
  const showInputError = (error) => {
    inputError.textContent = error ?? '';
    inputError.hidden = !error;
    inputHint.hidden = !input?.hint || !!error;
    if (error) inputElement.setAttribute('aria-invalid', 'true');
    else inputElement.removeAttribute('aria-invalid');
  };
  showInputError(input?.error);
  inputElement.oninput = input ? () => showInputError('') : null;
  if (input) {
    $('#ask-input-label').textContent = input.label;
    inputElement.value = input.value ?? '';
  }
  const okBtn = $('#ask-ok');
  okBtn.textContent = ok;
  okBtn.className = `action-button ${danger ? 'danger-solid' : 'primary'}`;
  $('#ask-cancel').textContent = cancel ?? '';
  $('#ask-cancel').hidden = !cancel;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      dlg.removeEventListener('close', onClose);
      dlg.removeEventListener('cancel', onCancel);
      okBtn.onclick = null;
      inputElement.oninput = null;
      copyButton.onclick = null;
      closeButton.onclick = null;
      clearTimeout(copyReset);
      $('#ask-cancel').onclick = null;
      if (dlg.open) dlg.close();
      callback(value);
    };
    const done = (value) => finish(resolve, value);
    const fail = (error) => finish(reject, error);
    // The previous dialog's close event is dispatched later; while this one is open it is not ours to act on.
    const onClose = () => { if (!dlg.open) done(null); };
    const onCancel = (event) => { if (!cancel && !closeOnly) event.preventDefault(); };
    dlg.addEventListener('close', onClose);
    dlg.addEventListener('cancel', onCancel);
    okBtn.onclick = async (ev) => {
      ev.preventDefault();
      const value = input ? inputElement.value.trim() : true;
      if (!validate) return done(value);
      okBtn.disabled = true;
      try {
        const error = await validate(value);
        if (error) {
          showInputError(error);
          inputElement.focus();
          return;
        }
        done(value);
      } catch (error) {
        fail(error);
      } finally {
        okBtn.disabled = false;
      }
    };
    $('#ask-cancel').onclick = (ev) => { ev.preventDefault(); done(null); };
    closeButton.onclick = (event) => { event.preventDefault(); done(null); };
    dlg.showModal();
    (input ? inputElement : closeOnly ? closeButton : okBtn).focus();
  });
}

const action = (fn) => (...args) => fn(...args).catch(report);

// ---- formatting ---------------------------------------------------------------------------

function ago(ms) {
  if (!ms) return 'never';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleString();
}
const dur = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(0)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const gb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '–' : Number(v).toFixed(d));
const iconSrc = (p) => `${projectUrl(p.id)}/icon?t=${p.icon?.mtimeMs ?? 0}${p.icon?.custom ? '' : `-${p.manifest?.iconColor ?? 'blue'}-${p.manifest?.iconShape ?? 'sphere'}`}`;

// ---- loading ------------------------------------------------------------------------------

/** The projects the list shows now: live ones, or the archive (archived ones work the same). */
const listed = () => (state.view === 'archive' ? state.archived : state.projects);
const allProjects = () => [...state.projects, ...state.archived];
const emptyProjectInventory = () => !state.projects.length && !state.archived.length && !state.unregistered.length;
const emptyUserProjectWorkspace = () => state.workspace?.kind === 'user' && emptyProjectInventory();

function syncEmptyProjectUi() {
  const empty = emptyUserProjectWorkspace();
  $('#projects').hidden = false;
  $('#project-content').hidden = empty;
  $('#side').hidden = empty;
  document.body.classList.toggle('projects-empty', empty);
  if (empty) syncRunDock(null);
}

async function loadWorkspace() {
  state.workspace = await api('GET', '/api/workspace');
}

/** A new app from the core's template, in the workspace's projects/unsorted/. */
async function newProject() {
  let project = null;
  const name = await ask({
    title: 'New project',
    message: 'Create a new app project in your workspace.',
    input: { label: 'Project name', hint: 'Letters, digits, spaces, and dashes.', value: '' },
    ok: 'Create',
    cancel: 'Cancel',
    validate: async (value) => {
      if (!value) return 'Enter a project name.';
      try {
        project = await api('POST', '/api/projects/new', { folder: value.toLowerCase().replace(/\s+/g, '-'), name: value });
        return '';
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        return /already exists/i.test(error.message) ? 'A project with this name already exists.' : error.message;
      }
    },
  });
  if (!name || !project) return false;
  state.selected = project.id;
  localStorage.setItem('panel.selected', project.id);
  await loadWorkspace();
  await loadProjects();
  return true;
}

let projectsLoadSequence = 0;
async function loadProjects() {
  const sequence = ++projectsLoadSequence;
  const previousSelection = selected()?.id ?? null;
  const r = await api('GET', '/api/projects');
  if (sequence !== projectsLoadSequence) return;
  const incomingProjects = [...r.projects, ...(r.archived ?? [])];
  const restoredProjects = new Set();
  const activePublicationJobs = [...state.jobs.values()].filter((job) => job.kind === 'publication' && (job.state === 'queued' || job.state === 'running'))
    .sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || a.id - b.id);
  for (const job of activePublicationJobs) {
    if (!job.projectId || restoredProjects.has(job.projectId)) continue;
    const project = incomingProjects.find((candidate) => candidate.id === job.projectId);
    const publication = job.publication ?? project?.manifest?.publication;
    if (!project || !publication) continue;
    const publisher = publication.publisher;
    const status = project.publicationDestinations?.[publisher]?.status ?? project.publication?.status ?? null;
    state.publicationJobViews.set(project.id, { jobId: job.id, publication: structuredClone(publication), status });
    restoredProjects.add(project.id);
  }
  const retainPublicationEdit = (project) => {
    const pending = state.savingPublication.get(project.id) ?? state.publicationJobViews.get(project.id);
    if (project.manifest) project = { ...project, manifest: settingsWriter.overlay(project.id, project.manifest) };
    if (!pending || !project.manifest) return project;
    const publisher = pending.publication.publisher;
    const status = pending.status ?? project.publicationDestinations?.[publisher]?.status ?? project.publication?.status ?? null;
    return { ...project,
      manifest: { ...project.manifest, publication: structuredClone(pending.publication) },
      publication: { ...project.publication, status },
    };
  };
  state.projects = r.projects.map(retainPublicationEdit);
  state.archived = (r.archived ?? []).map(retainPublicationEdit);
  state.projectProblems = r.problems ?? [];
  state.layout = r.layout ?? { sections: [] };
  state.unregistered = r.unregistered;
  if (emptyUserProjectWorkspace()) {
    state.view = 'projects';
    state.search = null;
    state.selected = null;
    localStorage.removeItem('panel.selected');
  } else if (!allProjects().some((p) => p.id === state.selected)) {
    const next = listed()[0] ?? state.projects[0] ?? state.archived[0] ?? null;
    state.selected = next?.id ?? null;
    if (next) {
      state.view = next.archived ? 'archive' : 'projects';
      localStorage.setItem('panel.view', state.view);
      localStorage.setItem('panel.selected', next.id);
    } else localStorage.removeItem('panel.selected');
  }
  renderProjects();
  renderDetail(previousSelection !== (selected()?.id ?? null));
  renderRunLog();
  syncEmptyProjectUi();
}

/** Switches the list between the projects and the archive. */
function setView(view) {
  state.view = view;
  localStorage.setItem('panel.view', view);
  renderProjects();
  renderDetail(true);
}
const loadPackages = async () => { state.packages = (await api('GET', '/api/packages')).packages; renderPackages(); };
const loadPanelFreshness = async () => { state.panel = await api('GET', '/api/panel'); renderPanelFreshness(); };
const loadMonitors = async () => { state.monitors = (await api('GET', '/api/monitors')).monitors ?? []; };
const loadPlugins = async () => {
  state.plugins = await api('GET', '/api/plugins').catch(() => null);
  renderDetail();
  renderHost();
  if (state.page === 'settings') renderGlobalSettings();
};
const loadHost = async () => {
  state.host = await api('GET', '/api/host');
  // The host's providers change only with a rebuild: refreshed here, after one.
  await loadPlugins();
  renderRunLog();
};
async function loadJobs() {
  for (const j of (await api('GET', '/api/jobs')).jobs) state.jobs.set(j.id, j);
  renderJobs();
}
async function loadRun() {
  const r = await api('GET', '/api/run');
  state.run = r.state;
  state.status = r.state.status;
  state.runLog = r.log;
  renderRun();
}

// ---- projects list ------------------------------------------------------------------------

/** A project's publication tag: local queued/running work wins over effective remote state. */
function publishedMark(p) {
  const publicationJob = activePublicationJob(p.id);
  if (publicationJob) {
    const stateClass = publicationJob.state === 'running' ? 'live' : 'busy';
    return `<span class="state ${stateClass} pub-mark">${publicationJob.state}</span>`;
  }
  const selectedPublisher = p.manifest?.publication?.publisher;
  const statuses = new Map();
  if (selectedPublisher) statuses.set(selectedPublisher,
    p.publicationDestinations?.[selectedPublisher]?.status ?? p.publication?.status ?? p.publicationStandalone?.status ?? null);
  for (const [publisher, destination] of Object.entries(p.publicationDestinations ?? {})) {
    if (!statuses.has(publisher)) statuses.set(publisher, destination?.status ?? null);
  }
  const states = selectedPublisher || statuses.size
    ? [...statuses].map(([publisher, status]) => effectivePublicationStatus(p, publisher, status)?.state)
    : [p.publicationStandalone?.status?.state, p.publication?.status?.state];
  const live = states.includes('published');
  if (!live && !states.includes('failed')) return '';
  return live
    ? '<span class="state ok pub-mark">published</span>'
    : '<span class="state busy pub-mark" data-tooltip="Published, not reachable: the site does not serve it">published</span>';
}

let inventoryDragId = null;
const clearProjectDragMarks = (root = document) => root.querySelectorAll('.dragging, .drop-before, .drop-after, .drop-into, .xrb-drop-target').forEach((element) => element.classList.remove('dragging', 'drop-before', 'drop-after', 'drop-into', 'xrb-drop-target'));

function wireInventoryDrag(nav) {
  const draggedProject = () => allProjects().find((project) => project.id === inventoryDragId);
  nav.querySelectorAll('.proj[draggable="true"]').forEach((button) => {
    button.addEventListener('dragstart', (event) => {
      inventoryDragId = button.dataset.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', inventoryDragId);
      requestAnimationFrame(() => button.classList.add('dragging'));
    });
    button.addEventListener('dragend', () => {
      inventoryDragId = null;
      clearProjectDragMarks(nav);
    });
  });
  nav.querySelectorAll('.xrb-tab[data-view]').forEach((tab) => {
    const accepts = () => {
      const project = draggedProject();
      return project && !project.running && (tab.dataset.view === 'archive') !== project.archived;
    };
    tab.addEventListener('dragover', (event) => {
      if (!accepts()) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      tab.classList.add('xrb-drop-target');
    });
    tab.addEventListener('dragleave', (event) => { if (!tab.contains(event.relatedTarget)) tab.classList.remove('xrb-drop-target'); });
    tab.addEventListener('drop', action(async (event) => {
      event.preventDefault();
      const id = inventoryDragId || event.dataTransfer.getData('text/plain');
      const view = tab.dataset.view;
      clearProjectDragMarks(nav);
      inventoryDragId = null;
      const project = allProjects().find((item) => item.id === id);
      if (!project || project.running || (view === 'archive') === project.archived) return;
      await archiveProject(id, view);
    }));
  });
}

function renderProjects() {
  if (state.renaming) return;  // live updates must not throw away a name being typed
  const nav = $('#projects');
  const archive = state.view === 'archive';
  const query = state.search?.trim().toLowerCase() ?? '';
  const searching = query !== '';
  const item = (p) => {
    const m = p.manifest;
    const kind = m?.kind ?? 'app';
    const meta = !m ? 'manifest has errors' : p.origin === 'bundled' ? 'embedded' : '';
    const pill = !m ? '<span class="state err">error</span>' : projectRunning(p) || p.running ? runPill() : searching && p.archived ? '<span class="state busy">archived</span>' : '';
    const published = m ? publishedMark(p) : '';
    return `<button class="proj xrb-focus-inset ${kind} ${p.id === state.selected ? 'selected' : ''}" data-id="${esc(p.id)}" aria-current="${p.id === state.selected}" ${searching ? '' : 'draggable="true"'}>
      <span class="stripe"></span>
      <img src="${iconSrc(p)}" alt="" draggable="false">
      <div class="text"><div class="name">${esc(m?.name ?? p.id)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>${pill ? `<div class="pill">${pill}</div>` : ''}${published ? `<div class="published">${published}</div>` : ''}
    </button>`;
  };
  let body;
  if (emptyUserProjectWorkspace()) {
    body = '<div class="xrb-stack"><div class="empty-note">No project yet.</div><button type="button" class="xrb-add-action" id="empty-projects">+ New project</button></div>';
  } else if (searching) {
    // Every word must appear in the name or the id; live projects first, then archived ones.
    const words = query.split(/\s+/);
    const hits = allProjects().filter((p) => {
      const text = `${p.manifest?.name ?? ''} ${p.id}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    body = hits.length ? hits.map(item).join('') : '<div class="empty-note">Nothing matches.</div>';
  } else if (archive) {
    body = (state.archived.length ? state.archived.map(item).join('')
      : '<div class="empty-note">Nothing is archived yet.</div>');
  } else {
    // The developer's sections (xrb-panel.json), then "Unsorted" for projects in none of them.
    const editable = state.projects;
    const byId = new Map(editable.map((p) => [p.id, p]));
    const placed = new Set();
    const secs = state.layout.sections.map((s, index) => ({
      name: s.name, index,
      items: s.items.filter((id) => byId.has(id)).map((id) => { placed.add(id); return byId.get(id); }),
    }));
    const unsorted = editable.filter((p) => !placed.has(p.id));
    if (unsorted.length) secs.push({ name: 'Unsorted', index: -1, items: unsorted });
    // Hide empty groups, but keep the original layout indices for every section action.
    body = secs.filter((s) => s.items.length).map((s) => `<section class="sec" data-sec="${s.index}">
        <h2 class="sec-head" data-tooltip="Double-click to rename"><span class="sec-name" data-tooltip-anchor>${esc(s.name)}</span></h2>
        <div class="sec-items">${s.items.map(item).join('')}</div>
      </section>`).join('') +
      '<button type="button" class="xrb-add-action" id="new-project">+ New project</button>' +
      (state.unregistered.length ? `<h2>Without manifest</h2>` + state.unregistered.map((id) =>
        `<div class="unregistered row">${esc(id)}<span class="spacer"></span><button class="small" data-create="${esc(id)}">Create manifest</button></div>`).join('') : '');
  }
  // Projects | Archive tabs in the column's heading row; the list scrolls under them.
  const tab = (view, label, count) => `<button type="button" role="tab" class="xrb-tab" data-view="${view}" aria-selected="${state.view === view}">${label} <span class="xrb-tab-count">${count}</span></button>`;
  // The search button swaps the tabs for a search field; Esc or × brings the tabs back.
  const searchIcon = iconSvg('search');
  const head = emptyUserProjectWorkspace()
    ? '<div class="nav-tabs xrb-tabs xrb-tabs-compact"><span class="xrb-tab">Projects</span></div>'
    : state.search === null
    ? `<div class="nav-tabs xrb-tabs xrb-tabs-compact" role="tablist" data-xrb-tabs-id="project-inventory">${tab('projects', 'Projects', state.projects.length)}${tab('archive', 'Archive', state.archived.length)}
        <button type="button" class="xrb-icon-button" id="search-open" title="Search projects and the archive" aria-label="Search">${searchIcon}</button></div>`
    : `<div class="nav-tabs xrb-tabs xrb-tabs-compact xrb-search-bar" data-xrb-tabs-id="project-inventory" data-xrb-tabs-search><span class="xrb-search-icon" aria-hidden="true">${searchIcon}</span><input type="search" class="xrb-search-input" placeholder="Search projects and archive" value="${esc(state.search)}" aria-label="Search projects and archive">
        <button type="button" class="xrb-icon-button xrb-search-close" id="search-close" title="Close search (Esc)" aria-label="Close">${iconSvg('close')}</button></div>`;
  const focused = document.activeElement?.classList.contains('xrb-search-input') ? document.activeElement : null;
  const caret = focused ? [focused.selectionStart, focused.selectionEnd] : null;
  const scroll = nav.querySelector('.nav-list')?.scrollTop ?? 0;
  const warnings = state.projectProblems.map(problem => `<p class="empty-note errors" role="alert">${esc(problem)}</p>`).join('');
  nav.innerHTML = `${head}<div class="nav-list xrb-workspace-sidebar-content">${warnings}${body}</div>`;
  nav.querySelector('.nav-list').scrollTop = scroll;
  nav.querySelectorAll('.nav-tabs .xrb-tab[data-view]').forEach((t) => t.addEventListener('click', () => { if (t.dataset.view !== state.view) setView(t.dataset.view); }));
  nav.querySelector('#search-open')?.addEventListener('click', openSearch);
  nav.querySelector('#search-close')?.addEventListener('click', closeSearch);
  const input = nav.querySelector('.xrb-search-input');
  if (input) {
    if (caret) { input.focus(); input.setSelectionRange(...caret); }  // live updates re-render while typing
    input.addEventListener('input', () => { state.search = input.value; renderProjects(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
      if (e.key === 'Enter') nav.querySelector('.nav-list .proj')?.click();  // open the first hit
    });
  }
  nav.querySelector('#empty-projects')?.addEventListener('click', action(newProject));
  nav.querySelectorAll('.proj').forEach((b) => b.addEventListener('click', () => {
    const changedProject = state.selected !== b.dataset.id;
    state.selected = b.dataset.id;
    const project = selected();
    if (changedProject && project?.packaging?.setupSupported) void refreshPackageSetup(project).catch(report);
    // A hit from the other list switches the view, so closing the search shows it in place.
    const view = state.archived.some((p) => p.id === b.dataset.id) ? 'archive' : 'projects';
    if (view !== state.view) { state.view = view; localStorage.setItem('panel.view', view); }
    state.fieldErrors = {};
    localStorage.setItem('panel.selected', state.selected);
    renderProjects();
    renderDetail(true);
    renderRun();
  }));
  nav.querySelectorAll('.proj').forEach((b) => b.addEventListener('contextmenu', (e) => {
    const p = allProjects().find((x) => x.id === b.dataset.id);
    if (!p) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, p.id);
  }));
  nav.querySelector('#new-project')?.addEventListener('click', action(newProject));
  nav.querySelectorAll('[data-create]').forEach((b) => b.addEventListener('click', action(async () => {
    const p = await api('POST', '/api/projects/create', { id: b.dataset.create });
    state.selected = p.id;
    await loadProjects();
  })));
  if (!searching) wireInventoryDrag(nav);
  if (!archive && !searching) wireSections(nav);
}

// Opening and closing the search: the selected tab's underline stretches across the row into the
// search field's line (and shrinks back onto the tab), while the row's content fades in.
function openSearch() {
  state.search = '';
  renderProjects();
  $('#projects .xrb-search-input').focus();
}

function closeSearch() {
  state.search = null;
  renderProjects();
}

// ---- sections: create, rename, delete, drag projects between them --------------------------

/** Saves the layout (optimistically: the list shows it at once). */
async function saveLayout(layout) {
  state.layout = layout;
  renderProjects();
  try { await api('PUT', '/api/layout', layout); }
  finally { await loadProjects(); }
}

const cloneLayout = () => ({ revision: state.layout.revision, sections: state.layout.sections.map((s) => ({ name: s.name, items: [...s.items] })), colors: { ...(state.layout.colors ?? {}) }, platformOrder: [...(state.layout.platformOrder ?? [])] });
const visibleSectionIndices = () => [...$('#projects').querySelectorAll('.sec')].map((sec) => Number(sec.dataset.sec)).filter((index) => index >= 0);
/** Project id as stored in the layout: archived projects keep their live id there. */
const layoutId = (id) => id.replace(/^archive\//, '');

/** Inline name editing in a section heading (or a new heading); resolves to the name or null. */
function editName(container, value) {
  return new Promise((resolve) => {
    state.renaming = true;  // live updates must not re-render the list meanwhile
    const input = document.createElement('input');
    input.className = 'rename sec-input xrb-inline-edit';
    input.value = value;
    input.placeholder = 'Section name';
    container.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      state.renaming = false;
      resolve(v);
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim() || null); }
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    });
    input.addEventListener('blur', () => finish(input.value.trim() || null));
  });
}

function wireSections(nav) {
  const taken = (name, except = -1) => state.layout.sections.some((s, i) => i !== except && s.name.toLowerCase() === name.toLowerCase());

  nav.querySelectorAll('.sec-head').forEach((h) => h.addEventListener('dblclick', action(async (e) => {
    const index = Number(h.closest('.sec').dataset.sec);
    if (index < 0) {
      // Naming "Unsorted" turns it into a real section holding the projects it shows now.
      const name = (await editName(h, ''))?.toLowerCase();  // section folders are lower case
      if (!name || taken(name)) { if (name) await ask({ title: 'Section exists', message: `There is already a section named "${name}".`, cancel: null }); return renderProjects(); }
      const placed = new Set(state.layout.sections.flatMap((s) => s.items));
      const l = cloneLayout();
      l.sections.push({ name, items: state.projects.map((p) => p.id).filter((id) => !placed.has(id)) });
      return saveLayout(l);
    }
    const name = (await editName(h, state.layout.sections[index].name))?.toLowerCase();
    if (!name || name === state.layout.sections[index].name || taken(name, index)) return renderProjects();
    const l = cloneLayout();
    // A rename, not a new section: the server renames the folder with everything in it.
    l.sections[index].from = l.sections[index].name;
    l.sections[index].name = name;
    await saveLayout(l);
  })));

  // Right-click a section heading: move it up or down, or rename it. Unsorted stays last.
  nav.querySelectorAll('.sec-head').forEach((h) => h.addEventListener('contextmenu', (e) => {
    const index = Number(h.closest('.sec').dataset.sec);
    e.preventDefault();
    closeMenu();
    const menu = $('#sec-menu');
    menu.dataset.sec = String(index);
    const visible = visibleSectionIndices(), position = visible.indexOf(index);
    menu.querySelector('[data-act="up"]').hidden = position <= 0;
    menu.querySelector('[data-act="down"]').hidden = position < 0 || position >= visible.length - 1;
    menu.querySelector('[data-act="delete"]').hidden = index < 0;  // Unsorted is not a section to delete
    placeMenu(menu, e.clientX, e.clientY);
  }));

  // Drag a live project onto a section (end of it) or onto another project (before/after it).
  const clearMarks = () => nav.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
  const target = (e) => {
    const sec = e.target.closest('.sec');
    if (!sec) return null;
    const over = e.target.closest('.proj');
    if (over && over.dataset.id !== inventoryDragId) {
      const r = over.getBoundingClientRect();
      return { sec, over, after: e.clientY > r.top + r.height / 2 };
    }
    return { sec, over: null, after: true, self: over?.dataset.id === inventoryDragId };
  };
  // A drop that would leave the project where it is: no marker, nothing saved.
  const unchanged = (t) => {
    const dragged = [...nav.querySelectorAll('.proj')].find((p) => p.dataset.id === inventoryDragId);
    if (!t || !dragged || dragged.closest('.sec') !== t.sec) return false;
    if (t.self || t.sec.dataset.sec === '-1') return true;  // Unsorted keeps no order of its own
    const prev = dragged.previousElementSibling, next = dragged.nextElementSibling;
    if (!t.over) return !next?.classList.contains('proj');  // already last in the section
    return t.after ? t.over === prev : t.over === next;
  };
  nav.querySelectorAll('.sec').forEach((sec) => {
    sec.addEventListener('dragover', (e) => {
      if (!inventoryDragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const t = target(e);
      clearMarks();
      if (unchanged(t)) return;
      if (t?.over) t.over.classList.add(t.after ? 'drop-after' : 'drop-before');
      else if (t) t.sec.classList.add('drop-into');
    });
    sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('drop-into'); });
    sec.addEventListener('drop', action(async (e) => {
      e.preventDefault();
      const t = target(e);
      const id = inventoryDragId;
      if (unchanged(t)) { clearMarks(); return; }
      clearMarks();
      if (!t || !id) return;
      const index = Number(t.sec.dataset.sec);
      const l = cloneLayout();
      for (const s of l.sections) s.items = s.items.filter((x) => x !== id);
      if (index >= 0) {
        const items = l.sections[index].items;
        let at = items.length;
        if (t.over) {
          const i = items.indexOf(t.over.dataset.id);
          if (i >= 0) at = t.after ? i + 1 : i;
        }
        items.splice(at, 0, id);
      }  // dropped on Unsorted: in no section
      await saveLayout(l);
    }));
  });
}

// ---- right-click menu and rename -----------------------------------------------------------

/** Shows a menu at the cursor, kept inside the window. */
function placeMenu(menu, x, y) {
  openFloating(menu, { x, y });
}

/**
 * The project thumbnail's menu: the default sphere's colour (while the project has no icon of its own), Upload
 * image… (a PNG), Render 3D… (the icon studio, when the build has a 3D icon) and Remove (back to the sphere).
 */
function openIconMenu(x, y, p) {
  closeMenu();
  const menu = $('#icon-menu');
  menu.dataset.project = p.id;
  const custom = !!p.icon?.custom;
  const currentColor = p.manifest?.iconColor ?? 'blue';
  menu.querySelector('.menu-colors').hidden = custom;
  menu.querySelectorAll('[data-icon-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.iconColor === currentColor)));
  menu.querySelector('[data-act="render-icon"]').hidden = !p.icon?.model;
  menu.querySelector('[data-act="remove-icon"]').hidden = !custom;
  placeMenu(menu, x, y);
}

$('#icon-menu').addEventListener('click', action(async (e) => {
  const menu = $('#icon-menu');
  const p = allProjects().find((x) => x.id === menu.dataset.project);
  const b = e.target.closest('button');
  if (!b || !p) return;
  if (b.dataset.act === 'upload-icon') {
    closeMenu();
    openStudioUpload(p);
    return;
  }
  if (b.dataset.act === 'render-icon') {
    closeMenu();
    openStudio(p);
    return;
  }
  if (b.dataset.act === 'remove-icon') {
    closeMenu();
    await api('DELETE', `${projectUrl(p.id)}/icon`);
    await loadProjects();
    return;
  }
  const color = b.dataset.iconColor;
  // The sphere is the only generated shape: a colour choice also clears a shape left by an older panel.
  if (!color || (color === (p.manifest.iconColor ?? 'blue') && !p.manifest.iconShape)) return;
  const m = structuredClone(p.manifest);
  if (color === 'blue') delete m.iconColor;  // blue is the default
  else m.iconColor = color;
  delete m.iconShape;
  await api('PUT', `${projectUrl(p.id)}/manifest`, { manifest: m, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision });
  await loadProjects();
  // Keep the palette open so the generated icon behind it acts as a live preview while cycling.
  menu.querySelectorAll('[data-icon-color]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.iconColor === color)));
}));

function openMenu(x, y, projectId) {
  closeMenu();
  const menu = $('#ctx-menu');
  const p = allProjects().find((x) => x.id === projectId);
  menu.dataset.project = projectId;
  menu.querySelector('[data-act="rename"]').hidden = !p?.manifest;  // a broken manifest can only be deleted
  menu.querySelector('[data-act="favicon"]').hidden = !p?.manifest;
  menu.querySelector('[data-act="rebuild-app"]').hidden = p?.manifest?.kind !== 'app' || !p.manifest.scripts?.build;
  const deletion = menu.querySelector('[data-act="delete"]');
  deletion.hidden = p?.origin === 'bundled' || !!p?.running;
  // Archive for live projects, Unarchive for archived ones
  const arch = menu.querySelector('[data-act="archive"]');
  arch.textContent = p?.archived ? 'Unarchive' : 'Archive';
  arch.hidden = !!p?.running;
  placeMenu(menu, x, y);
}
// A dropdown's option list closes itself: don't hide the list the same click opened.
const closeMenu = () => {
  document.querySelectorAll('.menu:not(.dropdown-list)').forEach((m) => { m.hidden = true; });
  $('#panel-menu-button')?.setAttribute('aria-expanded', 'false');
  $('#publication-links')?.setAttribute('aria-expanded', 'false');
  $('#ctx-menu [data-act="favicon"]')?.setAttribute('aria-expanded', 'false');
};

/** The shared Patch/Minor/Major menu serves the package version and the publication Next version alike. */
let versionMenuTarget = { input: null, commit: 'input' };
function openVersionMenu(input, commit, at) {
  if (!input || !bumpPackageVersion(input.value, 'patch')) return false;
  const menu = $('#version-menu');
  menu.querySelectorAll('[data-version-bump]').forEach((item) => {
    item.querySelector('.version-next').textContent = bumpPackageVersion(input.value, item.dataset.versionBump) ?? '';
  });
  closeMenu();
  versionMenuTarget = { input, commit };
  placeMenu(menu, at.x, at.y);
  return true;
}
/** A version input opens the shared menu on right-click without taking focus first (no outline or tooltip flash). */
function wireVersionMenu(input, commit) {
  if (!input) return;
  input.addEventListener('mousedown', (event) => { if (event.button === 2) event.preventDefault(); });
  input.addEventListener('contextmenu', (event) => {
    if (openVersionMenu(input, commit, { x: event.clientX, y: event.clientY })) event.preventDefault();
  });
}
$('#version-menu').addEventListener('click', (event) => {
  const kind = event.target.closest('[data-version-bump]')?.dataset.versionBump;
  const { input, commit } = versionMenuTarget;
  const version = input?.isConnected && bumpPackageVersion(input.value, kind);
  closeMenu();
  if (!version) return;
  input.value = version;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (commit === 'change') input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus();
});
$('#version-menu').addEventListener('keydown', (e) => menuKeyboard(e, $('#version-menu'), () => { closeMenu(); versionMenuTarget.input?.focus(); }));
$('#publication-links-menu').addEventListener('keydown', (e) => menuKeyboard(e, $('#publication-links-menu'), () => { closeMenu(); $('#publication-links')?.focus(); }));

$('#sec-menu').addEventListener('click', action(async (e) => {
  const act = e.target.closest('button')?.dataset.act;
  const index = Number($('#sec-menu').dataset.sec);
  closeMenu();
  if (act === 'new') {
    const name = (await ask({ title: 'New section', input: { label: 'Section name', value: '' }, ok: 'Create' }))?.toLowerCase();
    if (!name) return;
    if (state.layout.sections.some((section) => section.name.toLowerCase() === name.toLowerCase())) {
      await ask({ title: 'Section exists', message: `There is already a section named "${name}".`, cancel: null });
      return;
    }
    const l = cloneLayout();
    l.sections.push({ name, items: [] });
    await saveLayout(l);
    return;
  }
  if (act === 'rename') {
    $(`#projects .sec[data-sec="${index}"] .sec-head`)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return;
  }
  if (act === 'delete') {
    if (index < 0) return;
    const l = cloneLayout();
    l.sections.splice(index, 1);  // its projects move to Unsorted, other files in its folder to the Recycle Bin
    await saveLayout(l);
    return;
  }
  const visible = visibleSectionIndices(), position = visible.indexOf(index);
  const to = visible[act === 'up' ? position - 1 : act === 'down' ? position + 1 : -1];
  if (position < 0 || to === undefined) return;
  const l = cloneLayout();
  [l.sections[index], l.sections[to]] = [l.sections[to], l.sections[index]];
  await saveLayout(l);
}));
addEventListener('click', (e) => { if (!e.target.closest('.menu, #panel-menu-button, #publication-links, .dropdown')) closeMenu(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
addEventListener('scroll', (event) => { if (!event.target.closest?.('.dropdown-list')) closeMenu(); }, true);
addEventListener('blur', closeMenu);

$('#display-menu').addEventListener('click', action(async (e) => {
  if (e.target.closest('button')?.dataset.act !== 'refresh-displays') return;
  const menu = $('#display-menu');
  const p = allProjects().find((project) => project.id === menu.dataset.project);
  closeMenu();
  await loadMonitors();
  if (!p || selected()?.id !== p.id) return renderDetail(false);
  const fallback = refreshedDesktopDisplay(p.manifest, state.monitors);
  if (fallback) {
    const form = new FormData();
    form.set('display', fallback);
    await saveSettings(p, form, 'display');
    return;
  }
  renderDetail(false);
}));

/** Favicon: the icon menu as a submenu beside the row menu, which stays open behind it. */
function openFaviconSubmenu(item, id) {
  const p = allProjects().find((x) => x.id === id);
  if (!p?.manifest) return;
  const rect = item.getBoundingClientRect();
  openIconMenu(rect.right + 4, rect.top, p);
  $('#ctx-menu').hidden = false;
  item.setAttribute('aria-expanded', 'true');
}
$('#ctx-menu').addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  const id = $('#ctx-menu').dataset.project;
  if (act === 'favicon') return openFaviconSubmenu(e.target.closest('button'), id);
  closeMenu();
  if (act === 'rename') startRename(id);
  if (act === 'rebuild-app') rebuildApp(id).catch(report);
  if (act === 'delete') deleteProject(id).catch(report);
  if (act === 'archive') archiveProject(id).catch(report);
});

async function rebuildApp(id) {
  const job = await api('POST', `${projectUrl(id)}/rebuild-app`);
  state.jobs.set(job.id, { ...job, lines: state.jobs.get(job.id)?.lines ?? [] });
  renderJobsSoon();
  // Rebuild is background work; leave its output collapsed unless the user explicitly opens the job.
}

/**
 * Archive (live -> archive/) or Unarchive (archived -> back), no confirmation: either is undone
 * by the other. The list stays where it is; the project leaves it.
 */
async function archiveProject(id, targetView = null) {
  const p = allProjects().find((x) => x.id === id);
  const result = await api('POST', `${projectUrl(id)}/${p?.archived ? 'unarchive' : 'archive'}`);
  if (targetView && p) {
    state.view = targetView;
    state.search = null;
    state.selected = result.id;
    localStorage.setItem('panel.view', state.view);
    localStorage.setItem('panel.selected', state.selected);
  } else if (state.selected === id) state.selected = null;
  await loadProjects();
}

/** Moves the project folder to the Recycle Bin, after a confirmation. */
async function deleteProject(id) {
  const ok = await ask({
    title: 'Delete project',
    message: 'The project folder goes to the Recycle Bin. You can restore it from there.',
    ok: 'Delete',
    danger: true,
  });
  if (!ok) return;
  await api('POST', `${projectUrl(id)}/delete`);
  if (state.selected === id) state.selected = null;
  await loadProjects();
}

/** Edits a project's name in place in the list, independently of its package title. */
function startRename(id) {
  const p = allProjects().find((x) => x.id === id);
  const nameEl = document.querySelector(`.proj[data-id="${CSS.escape(id)}"] .name`);
  if (!p?.manifest || !nameEl) return;
  state.renaming = true;
  const input = document.createElement('input');
  input.className = 'rename';
  input.value = p.manifest.name;
  input.setAttribute('aria-label', 'Project name');
  nameEl.replaceChildren(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    try {
      if (save && name && name !== p.manifest.name) {
        const m = structuredClone(p.manifest);
        m.name = name;
        await api('PUT', `${projectUrl(p.id)}/manifest`, { manifest: m, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision });
      }
    } catch (e) {
      report(e);
    } finally {
      state.renaming = false;
      await loadProjects();
    }
  };
  // The input sits inside the project button: keep its clicks and keys to itself.
  for (const t of ['click', 'mousedown', 'keyup']) input.addEventListener(t, (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    if (e.key === ' ') e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

// ---- project detail -----------------------------------------------------------------------

/** The package identity: the platform's section of `plugins` (null standalone). */
const identity = (m) => (m?.platform ? (m.plugins?.[m.platform] ?? null) : null);

/** Generate package IDs only when the packager declares a title-to-ID rule. */
function syncPackageId(m, previous, packaging) {
  const platform = packaging?.platform ?? m.platform;
  const rule = packaging?.fields?.find((f) => f.key === 'id' && f.deriveStyle);
  const id = m.plugins?.[platform];
  if (!rule || !id || id.lastPackaged || !id.title?.trim()) return;
  if (id.id && id.title === previous?.plugins?.[platform]?.title) return;
  if (rule.deriveStyle === 'filename')
    id.id = `${rule.prefix ?? ''}${id.title.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/g, '')}`;
  if (rule.deriveStyle === 'package') {
    const name = id.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'app';
    id.id = `${rule.prefix ?? ''}${/^[a-z]/.test(name) ? name : `app_${name}`}`;
  }
}

const selected = () => allProjects().find((p) => p.id === state.selected) ?? null;

/** Use JSON labels: monitor and plugin names can contain colons or separators. */
const optionLabel = (o, owner) => {
  const labels = owner?.dataset.labels ? JSON.parse(owner.dataset.labels) : null;
  return labels?.[o] ?? (!o ? (owner?.dataset.default || 'Default') : owner?.dataset.raw ? o : o[0].toUpperCase() + o.slice(1));
};

function field(label, name, value, opts = {}) {
  const err = opts.disabled || opts.readonly ? null : state.fieldErrors[name];
  // Options: the panel's own dropdown (the browser's option list cannot be styled). A hidden
  // input carries the value, so the form and its autosave treat it like any field.
  const labels = { ...opts.labels, ...opts.optionLabels };
  const owner = { dataset: { default: opts.defaultLabel ?? '', raw: opts.raw ? '1' : '', labels: JSON.stringify(labels) } };
  const input = opts.options
    ? `<div class="dropdown" data-options="${esc(opts.options.join('|'))}" data-default="${esc(opts.defaultLabel ?? '')}" data-labels="${esc(JSON.stringify(labels))}" ${opts.marks ? `data-marks="${esc(JSON.stringify(opts.marks))}"` : ''} ${opts.optionDetails ? `data-details="${esc(JSON.stringify(opts.optionDetails))}"` : ''} ${opts.raw ? 'data-raw="1"' : ''} ${opts.multiple ? 'data-multi="1"' : ''} ${opts.title ? `title="${esc(opts.title)}"` : ''}>
        <input type="hidden" name="${name}" value="${esc(opts.multiple ? JSON.stringify(value) : value ?? '')}" ${err ? 'aria-invalid="true"' : ''}>
        <button type="button" class="dropdown-btn" aria-haspopup="listbox" aria-expanded="false" ${err ? 'aria-invalid="true"' : ''} ${opts.disabled ? 'disabled' : ''}>${!opts.multiple && opts.marks?.[value] ? `<span class="xrb-status-dot ${esc(opts.marks[value])}" aria-hidden="true"></span>` : ''}<span class="xrb-option-label">${esc(opts.multiple ? value.filter((v) => opts.options.includes(v)).map((v) => optionLabel(v, owner)).join(', ') || 'None' : optionLabel(value ?? '', owner))}</span>${!opts.multiple && opts.optionDetails?.[value] ? `<span class="xrb-option-detail">${esc(opts.optionDetails[value])}</span>` : ''}</button>
      </div>`
    : `<input name="${name}" value="${esc(value ?? '')}" ${err ? 'aria-invalid="true"' : ''} ${opts.disabled ? 'disabled' : ''} ${opts.readonly ? 'readonly aria-disabled="true"' : ''} ${opts.autocomplete ? `autocomplete="${esc(opts.autocomplete)}"` : ''} title="${esc(opts.title ?? '')}" placeholder="${esc(opts.placeholder ?? '')}">`;
  return renderField(label, input, { hint: opts.hint, error: err });
}

// Shared design-system dropdown behavior is state-model agnostic; this panel only supplies values.
installIcons(document);
installDropdowns(document);
installNumberSteppers(document);
installTooltips(document);
installTabs(document);
enhanceHelpText(document);

/**
 * Run and Run with dev server. While this project runs, the button that started it turns into
 * Stop (no extra button); while another project runs, both wait.
 */
const projectRunning = (p) => state.run?.projectId === p.id && state.run.phase !== 'idle';

function runButtons(p, busy) {
  const running = projectRunning(p);
  const stopping = running && state.run?.phase === 'stopping';
  const launching = running && state.run?.phase === 'starting';
  const button = running
    ? `<button id="act-stop" class="action-button${launching ? ' launching' : stopping ? '' : ' danger'}" ${launching || stopping ? 'disabled' : ''}>${launching ? 'Launching…' : stopping ? 'Stopping…' : 'Stop'}</button>`
    : `<button id="act-run" class="action-button primary" ${busy ? 'disabled' : ''}>Run</button>`;
  // A fresh template has no dist/ yet, so run it from source on the first click instead of
  // failing with "run Build first". Once built, use the developer's remembered app-level choice.
  const dev = running ? state.run?.mode === 'dev' : (!p.entryExists || devMode(p));
  const box = p.canDev
    ? `<label class="toggle xrb-toggle-pill xrb-toggle-pill-compact dev-server-toggle" data-tooltip="Run from source with live reload instead of the last build.">
        <input type="checkbox" id="act-dev" ${dev ? 'checked' : ''} ${running || busy ? 'disabled' : ''}> Dev server</label>`
    : '';
  const displayDisabled = (state.plugins?.disabled ?? []).some((plugin) => plugin.role === 'display' && plugin.name === p.manifest?.display);
  const desktop = displayDisabled || (p.manifest?.display ?? 'desktop') === 'desktop';
  const flat = running ? !!state.run?.flat : flatMode(p);
  const flatLocked = running ? state.run?.phase !== 'running' || !state.run?.channelUrl || (!!state.run?.switchView && !state.run?.switchable) : busy;
  const full = fullscreenMode(p);
  const fullBox = desktop
    ? `<label class="toggle xrb-toggle-pill xrb-toggle-pill-compact" data-tooltip="Run borderless on the selected display.">
        <input type="checkbox" id="act-fullscreen" ${full ? 'checked' : ''} ${running || busy ? 'disabled' : ''}> Fullscreen</label>`
    : `<label class="toggle xrb-toggle-pill xrb-toggle-pill-compact" data-tooltip="3D displays always run fullscreen.">
        <input type="checkbox" checked disabled> Fullscreen</label>`;
  const viewBox = `<label class="toggle xrb-toggle-pill xrb-toggle-pill-compact" data-tooltip="${desktop ? 'Use an Orthographic camera in 2D; Perspective in 3D.' : running ? 'Switch the display and managed camera between 2D and 3D while the app runs.' : 'Start the display and managed camera in 2D.'}">
        <input type="checkbox" id="act-flat" ${flat ? 'checked' : ''} ${flatLocked ? 'disabled' : ''}> 2D</label>`;
  return { button, dev: box, view: `${fullBox}${viewBox}` };
}

/** Standalone WebXR runs in a managed browser preview; packaged headset tabs remain build-only. */
function headsetButtons(p, busy) {
  const available = p.entryExists || p.manifest?.scripts?.build;
  const running = projectRunning(p);
  const useDev = running ? state.run?.mode === 'dev' : !p.entryExists || devMode(p);
  const launching = running && state.run?.phase === 'starting';
  const stopping = running && state.run?.phase === 'stopping';
  const button = running
    ? `<button id="act-stop" class="action-button${launching ? ' launching' : stopping ? '' : ' danger'}" ${launching || stopping ? 'disabled' : ''}>${launching ? 'Launching…' : stopping ? 'Stopping…' : 'Stop'}</button>`
    : `<button id="act-run" class="action-button primary" ${busy || !(available || (p.canDev && useDev)) ? 'disabled' : ''}>Run</button>`;
  const dev = p.canDev
    ? `<label class="toggle xrb-toggle-pill xrb-toggle-pill-compact dev-server-toggle" data-tooltip="Run from source with live reload instead of the last build.">
        <input type="checkbox" id="act-dev" ${useDev ? 'checked' : ''} ${running || busy ? 'disabled' : ''}> Dev server</label>`
    : '';
  const flat = running ? !!state.run?.flat : flatMode(p);
  return {
    button,
    dev,
    view: `<label class="toggle xrb-toggle-pill xrb-toggle-pill-compact" data-tooltip="Open the browser preview in fullscreen on the selected display.">
        <input type="checkbox" id="act-fullscreen" ${fullscreenMode(p) ? 'checked' : ''} ${running || busy ? 'disabled' : ''}> Fullscreen</label>
      <label class="toggle xrb-toggle-pill xrb-toggle-pill-compact" data-tooltip="Use an Orthographic camera in the local preview; published WebXR stays Perspective.">
        <input type="checkbox" id="act-flat" ${flat ? 'checked' : ''} ${running && state.run?.phase !== 'running' ? 'disabled' : ''}> 2D</label>`,
  };
}

/** Whether a project is built for a WebXR headset (manifest `target`; unset = the host). */
const isHeadset = (m) => m?.target === 'webxr';
/**
 * A role selector: the providers the built host offers for the role (built-ins and plugins, from
 * `xrb-host --list-plugins`); the platform also lists the platforms a packager plugin packages for.
 * A name the project uses but the host lacks stays selectable (marked missing), so nothing is lost.
 */
function inputField(m) {
  const deferred = new Set(['replay', 'simulated', 'calibrated']),isDeferred=name=>deferred.has(String(name).toLowerCase());
  const providers = (state.plugins?.providers ?? []).filter((p) => p.role === 'input' && p.name !== 'none' && !isDeferred(p.name));
  const values = exposedProviderInputs(m.inputs ?? ['mouse', 'keyboard', ...(m.input && m.input !== 'none' ? [m.input] : [])],providers).filter((name) => !isDeferred(name));
  const disabled = new Set((state.plugins?.disabled ?? []).filter((p) => p.role === 'input').map((p) => p.name));
  const selectable = providers.filter((provider) => !provider.hidden);
  const names = [...new Set([...selectable.map((p) => p.name), ...values.filter((v) => v !== 'mouse' && v !== 'keyboard')])].filter((n) => !disabled.has(n));
  const labels = { mouse: 'Mouse', keyboard: 'Keyboard' };
  for (const p of providers) if (!p.builtin) {
    const managed=state.managedPlugins.find(plugin=>plugin.providers?.some(provider=>provider.role==='input'&&provider.name===p.name));
    const label=p.label||managed?.title||p.description?.match(/^(.+?)\s+[—–]\s+/)?.[1]||p.description?.split(' ')[0]||p.name;
    labels[p.name]=p.hidden&&values.includes(p.name)?`${label} (unavailable)`:label;
  }
  return field('Input', 'inputs', values, { options: ['mouse', 'keyboard', ...names.filter((n) => n !== 'mouse' && n !== 'keyboard').sort()],
    optionLabels: labels, multiple: true, raw: true });
}

/** Drag a platform tab before or after another to reorder the tabs; the order is saved for the workspace. */
function wirePlatformDrag(group) {
  let dragged = null;
  const clear = () => group.querySelectorAll('.drop-before, .drop-after').forEach((b) => b.classList.remove('drop-before', 'drop-after'));
  const side = (button, e) => {
    const r = button.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? 'before' : 'after';
  };
  group.querySelectorAll('button[data-choice]').forEach((button) => {
    button.addEventListener('dragstart', (e) => {
      dragged = button.dataset.choice;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragged);
      requestAnimationFrame(() => button.classList.add('dragging'));
    });
    button.addEventListener('dragend', () => { dragged = null; button.classList.remove('dragging'); clear(); });
    button.addEventListener('dragover', (e) => {
      if (!dragged || dragged === button.dataset.choice) return;
      e.preventDefault();
      clear();
      button.classList.add(`drop-${side(button, e)}`);
    });
    button.addEventListener('drop', action(async (e) => {
      e.preventDefault();
      const from = dragged;
      const where = side(button, e);
      clear();
      if (!from || from === button.dataset.choice) return;
      const order = [...group.querySelectorAll('button[data-choice]')].map((b) => b.dataset.choice).filter((v) => v !== from);
      order.splice(order.indexOf(button.dataset.choice) + (where === 'after' ? 1 : 0), 0, from);
      const l = cloneLayout();
      // Choices not shown for this project keep their saved place after the shown ones.
      l.platformOrder = [...order, ...l.platformOrder.filter((v) => !order.includes(v))];
      await saveLayout(l);
      renderDetail(true);
    }));
  });
}

/** Platform choices in the workspace's saved tab order (xrb-panel.json); new ones keep their place after them. */
function orderedPlatforms(options) {
  const rank = new Map((state.layout.platformOrder ?? []).map((value, i) => [value, i]));
  return options.map((value, i) => ({ value, i })).sort((a, b) => (rank.get(a.value) ?? 1e6 + a.i) - (rank.get(b.value) ?? 1e6 + b.i)).map((o) => o.value);
}

function platformField(m, surface) {
  const { options: choices, labels, selected, warning } = platformChoices(m, state.plugins, surface);
  const options = orderedPlatforms(choices);
  // Titled like the fields beside it (Display, Package title): the tabs are the surface's Platform choice.
  return `<div class="platform-switch xrb-field-label">
    <span class="platform-title">Platform</span>
    <input type="hidden" name="platform-choice" value="${esc(selected)}">
    <div class="platform-options xrb-segmented" role="group" aria-label="Platform">${options.map((value) => `<button type="button" data-choice="${esc(value)}" draggable="true"
      aria-pressed="${value === selected}" ${warning && value === selected ? 'disabled' : ''}>${esc(labels[value])}</button>`).join('')}</div>
    ${warning ? `<span class="state none" title="${esc(warning)}">${esc(warning)}</span>` : ''}
  </div>`;
}

/** Each physical screen can be a desktop display; external display providers optionally
 * identify their screen by its friendly name (or the start of it, as models add a suffix), so a second mode
 * appears next to that screen, both named as the system names it. */
function displayField(m, { monitorsOnly = false } = {}) {
  const screens = state.monitors.length ? state.monitors : [{ index: 0, name: 'Primary monitor', primary: true }];
  const secondary = screens.filter((screen) => !screen.primary);
  const disabled = new Set((state.plugins?.disabled ?? []).filter((p) => p.role === 'display').map((p) => p.name));
  const providers = monitorsOnly ? [] : (state.plugins?.providers ?? []).filter((p) => p.role === 'display' && !p.builtin && !disabled.has(p.name));
  const matches = (provider, screen) => provider.screenName
    ? screen.name.toLowerCase().startsWith(provider.screenName.toLowerCase())
    : providers.length === 1 && secondary.length === 1 && secondary[0].index === screen.index;
  const current = monitorsOnly
    ? `desktop:${Math.max(0, Number(m.plugins?.desktop?.monitor) || 0)}`
    : m.display && m.display !== 'desktop'
      ? disabled.has(m.display) ? 'desktop:0' : m.display
      : `desktop:${Math.max(0, Number(m.plugins?.desktop?.monitor) || 0)}`;
  const options = [];
  const labels = {};
  for (const screen of screens) {
    const paired = providers.filter((provider) => matches(provider, screen));
    const value = `desktop:${screen.index}`;
    options.push(value);
    labels[value] = paired.some((provider) => provider.displayMode === '3D') ? `${screen.name} (2D)` : screen.name;
    for (const provider of paired) {
      if (options.includes(provider.name)) continue;
      options.push(provider.name);
      labels[provider.name] = `${screen.name}${provider.displayMode ? ` (${provider.displayMode})` : ` (${provider.name})`}`;
    }
  }
  for (const provider of providers) {
    if (options.includes(provider.name)) continue;
    options.push(provider.name);
    labels[provider.name] = `${provider.screenName ?? provider.name}${provider.displayMode ? ` (${provider.displayMode})` : ''}`;
  }
  // Keep disconnected monitors and missing providers readable without offering disabled plugins.
  if (!options.includes(current)) {
    labels[current] = current.startsWith('desktop:')
      ? `${screens.find((screen) => `desktop:${screen.index}` === current)?.name ?? 'Missing monitor'} (desktop)`
      : `${current} (unavailable)`;
    if (current.startsWith('desktop:')) options.push(current);
  }
  return field('Display', 'display', current, { options, optionLabels: labels, raw: true });
}

/** The identity fields the platform's packager declares (version excepted: it sits next to Build package). */
function identityFields(p, titleOnly = false) {
  const pk = p.packaging, m = p.manifest;
  if (!pk?.available) return '';
  const id = m.plugins?.[pk.platform] ?? {};
  return pk.fields.filter((f) => f.kind !== 'version' && (f.key === 'title') === titleOnly
    && !f.hidden).map((f) => {
    const fixed = f.fixed && id.lastPackaged;
    const label = f.key === 'title' ? 'Package title' : f.label;
    return field(label, `plugins.${pk.platform}.${f.key}`, f.key === 'title' && !fixed ? m.name : (id[f.key] ?? ''), {
      readonly: fixed, title: fixed ? `${label} is fixed after the first package` : (f.hint ?? ''),
    });
  }).join('');
}

/**
 * Package build, through the packager plugin of the project's platform. Without one (no plugin for the
 * platform, or a standalone app) the package action is omitted.
 */
function publisherDisplayName(item) {
  try { return new URL(item.origin).hostname || item.label || item.name; }
  catch { return item.label ?? item.name; }
}

const PUBLICATION_EFFECT_MS = 180;
const publicationKey = (projectId, publisher) => `${projectId}\n${publisher}`;
function activePublicationJob(projectId) {
  return [...state.jobs.values()].filter((job) => job.kind === 'publication' && job.projectId === projectId
    && (job.state === 'queued' || job.state === 'running'))
    .sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || a.id - b.id)[0] ?? null;
}
function effectivePublicationStatus(p, publisher, status) {
  const key = publicationKey(p.id, publisher);
  const override = state.publicationOverrides.get(key);
  if (!override) return status;
  if (status?.state === override.status.state) {
    state.publicationOverrides.delete(key);
    return status;
  }
  if (Date.now() >= override.expiresMs) {
    state.publicationOverrides.delete(key);
    return status;
  }
  return override.status;
}
function publicationEffect(p, publisher) {
  const effect = state.publicationEffects.get(publicationKey(p.id, publisher));
  return effect && effect.untilMs > Date.now() ? effect : null;
}
/** Accessible names of running publication operations; explicit so Update and Make live never read as Publish. */
// Publish covers new versions (publish, update); making an existing version live again reads Activate.
const OPERATION_LABELS = { publish: 'Publishing…', update: 'Publishing…', activate: 'Activating…', 'delete-release': 'Deleting…', unpublish: 'Unpublishing…' };
const ACTION_LABELS = { publish: 'Publish', update: 'Publish', activate: 'Activate', 'delete-release': 'Delete', unpublish: 'Unpublish' };

/** Before a new version goes out, say what is built, where it goes and what it replaces. Legacy publishers skip this. */
async function confirmNewVersion(p) {
  const releases = releasesOf(p);
  if (!releases) return true;
  const publisher = p.manifest?.publication?.publisher ?? '';
  const request = releaseRequest(p);
  const catalog = effectiveReleases(p, publisher, releases);
  const live = catalog?.liveReleaseId ? catalog.releases.find((release) => release.releaseId === catalog.liveReleaseId) : null;
  const status = effectivePublicationStatus(p, publisher, p.publicationDestinations?.[publisher]?.status ?? p.publication?.status);
  const destination = status?.deployedUrl ?? status?.selectedUrl ?? '';
  const replaces = live ? `, replacing ${releaseLabel(live)}, which is live now. Earlier versions stay available in Live version`
    : status?.state === 'published' || status?.state === 'failed' ? ', replacing the unversioned app that is live now. It is kept as a Legacy entry in Live version' : '';
  return !!(await ask({ title: `Publish ${request.version} version?`, message: `${p.manifest.name} is built from your current source and published as ${request.version} at ${destination}${replaces}.`, ok: 'Publish' }));
}
const releaseLabel = (release) => release?.version ?? 'Legacy (unversioned)';
const releasesOf = (p) => { const info = p.publicationStandalone ?? p.publication; return info?.releases?.supported ? info.releases : null; };

/**
 * Release history as shown: a verified job result marks the live release until the publisher's catalog
 * converges. Only the publisher's catalog can clear it; local intent never labels a release Live.
 */
function effectiveReleases(p, publisher, releases) {
  if (!releases?.supported) return null;
  const key = publicationKey(p.id, publisher);
  const override = state.releaseOverrides.get(key);
  const catalog = releases.catalog;
  if (!override) return catalog;
  if (Date.now() >= override.expiresMs || (catalog && catalog.liveReleaseId === override.liveReleaseId)) {
    state.releaseOverrides.delete(key);
    return catalog;
  }
  const list = [...(catalog?.releases ?? [])];
  if (override.release && !list.some((r) => r.releaseId === override.release.releaseId)) list.push(override.release);
  return { revision: catalog?.revision ?? null, releases: list, requestedReleaseId: override.liveReleaseId, liveReleaseId: override.liveReleaseId, legacyLive: false };
}

/** The version and catalog revision a Publish/Update request is validated against. */
function releaseRequest(p) {
  const releases = releasesOf(p);
  if (!releases) return undefined;
  const input = $('#build-settings [name="publication.version"]');
  return { version: (input?.value ?? '').trim() || releases.nextVersion, expectedRevision: releases.catalog?.revision ?? null };
}

async function startPublicationJob(p, operation, body) {
  const publication = structuredClone(p.manifest.publication);
  const view = { jobId: null, publication, status: p.publication?.status ?? null };
  state.publicationJobViews.set(p.id, view);
  const route = operation === 'update' ? 'publish' : operation;
  try {
    const job = await api('POST', `${projectUrl(p.id)}/${route}`, operation === 'unpublish' ? { confirm: true } : body);
    view.jobId = job.id;
    // SSE can finish a fast operation before its HTTP start response arrives.
    const streamed = state.jobs.get(job.id);
    const accepted = ['done', 'failed'].includes(streamed?.state) || (streamed?.state === 'running' && job.state === 'queued') ? streamed : job;
    state.jobs.set(job.id, { ...accepted, lines: streamed?.lines ?? [] });
    if (accepted.state === 'done' && streamed?.state !== 'done') finishPublicationJob(accepted);
    if (accepted.state === 'failed' && state.publicationJobViews.get(p.id) === view) state.publicationJobViews.delete(p.id);
    renderJobsSoon();
    renderProjects();
    renderDetail();
    return job;
  } catch (error) {
    if (state.publicationJobViews.get(p.id) === view) state.publicationJobViews.delete(p.id);
    const details = error instanceof ApiError ? error.data?.details : null;
    // Version problems belong under the Next version field; a moved catalog is shown, then history is refreshed.
    if (details?.errors?.some((item) => item.field === 'publication.version')) {
      showFieldErrors({ 'publication.version': error.message });
      return null;
    }
    if (details?.stale === 'release-catalog' || details?.alreadyLive) {
      await loadProjects();
      await ask({ title: 'Release history changed', message: `${error.message}.`, closeOnly: true });
      return null;
    }
    throw error;
  }
}

function finishPublicationJob(job) {
  const p = allProjects().find((project) => project.id === job.projectId);
  const jobView = state.publicationJobViews.get(job.projectId);
  const publication = jobView?.publication ?? p?.manifest?.publication;
  const publisher = publication?.publisher;
  if (!p || !publisher || !OPERATION_LABELS[job.operation]) return;
  const key = publicationKey(p.id, publisher);
  if (job.operation === 'delete-release') {
    // Deleting a retained release changes history only: no live state to show early, just re-read the catalog.
    state.releaseSelection.delete(key);
    renderProjects();
    if (selected()?.id === p.id) renderDetail(true);
    for (const delay of [350, 1000, 2000]) setTimeout(() => loadProjects().catch(report), delay);
    setTimeout(() => { if (state.publicationJobViews.get(p.id) === jobView) state.publicationJobViews.delete(p.id); loadProjects().catch(report); }, 2500);
    return;
  }
  const current = p.publication?.status ?? p.publicationDestinations?.[publisher]?.status ?? null;
  const url = current?.deployedUrl ?? current?.selectedUrl;
  const published = job.operation !== 'unpublish';
  const status = { ...current, state: published ? 'published' : 'unpublished', selectedUrl: url,
    deployedUrl: published ? url : undefined, error: undefined };
  const override = { status, expiresMs: Date.now() + 5000 };
  // Update and Make live change the live release, not the deployment: no reveal replay of the deployment UI.
  const creates = job.operation === 'publish' || job.operation === 'unpublish';
  const effect = creates ? { projectId: p.id, publisher, kind: published ? 'enter' : 'leave', url,
    startedMs: Date.now(), untilMs: Date.now() + PUBLICATION_EFFECT_MS } : null;
  state.publicationOverrides.set(key, override);
  if (effect) state.publicationEffects.set(key, effect);
  const result = job.result && typeof job.result === 'object' ? job.result : null;
  const releaseOverride = releasesOf(p) ? {
    liveReleaseId: published && typeof result?.releaseId === 'string' ? result.releaseId : null,
    release: published && typeof result?.releaseId === 'string' ? { releaseId: result.releaseId, version: result.version ?? null, digest: '', createdMs: Date.now() } : null,
    expiresMs: Date.now() + 5000,
  } : null;
  if (releaseOverride) state.releaseOverrides.set(key, releaseOverride);
  renderProjects();
  if (selected()?.id === p.id) renderDetail(true);
  setTimeout(() => {
    if (state.publicationEffects.get(key) === effect) state.publicationEffects.delete(key);
    if (selected()?.id === p.id) renderDetail(true);
  }, PUBLICATION_EFFECT_MS);
  for (const delay of [350, 1000, 2000]) setTimeout(() => loadProjects().catch(report), delay);
  setTimeout(() => {
    if (state.publicationOverrides.get(key) === override) state.publicationOverrides.delete(key);
    if (state.releaseOverrides.get(key) === releaseOverride) state.releaseOverrides.delete(key);
    if (state.publicationJobViews.get(p.id) === jobView) state.publicationJobViews.delete(p.id);
    loadProjects().catch(report);
  }, 5000);
}

/** Every destination of the app that is live (or deployed but unreachable), selected publisher first. */
function publishedDestinations(p) {
  const info = p.publicationStandalone ?? p.publication;
  const selected = p.manifest?.publication?.publisher ?? '';
  const names = [...new Set([selected, ...(info?.publishers ?? []).map((item) => item.name)])].filter(Boolean);
  return names.map((name) => {
    const raw = p.publicationDestinations?.[name]?.status ?? (name === selected ? p.publication?.status : null);
    const status = effectivePublicationStatus(p, name, raw);
    const url = status?.deployedUrl ?? status?.selectedUrl;
    if (!url || (status?.state !== 'published' && status?.state !== 'failed')) return null;
    const item = info?.publishers?.find((entry) => entry.name === name);
    return { name, label: item ? publisherDisplayName(item) : name, url, reachable: status.state === 'published', error: status.error };
  }).filter(Boolean);
}

/** One live destination is its link; several become a "N published" trigger whose menu lists every link. */
function publicationHeroLink(p) {
  const destinations = publishedDestinations(p);
  if (!destinations.length) return '';
  if (destinations.length === 1) {
    const [{ url, reachable, error }] = destinations;
    return reachable
      ? `<a class="publication-hero-link" href="${esc(url)}" target="_blank" rel="noopener"><span class="publication-status-dot" aria-hidden="true"></span>${esc(url)}</a>`
      : `<span class="publication-hero-link disabled" title="${esc(error ?? 'The published app is not reachable')}"><span class="publication-status-dot" aria-hidden="true"></span>${esc(url)}</span>`;
  }
  const allReachable = destinations.every((item) => item.reachable);
  return `<button type="button" id="publication-links" class="publication-hero-link publication-hero-menu${allReachable ? '' : ' disabled'}" aria-haspopup="menu" aria-expanded="false" data-tooltip="Open a published destination">
      <span class="publication-status-dot" aria-hidden="true"></span>${destinations.length} published</button>`;
}

/** The hero's destination menu: one link per live destination, with its reachability dot and URL. */
function openPublicationLinks(button, p) {
  const menu = $('#publication-links-menu');
  const destinations = publishedDestinations(p);
  menu.replaceChildren(...destinations.map((item) => {
    const link = document.createElement('a');
    link.role = 'menuitem';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'publication-link-item';
    if (!item.reachable) link.title = item.error ?? 'The published app is not reachable';
    const dot = document.createElement('span');
    dot.className = `xrb-status-dot ${item.reachable ? 'ok' : 'warn'}`;
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'publication-link-label';
    label.textContent = item.label;
    const url = document.createElement('span');
    url.className = 'publication-link-url muted mono';
    url.textContent = item.url;
    link.append(dot, label, url);
    link.addEventListener('click', () => closeMenu());
    return link;
  }));
  closeMenu();
  openFloating(menu, { anchor: button });
  button.setAttribute('aria-expanded', 'true');
}

function publicationFields(p) {
  // Publication is a WebXR deployment workflow, independent of the package target selected above.
  if (p.manifest?.kind !== 'app') return { button: '', fields: '' };
  const pub = p.manifest.publication ?? {};
  const info = p.publicationStandalone ?? p.publication ?? { publishers: [], status: null };
  const publisherNames = info.publishers.map((item) => item.name);
  const publisherLabels = Object.fromEntries(info.publishers.map((item) => [item.name, publisherDisplayName(item)]));
  // Each destination's live state marks its option: green when published, amber when deployed but not reachable.
  const publisherMarks = Object.fromEntries(publisherNames.map((name) => {
    const destination = effectivePublicationStatus(p, name, p.publicationDestinations?.[name]?.status ?? null);
    return [name, destination?.state === 'published' ? 'ok' : destination?.state === 'failed' ? 'warn' : null];
  }).filter(([, mark]) => mark));
  const selectedPublisher = pub.publisher || '';
  const status = effectivePublicationStatus(p, selectedPublisher, p.publicationDestinations?.[selectedPublisher]?.status ?? info.status);
  // 'failed' from a publisher's status: published (it has a record), but the site does not serve it. Still published:
  // the action is Unpublish, and the note says why it is not reachable.
  const published = status?.state === 'published' || status?.state === 'failed';
  const publicationJob = activePublicationJob(p.id);
  const remoteOperation = status?.state === 'pending' ? String(status.operation ?? '').toLowerCase() : '';
  const operation = publicationJob?.operation ?? (remoteOperation.includes('unpublish') ? 'unpublish' : remoteOperation.includes('activat') ? 'activate' : remoteOperation.includes('delet') ? 'delete-release' : status?.state === 'pending' ? 'publish' : null);
  const pending = !!publicationJob || status?.state === 'pending';
  const checking = !pending && status?.state === 'checking';
  // Release-capable publishers: Publish, then Update in place, with Unpublish as a separate confirmed action.
  // Legacy publishers keep the shared Publish/Unpublish primary slot and get no version controls or history.
  const releases = releasesOf(p);
  const versioned = !!releases && !!selectedPublisher && info.available;
  const catalog = versioned ? effectiveReleases(p, selectedPublisher, releases) : null;
  const actionName = pending ? (operation ?? 'publish') : published ? (versioned ? 'update' : 'unpublish') : 'publish';
  const savingDestination = state.savingPublication.has(p.id);
  const canPublish = !!selectedPublisher && info.available && (p.manifest.scripts?.build || p.entryExists);
  const retainedVersions = catalog?.releases.map((release) => release.version) ?? [];
  const nextVersion = versioned ? nextPublicationVersion(pub.versions?.[selectedPublisher], retainedVersions) : '';
  const versionValid = !versioned || !!bumpPackageVersion(nextVersion, 'patch');
  const locked = pending || checking || savingDestination;
  const actionEnabled = !savingDestination && !checking && (actionName === 'publish' || actionName === 'update' ? canPublish && versionValid : !!selectedPublisher && info.available);
  const actionLabel = pending ? OPERATION_LABELS[actionName] : checking ? 'Checking…' : ACTION_LABELS[actionName];
  const spinner = '<span class="xrb-spinner xrb-spinner-small" aria-hidden="true"></span>';
  const actionContent = pending ? spinner : `<span>${actionLabel}</span>`;
  const actionButton = `<button type="button" id="act-${actionName}" class="action-button" ${pending ? `aria-label="${actionLabel}" ` : ''}${!pending && actionEnabled ? '' : 'disabled'}>${actionContent}</button>`;
  const secondaryUnpublish = versioned && published && !pending
    ? `<button type="button" id="act-unpublish" class="action-button publication-secondary" ${locked ? 'disabled' : ''}>Unpublish</button>` : '';
  // A status problem is not a failed action: the publisher says why the app is not live, or cannot be asked.
  const failureTitle = status?.state === 'unavailable' ? 'Publisher unavailable' : 'Publication failed';
  const failure = status?.error && status.state !== 'failed' ? `<div class="publication-result error"><div class="publication-result-head"><span>${failureTitle}</span></div><span class="field-error">${esc(status.error)}</span></div>` : '';
  const result = failure;
  const selectedSlug = published && typeof status?.deployedSlug === 'string'
    ? status.deployedSlug
    : typeof pub.slug === 'string' ? pub.slug : defaultProjectSlug(p.id);
  // Next version is a draft: editing it (or Patch/Minor/Major from its context menu) deploys nothing. Live version
  // comes only from verified status. Publish/Update and Unpublish sit in the hero below the title.
  const live = catalog?.liveReleaseId ? catalog.releases.find((release) => release.releaseId === catalog.liveReleaseId) : null;
  const liveLabel = !versioned ? ''
    : published && live ? releaseLabel(live)
    : published && (catalog?.legacyLive || !catalog) ? 'Legacy (unversioned)'
    : published ? 'Not verified yet'
    : 'Not live';
  // Live version lists every retained release, newest first, with the verified live one marked and selected;
  // choosing another one asks to make it live. Without history it is a read-only label (legacy, not live).
  const retained = [...(catalog?.releases ?? [])].sort((a, b) => b.createdMs - a.createdMs || releaseLabel(b).localeCompare(releaseLabel(a)));
  const releaseMarks = Object.fromEntries(retained.map((release) => [release.releaseId,
    release.releaseId === catalog?.liveReleaseId ? 'ok' : release.releaseId === catalog?.requestedReleaseId ? 'warn' : null]).filter(([, mark]) => mark));
  // A retained release chosen in Live version is inspected first: the identity-row link opens its archive, Activate
  // deploys it, Delete removes it from history. A requested-but-unverified release cannot be deleted either.
  const selection = state.releaseSelection.get(publicationKey(p.id, selectedPublisher));
  const inspected = selection && selection !== (catalog?.liveReleaseId ?? null) ? retained.find((release) => release.releaseId === selection) ?? null : null;
  const deletable = !!inspected && inspected.releaseId !== catalog?.requestedReleaseId;
  const deleteRelease = `<button type="button" id="act-delete-release" class="action-button publication-secondary" ${locked || !info.available || !deletable ? 'disabled' : ''}${deletable ? '' : ' data-tooltip="This version is the requested deployment; activate another one or unpublish first"'}>Delete</button>`;
  const inspectActions = inspected && !pending ? `<button type="button" id="act-make-live" class="action-button" ${locked || !info.available ? 'disabled' : ''}>Activate</button>${deleteRelease}` : '';
  const liveField = retained.length
    // While nothing is live, "Not live" stays a permanent first entry so an inspection can be ended again.
    ? field('Live version', 'publication.live', inspected?.releaseId ?? live?.releaseId ?? '', { options: [...(published ? [] : ['']), ...retained.map((release) => release.releaseId)],
      optionLabels: Object.fromEntries(retained.map((release) => [release.releaseId, releaseLabel(release)])),
      optionDetails: Object.fromEntries(retained.map((release) => [release.releaseId, ago(release.createdMs)])),
      marks: releaseMarks, raw: true, defaultLabel: liveLabel, disabled: locked || !info.available })
    : `<label>Live version<input value="${esc(liveLabel)}" readonly aria-disabled="true" tabindex="-1" class="publication-live"></label>`;
  const versionRow = versioned ? `<div class="publication-version">
        ${liveField}
        ${field('Next version', 'publication.version', nextVersion, { autocomplete: 'off', disabled: locked || !!inspected })}
      </div>` : '';
  const historyError = releases?.error ? `<span class="xrb-help field-error">${esc(releases.error)}</span>` : '';
  return {
    // The action row holds Publish/Update with the confirmed Unpublish, or Activate and Delete while a retained release is inspected.
    button: inspectActions || `${actionButton}${secondaryUnpublish}`,
    fields: `<section class="publication-fields" aria-label="Publish">
      <div class="publication-config">
        ${field('Publisher', 'publication.publisher', selectedPublisher, { options: publisherNames, optionLabels: publisherLabels, marks: publisherMarks, defaultLabel: publisherNames.length ? 'Choose a publisher' : 'No publishers installed', raw: true, disabled: pending || checking || !publisherNames.length })}
        ${field('App slug', 'publication.slug', selectedSlug, { autocomplete: 'off', disabled: pending || checking, readonly: published })}
      </div>
      ${versionRow}
      ${result}
      ${historyError}
    </section>`,
  };
}

const setupKey = (p) => `${p.id}\n${p.packaging.platform}`;
async function refreshPackageSetup(p) {
  const key = setupKey(p);
  const request = {};
  state.packageSetupChecks.set(key, request);
  state.packageSetup.set(key, { state: 'checking' });
  let status;
  try { status = await api('GET', `${projectUrl(p.id)}/package/setup-status`); }
  catch (e) { status = { state: 'unavailable', reason: `Could not check package tools: ${e.message}` }; }
  if (state.packageSetupChecks.get(key) !== request) return null;
  state.packageSetup.set(key, status);
  if (selected()?.id === p.id && selected()?.packaging?.platform === p.packaging.platform) renderDetail();
  return status;
}
function packageSetupStatus(p) {
  if (!p.packaging?.setupSupported) return { state: 'ready' };
  if (state.savingPlatform === p.id) return { state: 'checking' };
  const key = setupKey(p);
  if (!state.packageSetup.has(key)) void refreshPackageSetup(p).catch(report);
  return state.packageSetup.get(key);
}
function packageAction(p) {
  const pk = p.packaging;
  if (!pk?.available) return { button: '', details: '' };
  const setup = packageSetupStatus(p);
  const setupNeeded = setup.state === 'setup-required' || setup.state === 'unavailable';
  const busy = [...state.jobs.values()].some((j) => j.kind === 'packager-setup' && j.state === 'running');
  const disabled = busy || setup.state === 'checking' || (!setupNeeded && !!pk.errors.length);
  const errors = pk.errors.map((e) => `<span class="field-error">${esc(e.message)}</span>`).join('');
  const reason = setup.reason ? `<span class="field-error">${esc(setup.reason)}</span>` : '';
  return {
    button: `<button type="button" id="act-${setupNeeded ? 'package-setup' : 'package'}" class="action-button" ${disabled ? 'disabled' : ''}>${setup.state === 'checking' ? 'Checking…' : setupNeeded ? 'Setup' : 'Build'}</button>`,
    details: `${reason}${errors}`,
  };
}

const preferenceId = (p) => p?.preferenceKey ?? p?.id;
const cameraKey = (id) => `panel.cams.${preferenceId(allProjects().find(project => project.id === id)) ?? id}`;
const cameraMode = (id) => {
  const p = allProjects().find(project => project.id === id), saved = localStorage.getItem(cameraKey(id)) ?? localStorage.getItem(`panel.cams.${id}`);
  return saved === null ? p?.runDefaults?.cameraView === true : saved === '1';
};
const surfaceKey = () => 'panel.surface';
const surfaceChoiceKey = (p, surface) => `panel.surfaceChoice.${surface}.${preferenceId(p)}`;
const choicesForSurface = (p, surface) => platformChoices(p.manifest, state.plugins, surface).options;
function projectSurface(p) {
  const current = platformChoiceOf(p.manifest);
  const stored = localStorage.getItem(surfaceKey()) ?? localStorage.getItem(`panel.surface.${p.id}`);
  if (stored === 'publish' && p.manifest?.kind === 'app' && hasProjectPublishers(p)) return 'publish';
  const saved = stored;
  if ((saved === 'display' || saved === 'build') && choicesForSurface(p, saved).includes(current)) return saved;
  if (choicesForSurface(p, 'display').includes(current)) return 'display';
  if (choicesForSurface(p, 'build').includes(current)) return 'build';
  return 'display';
}
async function selectProjectSurface(p, surface) {
  if (surface === 'publish') {
    if (!hasProjectPublishers(p)) return;
    localStorage.setItem(surfaceKey(), surface);
    animateDetailHeights(() => renderDetail(true));
    // Persist an unambiguous default only on this explicit action, never on startup/re-render.
    if (state.savingPlatform !== p.id && !p.manifest.publication?.publisher && p.publication?.publishers.length === 1) {
      const publisher = $('#build-settings [name="publication.publisher"]');
      if (publisher) {
        publisher.value = p.publication.publishers[0].name;
        publisher.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return;
  }
  const options = choicesForSurface(p, surface);
  if (!options.length) return;
  const previous = localStorage.getItem(surfaceKey());
  const remembered = localStorage.getItem(surfaceChoiceKey(p, surface))
    ?? (surface === 'build' ? localStorage.getItem(surfaceChoiceKey(p, 'publish')) : null);
  const current = platformChoiceOf(p.manifest);
  const choice = remembered && options.includes(remembered) ? remembered : options.includes(current) ? current : options[0];
  localStorage.setItem(surfaceKey(), surface);
  try {
    if (choice !== platformChoiceOf(p.manifest)) await savePlatformChoice(p, choice);
    localStorage.setItem(surfaceChoiceKey(p, surface), choice);
    animateDetailHeights(() => renderDetail(true));
  } catch (error) {
    if (previous === null) localStorage.removeItem(surfaceKey());
    else localStorage.setItem(surfaceKey(), previous);
    renderDetail(true);
    throw error;
  }
}
/** Run toggles are app-level so Desktop and standalone WebXR never disagree. */
const legacyRunOptionKey = (name, p) => `panel.${name}.${p.id}.${platformChoiceOf(p.manifest)}`;
const appRunOption = (name, p) => {
  const key = `panel.${name}.${preferenceId(p)}`, saved = localStorage.getItem(key);
  if (saved !== null) return saved === '1';
  const legacy = localStorage.getItem(`panel.${name}.${p.id}`) ?? localStorage.getItem(legacyRunOptionKey(name, p));
  if (legacy !== null) localStorage.setItem(key, legacy);
  return legacy === null ? p.runDefaults?.[name] === true || name === 'fullscreen' && p.manifest?.plugins?.desktop?.fullscreen === true : legacy === '1';
};
const setAppRunOption = (name, p, on) => localStorage.setItem(`panel.${name}.${preferenceId(p)}`, on ? '1' : '0');
const devMode = (p) => appRunOption('dev', p);
const setDevMode = (p, on) => setAppRunOption('dev', p, on);
const flatMode = (p) => appRunOption('flat', p);
const fullscreenMode = (p) => appRunOption('fullscreen', p);
const previewPath = (p) => `/preview/${p.id.split('/').map(encodeURIComponent).join('/')}/`;
const previewTokenKey = (p) => `panel.previewToken.${p.id}`;
const previewProjectionChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('xrb-preview-projection');
function signalPreviewProjection(p, flat) {
  const route = previewPath(p), projection = flat ? 'orthographic' : 'perspective';
  previewProjectionChannel?.postMessage({ route, projection });
  const token = sessionStorage.getItem(previewTokenKey(p));
  if (token) void api('POST', '/api/preview/projection', { route, token, projection }).catch(report);
}

async function startManagedRun(p, mode, flat, request) {
  const previousRun = state.run;
  state.run = { projectId: p.id, mode, flat, phase: 'starting', startedMs: Date.now() };
  renderDetail(true);
  renderRun();
  try {
    await request();
    await loadRun();
    renderDetail();
  } catch (error) {
    state.run = previousRun;
    renderRun();
    renderDetail();
    throw error;
  }
}

async function stopManagedRun() {
  const previousRun = state.run;
  if (!previousRun || previousRun.phase === 'idle' || previousRun.phase === 'stopping') return;
  state.run = { ...previousRun, phase: 'stopping' };
  renderDetail(true);
  renderRun();
  try {
    await api('POST', '/api/run/stop');
    if (previousRun.projectId) sessionStorage.removeItem(`panel.previewToken.${previousRun.projectId}`);
    await loadRun();
    renderDetail();
  } catch (error) {
    state.run = previousRun;
    renderRun();
    renderDetail();
    throw error;
  }
}

/**
 * vscode:// link to a workspace file. The browser hands it to VS Code itself, which then comes to the
 * front (a window opened by the background panel server would stay behind the browser).
 */
function vscodeLink(workspaceRelative) {
  const root = (state.repo ?? '').replace(/\\/g, '/');
  return `vscode://file/${root}/${workspaceRelative}`.replace(/ /g, '%20');
}

function renderDetail(force = false) {
  // Live events re-render the view; never throw away settings the developer is editing.
  if (state.dirty && !force) return;
  // Nor cut a card height animation short (a platform save's own refresh arrives mid-animation): render after it.
  const animating = (state.detailAnimationUntil ?? 0) - performance.now();
  if (!force && animating > 0) {
    clearTimeout(state.detailRenderTimer);
    state.detailRenderTimer = setTimeout(() => renderDetail(), animating);
    return;
  }
  state.dirty = false;
  const el = $('#detail');
  const p = selected();
  if (!p && state.view === 'archive') {
    el.innerHTML = '';
    syncRunDock(null);
    return;
  }
  if (!p) {
    el.innerHTML = '';
    syncRunDock(null);
    return;
  }
  const m = p.manifest;
  const busy = !!state.run && state.run.phase !== 'idle';
  const surface = m ? projectSurface(p) : 'display';
  const displaySurface = surface === 'display';
  const publishSurface = surface === 'publish';
  const headset = isHeadset(m);
  const packagedHeadset = headset && !!m?.platform;
  const controls = m && displaySurface ? (packagedHeadset ? null : headset ? headsetButtons(p, busy) : runButtons(p, busy)) : null;
  const packageControl = m && surface === 'build' ? packageAction(p) : { button: '', details: '' };
  const publicationControl = m && publishSurface ? publicationFields(p) : { button: '', fields: '' };
  const heroButton = displaySurface ? controls?.button ?? '' : publishSurface ? publicationControl.button : packageControl.button;
  const displayChoices = m ? choicesForSurface(p, 'display') : [];
  const buildChoices = m ? choicesForSurface(p, 'build') : [];
  const publicationLink = m ? publicationHeroLink(p) : '';
  const workflowTabs = m ? `<div class="project-workflow-tabs xrb-tabs" role="tablist" aria-label="Project workflow" data-xrb-tabs-id="project-workflow-${p.id}">
      <button type="button" class="xrb-tab" role="tab" data-surface="display" data-view="display" aria-selected="${displaySurface}" ${displaySurface ? 'data-active' : ''} ${displayChoices.length ? '' : 'disabled'}>Develop</button>
      ${hasProjectPublishers(p) ? `<button type="button" class="xrb-tab" role="tab" data-surface="publish" data-view="publish" aria-selected="${publishSurface}" ${publishSurface ? 'data-active' : ''}>Publish</button>` : ''}
      <button type="button" class="xrb-tab" role="tab" data-surface="build" data-view="build" aria-selected="${surface === 'build'}" ${surface === 'build' ? 'data-active' : ''} ${buildChoices.length ? '' : 'disabled'}>Build</button>
      ${publicationLink ? `<span class="spacer"></span>${publicationLink}` : ''}
    </div>` : '';
  const manifestButton = m && p.origin === 'bundled'
    ? `<button type="button" class="xrb-icon-button" id="open-manifest" aria-label="Open JSON">${iconSvg('code')}</button>`
    : m ? `<a href="${esc(vscodeLink(`${p.dir}/xrb-project.json`))}" class="xrb-icon-button" id="open-manifest" title="Open ${esc(p.dir)}/xrb-project.json in VS Code" aria-label="Open JSON">${iconSvg('code')}</a>`
    : '';
  // One click to the version chosen in Live version: an inspected release opens its archive, published or not;
  // otherwise the selected destination's live app, whenever it is published and reachable.
  const selectedPublisherName = m?.publication?.publisher ?? '';
  const selectedCatalog = m ? effectiveReleases(p, selectedPublisherName, releasesOf(p)) : null;
  const chosenRelease = state.releaseSelection.get(publicationKey(p.id, selectedPublisherName));
  const inspectedRelease = chosenRelease && chosenRelease !== (selectedCatalog?.liveReleaseId ?? null) ? selectedCatalog?.releases.find((release) => release.releaseId === chosenRelease) ?? null : null;
  const selectedDestination = m ? (publishedDestinations(p).find((item) => item.name === selectedPublisherName) ?? publishedDestinations(p)[0]) : null;
  const openTarget = inspectedRelease?.url ? { url: inspectedRelease.url, label: `Open ${releaseLabel(inspectedRelease)}` }
    : selectedDestination?.reachable ? { url: selectedDestination.url, label: 'Open published app' } : null;
  const liveButton = openTarget && publishSurface
    ? `<a href="${esc(openTarget.url)}" target="_blank" rel="noopener" class="xrb-icon-button" id="open-live" data-tooltip="${esc(openTarget.label)}" aria-label="${esc(openTarget.label)}">${iconSvg('open')}</a>`
    : '';
  const projectActions = `${liveButton}${publishSurface ? '' : surface === 'build' && p.packaging?.available
    ? `<button type="button" class="xrb-icon-button" id="out-path" data-tooltip="Open package folder" aria-label="Open package folder">${iconSvg('folder')}</button>`
    : `<button type="button" class="xrb-icon-button" id="open-dir" data-tooltip="Open project folder" aria-label="Open project folder">${iconSvg('folder')}</button>`}${manifestButton}`;
  if (m) {
    localStorage.setItem(surfaceKey(), surface);
    localStorage.setItem(surfaceChoiceKey(p, surface), platformChoiceOf(m));
  }
  const top = `${workflowTabs}<div class="hero-top project-hero-top">
      <span class="icon-btn" id="open-studio" aria-hidden="true">
        <img src="${iconSrc(p)}" alt="">
      </span>
      <div class="project-hero-main">
        <div class="project-title-row"><h3>${esc(m?.name ?? p.id)}</h3><span class="spacer"></span><div class="hero-tag">${p.archived ? '<span class="state busy" title="Kept in the archive folder; right-click it in the list to unarchive">archived</span> ' : ''}${m && p.icon?.custom && p.icon.changedSincePackage ? '<span class="state busy" title="Changed since the last package build: the next package uses it">icon changed</span>' : ''}
        </div><div class="hero-actions">${projectActions}</div></div>
        ${p.errors.length ? `<ul class="errors">${p.errors.map((e) => `<li>${esc(e.field ? `${e.field}: ` : '')}${esc(e.message)}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`;
  // The surface's primary action (Run/Stop, Publish/Update with Unpublish, Build) sits left-aligned below all content.
  const actionRow = heroButton ? `<div class="project-actions">${heroButton}</div>` : '';
  if (!m) {
    el.innerHTML = `<div class="card hero project-hero">${top}</div>` + '<p class="empty">Fix the manifest file, then it reloads here.</p>';
    $('#open-dir').addEventListener('click', action(() => api('POST', `${projectUrl(p.id)}/open-folder`)));
    syncRunDock(p);
    return;
  }
  const pkg = p.packaging?.available ? (m.plugins?.[p.packaging.platform] ?? {}) : identity(m);
  const runtimeSettings = displaySurface
    ? `${displayField(m, { monitorsOnly: headset })}${inputField(m)}`
    : '';
  const settings = publishSurface ? '' : `<form id="settings">
      <div class="row settings-toolbar">${m.kind === 'app' ? platformField(m, surface) : ''}<div class="settings-tools"><span class="display-options">${displaySurface ? `${controls?.view ?? ''}${controls?.dev ?? ''}` : ''}</span></div></div>
      ${runtimeSettings ? `<div class="settings-grid runtime-settings">${runtimeSettings}</div>` : ''}
      <span class="field-error">${esc(state.fieldErrors[''] ?? '')}</span>
    </form>`;
  const packageFields = surface === 'build' && p.packaging?.available ? `<div class="package-inline">
    ${identityFields(p, true)}
    <div class="version-field"><label>Package version
      <input class="version" id="act-version" value="${esc(pkg?.version ?? '0.1.0')}" aria-label="Package version">
    </label></div>
  </div><div class="package-extra-fields">${identityFields(p)}</div>${packageControl.details ?? ''}` : '';
  const publication = publicationControl.fields ?? '';
  const packageHistory = packageFields ? `<div class="package-history"><div id="packages" class="list"></div></div>` : '';
  const buildSettings = !displaySurface && (packageFields || publication) ? `<form id="build-settings" class="xrb-stack ${packageFields ? 'has-package' : ''}">
        ${packageFields}
        ${publication}
        <span class="field-error"></span>
      </form>${packageHistory}` : '';
  renderProjectHero(el, `<section class="card hero project-hero">${top}<div class="xrb-section-divider project-surface-content">${settings}${buildSettings}${actionRow}</div></section>`, p.id);
  stabilizePanelHeight(el, { stableKey: `${p.id}:${surface}:${platformChoiceOf(m)}` });
  resumeAnimations(el);
  for (const block of el.querySelectorAll('[data-publication-effect]')) {
    setRevealed(block, block.dataset.publicationEffect === 'enter', { elapsed: Number(block.dataset.publicationElapsed) || 0 });
  }

  if (p.origin === 'bundled') $('#open-manifest')?.addEventListener('click', action(() => api('POST', `${projectUrl(p.id)}/open-manifest`)));
  // The icon itself has no menu: its actions live under Favicon in the project row's right-click menu.
  $('#open-dir')?.addEventListener('click', action(async (e) => { e.preventDefault(); await api('POST', `${projectUrl(p.id)}/open-folder`); }));
  $('#settings [name="display"]')?.closest('.dropdown')?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    closeMenu();
    $('#display-menu').dataset.project = p.id;
    placeMenu($('#display-menu'), e.clientX, e.clientY);
  });
  $('#out-path')?.addEventListener('click', action(async (e) => {
    e.preventDefault();
    await api('POST', '/api/packages/open-folder', { channel: p.packaging.channel });
  }));
  wireVersionMenu($('#act-version'), 'input');
  renderPackages();
  $('#act-package')?.addEventListener('click', action(async () => {
    try {
      const job = await confirmable(`${projectUrl(p.id)}/package`, { version: $('#act-version').value.trim() });
      if (job) showProgressDialog('package', job);
    } catch (error) {
      if (!(error instanceof ApiError) || !error.data?.details?.needsSetup) throw error;
      await refreshPackageSetup(p);
    }
  }));
  $('#act-package-setup')?.addEventListener('click', action(async () => {
    const status = await refreshPackageSetup(p);
    if (!status || selected()?.id !== p.id || selected()?.packaging?.platform !== p.packaging.platform) return;
    if (status.state === 'ready') return;
    if (status.state !== 'setup-required') throw new Error(status.reason ?? 'Package tools are unavailable');
    const acceptTerms = !!status.termsUrl;
    if (acceptTerms && !(await ask({ title: 'Install package tools?', message: 'Read and accept the external terms before installing package tools.', link: status.termsUrl, ok: 'Accept and install' }))) return;
    if (selected()?.id !== p.id || selected()?.packaging?.platform !== p.packaging.platform) return;
    const job = await api('POST', `${projectUrl(p.id)}/package-setup`, { acceptTerms });
    showProgressDialog('setup', job);
    if (job.state !== 'running' || finishedSetups.has(job.id)) void finishPackageSetup(state.jobs.get(job.id) ?? job);
  }));
  $('#act-publish')?.addEventListener('click', action(async () => { if (await confirmNewVersion(p)) await startPublicationJob(p, 'publish', releaseRequest(p)); }));
  $('#act-update')?.addEventListener('click', action(async () => { if (await confirmNewVersion(p)) await startPublicationJob(p, 'update', releaseRequest(p)); }));
  $('#act-unpublish')?.addEventListener('click', action(async () => {
    const retained = releasesOf(p) ? ' Retained releases stay available to activate again; they are not erased.' : '';
    const yes = await ask({ title: 'Unpublish WebXR app?', message: `The public route will stop working, including installed packages that open it.${retained}`, ok: 'Unpublish', danger: true });
    if (yes) await startPublicationJob(p, 'unpublish');
  }));
  $('#publication-links')?.addEventListener('click', (event) => {
    if (!$('#publication-links-menu').hidden) return closeMenu();
    openPublicationLinks(event.currentTarget, p);
  });
  wireVersionMenu($('#build-settings [name="publication.version"]'), 'change');
  // Choosing a retained release in Live version only inspects it: Activate deploys it and Delete removes it, each after
  // confirmation. Choosing the live release again ends the inspection.
  const releaseKey = publicationKey(p.id, p.manifest?.publication?.publisher ?? '');
  $('#build-settings [name="publication.live"]')?.addEventListener('change', (event) => {
    const catalog = effectiveReleases(p, p.manifest?.publication?.publisher ?? '', releasesOf(p));
    if (event.target.value && event.target.value !== (catalog?.liveReleaseId ?? null)) state.releaseSelection.set(releaseKey, event.target.value);
    else state.releaseSelection.delete(releaseKey);
    renderDetail(true);
  });
  $('#act-make-live')?.addEventListener('click', action(async () => {
    const publisher = p.manifest?.publication?.publisher ?? '';
    const catalog = effectiveReleases(p, publisher, releasesOf(p));
    const releaseId = state.releaseSelection.get(releaseKey);
    const target = catalog?.releases.find((release) => release.releaseId === releaseId);
    if (!target || releaseId === catalog?.liveReleaseId) return;
    const live = catalog?.liveReleaseId ? catalog.releases.find((release) => release.releaseId === catalog.liveReleaseId) : null;
    const status = effectivePublicationStatus(p, publisher, p.publicationDestinations?.[publisher]?.status ?? p.publication?.status);
    const destination = status?.deployedUrl ?? status?.selectedUrl ?? '';
    const label = releaseLabel(target);
    const current = live ? `replaces ${releaseLabel(live)}, which is live now` : status?.state === 'published' || status?.state === 'failed' ? 'replaces the unversioned app that is live now' : 'goes live';
    const yes = await ask({ title: `Activate ${label}${target.version ? ' version' : ''}?`, message: `${p.manifest.name} ${current} at ${destination}. The saved ${label} build is used as it was published before; nothing is rebuilt from your current source.`, ok: 'Activate' });
    if (!yes) return;
    state.releaseSelection.delete(releaseKey);
    await startPublicationJob(p, 'activate', { releaseId, expectedRevision: catalog?.revision ?? null, confirm: true });
  }));
  $('#act-delete-release')?.addEventListener('click', action(async () => {
    const publisher = p.manifest?.publication?.publisher ?? '';
    const catalog = effectiveReleases(p, publisher, releasesOf(p));
    const releaseId = state.releaseSelection.get(releaseKey);
    const target = catalog?.releases.find((release) => release.releaseId === releaseId);
    if (!target || releaseId === catalog?.liveReleaseId || releaseId === catalog?.requestedReleaseId) return;
    const label = releaseLabel(target);
    const publisherLabel = (p.publicationStandalone ?? p.publication)?.publishers?.find((item) => item.name === publisher)?.label ?? publisher;
    const yes = await ask({ title: `Delete ${label}${target.version ? ' version' : ''}?`, message: `The saved ${label} build of ${p.manifest.name} is removed from ${publisherLabel} and can no longer be activated or opened. The live app is not changed.`, ok: 'Delete', danger: true });
    if (!yes) return;
    state.releaseSelection.delete(releaseKey);
    await startPublicationJob(p, 'delete-release', { releaseId, expectedRevision: catalog?.revision ?? null, confirm: true });
  }));
  $('#act-run')?.addEventListener('click', headset
    ? action(() => {
      const mode = p.canDev && $('#act-dev')?.checked ? 'dev' : 'built';
      const flat = $('#act-flat')?.checked === true;
      const fullscreen = $('#act-fullscreen')?.checked === true;
      const monitor = Math.max(0, Number(p.manifest?.plugins?.desktop?.monitor) || 0);
      const token = crypto.randomUUID();
      return startManagedRun(p, mode, flat, async () => {
        await api('POST', `${projectUrl(p.id)}/preview`, { mode, flat, fullscreen, monitor, token });
        sessionStorage.setItem(previewTokenKey(p), token);
      });
    })
    : action(() => {
      const mode = p.canDev && $('#act-dev')?.checked ? 'dev' : 'built';
      const flat = $('#act-flat')?.checked === true;
      const cameraView = cameraMode(p.id);
      const fullscreen = $('#act-fullscreen')?.checked === true;
      const monitor = (state.plugins?.disabled ?? []).some((plugin) => plugin.role === 'display' && plugin.name === p.manifest?.display)
        ? 0 : Number(p.manifest?.plugins?.desktop?.monitor ?? 0);
      return startManagedRun(p, mode, flat, () => api('POST', `${projectUrl(p.id)}/run`, {
        mode, flat, cameraView, fullscreen, monitor,
      }));
    }));

  $('#act-dev')?.addEventListener('change', (e) => setDevMode(p, e.target.checked));
  $('#act-fullscreen')?.addEventListener('change', (e) => {
    setAppRunOption('fullscreen', p, e.target.checked);
  });
  $('#act-flat')?.addEventListener('change', (e) => {
    setAppRunOption('flat', p, e.target.checked);
    if (headset) {
      signalPreviewProjection(p, e.target.checked);
      return;
    }
    if (projectRunning(p)) {
      // The state event re-renders the box once the host confirms; a refused switch puts it back now.
      api('POST', '/api/run/view', { flat: e.target.checked }).catch((err) => {
        e.target.checked = !e.target.checked;
        setAppRunOption('flat', p, e.target.checked);
        report(err);
      });
    }
  });
  $('#act-stop')?.addEventListener('click', action(stopManagedRun));
  for (const tab of el.querySelectorAll('[data-surface]')) tab.addEventListener('click', action(async () => {
    if (tab.disabled || tab.dataset.surface === surface) return;
    await selectProjectSurface(p, tab.dataset.surface);
  }));
  const platformGroup = $('#settings .platform-options');
  platformGroup?.addEventListener('click', action(async (event) => {
    const button = event.target.closest('button[data-choice]');
    if (!button || button.disabled) return;
    const input = $('#settings [name="platform-choice"]');
    if (input.value === button.dataset.choice) return;
    await savePlatformChoice(p, button.dataset.choice);
    localStorage.setItem(surfaceChoiceKey(p, surface), button.dataset.choice);
  }));
  if (platformGroup) wirePlatformDrag(platformGroup);
  syncRunDock(p);
  renderSettingsStatus();
  // The optional Publish form saves independently: Display/Input edits must not overwrite package or publication fields.
  // A title saves on Enter or blur, never while half typed.
  for (const form of [$('#settings'), $('#build-settings')].filter(Boolean)) {
    form.addEventListener('input', (event) => { if (event.target.name) state.dirty = true; });
    form.addEventListener('submit', (ev) => { ev.preventDefault(); ev.target.querySelector(':focus')?.blur(); });
    form.addEventListener('change', action(async (event) => {
      if (!event.target.name) return;
      if (event.target.name?.endsWith('.title') && !event.target.value.trim())
        return showFieldErrors({ [event.target.name]: 'package title is required' });
      await saveSettings(p, new FormData(form), event.target.name);
    }));
  }
}

/**
 * Switching platform tab keeps each tab's Display and Input: the current tab's settings are saved under
 * `platformSettings`, and the new tab's come back (a tab never used starts from the current settings).
 */
function platformChoiceManifest(p, previous, choice) {
  const next = switchRunSettings(previous, selectPlatform(structuredClone(previous), choice), choice);
  const target = next.target === 'webxr' ? 'webxr' : 'host';
  const packaging = p.packagingChoices?.[`${target}:${next.platform ?? ''}`] ?? {
    available: false, platform: next.platform ?? '', channel: next.platform ?? target,
    packager: null, fields: [], errors: [], reason: 'no packager for this Platform choice',
  };
  syncPackageId(next, previous, packaging);
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  return { next, target, packaging };
}

function previewPlatformChoice(p, choice) {
  const { next, target, packaging } = platformChoiceManifest(p, p.manifest, choice);
  state.dirty = false;
  p.manifest = next;
  p.packaging = packaging;
  if (target === 'webxr' && !next.platform) p.publication = p.publicationStandalone ?? p.publication;
  animateDetailHeights(() => renderDetail(true));
  return next;
}

/**
 * Runs a re-render of the project view and eases each card from its old height to its new one, so fields that a
 * platform switch adds or removes (Display, Input, Publish) open and collapse instead of jumping.
 */
function animateDetailHeights(render) {
  // Keep the card in normal layout while it extends or shrinks; surrounding cards follow its height.
  const duration = transitionPanelHeight($('#project-content'), render, { selector: ':scope' });
  if (duration) state.detailAnimationUntil = performance.now() + duration;
}

async function rebasePlatformChoice(p, choice) {
  let conflict = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await api('GET', projectUrl(p.id));
    const { next } = platformChoiceManifest(p, latest.manifest, choice);
    try {
      return await api('PUT', `${projectUrl(p.id)}/manifest`, { manifest: next, mtimeMs: latest.manifestMtimeMs, revision: latest.manifestRevision });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || error.data?.details?.needsConfirm) throw error;
      conflict = error;
    }
  }
  throw conflict;
}

async function savePlatformChoice(p, choice) {
  if (state.savingPlatform === p.id) {
    state.queuedPlatform = { projectId: p.id, choice };
    previewPlatformChoice(p, choice);
    return;
  }
  const previous = p.manifest;
  const previousPackaging = p.packaging;
  const previousPublication = p.publication;
  state.savingPlatform = p.id;
  state.queuedPlatform = null;
  const next = previewPlatformChoice(p, choice);
  try {
    await api('PUT', `${projectUrl(p.id)}/manifest`, { manifest: next, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision });
    state.fieldErrors = {};
    await loadProjects();
    const queued = state.queuedPlatform?.projectId === p.id ? state.queuedPlatform : null;
    state.savingPlatform = null;
    state.queuedPlatform = null;
    if (queued && queued.choice !== choice) {
      const current = allProjects().find((project) => project.id === p.id);
      if (current) await savePlatformChoice(current, queued.choice);
      return;
    }
    if (selected()?.id === p.id && selected()?.packaging?.setupSupported) void refreshPackageSetup(selected()).catch(report);
    animateDetailHeights(() => renderDetail(true));
  } catch (e) {
    let error = e;
    const queued = state.queuedPlatform?.projectId === p.id ? state.queuedPlatform : null;
    if (error instanceof ApiError && error.status === 409 && !error.data?.details?.needsConfirm) {
      try {
        await rebasePlatformChoice(p, queued?.choice ?? choice);
        state.fieldErrors = {};
        state.dirty = false;
        await loadProjects();
        state.savingPlatform = null;
        state.queuedPlatform = null;
        if (selected()?.id === p.id && selected()?.packaging?.setupSupported) void refreshPackageSetup(selected()).catch(report);
        renderDetail(true);
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    state.savingPlatform = null;
    if (state.queuedPlatform?.projectId === p.id) state.queuedPlatform = null;
    if (error instanceof ApiError && error.status === 409) {
      state.dirty = false;
      await loadProjects();
      return;
    }
    if (selected() === p) {
      p.manifest = previous;
      p.packaging = previousPackaging;
      p.publication = previousPublication;
      renderDetail(true);
    }
    if (error instanceof ApiError && error.status === 400 && error.data?.fields) {
      state.fieldErrors = Object.fromEntries(error.data.fields.map((field) => [field.field, field.message]));
      showFieldErrors();
      return;
    }
    throw error;
  }
}

async function rebasePublicationSettings(p, desired, confirm = []) {
  let conflict = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await api('GET', projectUrl(p.id));
    const current = latest.manifest.publication;
    if (current?.publisher === desired.publisher && current.slug === desired.slug && JSON.stringify(current.versions ?? {}) === JSON.stringify(desired.versions ?? {})) return latest;
    const routes = { ...current?.routes, ...desired.routes };
    if (current?.publisher && typeof current.slug === 'string') routes[current.publisher] = current.slug;
    routes[desired.publisher] = desired.slug;
    const manifest = {
      ...latest.manifest,
      publication: { ...desired, id: current?.id ?? desired.id, routes },
    };
    try {
      return await api('PUT', `${projectUrl(p.id)}/manifest`, { manifest, mtimeMs: latest.manifestMtimeMs, revision: latest.manifestRevision, ...(confirm.length ? { confirm } : {}) });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || error.data?.details?.needsConfirm) throw error;
      conflict = error;
    }
  }
  throw conflict;
}

async function saveSettings(p, form, changedName) {
  const get = (k) => String(form.get(k) ?? '').trim();
  const previousManifest = p.manifest;
  const previousPublication = p.publication;
  // Each form saves only its own fields. The other card, project name, scripts and versions stay intact.
  let m = structuredClone(p.manifest);
  if (changedName === 'platform-choice') m = selectPlatform(m, get('platform-choice'));
  if (changedName === 'display') {
    const display = get('display');
    if (display.startsWith('desktop:')) {
      m.display = 'desktop';
      m.plugins = { ...m.plugins, desktop: { ...m.plugins?.desktop, monitor: Number(display.slice('desktop:'.length)) } };
    } else m.display = display;
  }
  // Live version is a deployment decision handled by its own confirmed flow, never a manifest save.
  if (changedName === 'publication.live') return;
  if (changedName === 'publication.version') {
    // The draft next version is remembered per publisher; it deploys nothing and never touches package versions.
    const previous = m.publication;
    const publisher = previous?.publisher || get('publication.publisher');
    const version = get('publication.version');
    if (!previous || !publisher) return;
    if (!bumpPackageVersion(version, 'patch')) return showFieldErrors({ 'publication.version': 'Use a stable three-part version such as 0.1.0.' });
    m.publication = { ...previous, versions: { ...previous.versions, [publisher]: version } };
  } else if (changedName?.startsWith('publication.')) {
    const previous = m.publication;
    const publisher = get('publication.publisher');
    const routes = { ...previous?.routes };
    if (previous?.publisher && typeof previous.slug === 'string') routes[previous.publisher] = previous.slug;
    const enteredSlug = get('publication.slug').toLowerCase();
    const slug = changedName === 'publication.publisher' && Object.hasOwn(routes, publisher)
      ? routes[publisher]
      : enteredSlug;
    routes[publisher] = slug;
    m.publication = {
      enabled: true,
      publisher,
      id: previous?.id ?? crypto.randomUUID(),
      slug,
      routes,
      ...(previous?.versions ? { versions: { ...previous.versions } } : {}),
    };
  }
  if (changedName === 'inputs') {
    m.inputs = runtimeProviderInputs(JSON.parse(get('inputs')),state.plugins?.providers);
    delete m.input;  // Migrate the legacy single provider on the first settings edit.
  }
  for (const [k, v] of form.entries()) {
    const at = /^plugins\.([^.]+)\.(.+)$/.exec(k);
    if (!at || k !== changedName) continue;
    const value = k === 'plugins.desktop.monitor' ? Math.max(0, Number(v) || 0) : String(v).trim();
    m.plugins = { ...m.plugins, [at[1]]: { ...m.plugins?.[at[1]], [at[2]]: value } };
  }
  if (changedName?.startsWith('publication.') || changedName === 'platform-choice') syncPackageId(m, p.manifest, p.packaging);
  for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k];
  if (!changedName?.startsWith('publication.') && changedName !== 'platform-choice') {
    const saving = settingsWriter.enqueue(p.id, previousManifest, m);
    p.manifest = settingsWriter.overlay(p.id, previousManifest);
    state.dirty = false;
    await saving;
    await loadProjects();
    renderSettingsStatus();
    return;
  }
  const editingPublication = changedName?.startsWith('publication.');
  const switchingPublisher = changedName === 'publication.publisher' && m.publication?.publisher !== previousManifest.publication?.publisher;
  const destination = switchingPublisher ? p.publicationDestinations?.[m.publication.publisher] : null;
  const publicationSave = editingPublication ? {
    publication: structuredClone(m.publication),
    status: switchingPublisher ? destination?.status ?? null : previousPublication?.status ?? null,
  } : null;
  const clearPublicationSave = () => {
    if (publicationSave && state.savingPublication.get(p.id) === publicationSave) state.savingPublication.delete(p.id);
  };
  if (publicationSave) {
    state.publicationJobViews.delete(p.id);
    state.savingPublication.set(p.id, publicationSave);
    p.manifest = m;
    p.publication = { ...previousPublication, status: publicationSave.status };
  }
  if (switchingPublisher) {
    for (const name of Object.keys(state.fieldErrors)) if (name.startsWith('publication.')) delete state.fieldErrors[name];
  }
  if (publicationSave) renderDetail(true);
  try {
    await api('PUT', `${projectUrl(p.id)}/manifest`, { manifest: m, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision });
    state.fieldErrors = {};
    state.dirty = false;
    clearPublicationSave();
    await loadProjects();
  } catch (e) {
    let error = e;
    if (publicationSave && state.savingPublication.get(p.id) !== publicationSave) return;
    if (editingPublication && error instanceof ApiError && error.status === 409 && !error.data?.details?.needsConfirm) {
      try {
        await rebasePublicationSettings(p, m.publication);
        state.fieldErrors = {};
        state.dirty = false;
        clearPublicationSave();
        await loadProjects();
        return;
      } catch (retryError) {
        error = retryError;
      }
    }
    if (error instanceof ApiError && error.status === 400 && error.data?.fields) {
      clearPublicationSave();
      // Keep what was typed: patch the error messages into the form instead of re-rendering.
      state.fieldErrors = Object.fromEntries(error.data.fields.map((f) => [f.field, f.message]));
      showFieldErrors();
      return;
    }
    if (error instanceof ApiError && error.status === 409 && error.data?.details?.needsConfirm === 'publication-route') {
      const yes = await ask({ title: 'Move published route?', message: `${error.message} The old route is not kept automatically.`, ok: 'Move', danger: true });
      if (yes) {
        try {
          if (editingPublication) await rebasePublicationSettings(p, m.publication, ['publication-route']);
          else await api('PUT', `${projectUrl(p.id)}/manifest`, { manifest: m, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision, confirm: ['publication-route'] });
          state.dirty = false;
        } finally {
          clearPublicationSave();
        }
        await loadProjects();
      } else {
        clearPublicationSave();
        if (editingPublication && selected() === p) {
          p.manifest = previousManifest;
          p.publication = previousPublication;
          renderDetail(true);
        }
      }
      return;
    }
    if (error instanceof ApiError && error.status === 409) {
      if (editingPublication) {
        state.dirty = false;
        clearPublicationSave();
        await loadProjects();
        return;
      }
      showFieldErrors({ '': `Not saved. ${error.message}` });
      return;
    }
    clearPublicationSave();
    if (editingPublication && selected() === p) {
      p.manifest = previousManifest;
      p.publication = previousPublication;
      renderDetail(true);
    }
    throw error;
  }
}

function showFieldErrors(errors) {
  if (errors) state.fieldErrors = errors;
  // The Publish surface has no #settings form: only the forms that exist carry field errors.
  const forms = [$('#settings'), $('#build-settings')].filter(Boolean);
  for (const form of forms) for (const input of form.querySelectorAll('[name]')) setFieldError(input);
  for (const [name, message] of Object.entries(state.fieldErrors)) {
    const input = forms.map((form) => form.querySelector(`[name="${CSS.escape(name)}"]`)).find(Boolean);
    if (!input || input.disabled || input.readOnly) continue;
    setFieldError(input, message);
  }
  const general = Object.entries(state.fieldErrors).filter(([n]) => !forms.some((form) => form.querySelector(`[name="${CSS.escape(n)}"]`))).map(([, m]) => m);
  const generalTarget = forms.map((form) => form.querySelector(':scope > .field-error')).find(Boolean);
  if (generalTarget) generalTarget.textContent = general.join('; ');
}

// ---- host, run, jobs, packages ------------------------------------------------------------

function renderHost() {
  const h = state.host;
  const chip = $('#host-chip');
  if (!h) return;
  const needsRebuild = updateRebuildChip(chip, h, `rebuilt ${ago(h.exeMs)}`);
  chip.title = h.hostProblem ?? (h.exists && h.staleHostPlugins?.length ? `plugins from an older build sit next to xrb-host.exe (${h.staleHostPlugins.join(', ')}): rebuild to use selected plugin roots`
    : h.exists && h.outdated ? `host sources or plugins changed (${h.newestSource ?? 'source membership'}): ${h.exe}` : `xrb-host.exe (${h.runtimeOrigin === 'cache' ? 'user cache' : 'product/source build'}): ${h.exe}`);
  // Only a problem is worth a chip; the matching dot identifies its action in the menu.
  const rebuildDot = $('#host-rebuild-dot');
  rebuildDot.hidden = !needsRebuild;
}

/** Panel server code changed after this process started: the chip and the Restart dot say a restart loads it. */
function renderPanelFreshness() {
  const f = state.panel;
  const outdated = !!f?.outdated;
  const chip = $('#panel-chip');
  updateRestartChip(chip, outdated);
  chip.title = outdated ? `${f.newestSource} changed after the control panel started: restart to load it` : '';
  $('#panel-restart-dot').hidden = !outdated;
}

function tile(k, v, cls = '') {
  return `<div class="tile ${cls}"><div class="v">${v}</div><div class="k">${k}</div></div>`;
}

/** The run-state bulb follows the managed lifecycle: muted while starting/stopping, Stop red while running. */
function runPill() {
  const r = state.run;
  if (!r || r.phase === 'idle') return '';
  const phase = r.phase === 'stopping' ? 'stopping' : r.phase === 'starting' ? 'launching' : 'running';
  return `<span class="run-dot ${phase}" title="${phase}" aria-label="${phase}"></span>`;
}

function renderRun() {
  const r = state.run;
  const s = state.status;
  const running = r && r.phase !== 'idle';
  const cameraProject = allProjects().find((p) => p.id === (running ? r.projectId : state.selected));
  const inputNames = cameraProject?.manifest?.inputs ?? [cameraProject?.manifest?.input ?? 'none'];
  const disabledInputs = new Set((state.plugins?.disabled ?? []).filter((p) => p.role === 'input').map((p) => p.name));
  const cameraAvailable = running ? !!r.cameraAvailable : !isHeadset(cameraProject?.manifest) && inputNames.some((name) => !disabledInputs.has(name) && !['none', 'mouse', 'keyboard', 'replay', 'simulated'].includes(name));
  $('#camera-toggle').hidden = !cameraProject || !cameraAvailable;
  $('#act-cams').checked = running ? !!r.cameraView : !!cameraProject && cameraMode(cameraProject.id);
  $('#act-cams').disabled = !!running && (r.phase !== 'running' || !r.channelUrl);
  const pageError = !s?.pageFps && state.runLog.findLast((line) => /\[page\]\s+Uncaught\b/.test(line));
  const warn = $('#run-warning');
  warn.hidden = !r?.warning;
  warn.innerHTML = r?.warning ? esc(r.warning) + (r.foreign ?? []).map((f) => ` <button class="small" data-foreign="${f.pid}">Stop pid ${f.pid}</button>`).join('') : '';
  warn.querySelectorAll('[data-foreign]').forEach((b) => b.addEventListener('click', action(() => api('POST', '/api/run/stop-foreign', { pid: Number(b.dataset.foreign) }))));
  $('#run-metrics').innerHTML = !running
    ? '<div class="empty-note">No app is running.</div>'
    : isHeadset(cameraProject?.manifest) && r.phase === 'running'
      ? '<div class="empty-note">Browser preview is running.</div>'
    : s?.pageFps != null
      ? runMetrics(s)
      : pageError
        ? `<div class="empty-note app-error" title="${esc(pageError)}">App error — see Log.</div>`
        : '<div class="empty-note">Starting…</div>';
  renderStatsDock(running ? s : null);
  renderCameras(running && r.cameraView ? r.channelUrl : null);
  renderRunLog();
}

// ---- Camera view --------------------------------------------------------------------------
// With "Cameras" on, the host streams the input provider's debug images on its channel (e.g.
// per camera the infrared view with the tracker's 2D detections and the colour view). The panel
// connects to the channel like a page would (binary WebSocket, 16-byte header, types 10..17,
// protocol v2: stream, format, label, boxes, pixels; see packages/sdk/src/protocol.ts).
const DEBUG_IMAGE = 10;
const cams = { url: null, ws: null, seen: new Map() };

function renderCameras(url) {
  const box = $('#run-cameras');
  if (!url) {
    if (cams.ws) { cams.ws.close(); cams.ws = null; }
    cams.url = null;
    cams.seen.clear();
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  if (cams.url === url) return;
  cams.url = url;
  cams.seen.clear();
  box.innerHTML = '<div class="cam-note">Waiting for camera frames…</div>';
  if (cams.ws) cams.ws.close();
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  cams.ws = ws;
  ws.onmessage = (e) => { if (cams.ws === ws) drawCameraFrame(e.data); };
  ws.onclose = () => { if (cams.ws === ws) cams.ws = null; };
}

function drawCameraFrame(buffer) {
  if (buffer.byteLength < 28) return;
  const v = new DataView(buffer);
  const type = v.getUint8(0);
  if (type < DEBUG_IMAGE || type >= DEBUG_IMAGE + 8 || v.getUint8(1) < 2) return;
  const p = 16;
  const stream = v.getUint8(p), rgb = v.getUint8(p + 1) === 2, nBoxes = v.getUint8(p + 2), labelLen = v.getUint8(p + 3);
  const w = v.getUint16(p + 4, true), h = v.getUint16(p + 6, true);
  const scale = w ? (v.getUint16(p + 8, true) || w) / w : 1;  // boxes are in full-size pixels
  const bpp = rgb ? 3 : 1;
  if (buffer.byteLength < p + 12 + labelLen) return;
  const label = new TextDecoder().decode(new Uint8Array(buffer, p + 12, labelLen)) || `stream ${stream}`;
  let o = p + 12 + labelLen;
  if (buffer.byteLength < o + nBoxes * 20) return;
  const boxes = [];
  for (let i = 0; i < nBoxes; i++, o += 20) boxes.push([v.getFloat32(o, true), v.getFloat32(o + 4, true), v.getFloat32(o + 8, true), v.getFloat32(o + 12, true), v.getFloat32(o + 16, true)]);
  if (buffer.byteLength < o + w * h * bpp) return;
  const key = String(stream);
  let slot = cams.seen.get(key);
  if (!slot) {
    const box = $('#run-cameras');
    box.querySelector('.cam-note')?.remove();
    const div = document.createElement('div');
    div.className = 'cam';
    div.style.order = String(stream);
    div.innerHTML = `<canvas width="${w}" height="${h}"></canvas><span class="cam-label"></span>`;
    box.appendChild(div);
    slot = { canvas: div.querySelector('canvas'), label: div.querySelector('.cam-label'), image: null };
    cams.seen.set(key, slot);
  }
  const canvas = slot.canvas;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; slot.image = null; }
  const ctx = canvas.getContext('2d');
  if (!slot.image) slot.image = ctx.createImageData(w, h);
  const px = slot.image.data, src = new Uint8Array(buffer, o, w * h * bpp);
  if (rgb) for (let i = 0, j = 0; i < w * h; i++, j += 3) { px[i * 4] = src[j]; px[i * 4 + 1] = src[j + 1]; px[i * 4 + 2] = src[j + 2]; px[i * 4 + 3] = 255; }
  else for (let i = 0; i < w * h; i++) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = src[i]; px[i * 4 + 3] = 255; }
  ctx.putImageData(slot.image, 0, 0);
  if (boxes.length) {
    ctx.lineWidth = 2;
    ctx.font = '11px sans-serif';
    for (const [x, y, bw, bh, score] of boxes) {
      ctx.strokeStyle = score >= 0.5 ? '#5bd18b' : '#ffb84d';
      ctx.strokeRect(x / scale, y / scale, bw / scale, bh / scale);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(score.toFixed(2), x / scale + 3, y / scale - 3);
    }
  }
  slot.label.textContent = `${label}${nBoxes || !rgb ? ` · ${boxes.length} box${boxes.length === 1 ? '' : 'es'}` : ''}`;
}

// Header metrics and the mirrored Run/Stop control share one visibility decision, both when
// rebinding the current action and when it crosses above the sticky bar.
let runDockVisible = false;

function renderStatsDock(s) {
  const dock = $('#stats-dock');
  dock.hidden = !s || !runDockVisible;
  if (dock.hidden) return;
  const fpsCls = s.pageFps == null ? '' : s.pageFps >= 55 ? 'good' : s.pageFps >= 40 ? 'warn' : 'bad';
  const handsOff = s.handState === 'off';
  const handsBad = ['failed', 'device-missing', 'needs-setup'].includes(s.handState);
  const handsCls = handsOff ? '' : handsBad ? 'bad' : s.handState === 'running' ? (s.handsHz >= 45 ? 'good' : 'warn') : '';
  dock.innerHTML = `<span class="stat ${fpsCls}" title="Page frames per second">${num(s.pageFps, 1)}<small>fps</small></span>`
    + (handsOff ? '' : `<span class="stat ${handsCls}" title="Hand tracking: ${esc(s.handState ?? '')}">${num(s.handsHz, 0)}<small>Hz</small></span>`);
}

/**
 * Two headline figures (page, hands) and a strip of facts. Always shown: without a running app
 * (or before its first status) every value is "–" and nothing is coloured.
 */
function runMetrics(s) {
  const idle = !s;
  const fpsCls = idle || s.pageFps == null ? '' : s.pageFps >= 55 ? 'good' : s.pageFps >= 40 ? 'warn' : 'bad';
  const handsOff = !idle && s.handState === 'off';
  const handsBad = !idle && ['failed', 'device-missing', 'needs-setup'].includes(s.handState);
  const handsCls = idle || handsOff ? '' : handsBad ? 'bad' : s.handState === 'running' ? (s.handsHz >= 45 ? 'good' : 'warn') : '';
  const v = (x) => (idle ? '–' : x);
  // value, label: one small cell each
  const facts = [
    handsOff ? null : [v(s?.latencyMs != null ? `${num(s.latencyMs, 0)} ms` : '–'), 'latency'],
    handsOff ? null : [v(String(s?.hands)), s?.hands === 1 ? 'hand' : 'hands'],
    [v(s?.eyeW ? `${s.eyeW}×${s.eyeH}` : '–'), 'per eye'],
    [v(String(s?.clients)), s?.clients === 1 ? 'client' : 'clients'],
    [v(dur((s?.uptimeS ?? 0) * 1000)), 'up'],
  ].filter(Boolean);
  return `<div class="metrics ${idle ? 'idle' : ''} ${handsOff ? 'no-hands' : ''}">
      <div class="metric ${fpsCls}"><div class="v">${v(num(s?.pageFps, 1))}<small>fps</small></div><div class="k">page · ${v(num(s?.frameMs, 1))} ms per frame</div></div>
      ${handsOff ? '' : `<div class="metric ${handsCls}"><div class="v">${v(num(s?.handsHz, 0))}<small>Hz</small></div><div class="k">hands · ${esc(idle ? '–' : s.handState)}</div></div>`}
    </div>
    <div class="facts ${idle ? 'idle' : ''}">${facts.map(([val, k]) => `<div><b>${esc(val)}</b><span>${esc(k)}</span></div>`).join('')}</div>`;
}

/**
 * The host log, without the plugins' debug output unless asked for: the host tags those lines
 * "[<plugin> debug]", and the untagged lines that follow one (a multi-line profiling report)
 * belong to it.
 */
/**
 * Log lines -> entries like a game engine's console: one entry per message, the untagged lines after a
 * message (multi-line output such as a tracker's profiling report) belong to it. Recognised:
 *   "   12.345 [host] text"                  host log: seconds since start, source
 *   "[2026-10-09 15:26:46.795] [info] text"  a display runtime: wall clock, level
 *   "[panel] text", "[dev] text"            panel and dev server
 */
function logEntries(lines) {
  const entries = [];
  const text = (s) => s.replace(/^[\t ]+/, '');
  for (const raw of lines) {
    // Dev tools such as Vite colour terminal output; control sequences have no place in the HTML log.
    const l = raw.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
    let m;
    if ((m = l.match(/^\s*(\d+\.\d{3}) \[([^\]]+)\] ?(.*)$/))) entries.push({ time: `${m[1]} s`, src: m[2], text: text(m[3]) });
    else if ((m = l.match(/^\[\d{4}-\d\d-\d\d (\d\d:\d\d:\d\d)[.\d]*\] \[(\w+)\] ?(.*)$/))) entries.push({ time: m[1], src: `runtime ${m[2]}`, text: text(m[3]) });
    else if ((m = l.match(/^\[(panel|dev)\] ?(.*)$/))) entries.push({ time: '', src: m[1], text: text(m[2]) });
    // A display runtime's own lines, e.g. "[client][7212][42396] send: keepalive to server"
    else if ((m = l.match(/^\[([A-Za-z][\w-]*)\]((?:\[[^\]]*\])*) ?(.*)$/))) entries.push({ time: '', src: `runtime ${m[1]}`, text: text(m[3]) });
    else if (entries.length) entries[entries.length - 1].text += `\n${text(l)}`;
    else entries.push({ time: '', src: '', text: text(l) });
  }
  // Collapse repeats: the same message right after itself -> one row xN.
  const collapsed = [];
  for (const e of entries) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.src === e.src && prev.text === e.text) {
      prev.count++;
      prev.time = e.time || prev.time;
    } else collapsed.push({ ...e, count: 1 });
  }
  entries.length = 0;
  entries.push(...collapsed);
  for (const e of entries) {
    const s = `${e.src} ${e.text}`;
    e.level = /\b(error|crash|failed|fail:)\b/i.test(s) ? 'err' : /\b(warn|warning)\b/i.test(s) ? 'warn' : 'info';
    e.debug = / debug$/.test(e.src);
    // short source badge: "tracker debug" -> "tracker", "display-runtime 2" -> "display-runtime"
    e.badge = e.src.replace(/ debug$/, '').replace(/\.dll\b.*/, '').replace(/ \d+$/, '');
  }
  return entries;
}

function renderRunLog() {
  const el = $('#run-log');
  const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
  const parsed = logEntries(state.runLog);
  // Keep the configured input plugin visible even before it emits anything (e.g. display startup failed).
  // Other plugin filters appear only when they actually produce debug output.
  const inputs = selected()?.manifest?.inputs ?? [selected()?.manifest?.input];
  const configured = (state.plugins?.providers ?? []).filter((p) => p.role === 'input' && !p.builtin && inputs.includes(p.name)).map((p) => p.name);
  const observed = parsed.filter((e) => e.debug).map((e) => e.src.slice(0, -' debug'.length));
  const debugSources = [...new Set([...configured, ...observed])];
  const debugGroup = $('#log-debug');
  debugGroup.hidden = debugSources.length === 0;
  for (const button of debugGroup.querySelectorAll('button')) {
    if (!debugSources.includes(button.dataset.source)) button.remove();
  }
  for (const source of debugSources) {
    let button = [...debugGroup.querySelectorAll('button')].find((b) => b.dataset.source === source);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'log-filter xrb-filter-chip';
      button.dataset.source = source;
      const label = document.createElement('span');
      label.className = 'n xrb-filter-count';
      label.textContent = source;
      button.append(label);
      button.addEventListener('click', () => {
        state.logDebugSources[source] = !state.logDebugSources[source];
        renderRunLog();
      });
      debugGroup.append(button);
    }
    const enabled = !!state.logDebugSources?.[source];
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', `Toggle debug messages from ${source}`);
    button.dataset.tooltip = `${enabled ? 'Hide' : 'Show'} debug messages from ${source}${observed.includes(source) ? '' : ' (none yet; the host must start successfully)'}`;
  }
  const all = parsed.filter((e) => !e.debug || state.logDebugSources?.[e.src.slice(0, -' debug'.length)]);
  // Console-style filters: each kind counted (repeats included) and shown or hidden.
  for (const b of document.querySelectorAll('.log-filter[data-level]')) {
    const level = b.dataset.level;
    b.querySelector('.n').textContent = String(all.reduce((n, e) => n + (e.level === level ? e.count : 0), 0));
    b.setAttribute('aria-pressed', String(state.logShow[level]));
  }
  const entries = all.filter((e) => state.logShow[e.level]).slice(-300);
  el.innerHTML = entries.map((e) => `<div class="entry ${e.level}">
      <span class="src">${e.badge ? `<span class="badge">${esc(e.badge)}</span>` : ''}</span>
      <span class="msg">${esc(e.text)}${e.count > 1 ? ` <span class="count">×${e.count}</span>` : ''}</span>
      <span class="time">${esc(e.time)}</span>
    </div>`).join('');
  el.hidden = entries.length === 0;
  $('#log-empty').hidden = entries.length > 0;
  $('#log-empty').textContent = parsed.length ? 'No log entries match these filters.' : 'No logs yet.';
  const clear = $('#log-clear');
  clear.hidden = state.runLog.length === 0;
  clear.setAttribute('aria-disabled', String(state.runLog.length === 0));
  if (atEnd) el.scrollTop = el.scrollHeight;
}
for (const b of document.querySelectorAll('.log-filter[data-level]')) b.addEventListener('click', () => {
  state.logShow[b.dataset.level] = !state.logShow[b.dataset.level];
  localStorage.setItem('panel.logShow', JSON.stringify(state.logShow));
  renderRunLog();
});
$('#log-clear').addEventListener('click', action(async (e) => {
  e.preventDefault();
  if (e.currentTarget.getAttribute('aria-disabled') === 'true') return;
  await api('POST', '/api/run/clear-log');
  state.runLog = [];
  renderRunLog();
}));

/**
 * The one list item every list in the sidebar uses (jobs, built packages): a coloured stripe,
 * a title with a small detail line under it, a value with a note on the right, and optional
 * content below (HTML strings, already escaped by the caller).
 */
function item({ tone = 'accent', className = '', animationElapsed = null, title, detail = '', value = '', note = '', body = '', tooltip = '' }) {
  return `<div class="item tone-${tone}${className ? ` ${className}` : ''}"${animationElapsed === null ? '' : ` data-xrb-animation-elapsed="${animationElapsed}"`}${tooltip ? ` data-tooltip="${esc(tooltip)}"` : ''}>
      <span class="stripe"></span>
      <div class="main"><div class="title">${title}</div>${detail ? `<div class="detail">${detail}</div>` : ''}</div>
      <div class="aside">${value ? `<div class="value">${value}</div>` : ''}${note ? `<div class="detail">${note}</div>` : ''}</div>
      ${body ? `<div class="body">${body}</div>` : ''}
    </div>`;
}

function renderJobs() {
  const list = $('#jobs');
  const visible = !$('#activity-jobs').hidden;
  const scroll = visible ? list.scrollTop : (state.jobsScroll ?? 0);
  const atEnd = visible ? scroll + list.clientHeight >= list.scrollHeight - 20 : (state.jobsAtEnd ?? true);
  const allJobs = [...state.jobs.values()].sort((a, b) => b.id - a.id);
  for (const button of document.querySelectorAll('.job-filter[data-state]')) {
    const status = button.dataset.state;
    button.querySelector('.n').textContent = String(allJobs.filter((j) => j.state === status).length);
    button.setAttribute('aria-pressed', String(state.jobShow[status]));
  }
  const jobs = allJobs.filter((j) => state.jobShow[j.state]).slice(0, 12);
  const pill = { queued: 'busy', running: 'live', done: 'ok', failed: 'err' };
  const tone = { queued: 'warn', running: 'accent', done: 'ok', failed: 'err' };
  list.innerHTML = jobs.length ? jobs.map((j) => item({
    tone: tone[j.state],
    title: esc(j.title),
    detail: j.error ? `<span class="field-error">${esc(j.error)}</span>` : '',
    value: `<span class="state ${pill[j.state]}">${j.state}</span>`,
    note: dur((j.endedMs ?? Date.now()) - (j.state === 'queued' ? j.queuedMs ?? j.startedMs : j.startedMs)),
    body: `<details ${j.id === state.openJob ? 'open' : ''} data-job="${j.id}"><summary>output</summary>
        <div class="xrb-copy-block"><button type="button" class="xrb-icon-button xrb-copy-action job-copy" aria-label="Copy job log">${iconSvg('copy')}</button>
        <pre class="log">${esc((j.lines ?? []).slice(-200).join('\n'))}</pre></div></details>`,
  })).join('') : `<div class="empty-note">${allJobs.length ? 'No jobs match these filters.' : 'No jobs yet.'}</div>`;
  $('#jobs-clear').hidden = !allJobs.some((j) => j.state === 'done' || j.state === 'failed');
  if (visible) list.scrollTop = atEnd ? list.scrollHeight : scroll;
  state.jobsScroll = visible ? list.scrollTop : scroll;
  state.jobsAtEnd = atEnd;
  list.querySelectorAll('details').forEach((d) => {
    d.addEventListener('toggle', () => { if (d.open) state.openJob = Number(d.dataset.job); });
    d.querySelector('.job-copy').addEventListener('click', action(async (event) => {
      event.preventDefault();
      const job = state.jobs.get(Number(d.dataset.job));
      await navigator.clipboard.writeText((job?.lines ?? []).join('\n'));
    }));
    const pre = d.querySelector('pre');
    pre.scrollTop = pre.scrollHeight;
  });
}

for (const button of document.querySelectorAll('.job-filter[data-state]')) button.addEventListener('click', () => {
  state.jobShow[button.dataset.state] = !state.jobShow[button.dataset.state];
  localStorage.setItem('panel.jobShow', JSON.stringify(state.jobShow));
  renderJobs();
});

let jobsFrame = 0;
const renderJobsSoon = () => { if (!jobsFrame) jobsFrame = requestAnimationFrame(() => { jobsFrame = 0; renderJobs(); renderProgressDialog(); }); };

function renderPackages() {
  const packages = $('#packages');
  if (!packages) return;
  const project = selected();
  const platform = project?.packaging?.available ? project.packaging.platform : '';
  const channel = project?.packaging?.available ? project.packaging.channel : '';
  const packageId = platform ? project.manifest?.plugins?.[platform]?.id : null;
  const visible = packageId && channel ? state.packages.filter((pkg) => pkg.channel === channel && pkg.id === packageId) : [];
  packages.closest('.package-history').hidden = visible.length === 0;
  packages.innerHTML = visible.map((k) => item({
    tone: k.error ? 'err' : 'accent',
    title: esc(k.id ?? k.file),
    detail: `${esc(k.file)} · ${gb(k.sizeBytes)}${k.error ? ` · ${esc(k.error)}` : ''}`,
    value: `<button type="button" class="xrb-icon-button package-delete" data-file="${esc(k.file)}" title="Delete package" aria-label="Delete package">${iconSvg('trash')}</button>`,
  })).join('');
  for (const button of packages.querySelectorAll('.package-delete')) button.addEventListener('click', action(async () => {
    const file = button.dataset.file;
    if (!(await ask({ title: 'Delete package?', message: `${file} will be permanently deleted.`, ok: 'Delete', danger: true }))) return;
    await api('DELETE', `/api/packages/${encodeURIComponent(channel)}/${encodeURIComponent(file)}`);
    await loadPackages();
  }));
}

// ---- icon studio --------------------------------------------------------------------------

const studio = { project: null, frameOrigin: location.origin, helloTimer: 0, nextId: 1, pending: new Map(), paused: false };

/** Pause / play the app preview; the app holds its animation frames while paused. */
function studioPause(paused) {
  studio.paused = paused;
  const btn = $('#studio-pause');
  btn.setAttribute('aria-pressed', String(paused));
  // No input reaches the app while paused: drags would pile up in its controls and jump on resume.
  $('#studio-live').classList.toggle('paused', paused);
  btn.querySelector('.studio-pause-label').textContent = paused ? 'Play' : 'Pause';
}

/** The studio's overlay: a spinner while loading, a plain message otherwise, none once the app answers. */
function studioMessage(kind, text = '', { pick = false, play = false } = {}) {
  const el = $('#studio-msg');
  const message = el.querySelector('.text');
  el.hidden = !kind;
  el.dataset.kind = kind ?? '';
  message.textContent = text;
  message.hidden = !text;
  $('#studio-play').hidden = !play;
  $('#studio-pick').hidden = !pick;
}

/** Saves a PNG as the project's icon (Take, or a picked file) and refreshes the thumbnail. */
async function saveStudioIcon(p, png) {
  const updated = await api('PUT', `${projectUrl(p.id)}/icon`, new Blob([png], { type: 'image/png' }));
  $('#studio-current').src = iconSrc(updated);
  studio.project = updated;
  await loadProjects();
}

/** The studio's preview of a project's 3D icon (the build's icon.js) alone, without the app. */
const studioPreviewUrl = (p) => `/icon-preview.html?model=${encodeURIComponent(p.icon.model)}`;

/** Take, Reset and the controls hint: shown for a 3D icon, enabled once its preview answers. */
function studioControls(shown, enabled = false) {
  for (const id of ['#studio-take', '#studio-reset']) {
    $(id).hidden = !shown;
    $(id).disabled = !enabled;
  }
  $('#studio-hint').hidden = !shown;
  $('#studio-hint').textContent = 'Drag to turn · middle-drag to pan · right-drag or scroll to zoom';
}

const NO_3D_ICON = 'This app has no 3D icon. Choose a PNG instead.';

function loadStudioPreview(url) {
  const preview = new URL(url, location.href);
  preview.searchParams.set('xrb-icon', '512');
  preview.searchParams.set('interactive', '');
  preview.searchParams.set('paused', '');
  studio.frameOrigin = preview.origin;
  studioMessage('loading', 'Loading the icon…');
  $('#studio-frame').src = preview.href;
  clearTimeout(studio.helloTimer);
  studio.helloTimer = setTimeout(() => {
    studioMessage('info', 'The 3D icon did not load. Choose a PNG instead.', { pick: true });
  }, 10000);
}

async function waitForJob(id) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const job = (await api('GET', '/api/jobs')).jobs.find((item) => item.id === id);
    if (job?.state === 'done') return;
    if (job?.state === 'failed') throw new Error(job.error || 'The preview build failed.');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('The preview build timed out.');
}

async function prepareStudioPreview(p) {
  const dlg = $('#studio');
  studioMessage('loading', 'Preparing preview…');
  try {
    const job = await api('POST', `${projectUrl(p.id)}/build-web`);
    await waitForJob(job.id);
    if (!dlg.open || studio.project?.id !== p.id) return;
    await loadProjects();
    const updated = allProjects().find((item) => item.id === p.id);
    if (!updated?.entryExists) throw new Error('The build finished without a preview page.');
    studio.project = updated;
    if (!updated.icon?.model) return studioMessage('info', NO_3D_ICON, { pick: true });
    studioControls(true);
    loadStudioPreview(studioPreviewUrl(updated));
  } catch (error) {
    if (!dlg.open || studio.project?.id !== p.id) return;
    studioMessage('info', error.message, { pick: true, play: true });
  }
}

/** Sets the dialog up for one mode: 'render' (a 3D icon's live preview, Take) or 'upload' (a chosen PNG, Save). */
function studioMode(p, mode) {
  studio.project = p;
  studio.mode = mode;
  $('#studio-title').textContent = mode === 'upload' ? 'Upload image' : 'Render 3D icon';
  $('#studio-preview-label').textContent = mode === 'upload' ? 'Image preview' : 'Render preview';
  $('#studio-current').src = iconSrc(p);
  studioControls(false);
  $('#studio-pause').hidden = true;
  studioPause(false);
  $('#studio-frame').hidden = mode === 'upload';
  clearStudioUpload();
}

/** Forgets a chosen, unsaved PNG. */
function clearStudioUpload() {
  if (studio.uploadUrl) URL.revokeObjectURL(studio.uploadUrl);
  studio.upload = null;
  studio.uploadUrl = null;
  studio.crop = null;
  $('#studio-image').hidden = true;
  $('#studio-clear').hidden = true;
  if (studio.mode === 'upload') studioControls(false);
}

// ---- upload crop: the chosen image framed in the 512 x 512 square (drag to move, right-drag or scroll to zoom)

const CROP = 512;

/** The image fitted whole into the square, centred. */
function fitCrop(img) {
  const scale = Math.min(CROP / img.naturalWidth, CROP / img.naturalHeight);
  return { img, fit: scale, scale, x: (CROP - img.naturalWidth * scale) / 2, y: (CROP - img.naturalHeight * scale) / 2 };
}

function drawCrop() {
  const c = studio.crop;
  const ctx = $('#studio-image').getContext('2d');
  ctx.clearRect(0, 0, CROP, CROP);
  if (!c) return;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c.img, c.x, c.y, c.img.naturalWidth * c.scale, c.img.naturalHeight * c.scale);
}

/** Zooms by `factor` around a point of the square (canvas pixels), between a quarter of the fit and 16x. */
function zoomCrop(factor, px = CROP / 2, py = CROP / 2) {
  const c = studio.crop;
  if (!c) return;
  const scale = Math.min(Math.max(c.scale * factor, c.fit / 4), c.fit * 16);
  c.x = px - (px - c.x) * (scale / c.scale);
  c.y = py - (py - c.y) * (scale / c.scale);
  c.scale = scale;
  drawCrop();
}

{
  const canvas = $('#studio-image');
  let last = null;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (CROP / r.width), y: (e.clientY - r.top) * (CROP / r.height) };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!studio.crop || (e.button !== 0 && e.button !== 2)) return;
    last = { ...at(e), zoom: e.button === 2, start: at(e) };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = at(e);
    if (last.zoom) zoomCrop(Math.exp(-(p.y - last.y) / CROP * 2), last.start.x, last.start.y);
    else {
      studio.crop.x += p.x - last.x;
      studio.crop.y += p.y - last.y;
      drawCrop();
    }
    last = { ...p, zoom: last.zoom, start: last.start };
  });
  const end = () => { last = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    if (!studio.crop) return;
    e.preventDefault();
    const p = at(e);
    zoomCrop(Math.exp(-e.deltaY / 500), p.x, p.y);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Upload image…: the dialog asks for a PNG, shows it as the preview and the thumbnail, and saves it on Save. */
function openStudioUpload(p) {
  studioMode(p, 'upload');
  $('#studio').showModal();
  document.activeElement?.blur();
  studioMessage('info', 'Choose a PNG for this project\'s icon.', { pick: true });
}

/** A chosen PNG: previewed in the dialog until Save. */
function showStudioUpload(file) {
  if (file.type && file.type !== 'image/png') {
    studioMessage('info', 'The icon must be a PNG.', { pick: true });
    return;
  }
  if (studio.mode !== 'upload') studioMode(studio.project, 'upload');
  clearStudioUpload();
  studio.upload = file;
  studio.uploadUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (studio.upload !== file) return;
    studio.crop = fitCrop(img);
    studioMessage(null);
    $('#studio-image').hidden = false;
    drawCrop();
    $('#studio-clear').hidden = false;
    studioControls(true, true);
    $('#studio-hint').textContent = 'Drag to move · right-drag or scroll to zoom';
  };
  img.onerror = () => studioMessage('info', 'The file could not be read as a PNG.', { pick: true });
  img.src = studio.uploadUrl;
}

function openStudio(p) {
  const dlg = $('#studio');
  studioMode(p, 'render');
  dlg.showModal();
  document.activeElement?.blur();  // no focus ring on the close button right away

  // A built 3D icon previews at once, its controls disabled until it answers. Without one there is nothing to
  // frame: a PNG is the icon. An unbuilt app may still have one, so it can be built here (Play here).
  if (p.icon?.model) {
    studioControls(true);
    return loadStudioPreview(studioPreviewUrl(p));
  }
  if (!p.entryExists && p.manifest?.scripts?.build) studioMessage('info', '', { pick: true, play: true });
  else studioMessage('info', NO_3D_ICON, { pick: true });
}

$('#studio-play').addEventListener('click', action(() => prepareStudioPreview(studio.project)));

$('#studio-reset').addEventListener('click', () => {
  if (studio.mode === 'upload') {
    // The whole image fitted again.
    if (studio.crop) studio.crop = fitCrop(studio.crop.img);
    drawCrop();
    return;
  }
  $('#studio-frame').contentWindow?.postMessage({ type: 'xrb-icon:reset' }, studio.frameOrigin);
});

$('#studio-pause').addEventListener('click', () => {
  studioPause(!studio.paused);
  $('#studio-frame').contentWindow?.postMessage({ type: 'xrb-icon:pause', paused: studio.paused }, studio.frameOrigin);
});

$('#studio').addEventListener('close', () => {
  clearTimeout(studio.helloTimer);
  clearStudioUpload();
  $('#studio-frame').src = 'about:blank';
  studio.pending.clear();
  studio.frameOrigin = location.origin;
});

window.addEventListener('message', (e) => {
  const frame = $('#studio-frame');
  if (e.source !== frame.contentWindow || e.origin !== studio.frameOrigin) return;
  const m = e.data;
  if (m?.type === 'xrb-icon:hello') {
    clearTimeout(studio.helloTimer);
    studioMessage(null);
    studioControls(true, true);
    $('#studio-pause').hidden = !m.canPause;
    if (m.canPause) {
      studioPause(true);
      // Also pause older SDK versions that do not recognise the preview's paused URL flag.
      frame.contentWindow?.postMessage({ type: 'xrb-icon:pause', paused: true }, studio.frameOrigin);
    }
  } else if (m?.type === 'xrb-icon:png' || m?.type === 'xrb-icon:error') {
    const done = studio.pending.get(m.id);
    studio.pending.delete(m.id);
    done?.(m);
  }
});

/** A PNG of the preview's current frame. */
async function studioCapture() {
  const id = studio.nextId++;
  const reply = await new Promise((resolve, reject) => {
    studio.pending.set(id, resolve);
    $('#studio-frame').contentWindow.postMessage({ type: 'xrb-icon:capture', id }, studio.frameOrigin);
    setTimeout(() => reject(new Error('the app did not answer the capture')), 5000);
  });
  if (reply.type === 'xrb-icon:error') throw new Error(reply.message);
  return reply.png;
}

$('#studio-take').addEventListener('click', action(async () => {
  const p = studio.project;
  const btn = $('#studio-take');
  btn.disabled = true;
  try {
    // Upload: the framed square (512 x 512, transparent outside the image); Render 3D: the preview's frame.
    const png = studio.mode === 'upload'
      ? await new Promise((resolve) => $('#studio-image').toBlob(resolve, 'image/png'))
      : await studioCapture();
    if (!png) throw new Error('the framed image could not be saved as PNG');
    await saveStudioIcon(p, png);
  } finally {
    btn.disabled = false;
  }
}));

// ---- plugin manager -----------------------------------------------------------------------

const pluginGlyph = '<span class="plugin-symbol" aria-hidden="true"><span class="plugin-symbol-emoji plugin-symbol-tinted">🧩</span></span>';
const managerIcon = (p) => p.icon ? `<img src="${esc(p.icon)}" alt="">` : p.glyph ? `<span class="plugin-symbol" aria-hidden="true"><span class="plugin-symbol-emoji plugin-symbol-tinted">${esc(p.glyph)}</span></span>` : pluginGlyph;
const titleCasePluginName = (value) => String(value).replace(/^publisher-/, '').split(/[-_\s]+/).filter(Boolean).map((word) => word.toLowerCase() === 'webxr' ? 'WebXR' : word[0].toUpperCase() + word.slice(1)).join(' ');
const managerName = (p) => p.title || titleCasePluginName(p.packager && p.name === p.id ? p.id.replace(/^platform-/, '') : p.name);
const managerType = (p) => p.type || [...new Set([...p.providers.map((v) => v.role), ...(p.packager ? ['platform'] : [])])].join(', ') || 'plugin';
const pluginOriginLabels = { bundled: 'embedded', workspace: 'custom' };

async function importPluginSample(plugin, sample) {
  let imported = null;
  const name = await ask({
    title: 'Import sample project',
    message: `Create an editable copy of ${sample.name} in the PLUGINS project section.`,
    input: { label: 'Project name', hint: 'Letters, digits, spaces, and dashes.', value: sample.name },
    ok: 'Import',
    cancel: 'Cancel',
    validate: async (value) => {
      if (!value) return 'Enter a project name.';
      const folder = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/g, '');
      if (!folder) return 'Use at least one letter or digit.';
      try {
        imported = await api('POST', `/api/plugins/manage/${encodeURIComponent(plugin.id)}/samples/${encodeURIComponent(sample.id)}/import`, {
          folder, name: value.trim(),
        });
        return '';
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
        return /already exists/i.test(error.message) ? 'A project with this name already exists.' : error.message;
      }
    },
  });
  if (!name || !imported) return;
  state.view = 'projects';
  state.search = null;
  state.selected = imported.id;
  localStorage.setItem('panel.view', state.view);
  localStorage.setItem('panel.selected', imported.id);
  await loadProjects();
  await showPage('projects');
}

async function loadManagedPlugins() {
  const inventory = await api('GET', '/api/plugins/manage');
  state.managedPlugins = inventory.plugins;
  state.pluginServices = inventory.services ?? null;
  if (!state.managedPlugins.some((p) => p.id === state.managedId)) state.managedId = state.managedPlugins[0]?.id ?? null;
  if (state.managedId) localStorage.setItem('panel.managedPlugin', state.managedId);
  else localStorage.removeItem('panel.managedPlugin');
  if (state.page === 'plugins') renderManagedPlugins();
  else if (state.page === 'settings') renderGlobalSettings();
}

function renderManagedPlugins() {
  const nav = $('#plugin-nav');
  const scroll = nav.querySelector('.nav-list')?.scrollTop ?? 0;
  const empty = !state.managedPlugins.length;
  $('#plugin-details').hidden = empty;
  nav.innerHTML = `<div class="nav-tabs xrb-section-label"><span>Plugins</span></div>
    <div class="nav-list xrb-workspace-sidebar-content">${empty ? '<div class="empty-note">No plugins installed yet.</div>' : state.managedPlugins.map((p) =>
      `<button type="button" class="proj xrb-focus-inset ${p.id === state.managedId ? 'selected' : ''} ${p.enabled ? '' : 'plugin-disabled'}" data-plugin="${esc(p.id)}" aria-current="${p.id === state.managedId}" ${p.enabled ? '' : `aria-label="${esc(`${managerName(p)}, disabled`)}"`}>
        <span class="stripe"></span>${managerIcon(p)}<span class="text"><span class="name">${esc(managerName(p))}</span><span class="meta">${esc(managerType(p))}</span></span></button>`).join('')}</div>`;
  nav.querySelector('.nav-list').scrollTop = scroll;
  nav.querySelectorAll('[data-plugin]').forEach((b) => b.addEventListener('click', () => {
    state.managedId = b.dataset.plugin;
    localStorage.setItem('panel.managedPlugin', state.managedId);
    renderManagedPlugins();
  }));

  const p = state.managedPlugins.find((item) => item.id === state.managedId);
  const el = $('#plugin-detail');
  if (!p) { el.innerHTML = ''; return; }
  const samples = p.samples ?? [];
  const servicesProblem = state.pluginServices?.problem;
  const description = p.description || (p.packager ? `Builds packages for ${managerName(p)} apps.` : 'No description provided.');
  const version = p.version || p.providers.find((v) => v.version)?.version;
  const hasSettings = (p.settings?.length ?? 0) > 0 || (p.panelSettings?.length ?? 0) > 0;
  el.innerHTML = `${servicesProblem ? `<p class="errors" role="alert">${esc(servicesProblem)}</p>` : ''}<div class="card hero plugin-hero-card">
    <div class="hero-top plugin-hero-top"><div class="plugin-hero-icon">${managerIcon(p)}</div>
      <div class="plugin-identity"><h3>${esc(managerName(p))}</h3></div>
      <div class="plugin-hero-links">${hasSettings ? `<a href="/settings/?module=${encodeURIComponent(p.id)}" class="xrb-icon-button plugin-hero-settings" data-tooltip="Open plugin settings" aria-label="Open plugin settings">${iconSvg('settings')}</a>` : ''}
        <button type="button" class="xrb-icon-button plugin-hero-folder" id="open-plugin-folder" data-tooltip="Open plugin folder" aria-label="Open plugin folder">${iconSvg('folder')}</button></div>
      <div class="plugin-hero-actions">
        <label class="xrb-switch plugin-toggle-action" title="Disabled plugins remain installed, but cannot run or package apps. Stop running apps and jobs before changing this setting.">
          <input type="checkbox" class="plugin-enable" role="switch" aria-label="Enable ${esc(managerName(p))}" ${p.enabled ? 'checked' : ''} ${p.selected === false ? 'disabled' : ''}><span>${p.enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
        <div class="plugin-roles">${pluginOriginLabels[p.origin] ? `<span class="state neutral plugin-origin">${esc(pluginOriginLabels[p.origin])}</span>` : ''}
          ${p.built ? '' : '<span class="state rebuild">needs build</span>'}
          ${p.problem ? `<span class="state err">${p.selected === false ? 'source not selected' : 'invalid metadata'}</span>` : ''}
          ${version ? `<span class="state ok">${esc(version)}</span>` : ''}</div>
      </div>
    </div>
    ${p.problem ? `<p class="xrb-help">${esc(p.problem)}</p>` : ''}
  </div>
  ${(p.availableOrigins?.length > 1 || p.selected === false) ? `<form class="card" id="plugin-source-form">
    ${field('Plugin source', 'origin', p.selectedOrigin ?? (p.selected ? p.origin : ''), { options: p.availableOrigins ?? [], optionLabels: pluginOriginLabels, defaultLabel: 'Choose a source', raw: true })}
    <p class="xrb-help">Selects the whole plugin: services, settings, tools and native providers. Stop running apps and jobs first. Changed tool sources still require a panel restart.</p>
    <button type="submit" class="action-button">Use selected source</button>
  </form>` : ''}
  <div class="card"><p class="plugin-description">${esc(description)}</p></div>
  ${samples.length ? `<div class="card"><h2>Sample projects</h2><div class="plugin-sample-list">${samples.map((sample) =>
    `<div class="plugin-sample"><div><h3>${esc(sample.name)}</h3>${sample.description ? `<p class="xrb-help">${esc(sample.description)}</p>` : ''}</div>
      <button type="button" class="action-button" data-import-sample="${esc(sample.id)}">Import</button></div>`).join('')}</div></div>` : ''}`;
  el.querySelector('#plugin-source-form')?.addEventListener('submit', action(async event => {
    event.preventDefault();
    const form = event.currentTarget, origin = new FormData(form).get('origin');
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      await api('PUT', `/api/plugins/manage/${encodeURIComponent(p.id)}/origin`, { origin, revision: p.sourceRevision });
      state.managedId = `${origin}:${p.logicalId}`;
      state.packageSetup.clear(); state.packageSetupChecks.clear(); state.publicationOverrides.clear(); state.releaseOverrides.clear(); state.releaseSelection.clear();
      await Promise.all([loadManagedPlugins(), loadPlugins(), loadNavigation(), loadProjects()]);
    } finally { if (form.isConnected) form.querySelector('button[type="submit"]').disabled = false; }
  }));
  el.querySelector('#open-plugin-folder').addEventListener('click', action(() => api('POST', `/api/plugins/manage/${encodeURIComponent(p.id)}/open-folder`)));
  el.querySelectorAll('[data-import-sample]').forEach((button) => button.addEventListener('click', action(() => {
    const sample = samples.find((item) => item.id === button.dataset.importSample);
    return sample ? importPluginSample(p, sample) : Promise.resolve();
  })));
  el.querySelector('.plugin-enable').addEventListener('change', action(async (event) => {
    event.target.disabled = true;
    try {
      await api('PUT', `/api/plugins/manage/${encodeURIComponent(p.id)}`, { enabled: event.target.checked });
      await loadHost();
      await loadProjects();
      await loadManagedPlugins();
    } catch (e) { event.target.checked = !event.target.checked; event.target.disabled = false; throw e; }
  }));
}

const APPS_GLYPH = '🎛️';
const settingsGlyph = (symbol, detailed = false) => `<span class="plugin-symbol" aria-hidden="true"><span class="plugin-symbol-emoji plugin-symbol-tinted${detailed ? ' xrb-glyph-detail' : ''}">${symbol}</span></span>`;
const pluginSettingsTimers = new Map();

function pluginSettingControl(setting, value, disabled) {
  const hint = setting.hint ? `<span class="xrb-help">${esc(setting.hint)}</span>` : '';
  if (setting.type === 'boolean') return `<div class="xrb-stack settings-boolean-field"><label class="toggle"><input type="checkbox" name="${esc(setting.key)}" ${value ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${esc(setting.label)}</label>${hint}</div>`;
  if (setting.type === 'select') {
    const options = setting.options.map((option) => option.value), labels = Object.fromEntries(setting.options.map((option) => [option.value, option.label]));
    return field(esc(setting.label), setting.key, value, { options, labels, disabled, hint: setting.hint });
  }
  const control = `<input type="${setting.type === 'number' ? 'number' : 'text'}" name="${esc(setting.key)}" value="${esc(value ?? '')}" ${setting.min !== undefined ? `min="${esc(setting.min)}"` : ''} ${setting.max !== undefined ? `max="${esc(setting.max)}"` : ''} ${setting.step !== undefined ? `step="${esc(setting.step)}"` : ''} ${disabled ? 'disabled' : ''}>`;
  return renderField(esc(setting.label), control, { hint: setting.hint });
}

function pluginSettingsForm(plugin, scope, fields, values, divided = false) {
  if (!fields.length) return '';
  let section = null, hasContent = false;
  const controls = fields.map((field) => {
    const heading = field.section && field.section !== section ? `<h2 class="settings-section ${hasContent ? 'xrb-section-divider' : ''}">${esc(field.section)}</h2>` : '';
    if (field.section) section = field.section;
    const control = pluginSettingControl(field, values[field.key], !plugin.enabled);
    hasContent = true;
    return `${heading}${control}`;
  }).join('');
  return `<form class="settings-card-fields ${divided ? 'xrb-section-divider' : ''}" data-plugin-settings="${esc(plugin.id)}" data-settings-scope="${scope}">${controls}</form>`;
}

function pluginSettingsCard(plugin) {
  const runtime = plugin.settings ?? [], panel = plugin.panelSettings ?? [];
  return `<div class="card settings-plugin-card ${plugin.enabled ? '' : 'settings-card-disabled'}" data-settings-owner="${esc(plugin.id)}">
    ${plugin.settingsDescription ? `<p class="xrb-supporting-text">${esc(plugin.settingsDescription)}</p>` : ''}
    ${pluginSettingsForm(plugin, 'settings', runtime, plugin.values ?? {})}
    ${pluginSettingsForm(plugin, 'panelSettings', panel, plugin.panelValues ?? {}, runtime.length > 0)}
  </div>`;
}

function settingsOwnerSection(id, title, card, status = '') {
  return `<section class="settings-owner-section" data-settings-module="${esc(id)}"><div class="settings-owner-heading xrb-section-label"><h2>${esc(title)}</h2>${status}</div>${card}</section>`;
}

function pluginSettingsSection(plugin) {
  const status = `<span id="plugin-settings-status-${esc(plugin.id)}" class="state ${plugin.enabled ? 'ok' : 'none'}" ${plugin.enabled ? 'hidden' : ''}>${plugin.enabled ? '' : 'disabled'}</span>`;
  return settingsOwnerSection(plugin.id, managerName(plugin), pluginSettingsCard(plugin), status);
}

function renderGlobalSettings() {
  const plugins = state.managedPlugins.filter((plugin) => !plugin.problem && ((plugin.settings?.length ?? 0) || (plugin.panelSettings?.length ?? 0)));
  const defaultFilter = plugins.length ? 'all' : 'control-panel';
  const filters = new Set([...(plugins.length ? ['all'] : []), 'control-panel', ...plugins.map((plugin) => plugin.id)]);
  const requestedFilter = new URLSearchParams(location.search).get('module');
  // Route intent wins: the plain menu destination always opens All, not the last sidebar module.
  state.settingsFilter = requestedFilter && filters.has(requestedFilter) ? requestedFilter : defaultFilter;
  if (requestedFilter && !filters.has(requestedFilter)) {
    const url = new URL(location.href);
    url.searchParams.delete('module');
    history.replaceState(null, '', url);
  }
  const nav = $('#settings-nav');
  const rows = [
    ...(plugins.length ? [{ id: 'all', name: 'All', meta: 'settings', icon: settingsGlyph('⚙️') }] : []),
    { id: 'control-panel', name: 'Apps', meta: 'core', icon: settingsGlyph(APPS_GLYPH, true) },
    ...plugins.map((plugin) => ({ id: plugin.id, name: managerName(plugin), meta: managerType(plugin), icon: managerIcon(plugin), enabled: plugin.enabled })),
  ];
  nav.innerHTML = `<div class="nav-tabs xrb-section-label settings-module-heading"><span>Module</span></div><div class="nav-list xrb-workspace-sidebar-content">${rows.map((row) => `<button type="button" class="proj xrb-focus-inset ${row.id === state.settingsFilter ? 'selected' : ''} ${row.enabled === false ? 'plugin-disabled' : ''}" data-settings-filter="${esc(row.id)}" aria-current="${row.id === state.settingsFilter}"><span class="stripe"></span>${row.icon}<span class="text"><span class="name">${esc(row.name)}</span><span class="meta">${esc(row.meta)}</span></span></button>`).join('')}</div>`;
  nav.querySelectorAll('[data-settings-filter]').forEach((button) => button.addEventListener('click', () => {
    state.settingsFilter = button.dataset.settingsFilter;
    const url = new URL(location.href);
    if (state.settingsFilter === 'all') url.searchParams.delete('module');
    else url.searchParams.set('module', state.settingsFilter);
    history.replaceState(null, '', url);
    renderGlobalSettings();
  }));
  const shownPlugins = state.settingsFilter === 'all' ? plugins : plugins.filter((plugin) => plugin.id === state.settingsFilter);
  const apps = ['all', 'control-panel'].includes(state.settingsFilter) ? settingsOwnerSection('control-panel', 'Apps',
    `<div class="card"><form id="panel-appearance" class="settings-card-fields">${field('Theme', 'theme', window.xrbTheme.get(), {
      options: ['system', 'light', 'dark'], raw: true,
      optionLabels: { system: 'System', light: 'Light', dark: 'Dark' },
    })}</form><form id="app-preferences"><div class="settings-card-fields">${field('Cursor', 'cursor', state.appSettings.cursor, {
      options: ['system', 'ring', 'ring-dot'], raw: true,
      optionLabels: { system: 'System', ring: 'Ring', 'ring-dot': 'Ring with hover dot' },
      hint: 'Applies on the next run. Mouse must be selected in the app’s Input options.',
    })}</div></form></div>`) : '';
  $('#settings-content').innerHTML = apps + shownPlugins.map(pluginSettingsSection).join('');
  $('#panel-appearance')?.addEventListener('change', event => window.xrbTheme.set(event.currentTarget.elements.namedItem('theme').value));
  $('#app-preferences')?.addEventListener('change', action(async (event) => {
    const form = event.currentTarget, cursor = form.elements.namedItem('cursor').value;
    form.querySelectorAll('input,button').forEach(control => { control.disabled = true; });
    try { state.appSettings = await api('PUT', '/api/app-settings', { cursor }); }
    finally { renderGlobalSettings(); }
  }));
  $('#settings-content').querySelectorAll('[data-plugin-settings]').forEach((form) => form.addEventListener('change', action(() => savePluginSettings(form))));
}

async function savePluginSettings(form) {
  const plugin = state.managedPlugins.find((candidate) => candidate.id === form.dataset.pluginSettings);
  const scope = form.dataset.settingsScope;
  const fields = scope === 'panelSettings' ? plugin?.panelSettings : plugin?.settings;
  if (!plugin || !fields || !['settings', 'panelSettings'].includes(scope)) return;
  const values = Object.fromEntries(fields.map((setting) => {
    const input = form.elements.namedItem(setting.key);
    return [setting.key, setting.type === 'boolean' ? input.checked : setting.type === 'number' ? Number(input.value) : input.value];
  }));
  form.querySelectorAll('input,button').forEach((control) => { control.disabled = true; });
  const status = document.getElementById(`plugin-settings-status-${plugin.id}`), timerKey = plugin.id;
  clearTimeout(pluginSettingsTimers.get(timerKey));
  status.hidden = true;
  status.textContent = '';
  pluginSettingsTimers.set(timerKey, setTimeout(() => {
    status.hidden = false;
    status.className = 'state busy';
    status.textContent = 'saving';
    pluginSettingsTimers.delete(timerKey);
  }, 300));
  try {
    await api('PUT', `/api/plugins/manage/${encodeURIComponent(plugin.id)}`, { [scope]: values });
    clearTimeout(pluginSettingsTimers.get(timerKey));
    if (scope === 'panelSettings') plugin.panelValues = values;
    else plugin.values = values;
    status.hidden = false;
    status.className = 'state ok';
    status.textContent = 'saved';
    pluginSettingsTimers.set(timerKey, setTimeout(() => {
      status.hidden = true;
      status.textContent = '';
      pluginSettingsTimers.delete(timerKey);
    }, 2500));
  } catch (error) {
    clearTimeout(pluginSettingsTimers.get(timerKey));
    status.hidden = false;
    status.className = 'state err';
    status.textContent = 'save failed';
    throw error;
  } finally {
    form.querySelectorAll('input,button').forEach((control) => { control.disabled = false; });
  }
}

async function showPage(page) {
  closeMenu();
  if (page === 'plugins') {
    state.dashboardScroll = scrollY;
    await loadManagedPlugins();
  } else if (page === 'settings') {
    await loadManagedPlugins();
    state.appSettings = await api('GET', '/api/app-settings');
  }
  state.page = page;
  $('#dashboard').hidden = page !== 'projects';
  $('#plugins-manager').hidden = page !== 'plugins';
  $('#global-settings').hidden = page !== 'settings';
  document.body.classList.toggle('plugins-page', page === 'plugins');
  document.body.classList.toggle('settings-page', page === 'settings');
  const plugins = page === 'plugins', settings = page === 'settings';
  const title = plugins ? 'Plugins' : settings ? 'Settings' : 'Apps';
  $('#panel-menu-button').textContent = title;
  syncPanelIdentity();
  renderPanelNavigation();
  if (page === 'plugins') { renderManagedPlugins(); scrollTo(0, 0); }
  else if (page === 'settings') { renderGlobalSettings(); scrollTo(0, 0); }
  else {
    renderProjects(); renderDetail(true); syncEmptyProjectUi();
    scrollTo(0, state.dashboardScroll);
  }
}

function syncPanelIdentity() {
  const plugins = state.page === 'plugins';
  const glyphs = getComputedStyle(document.documentElement);
  const tint = glyphs.getPropertyValue('--xrb-glyph-filter').trim();
  const detailTint = glyphs.getPropertyValue('--xrb-glyph-detail-filter').trim();
  if (state.page === 'settings') setPageIdentity('Settings', '⚙️', tint);
  else setPageIdentity(plugins ? 'Plugins' : 'Apps', plugins ? '🧩' : APPS_GLYPH, plugins ? tint : detailTint);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncPanelIdentity);
window.addEventListener('xrb-theme-change', () => {
  syncPanelIdentity();
  const input = $('#panel-appearance [name="theme"]');
  if (input) input.value = window.xrbTheme.get();
});

// ---- header -------------------------------------------------------------------------------

let navigationTools=[];
function renderPanelNavigation(){
  renderNavigationMenu($('#panel-menu'),{origin:location.origin,tools:navigationTools,current:state.page,indicators:true});
  if(state.host)renderHost();if(state.panel)renderPanelFreshness();
}
renderPanelNavigation();

$('#panel-menu-button').addEventListener('click', (event) => {
  event.stopPropagation();
  const button = event.currentTarget;
  const menu = $('#panel-menu');
  if (!menu.hidden) return closeMenu();
  closeMenu();
  const r = button.getBoundingClientRect();
  placeMenu(menu, r.left, r.bottom + 6);
  button.setAttribute('aria-expanded', 'true');
  menu.querySelector('[aria-current="page"]')?.focus();
});

async function loadNavigation() {
  const data=await api('GET','/api/navigation');navigationTools=data.tools??[];renderPanelNavigation();
  if(shouldReportNavigationError(data.error,state.panel))report(new Error(data.error));
  else if(data.error)console.warn(`[navigation] ${data.error}`);
}
$('#panel-menu').addEventListener('click',event=>{
  const item=event.target.closest('[data-navigation]');if(!item)return;const id=item.dataset.navigation;
  if(id==='rebuild'||id==='restart')event.preventDefault();
  if(id==='rebuild')void rebuildHost();else if(id==='restart')void restartPanel().catch(report);
});
$('#panel-menu').addEventListener('keydown',e=>menuKeyboard(e,$('#panel-menu'),()=>{closeMenu();$('#panel-menu-button').focus();}));
$('#panel-menu-button').addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if($('#panel-menu').hidden)$('#panel-menu-button').click();$('#panel-menu [role="menuitem"]')?.focus();}});

async function restartPanel() { closeMenu();await restartPanelInPlace(location.origin); }

const finishedSetups = new Map();
async function finishPackageSetup(job) {
  let check = finishedSetups.get(job.id);
  if (!check) {
    const p = allProjects().find((project) => project.id === job.projectId);
    check = p?.packaging?.setupSupported && p.packaging.platform === job.result?.platform
      ? refreshPackageSetup(p) : Promise.resolve(null);
    finishedSetups.set(job.id, check);
    if (finishedSetups.size > 30) finishedSetups.delete(finishedSetups.keys().next().value);
  }
  const status = await check;
  if (progressKind !== 'setup' || progressJobId !== job.id || !$('#job-progress').open) return;
  if (job.state === 'done' && (!status || status.state === 'ready')) $('#job-progress').close();
  else if (job.state === 'done') {
    progressError = status.reason ?? 'Package tools are not ready after setup.';
    renderProgressDialog();
  }
}

let progressJobId = null;
let progressError = null;
let progressKind = 'package';
function renderProgressDialog() {
  const dialog = $('#job-progress');
  if (!dialog.open) return;
  const job = state.jobs.get(progressJobId);
  const running = !progressError && (!job || job.state === 'running');
  const failed = !!progressError || job?.state === 'failed';
  const setup = progressKind === 'setup';
  $('#job-progress-status-icon').dataset.state = running ? 'running' : failed ? 'failed' : 'done';
  $('#job-progress-title').textContent = running
    ? (setup ? 'Setting up package tools' : 'Building package')
    : failed ? (setup ? 'Package setup failed' : 'Package build failed')
      : (setup ? 'Package tools ready' : 'Package built');
  $('#job-progress-message').textContent = progressError || (running
    ? (setup ? 'Installing prerequisites…' : 'Preparing the package…')
    : job?.state === 'failed' ? job.error || 'See job output below.'
      : setup ? 'You can build the package now.' : 'The package is ready.');
  const output = $('#job-progress-output');
  output.textContent = job?.lines?.length ? job.lines.slice(setup ? -200 : -20).join('\n')
    : progressError ? 'The job could not start.' : 'Waiting for output…';
  output.scrollTop = output.scrollHeight;
  $('#job-progress-view-job').disabled = !!progressError && !job;
  $('#job-progress-actions').classList.toggle('is-building', running && !setup);
  $('#job-progress-autoclose').closest('label').hidden = setup;
  if (!setup && job?.state === 'done' && $('#job-progress-autoclose').checked) dialog.close();
}
function showProgressDialog(kind, job) {
  progressKind = kind;
  progressJobId = job?.id ?? null;
  progressError = null;
  if (job && !state.jobs.has(job.id)) state.jobs.set(job.id, job);
  $('#job-progress-actions').classList.toggle('is-building', kind !== 'setup' && (!job || job.state === 'running'));
  $('#job-progress').showModal();
  renderProgressDialog();
}
$('#job-progress-autoclose').checked = localStorage.getItem('panel.progressAutoclose') === '1';
$('#job-progress-autoclose').addEventListener('change', (e) => localStorage.setItem('panel.progressAutoclose', e.target.checked ? '1' : '0'));
function alignJobAtTop(jobId) {
  const list = $('#jobs');
  const item = list.querySelector(`details[data-job="${Number(jobId)}"]`)?.closest('.item');
  if (!item) return;
  const listTop = list.getBoundingClientRect().top;
  list.scrollTop += item.getBoundingClientRect().top - listTop;
  state.jobsScroll = list.scrollTop;
  state.jobsAtEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 20;
}

async function openJobInActivity(jobId) {
  const job = state.jobs.get(Number(jobId));
  if (!job) return;
  if (state.page !== 'projects') {
    history.pushState(null, '', '/');
    await showPage('projects');
  }
  state.openJob = job.id;
  state.jobShow[job.state] = true;
  localStorage.setItem('panel.jobShow', JSON.stringify(state.jobShow));
  selectActivityTab('jobs');
  renderJobs();
  requestAnimationFrame(() => {
    alignJobAtTop(job.id);
    // Bring the selected job itself—not merely the Activity card—to the page's top edge.
    $('#jobs').querySelector(`details[data-job="${job.id}"]`)?.closest('.item')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
async function rebuildHost() {
  closeMenu();
  await rebuildHostInPlace(location.origin, {
    onJob(job) {
      const previous = state.jobs.get(job.id);
      state.jobs.set(job.id, { ...job, lines: job.lines ?? previous?.lines ?? [] });
      renderJobsSoon();
    },
    onViewJob: (job) => void openJobInActivity(job.id),
    onComplete: () => loadHost().then(() => renderDetail()).catch(report),
  });
}
$('#job-progress-view-job').addEventListener('click', () => {
  $('#job-progress').close();
  void openJobInActivity(progressJobId);
});
$('#job-progress-close').addEventListener('click', () => $('#job-progress').close());
$('#job-progress').addEventListener('cancel', (event) => { if ($('#job-progress-actions').classList.contains('is-building')) event.preventDefault(); });
$('#jobs-clear').addEventListener('click', action(async (e) => {
  e.preventDefault();
  const r = await api('POST', '/api/jobs/clear');
  state.jobs = new Map(r.jobs.map((j) => [j.id, { ...j, lines: state.jobs.get(j.id)?.lines ?? j.lines }]));
  renderJobs();
}));
$('#act-cams').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  const running = state.run && state.run.phase === 'running';
  const id = running ? state.run.projectId : state.selected;
  if (!id) return;
  if (!running) { localStorage.setItem(cameraKey(id), enabled ? '1' : '0'); return; }
  e.target.disabled = true;
  api('POST', '/api/run/cameras', { enabled }).then(() => {
    localStorage.setItem(cameraKey(id), enabled ? '1' : '0');
    e.target.disabled = false;
  }).catch((err) => { e.target.checked = !enabled; e.target.disabled = false; report(err); });
});

// Keep the log and jobs mounted while switching tabs: output, scroll and open job details survive.
function selectActivityTab(name, focus = false) {
  if (state.activityTab === 'jobs' && !$('#activity-jobs').hidden) state.jobsScroll = $('#jobs').scrollTop;
  state.activityTab = name;
  localStorage.setItem('panel.activityTab', name);
  for (const tab of ['log', 'jobs']) {
    const button = $(`#activity-${tab}-tab`);
    button.setAttribute('aria-selected', String(tab === name));
    button.tabIndex = tab === name ? 0 : -1;
    $(`#activity-${tab}`).hidden = tab !== name;
    $(`#activity-${tab}-filters`).hidden = tab !== name;
    $(`#activity-${tab}-actions`).hidden = tab !== name;
  }
  if (name === 'jobs') $('#jobs').scrollTop = state.jobsAtEnd ? $('#jobs').scrollHeight : (state.jobsScroll ?? 0);
  if (focus) $(`#activity-${name}-tab`).focus();
}
for (const tab of ['log', 'jobs']) {
  $(`#activity-${tab}-tab`).addEventListener('click', () => selectActivityTab(tab));
  $(`#activity-${tab}-tab`).addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    selectActivityTab(e.key === 'Home' ? 'jobs' : e.key === 'End' ? 'log' : tab === 'log' ? 'jobs' : 'log', true);
  });
}
selectActivityTab(state.activityTab);

// The panel owns every contextual action; suppress the browser menu where no panel menu applies.
document.addEventListener('contextmenu', (event) => event.preventDefault());

// ---- live events --------------------------------------------------------------------------

function connect() {
  const es = new EventSource('/api/events');
  const on = (type, fn) => es.addEventListener(type, (e) => fn(JSON.parse(e.data)));
  on('run', (r) => {
    if (r.phase === 'starting' && r.startedMs !== state.run?.startedMs) state.runLog = [];
    state.run = r;
    if (r.phase === 'idle') state.status = null;
    renderRun();
    renderDetail();
  });
  on('status', (s) => {
    const wasUp = state.status?.pageFps != null;
    state.status = s;
    renderRun();
    // launching -> running: the list and the project header show the run state too.
    if (!wasUp && s.pageFps != null) { renderProjects(); renderDetail(); }
  });
  on('run-log', (text) => {
    state.runLog.push(text);
    if (state.runLog.length > 1000) state.runLog.splice(0, state.runLog.length - 1000);
    if (/\[page\]\s+Uncaught\b/.test(text) && state.status?.pageFps == null) renderRun();
    else renderRunLog();
  });
  on('job', (j) => {
    const prev = state.jobs.get(j.id);
    state.jobs.set(j.id, { ...j, lines: prev?.lines ?? [] });
    renderJobsSoon();
    if (j.kind === 'publication' && (j.state === 'queued' || j.state === 'running')) {
      const p = allProjects().find((project) => project.id === j.projectId);
      const active = p ? activePublicationJob(p.id) : null;
      const publication = active?.publication ?? p?.manifest?.publication;
      if (p && active?.id === j.id && publication && state.publicationJobViews.get(p.id)?.jobId !== j.id) {
        const publisher = publication.publisher;
        const status = p.publicationDestinations?.[publisher]?.status ?? p.publication?.status ?? null;
        state.publicationJobViews.set(p.id, { jobId: j.id, publication: structuredClone(publication), status });
      }
      renderProjects();
      if (j.projectId === selected()?.id) renderDetail();
    }
    if (j.kind === 'publication' && prev?.state === 'running' && j.state === 'done') finishPublicationJob(j);
    if (j.kind === 'publication' && prev?.state === 'running' && j.state === 'failed') {
      if (state.publicationJobViews.get(j.projectId)?.jobId === j.id) state.publicationJobViews.delete(j.projectId);
      renderProjects();
    }
    if (j.kind === 'packager-setup') {
      if (j.projectId === selected()?.id && j.state === 'running') renderDetail();
      if (j.state !== 'running') {
        renderDetail();
        void finishPackageSetup(j).catch(report);
      }
    }
    if (j.state !== 'running' && j.kind === 'host-rebuild') loadHost().then(() => renderDetail()).catch(report);
  });
  on('job-line', ({ id, text }) => {
    const j = state.jobs.get(id);
    if (!j) return;
    j.lines.push(text);
    if (j.lines.length > 2000) j.lines.splice(0, j.lines.length - 2000);
    renderJobsSoon();
  });
  on('projects-changed', () => {
    loadProjects().catch(report);
    loadPackages().catch(report);
    loadHost().catch(report);
    if (state.page === 'plugins' || state.page === 'settings') loadManagedPlugins().catch(report);
  });
  on('plugins-changed', () => {
    state.packageSetup.clear(); state.packageSetupChecks.clear(); state.publicationOverrides.clear(); state.releaseOverrides.clear(); state.releaseSelection.clear(); state.publicationEffects.clear();
    loadNavigation().catch(report);
    loadPlugins().catch(report);
    if (state.page === 'plugins' || state.page === 'settings') loadManagedPlugins().catch(report);
  });
  on('project', () => loadProjects().catch(report));
  // A publisher's status arrives after the list (it may read remote state): reload the list, served from the cache.
  on('publication-status', () => loadProjects().catch(report));
  es.onerror = () => { /* EventSource reconnects by itself */ };
}

// The workspace path first: links to project files and the out folder need it.
const initialPing = await api('GET', '/api/ping').catch(() => ({}));
state.repo = initialPing.workspace ?? '';
await loadWorkspace().catch(report);
// Monitors come from a PowerShell query (~0.5 s): they only fill the display choice, so they do not hold the reveal.
loadMonitors().then(() => { if (!document.activeElement || document.activeElement === document.body) renderDetail(); }).catch(report);
await Promise.all([loadPackages(), loadHost(), loadPanelFreshness(), loadJobs(), loadRun()]).catch(report);
await loadProjects().catch(report);
// Plugins and Settings are standalone routes; legacy ?page= links are consumed once.
const navigationRequest=initialNavigationRequest;
if(navigationRequest.page==='plugins'&&location.pathname!=='/plugins/'&&!navigationRequest.maintenance){location.replace('/plugins/');}
if(navigationRequest.page==='settings'&&location.pathname!=='/settings/'&&!navigationRequest.maintenance){const destination=new URL(navigationRequest.cleanUrl);destination.pathname='/settings/';location.replace(destination.href);}
if(navigationRequest.cleanUrl!==location.href)history.replaceState(null,'',navigationRequest.cleanUrl);
const initialPage = ['plugins', 'settings'].includes(navigationRequest.page) ? navigationRequest.page : 'projects';
await showPage(initialPage).catch(report);
if(navigationRequest.job)await openJobInActivity(navigationRequest.job);
await loadNavigation().catch(report);
// Reveal only the fully populated layout, after its web fonts settle, so refresh has no card or text jumps.
await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
document.body.classList.remove('workspace-pending');
document.body.removeAttribute('data-xrb-scrollbar');
connect();
// A maintenance link is an explicit one-shot action; shared tool navigation normally handles it in place.
if(navigationRequest.maintenance){
  if(navigationRequest.maintenance==='rebuild')$('#host-rebuild').click();
  else $('#panel-restart').click();
}
setInterval(() => { renderProjects(); loadHost().catch(() => {}); loadPanelFreshness().catch(() => {}); }, 30000);
addEventListener('focus', () => loadPanelFreshness().catch(() => {}));

$('#studio-pick').addEventListener('click', () => $('#studio-file').click());
// Delete: drops the chosen, unsaved PNG; the dialog is back to choosing one and shows the current icon.
$('#studio-clear').addEventListener('click', () => {
  clearStudioUpload();
  $('#studio-current').src = iconSrc(studio.project);
  studioMessage('info', 'Choose a PNG for this project\'s icon.', { pick: true });
});
$('#studio-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) showStudioUpload(file);
});

// ---- run dock ------------------------------------------------------------------------------
// The project's Run / Stop, pinned in the top bar while its own button is scrolled away, so a
// run can be stopped (or started) from anywhere on the page. It mirrors the button and clicks it.


function syncRunDock(p) {
  const dock = $('#run-dock');
  const src = $('#act-stop') ?? $('#act-run');
  syncRunDock.observer?.disconnect();
  syncRunDock.observer = null;
  if (!src) {
    runDockVisible = false;
    dock.hidden = true;
    renderStatsDock(null);
    return;
  }
  dock.querySelector('img').src = iconSrc(p);
  dock.querySelector('.name').textContent = p.manifest?.name ?? p.id;
  const btn = dock.querySelector('button');
  btn.className = src.className;
  const pending = state.run?.phase === 'starting' || state.run?.phase === 'stopping';
  btn.textContent = pending ? '...' : src.id === 'act-stop' ? 'Stop' : 'Run';
  btn.title = src.textContent;
  btn.disabled = src.disabled;
  // A workflow animation can clip the action below the header without any scrolling.
  // Only an action above the app bar belongs in the dock; below-viewport actions do not.
  const top = getComputedStyle(document.documentElement).getPropertyValue('--top-h').trim() || '54px';
  const update = () => {
    const rect = src.getBoundingClientRect(), edge = $('.top').getBoundingClientRect().bottom;
    runDockVisible = src.isConnected && rect.width > 0 && rect.height > 0 && rect.bottom <= edge;
    dock.hidden = !runDockVisible;
    renderStatsDock(state.run && state.run.phase !== 'idle' ? state.status : null);
  };
  const observer = new IntersectionObserver(() => {
    if (syncRunDock.observer !== observer || !src.isConnected) return;
    update();
  }, { rootMargin: `-${top} 0px 0px 0px` });
  syncRunDock.observer = observer;
  update();
  observer.observe(src);
}
$('#run-dock button').addEventListener('click', () => ($('#act-stop') ?? $('#act-run'))?.click());
