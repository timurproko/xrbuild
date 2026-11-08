const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERIC_TITLES = new Set(['xrbuild', 'xr build', 'app']);
const FALLBACK_DESCRIPTIONS = {
  'ui-kit': 'Library of spatial UI controls.',
};

/** The launcher card a publisher records with a deployment: the same contract the panel's preview list carries. */
export function validCard(card) {
  return !!card && typeof card === 'object'
    && typeof card.name === 'string' && !!card.name.trim()
    && typeof card.description === 'string'
    && !!card.icon && typeof card.icon === 'object' && typeof card.icon.default === 'boolean' && typeof card.icon.model === 'boolean'
    && typeof card.icon.color === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(card.icon.color);
}

function assertString(value, message) {
  if (typeof value !== 'string' || !value) throw new Error(message);
  return value;
}

export function titleFromSlug(slug) {
  return slug.split('-').map((word) => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
}

export function normalizeInventory(value) {
  if (value?.version !== 1 || !Array.isArray(value.publications)) throw new Error('The publication inventory has an unsupported format.');
  const seenIds = new Set();
  const seenSlugs = new Set();
  const publications = value.publications.map((item) => {
    const id = assertString(item?.id, 'A publication has no ID.');
    const slug = item?.slug;
    if (typeof slug !== 'string') throw new Error('A publication has no route.');
    if (slug && !SLUG.test(slug)) throw new Error(`The publication route "${slug}" is invalid.`);
    if (seenIds.has(id) || seenSlugs.has(slug)) throw new Error('The publication inventory contains duplicate entries.');
    if (!Number.isFinite(item.publishedMs)) throw new Error(`The publication "${slug}" has no publish date.`);
    seenIds.add(id);
    seenSlugs.add(slug);
    return { id, slug, publishedMs: item.publishedMs, ...(validCard(item.card) ? { card: item.card } : {}) };
  });
  return publications.sort((a, b) => b.publishedMs - a.publishedMs || a.slug.localeCompare(b.slug));
}

export function currentPublicationSlug(pathname) {
  return pathname.match(/\/apps\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?(?:$|[?#])/)?.[1] ?? null;
}

export function isLoopbackDevelopment(baseHref) {
  return /^(localhost|127\.0\.0\.1)$/.test(new URL(baseHref).hostname);
}

export function isPanelPreview(baseHref) {
  const url = new URL(baseHref);
  return isLoopbackDevelopment(url.href) && /^\/preview\/[^/]+(?:\/|$)/.test(url.pathname);
}

export function workspaceCatalogBase(runtimeHref) {
  try {
    const runtime = new URL(runtimeHref);
    const raw = runtime.searchParams.get('xrb-panel');
    if (!raw) return null;
    const panel = new URL(raw, runtime);
    if (!['http:', 'https:'].includes(panel.protocol) || !isLoopbackDevelopment(panel.href) || panel.username || panel.password) return null;
    panel.pathname = '/';
    panel.search = '';
    panel.hash = '';
    return panel.href;
  } catch {
    return null;
  }
}

/** A page served from a publisher's app route or release archive, on any host including a local test publisher. */
export function isPublishedHosting(href) {
  return /^\/(?:apps|releases|\.xrb-releases)(?:\/|$)/.test(new URL(href).pathname);
}

/** Published hosting lists its own inventory. External catalogs are explicit; no deployment origin is built in. */
export function catalogBaseHref(runtimeHref, configured) {
  if (configured) {
    const url = new URL(configured, runtimeHref);
    if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && isLoopbackDevelopment(url.href))) throw new Error('Catalog origin must be clean HTTPS or loopback HTTP.');
    return url.href;
  }
  return new URL(runtimeHref).href;
}

export function catalogEndpoints(baseHref) {
  const base = new URL(baseHref);
  return {
    inventory: new URL('/.xrb-publications.json', base),
    apps: new URL('/apps/', base),
  };
}

function cacheBusted(url, token) {
  const result = new URL(url);
  result.searchParams.set('xrb-launcher', token);
  return result;
}

function decodeHtml(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (_, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? _;
    const hex = entity[1].toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
}

export function titleFromHtml(html) {
  const title = html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeHtml(title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : null;
}

/** Card metadata the panel stamps into a finalized page: whether the icon is the generated default, its colour and whether the build ships a 3D icon. */
export function cardHintsFromHtml(html) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1].toLowerCase(), match[2]]));
    if (attributes.name?.toLowerCase() !== 'xrb-app-card') continue;
    return { defaultIcon: attributes.content === 'default', color: attributes['data-color'] || 'blue', model: attributes['data-model'] === '1' };
  }
  return null;
}

export function descriptionFromHtml(html) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1].toLowerCase(), match[2]]));
    if ((attributes.name ?? attributes.property)?.toLowerCase() === 'description') return decodeHtml(attributes.content ?? '').trim() || null;
  }
  return null;
}

