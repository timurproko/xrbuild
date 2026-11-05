// UI-only platform choices. The project manifest still stores target and platform separately.
const labelOf = (name) => name.length <= 2 ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1);
const valueOf = (target, name = '') => `${target}:${name}`;

export function refreshedDesktopDisplay(manifest, monitors) {
  const desktop = !manifest.display || manifest.display === 'desktop';
  const monitor = Math.max(0, Number(manifest.plugins?.desktop?.monitor) || 0);
  if (!desktop || !monitors.length || monitors.some((item) => item.index === monitor)) return null;
  const fallback = monitors.find((item) => item.primary) ?? monitors[0];
  return `desktop:${fallback.index}`;
}

export function platformChoices(manifest, plugins = {}, surface = 'all') {
  const disabled = new Set((plugins.disabled ?? []).filter((p) => p.role === 'platform').map((p) => p.name));
  const runtime = new Set((plugins.providers ?? []).filter((p) => p.role === 'platform' && p.name && p.name !== 'standalone').map((p) => p.name));
  const packagers = new Set(plugins.packagers ?? []);
  const webxrPackagers = new Set(plugins.headsetPlatforms ?? []);
  const hostPackagers = new Set([...packagers].filter((name) => !webxrPackagers.has(name)));
  const host = surface === 'display' ? new Set() : surface === 'build' ? hostPackagers : new Set([...runtime, ...hostPackagers]);
  const webxr = surface === 'display' ? new Set() : webxrPackagers;
  const label = (name) => plugins.packagerLabels?.[name] || labelOf(name);
  const standaloneTargets = new Set(plugins.standaloneTargets ?? []);
  // The core desktop packager makes the default host target distributable as well as runnable.
  const options = [valueOf('host')];
  // Browser is a Develop-only local preview. Build lists only package-capable targets.
  if (standaloneTargets.has('webxr') && surface !== 'build') options.push(valueOf('webxr'));
  const labels = { 'host:': 'Desktop', 'webxr:': 'Browser' };
  for (const [target, names] of [['host', host], ['webxr', webxr]]) {
    for (const name of [...names].sort()) {
      if (disabled.has(name)) continue;
      const value = valueOf(target, name);
      options.push(value);
      labels[value] = label(name) + (host.has(name) && webxr.has(name) ? ` (${target === 'host' ? 'Desktop' : 'WebXR'})` : '');
    }
  }
  const target = manifest.target === 'webxr' ? 'webxr' : 'host';
  const name = disabled.has(manifest.platform) ? '' : manifest.platform ?? '';
  const selected = valueOf(target, name);
  let warning = '';
  if (!options.includes(selected)) {
    if (name) {
      const other = target === 'host' ? webxr : host;
      warning = other.has(name) ? `${label(name)} requires ${target === 'host' ? 'WebXR' : 'Desktop'}` : `${label(name)} unavailable`;
      labels[selected] = `${label(name)} (unavailable)`;
    } else {
      warning = `${labels[selected] ?? target} unavailable`;
      labels[selected] = `${labels[selected] ?? target} (unavailable)`;
    }
    if (surface === 'all') options.push(selected); // The unfiltered editor keeps unavailable identities readable.
  }
  return { options, labels, selected, warning };
}

export function selectPlatform(manifest, choice) {
  const match = /^(host|webxr):([a-z0-9-]*)$/.exec(choice);
  if (!match) throw new Error('Invalid platform choice');
  const next = { ...manifest, platform: match[2] || undefined, target: match[1] === 'webxr' ? 'webxr' : undefined };
  if (!next.platform) delete next.platform;
  if (!next.target) delete next.target;
  return next;
}

/** The platform tab a manifest selects ("host:", "host:<platform>", "webxr:", "webxr:<platform>"). */
export const platformChoiceOf = (manifest) => valueOf(manifest?.target === 'webxr' ? 'webxr' : 'host', manifest?.platform ?? '');

/** A platform tab's own run settings: display, input(s) and the desktop monitor. */
function runSettingsOf(manifest) {
  const settings = { display: manifest.display, input: manifest.input, inputs: manifest.inputs, monitor: manifest.plugins?.desktop?.monitor };
  for (const key of Object.keys(settings)) if (settings[key] === undefined) delete settings[key];
  return structuredClone(settings);
}

function applyRunSettings(manifest, settings) {
  for (const key of ['display', 'input', 'inputs']) {
    if (settings[key] === undefined) delete manifest[key];
    else manifest[key] = structuredClone(settings[key]);
  }
  if (settings.monitor !== undefined) manifest.plugins = { ...manifest.plugins, desktop: { ...manifest.plugins?.desktop, monitor: settings.monitor } };
}

/**
 * Switching platform tab keeps each tab's Display and Input: the previous tab's settings are saved under
 * `platformSettings`, and the chosen tab's come back (a tab never used starts from the current settings).
 */
export function switchRunSettings(previous, next, choice) {
  const settings = { ...(previous.platformSettings ?? {}), [platformChoiceOf(previous)]: runSettingsOf(previous) };
  if (settings[choice]) applyRunSettings(next, settings[choice]);
  next.platformSettings = settings;
  return next;
}
