import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultIcon, type IconColor, type IconShape } from '../../app-icon/src/icon.ts';

export const APP_FAVICON_FILE = 'xrb-app-icon.png';
const LINK_TAG = /<link\b[^>]*>/gi;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export interface BrowserBuildIcon {
  file?: string;
  color?: IconColor;
  shape?: IconShape;
  /** Optional launcher card copy from the manifest; stamped into the page unless the app authored its own description. */
  description?: string;
}

export interface BrowserBuildFinalization {
  changed: boolean;
  htmlChanged: boolean;
  iconChanged: boolean;
  href: string;
}

function attribute(tag: string, name: string): string | null {
  ATTRIBUTE.lastIndex = 0;
  for (let match = ATTRIBUTE.exec(tag); match; match = ATTRIBUTE.exec(tag)) {
    if (match[1]?.toLowerCase() === name) return match[2] ?? match[3] ?? match[4] ?? '';
  }
  return null;
}

function isPageFavicon(tag: string): boolean {
  return attribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('icon') ?? false;
}

function insertHeadTag(html: string, tag: string): string {
  const closingHead = /<\/head\s*>/i.exec(html);
  if (closingHead?.index !== undefined) {
    const lineStart = html.lastIndexOf('\n', closingHead.index - 1) + 1;
    const beforeClosingTag = html.slice(lineStart, closingHead.index);
    if (/^[\t ]*$/.test(beforeClosingTag)) {
      return `${html.slice(0, lineStart)}${beforeClosingTag}  ${tag}\n${html.slice(lineStart)}`;
    }
    return `${html.slice(0, closingHead.index)}\n  ${tag}\n${html.slice(closingHead.index)}`;
  }
  const openingHead = /<head\b[^>]*>/i.exec(html);
  if (openingHead?.index !== undefined) {
    const at = openingHead.index + openingHead[0].length;
    return `${html.slice(0, at)}\n  ${tag}${html.slice(at)}`;
  }
  const head = `<head>\n  ${tag}\n</head>`;
  const openingHtml = /<html\b[^>]*>/i.exec(html);
  if (openingHtml?.index !== undefined) {
    const at = openingHtml.index + openingHtml[0].length;
    return `${html.slice(0, at)}\n${head}${html.slice(at)}`;
  }
  const doctype = /<!doctype\b[^>]*>/i.exec(html);
  if (doctype?.index !== undefined) {
    const at = doctype.index + doctype[0].length;
    return `${html.slice(0, at)}\n${head}${html.slice(at)}`;
  }
  return `${head}\n${html}`;
}

function reconcileFavicon(html: string, tag: string): string {
  const faviconTags = [...html.matchAll(LINK_TAG)].filter((match) => isPageFavicon(match[0]));
  if (!faviconTags.length) return insertHeadTag(html, tag);
  let kept = false;
  return html.replace(LINK_TAG, (candidate) => {
    if (!isPageFavicon(candidate)) return candidate;
    if (kept) return '';
    kept = true;
    return tag;
  });
}

async function readProjectIcon(icon: BrowserBuildIcon): Promise<{ image: Buffer; custom: boolean }> {
  if (icon.file) {
    try {
      return { image: await fs.readFile(icon.file), custom: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { image: defaultIcon(256, icon.color, icon.shape), custom: false };
}

const META_TAG = /<meta\b[^>]*>/gi;
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Replaces the first meta tag the matcher accepts (dropping duplicates) with `tag`, inserts it when none exists, or removes them when `tag` is null. */
function reconcileMeta(html: string, matches: (tag: string) => boolean, tag: string | null): string {
  let kept = false;
  const next = html.replace(META_TAG, (candidate) => {
    if (!matches(candidate)) return candidate;
    if (kept || tag === null) return '';
    kept = true;
    return tag;
  });
  return kept || tag === null ? next : insertHeadTag(next, tag);
}

async function writeChanged(file: string, body: string | Buffer): Promise<boolean> {
  const current = await fs.readFile(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const next = typeof body === 'string' ? Buffer.from(body) : body;
  if (current?.equals(next)) return false;
  await fs.writeFile(file, next);
  return true;
}

/** Adds the manifest project icon to a completed browser build without changing project source files. */
export async function finalizeBrowserBuild(entry: string, icon: BrowserBuildIcon): Promise<BrowserBuildFinalization> {
  const indexFile = path.join(entry, 'index.html');
  const iconFile = path.join(entry, APP_FAVICON_FILE);
  const { image, custom } = await readProjectIcon(icon);
  const digest = createHash('sha256').update(image).digest('hex').slice(0, 12);
  const href = `./${APP_FAVICON_FILE}?v=${digest}`;
  const faviconTag = `<link rel="icon" type="image/png" href="${href}" data-xrb-app-icon>`;
  // Card metadata for launchers, so a published card renders like the local one: whether the icon is the generated
  // default (its colour and shape), whether the build ships a 3D icon, and the manifest's card copy.
  const hasModel = await fs.access(path.join(entry, 'icon.js')).then(() => true, () => false);
  const cardTag = `<meta name="xrb-app-card" content="${custom ? 'custom' : 'default'}" data-color="${escapeAttribute(icon.color ?? 'blue')}" data-shape="${escapeAttribute(icon.shape ?? 'sphere')}" data-model="${hasModel ? '1' : '0'}">`;
  const html = await fs.readFile(indexFile, 'utf8');
  let nextHtml = reconcileFavicon(html, faviconTag);
  nextHtml = reconcileMeta(nextHtml, (tag) => attribute(tag, 'name')?.toLowerCase() === 'xrb-app-card', cardTag);
  const authoredDescription = [...nextHtml.matchAll(META_TAG)].some((match) => attribute(match[0], 'name')?.toLowerCase() === 'description' && attribute(match[0], 'data-xrb-description') === null);
  const description = icon.description?.trim();
  nextHtml = reconcileMeta(nextHtml, (tag) => attribute(tag, 'data-xrb-description') !== null,
    description && !authoredDescription ? `<meta name="description" content="${escapeAttribute(description)}" data-xrb-description>` : null);
  const [iconChanged, htmlChanged] = await Promise.all([
    writeChanged(iconFile, image),
    nextHtml === html ? false : fs.writeFile(indexFile, nextHtml).then(() => true),
  ]);
  return { changed: iconChanged || htmlChanged, htmlChanged, iconChanged, href };
}