async function optionalJson(fetchImpl, url, signal) {
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

async function optionalText(fetchImpl, url, signal) {
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

function safeIcon(route, manifest) {
  const fallback = new URL('xrb-app-icon.png', route).href;
  const source = manifest?.icons?.find((icon) => typeof icon?.src === 'string' && icon.src)?.src;
  if (!source) return fallback;
  const icon = new URL(source, route);
  return icon.origin === route.origin ? icon.href : fallback;
}

async function enrichPublication(publication, appsRoot, fetchImpl, signal, token) {
  const route = new URL(publication.slug ? `${publication.slug}/` : './', appsRoot);
  const [manifest, html] = await Promise.all([
    optionalJson(fetchImpl, cacheBusted(new URL('manifest.webmanifest', route), token), signal),
    optionalText(fetchImpl, cacheBusted(route, token), signal),
  ]);
  const manifestTitle = typeof manifest?.name === 'string' ? manifest.name.trim() : '';
  const documentTitle = html ? titleFromHtml(html) : null;
  const manifestDescription = typeof manifest?.description === 'string' ? manifest.description.trim() : '';
  const documentDescription = html ? descriptionFromHtml(html) : null;
  const genericManifest = GENERIC_TITLES.has(manifestTitle.toLowerCase());
  const title = (documentTitle && (!manifestTitle || genericManifest) ? documentTitle : manifestTitle)
    || documentTitle
    || titleFromSlug(publication.slug);
  const launch = new URL(route);
  launch.searchParams.set('xrb-xr', 'enter');
  // The card recorded with the deployment is the same contract the panel's preview list carries, so a published card
  // renders like the local one without rebuilding the app; pages published before cards exist fall back to their
  // stamped metadata, then to what the page itself says.
  const card = publication.card ?? null;
  const hints = card ? { defaultIcon: card.icon.default, color: card.icon.color, model: card.icon.model } : html ? cardHintsFromHtml(html) : null;
  return {
    ...publication,
    title: card?.name || title,
    description: card ? card.description : (manifestDescription || documentDescription || FALLBACK_DESCRIPTIONS[publication.slug] || ''),
    route: route.href,
    launchUrl: launch.href,
    iconUrl: safeIcon(route, manifest),
    defaultSphere: !!hints?.defaultIcon,
    defaultIcon3d: !!hints?.defaultIcon && !hints.model,
    iconColor: hints?.color ?? 'blue',
  };
}

/** Match the panel sidebar: saved sections and their item order first, then Unsorted projects. */
function orderedWorkspaceProjects(projects, layout) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const ordered = [], placed = new Set();
  for (const section of layout?.sections ?? []) for (const id of section.items ?? []) {
    const project = byId.get(id);
    if (!project || placed.has(id)) continue;
    placed.add(id);
    ordered.push(project);
  }
  ordered.push(...projects.filter((project) => !placed.has(project.id)));
  return ordered;
}

/** The panel preview is a workspace launcher: every active app appears whether or not it is published. */
export async function loadWorkspaceCatalog({ fetchImpl = fetch, baseHref, signal }) {
  const base = new URL(baseHref);
  const response = await fetchImpl(new URL('/api/projects', base), { signal });
  if (!response.ok) throw new Error(`Could not load workspace apps (${response.status}).`);
  const { projects, layout } = await response.json();
  if (!Array.isArray(projects)) throw new Error('The panel returned an invalid project list.');
  return orderedWorkspaceProjects(projects, layout).filter((project) => !project.archived && project.manifest?.kind === 'app'
    && (project.entryExists || project.manifest.scripts?.build))
    .map((project) => {
      const route = new URL(`/preview/${encodeURIComponent(project.id)}/`, base);
      const launch = new URL(route);
      launch.searchParams.set('xrb-xr', 'enter');
      // The panel's card is the same contract a publisher records with a deployment; older panels get it derived here.
      const card = validCard(project.card) ? project.card : {
        name: project.manifest.name,
        description: project.manifest.description || '',
        icon: { default: !project.manifest.icon, color: project.manifest.iconColor ?? 'blue', shape: project.manifest.iconShape ?? 'sphere', model: !!project.icon?.model },
      };
      return {
        id: project.manifest.publication?.id ?? project.id,
        slug: project.manifest.publication?.slug ?? project.id,
        title: card.name,
        description: card.description || FALLBACK_DESCRIPTIONS[project.id] || '',
        route: route.href,
        launchUrl: launch.href,
        iconUrl: new URL(`/api/projects/${encodeURIComponent(project.id)}/icon`, base).href,
        // A generated default icon keeps the compact sphere in the app colour; authored icons keep their own size.
        defaultSphere: card.icon.default,
        defaultIcon3d: card.icon.default && !card.icon.model,
        iconColor: card.icon.color,
        publishedMs: 0,
      };
    });
}

export function excludeCurrentPublication(catalog, currentHref, embeddedIdentity = {}) {
  const current = new URL(currentHref);
  const currentPath = current.pathname.replace(/\/$/, '');
  const previewKey = current.pathname.match(/^\/preview\/([^/]+)(?:\/|$)/)?.[1];
  let previewId = null;
  try { previewId = previewKey ? decodeURIComponent(previewKey) : null; } catch { /* not a valid catalog key */ }
  const publishedRoute = /^\/apps(?:\/|$)/.test(current.pathname);
  const embeddedId = !publishedRoute && typeof embeddedIdentity.id === 'string' ? embeddedIdentity.id : null;
  const currentSlug = currentPublicationSlug(current.pathname)
    ?? (!publishedRoute && !embeddedId && typeof embeddedIdentity.slug === 'string' ? embeddedIdentity.slug : null);
  return catalog.filter((app) => app.id !== previewId && app.id !== embeddedId && app.slug !== currentSlug
    && new URL(app.route).pathname.replace(/\/$/, '') !== currentPath);
}

export async function loadCatalog({ fetchImpl = fetch, baseHref, signal, token = String(Date.now()) }) {
  const endpoints = catalogEndpoints(baseHref);
  const response = await fetchImpl(cacheBusted(endpoints.inventory, token), { signal });
  // A publisher that has not written an inventory yet has published nothing: an empty library, not a failure.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Could not load the app library (${response.status}).`);
  const publications = normalizeInventory(await response.json());
  return Promise.all(publications.map((publication) => enrichPublication(publication, endpoints.apps, fetchImpl, signal, token)));
}
