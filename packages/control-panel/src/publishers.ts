import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { effectiveSettings } from './plugin-manager.ts';
import { containedModule, containedPath, pluginPackageDirs, pluginPreferenceValues, resolvePluginCatalog, type ResolvedPlugin } from './extension-catalog.ts';
import { resolvePluginModule } from './component-resolver.ts';
import { pluginServiceContext, type PluginServiceContext } from './plugin-service.ts';

export interface PublicationIdentity { id: string; slug: string }
/**
 * How a launcher presents an app: one contract for the panel's preview list and for every publisher's inventory,
 * so a card looks the same in Develop, on a local destination and on production without rebuilding the app.
 */
export interface PublicationCard {
  name: string;
  description: string;
  icon: {
    /** true: the generated default icon (the panel's sphere in `color`/`shape`); false: the project's own image */
    default: boolean;
    color: string;
    shape: string;
    /** whether the build ships a 3D icon (`icon.js`) a launcher can render */
    model: boolean;
  };
}
const CARD_TOKEN = /^[a-z][a-z0-9-]{0,31}$/;
/** A card as stored by a publisher, validated so a malformed inventory never reaches a launcher as truth. */
export function cardProblem(value: unknown): string | null {
  const card = value as Partial<PublicationCard> | null;
  if (!card || typeof card !== 'object') return 'card must be an object';
  if (typeof card.name !== 'string' || !card.name.trim() || card.name.length > 120) return 'card.name must be a short non-empty string';
  if (typeof card.description !== 'string' || card.description.length > 400) return 'card.description must be a string of at most 400 characters';
  const icon = card.icon as Partial<PublicationCard['icon']> | undefined;
  if (!icon || typeof icon !== 'object' || typeof icon.default !== 'boolean' || typeof icon.model !== 'boolean'
    || typeof icon.color !== 'string' || !CARD_TOKEN.test(icon.color) || typeof icon.shape !== 'string' || !CARD_TOKEN.test(icon.shape)) return 'card.icon must name default, model, color and shape';
  return null;
}
export interface PublisherError { field: string; message: string }
export interface PublisherStatus {
  /** `checking`: set by the panel while a publisher's first status is still being read */
  state: 'unpublished' | 'pending' | 'published' | 'failed' | 'unavailable' | 'checking';
  selectedUrl: string;
  deployedUrl?: string;
  deployedSlug?: string;
  publishedMs?: number;
  operation?: string;
  error?: string;
  link?: string;
  associations?: number;
}
export interface PublisherResult { url?: string; link?: string }
/** One immutable retained release of a publication at a publisher. */
export interface PublisherRelease {
  /** Publisher-issued opaque ID: never a path or a URL for the caller. */
  releaseId: string;
  /** Stable three-part semantic version; null for a captured legacy (unversioned) deployment. */
  version: string | null;
  /** Content digest of the retained output. */
  digest: string;
  createdMs: number;
  /** Public HTTPS URL where the retained output can be previewed without deploying it, when the publisher serves archives. */
  url?: string;
}
export interface PublisherReleaseCatalog {
  /** Precondition token for this identity's release decision; changes whenever the catalog or its decision changes. */
  revision: string;
  releases: PublisherRelease[];
  /** The release the latest decision asked to deploy, or null without a versioned decision. */
  requestedReleaseId: string | null;
  /** The release verified live at the canonical route, or null (unpublished, unverified or legacy). */
  liveReleaseId: string | null;
  /** True when a verified deployment exists at the route that no retained release describes (legacy, unversioned). */
  legacyLive: boolean;
}
export interface PublisherReleaseResult extends PublisherResult { releaseId: string; version: string | null }
/** Optional complete versioned-release capability of a publisher. */
export interface PublisherReleases {
  /** Read-only: never migrates or writes remote state. */
  catalog(publication: PublicationIdentity): Promise<PublisherReleaseCatalog>;
  /** Version-aware publish of a verified build at the canonical route, retaining previous releases. */
  publish(o: { app: string; publication: PublicationIdentity; version: string; expectedRevision: string | null; card?: PublicationCard; log(message: string): void }): Promise<PublisherReleaseResult>;
  /** Deploys the exact retained bytes of an owned release at the canonical route; never rebuilds. The card is the current manifest's. */
  activate(o: { publication: PublicationIdentity; releaseId: string; expectedRevision: string | null; card?: PublicationCard; log(message: string): void }): Promise<PublisherReleaseResult>;
  /** Removes an owned retained release that is neither live nor requested, with its archive; never touches the live route. */
  delete(o: { publication: PublicationIdentity; releaseId: string; expectedRevision: string | null; log(message: string): void }): Promise<PublisherResult>;
}
export interface Publisher {
  /** Stable manifest identifier. */
  name: string;
  /** Optional user-facing name. */
  label?: string;
  origin: string;
  routePrefix?: string;
  validate(publication: PublicationIdentity): PublisherError[];
  status(publication: PublicationIdentity): Promise<PublisherStatus>;
  publish(o: { app: string; publication: PublicationIdentity; card?: PublicationCard; log(message: string): void }): Promise<PublisherResult>;
  unpublish(o: { publication: PublicationIdentity; log(message: string): void }): Promise<PublisherResult>;
  /** Complete versioned-release capability; a legacy publisher omits it and keeps Publish/Unpublish only. */
  releases?: PublisherReleases;
}
/** Why a declared release capability is incomplete, or null when absent or complete. */
export function releaseCapabilityProblem(value: unknown): string | null {
  const releases = (value as { releases?: unknown } | null)?.releases;
  if (releases === undefined) return null;
  if (!releases || typeof releases !== 'object') return 'releases must be an object with catalog, publish, activate and delete';
  const missing = ['catalog', 'publish', 'activate', 'delete'].filter((key) => typeof (releases as Record<string, unknown>)[key] !== 'function');
  return missing.length ? `releases capability is incomplete: missing ${missing.join(', ')}` : null;
}
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const releaseIdProblem = (value: unknown): string | null => typeof value === 'string' && RELEASE_ID.test(value) ? null : 'release ID must be a publisher-issued identifier';
/** A catalog as the publisher returned it, validated so a malformed provider answer never reaches the UI as truth. */
export function normalizeReleaseCatalog(value: unknown): PublisherReleaseCatalog {
  const c = value as Partial<PublisherReleaseCatalog> | null;
  if (!c || typeof c !== 'object' || typeof c.revision !== 'string' || !c.revision || !Array.isArray(c.releases)) throw new Error('release catalog is malformed');
  const releases = c.releases.map((item) => {
    const r = item as Partial<PublisherRelease>;
    if (!r || releaseIdProblem(r.releaseId) || (r.version !== null && r.version !== undefined && (typeof r.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.version)))
      || typeof r.digest !== 'string' || !/^[0-9a-f]{16,128}$/.test(r.digest) || !Number.isFinite(r.createdMs)
      || (r.url !== undefined && (typeof r.url !== 'string' || !/^https:\/\//.test(r.url)))) throw new Error('release catalog entry is malformed');
    return { releaseId: r.releaseId!, version: r.version ?? null, digest: r.digest, createdMs: r.createdMs!, ...(r.url ? { url: r.url } : {}) };
  });
  const ids = new Set(releases.map((r) => r.releaseId));
  if (ids.size !== releases.length) throw new Error('release catalog has duplicate release IDs');
  const ref = (id: unknown, what: string) => {
    if (id === null || id === undefined) return null;
    if (typeof id !== 'string' || !ids.has(id)) throw new Error(`release catalog ${what} names an unknown release`);
    return id;
  };
  return { revision: c.revision, releases, requestedReleaseId: ref(c.requestedReleaseId, 'request'), liveReleaseId: ref(c.liveReleaseId, 'live release'), legacyLive: c.legacyLive === true };
}
export interface PublisherDiscovery { found: Array<{ publisher: Publisher; dir: string; plugin?: ResolvedPlugin }>; problems: string[] }
function isPublisherDeclaration(value: unknown): value is { module: string; setting?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.module === 'string' && (item.setting === undefined || typeof item.setting === 'string' && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(item.setting));
}
function isPublisher(value: unknown): value is Publisher {
  const p = value as Partial<Publisher> | null;
  if (!p || typeof p.name !== 'string' || !/^[a-z0-9-]+$/.test(p.name) || (p.label !== undefined && (typeof p.label !== 'string' || !p.label.trim())) || typeof p.origin !== 'string') return false;
  try {
    const origin = new URL(p.origin);
    if (origin.protocol !== 'https:' || origin.username || origin.password || (p.routePrefix !== undefined && !/^[a-z0-9-]+$/.test(p.routePrefix))) return false;
  } catch { return false; }
  return typeof p.validate === 'function' && typeof p.status === 'function' && typeof p.publish === 'function' && typeof p.unpublish === 'function';
}
export async function discoverPublishers(workspace: string, core?: string): Promise<PublisherDiscovery> {
  const catalog = await resolvePluginCatalog(workspace, core);
  const found: PublisherDiscovery['found'] = [], problems = [...catalog.problems], prefs = catalog.prefs;
  const candidates = (await Promise.all(catalog.selected.map(async plugin => (await pluginPackageDirs(plugin)).map(dir => ({ plugin, dir }))))).flat();
  const conflicts = new Set<string>();
  for (const { plugin, dir } of candidates) {
    let config: { publisher?: unknown; publishers?: unknown };
    try { config = (JSON.parse(await fs.readFile(await containedPath(dir, 'package.json'), 'utf8')) as { xrBuild?: { publisher?: unknown; publishers?: unknown } }).xrBuild ?? {}; }
    catch { continue; }
    if (config.publisher === undefined && config.publishers === undefined) continue;
    const where = `${plugin.origin}:${path.relative(plugin.workspaceRoot, dir)}`;
    if (config.publisher !== undefined && config.publishers !== undefined) { problems.push(`${where}: declare publisher or publishers, not both`); continue; }
    let declarations: Array<{ module: string; setting?: string }>;
    if (config.publisher !== undefined) {
      if (typeof config.publisher !== 'string') { problems.push(`${where}: xrBuild.publisher must be a module path`); continue; }
      declarations = [{ module: config.publisher }];
    } else if (!Array.isArray(config.publishers) || !config.publishers.length || config.publishers.length > 8 || !config.publishers.every(isPublisherDeclaration)) {
      problems.push(`${where}: xrBuild.publishers must contain 1–8 {module, setting?} entries`); continue;
    } else declarations = config.publishers;
    const settings = effectiveSettings(plugin.meta.settings ?? [], pluginPreferenceValues(plugin, prefs));
    for (const declaration of declarations) {
      if (declaration.setting && settings[declaration.setting] === false) continue;
      try {
        const resolved = await resolvePluginModule(plugin, dir, declaration.module, workspace, core, catalog), file = resolved.file;
        const mod = await import(pathToFileURL(file).href) as { publisher?: unknown; default?: unknown; createPublisher?: (context: PluginServiceContext) => unknown };
        if (plugin.meta.config !== undefined && typeof mod.createPublisher !== 'function') throw new Error('a publisher with user config must export createPublisher(context)');
        const legacy = mod.publisher ?? mod.default;
        const useFactory = plugin.meta.config !== undefined || legacy === undefined;
        const publisher = useFactory && typeof mod.createPublisher === 'function' ? await mod.createPublisher(await pluginServiceContext(plugin, workspace, core, resolved.runtimeRoot)) : legacy;
        if (!isPublisher(publisher)) throw new Error('the module does not export a publisher (name, HTTPS origin, validate, status, publish, unpublish)');
        const capability = releaseCapabilityProblem(publisher);
        if (capability) throw new Error(`${publisher.name}: ${capability}`);
        if (found.some((item) => item.publisher.name === publisher.name) || conflicts.has(publisher.name)) {
          conflicts.add(publisher.name);
          throw new Error(`conflicting publishers named "${publisher.name}": all implementations are unavailable`);
        }
        found.push({ publisher, dir, plugin });
      } catch (error) { problems.push(`${where}: ${(error as Error).message}`); }
    }
  }
  return { found: found.filter(item => !conflicts.has(item.publisher.name)), problems };
}
export const publisherFor = (discovery: PublisherDiscovery, name: string) => discovery.found.find((item) => item.publisher.name === name) ?? null;
export function publicationUrl(publisher: Pick<Publisher, 'origin' | 'routePrefix'>, slug: string): string {
  const prefix = `/${(publisher.routePrefix ?? 'apps').replace(/^\/+|\/+$/g, '')}/`;
  return new URL(`${prefix}${slug ? `${slug}/` : ''}`, publisher.origin.endsWith('/') ? publisher.origin : `${publisher.origin}/`).href;
}
