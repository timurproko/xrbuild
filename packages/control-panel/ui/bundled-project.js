// Product source stays read-only. Personal run choices are saved separately in the selected workspace.
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function bundledProjectDetails(project, { icon, busy, running, providers = [] }) {
  const manifest = project.manifest;
  const settings = project.runSettings, values = settings?.values;
  const displays = [...new Set(['desktop', values?.display, ...providers.filter(provider => provider.role === 'display').map(provider => provider.name)].filter(Boolean))];
  const advanced = settings?.providerSchemas?.length ? `<details class="xrb-stack"><summary>Advanced provider options</summary><p class="xrb-help">Only declared boolean, numeric and choice settings are available. Save provider selection first to refresh this list. Unchecked overrides inherit product/workspace defaults.</p>${settings.providerSchemas.map(schema => `<fieldset class="xrb-stack"><legend>${esc(schema.label)} · ${esc(schema.provider)}</legend>${schema.fields.map(field => {
    const prefix = `provider.${schema.provider}.${field.key}`, saved = settings.overrides.providerSettings?.[schema.provider];
    const overridden = !!saved && Object.hasOwn(saved.values, field.key), value = schema.values[field.key];
    const control = field.type === 'boolean' ? `<input type="checkbox" name="${esc(prefix)}" ${value === true ? 'checked' : ''} ${overridden ? '' : 'disabled'}>`
      : field.type === 'select' ? `<select name="${esc(prefix)}" ${overridden ? '' : 'disabled'}>${field.options.map(option => `<option value="${esc(option.value)}" ${option.value === value ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select>`
      : `<input type="number" name="${esc(prefix)}" value="${esc(value ?? '')}" step="${field.step ?? 'any'}" ${field.min === undefined ? '' : `min="${field.min}"`} ${field.max === undefined ? '' : `max="${field.max}"`} ${overridden ? '' : 'disabled'}>`;
    return `<div data-provider-setting><label><input type="checkbox" data-provider-override name="${esc(prefix)}.override" ${overridden ? 'checked' : ''}> Override ${esc(field.label)}</label><label>${esc(field.label)} ${control}</label><small>Inherited: ${esc(schema.defaults[field.key] ?? 'provider runtime default')}</small></div>`;
  }).join('')}</fieldset>`).join('')}</details>` : '';
  const choices = values ? `<form id="bundled-run-settings" class="xrb-stack"><h4>Personal run settings</h4>
    <p>Saved in your workspace, not in the embedded project. Applies on the next run.</p>
    <fieldset class="xrb-stack" ${busy ? 'disabled' : ''}>
      <label>Input methods (comma-separated IDs)<input name="inputs" value="${esc(values.inputs.join(', '))}" maxlength="1050" autocomplete="off"></label>
      ${manifest?.target === 'webxr' ? '' : `<label>Display<select name="display">${displays.map(name => `<option value="${esc(name)}" ${name === values.display ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`}
      <label>Monitor index<input type="number" name="monitor" min="0" max="255" step="1" value="${values.monitor}" required></label>
      ${[['fullscreen', 'Fullscreen'], ['flat', 'Orthographic view'], ...(manifest?.target === 'webxr' ? [] : [['cameraView', 'Native camera view']])].map(([key, label]) => `<label><input type="checkbox" name="${key}" ${values[key] ? 'checked' : ''}> ${label}</label>`).join('')}
      ${advanced}
      <div class="row"><button type="submit" class="action-button">Save run settings</button><button type="button" id="bundled-reset-settings" class="action-button">Restore embedded defaults</button></div>
    </fieldset></form>` : '';
  const base = project.id.split('/').at(-1).replace(/^bundled:/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 58);
  return `<section class="card hero project-hero">
    <div class="hero-top project-hero-top"><img src="${esc(icon)}" width="64" height="64" alt="">
      <div class="project-hero-main"><h3>${esc(manifest?.name ?? project.id)}</h3>
      <span class="state">embedded${project.archived ? ' · archived' : ''}</span></div></div>
    <p>${esc(manifest?.description ?? '')}</p>
    ${project.errors?.length ? `<ul class="errors">${project.errors.map(error => `<li>${esc(error.message)}</li>`).join('')}</ul>` : ''}
    <p>Runs use packaged or successfully rebuilt cached output without modifying product sources. Copy to your project repository to edit source, develop, generate icons, package or publish.</p>
    ${project.build?.problem ? `<p class="errors" role="alert">${esc(project.build.problem)}</p><code>${esc(project.build.path)}</code>` : ''}
    <p class="empty-note">${project.build?.origin === 'cache' ? 'User-cached output' : 'Packaged output'}${!project.entryExists ? ' is unavailable.' : ' is ready.'}</p>
    ${project.build?.canRebuild ? `<button type="button" id="bundled-rebuild" class="action-button" ${busy ? 'disabled' : ''}>Rebuild in user cache</button>` : project.build?.reason ? `<small>${esc(project.build.reason)}</small>` : ''}
    ${project.runSettingsProblem ? `<p class="errors" role="alert">${esc(project.runSettingsProblem)}</p><code>${esc(project.runSettingsPath)}</code>` : ''}
    <div class="project-actions">${running
      ? '<button type="button" id="bundled-stop" class="action-button">Stop</button>'
      : `<button type="button" id="bundled-run" class="action-button primary" ${busy || !manifest || !project.entryExists || project.runSettingsProblem ? 'disabled' : ''}>${manifest?.target === 'webxr' ? 'Run in browser' : 'Run app'}</button>`}</div>
    ${choices}
    <form id="bundled-copy" class="xrb-stack"><label>New project folder
      <input name="folder" value="${esc(base)}-copy" pattern="[a-z0-9][a-z0-9-]{0,62}" maxlength="63" required autocomplete="off"></label>
      <button type="submit" class="action-button" ${manifest ? '' : 'disabled'}>Copy to workspace</button>
      <small>The copy starts in unsorted without publication, signing, device or machine identity.</small></form>
  </section><section class="card"><h4>Build cache</h4><button type="button" id="bundled-cache-review" class="action-button">Review working cache</button><div id="bundled-cache-content"></div></section>`;
}
