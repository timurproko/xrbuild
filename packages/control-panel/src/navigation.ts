import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePluginCatalog } from './extension-catalog.ts';

export const TOOLS_FILE = 'xrb-tools.json';
const ID = /^[a-z][a-z0-9-]{0,47}$/;
const MANAGED_ROUTE = /^\/(?:[a-z][a-z0-9-]*\/)+$/;
const ENDPOINT = /^\/{1}__[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*\/?$/;
const MODULE = /^(?:[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*\.mjs|#[a-z][a-z0-9-]{0,47})$/;
const RESERVED_IDS = new Set(['projects', 'plugins', 'settings', 'rebuild', 'restart', 'design-system']);
const RESERVED_PATHS = ['/api/', '/plugins/', '/settings/', '/preview/', '/vendor/', '/sdk/', '/design-system/', '/design/'];

interface ToolBase { id: string; label: string }
export interface ExternalToolLink extends ToolBase { url: string; passPanelOrigin?: boolean }
export interface ManagedToolLink extends ToolBase { route: string; module: string; endpoints: string[]; aliases?: string[]; owner?: { key: string; root: string; module: string } }
export type ToolLink = ExternalToolLink | ManagedToolLink;
export const isManagedTool = (tool: ToolLink): tool is ManagedToolLink => 'route' in tool;

const overlaps = (a: string, b: string) => a === b || a.startsWith(b) || b.startsWith(a);
const validatePathOwnership = (paths: string[], source: string) => {
  for (const value of paths) if (RESERVED_PATHS.some((reserved) => overlaps(value, reserved))) throw new Error(`${source}: tool routes must not overlap panel routes`);
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++)
    if (overlaps(paths[i], paths[j])) throw new Error(`${source}: tool routes must be distinct and non-overlapping`);
};

function validateItems(tools: unknown[], source: string, modulePrefix = '', managedOnly = false): ToolLink[] {
  if (tools.length > 12) throw new Error(`${source}: at most 12 tools are supported`);
  const ids = new Set<string>(), ownedPaths: string[] = [];
  const result = tools.map((item): ToolLink => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${source}: invalid tool`);
    const tool = item as Record<string, unknown>;
    if (typeof tool.id !== 'string' || !ID.test(tool.id) || ids.has(tool.id) || RESERVED_IDS.has(tool.id))
      throw new Error(`${source}: tool IDs must be distinct lower-case names`);
    if (typeof tool.label !== 'string' || !tool.label.trim() || tool.label.length > 60 || /[\x00-\x1f\x7f]/.test(tool.label))
      throw new Error(`${source}: invalid tool label`);
    const hasUrl = tool.url !== undefined, hasManaged = tool.route !== undefined || tool.module !== undefined || tool.endpoints !== undefined || tool.aliases !== undefined;
    if (hasUrl === hasManaged || managedOnly && hasUrl) throw new Error(`${source}: each tool must define ${managedOnly ? 'a managed route/module' : 'either url or route/module'}`);
    ids.add(tool.id);
    const base = { id: tool.id, label: tool.label.trim() };
    if (hasUrl) {
      if (typeof tool.url !== 'string' || tool.url.length > 512) throw new Error(`${source}: invalid tool URL`);
      let url: URL;
      try { url = new URL(tool.url); } catch { throw new Error(`${source}: invalid tool URL`); }
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.username || url.password || url.search || url.hash)
        throw new Error(`${source}: tool URLs must be HTTP loopback addresses with an explicit port and no credentials, query or fragment`);
      if (tool.passPanelOrigin !== undefined && typeof tool.passPanelOrigin !== 'boolean') throw new Error(`${source}: passPanelOrigin must be boolean`);
      return { ...base, url: url.href, ...(tool.passPanelOrigin === false ? { passPanelOrigin: false } : {}) };
    }
    if (typeof tool.route !== 'string' || !MANAGED_ROUTE.test(tool.route)) throw new Error(`${source}: managed tool route must be a lower-case absolute directory path`);
    if (typeof tool.module !== 'string' || !MODULE.test(tool.module) || tool.module.split('/').includes('..') || path.isAbsolute(tool.module))
      throw new Error(`${source}: managed tool module must be a contained .mjs path`);
    if (tool.module.startsWith('#') && !managedOnly) throw new Error(`${source}: component aliases require a plugin owner`);
    const module = modulePrefix ? `${modulePrefix}/${tool.module}` : tool.module;
    if (module.length > 256 || !MODULE.test(module)) throw new Error(`${source}: managed tool module path is too long`);
    const endpoints = tool.endpoints === undefined ? [] : tool.endpoints;
    if (!Array.isArray(endpoints) || endpoints.length > 8 || endpoints.some((entry) => typeof entry !== 'string' || !ENDPOINT.test(entry)))
      throw new Error(`${source}: managed tool endpoints must be bounded local path prefixes`);
    const distinct = [...new Set(endpoints as string[])];
    if (distinct.length !== endpoints.length) throw new Error(`${source}: managed tool endpoints must be distinct`);
    const aliases = tool.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.length > 8 || aliases.some(entry => typeof entry !== 'string' || entry.length > 128 || !MANAGED_ROUTE.test(entry)))
      throw new Error(`${source}: managed tool aliases must be bounded local directory paths`);
    ownedPaths.push(tool.route, ...distinct, ...aliases);
    return { ...base, route: tool.route, module, endpoints: distinct, ...(aliases.length ? {aliases: aliases as string[]} : {}) };
  });
  validatePathOwnership(ownedPaths, source);
  return result;
}

function validateInventory(tools: ToolLink[]): ToolLink[] {
  if (tools.length > 12) throw new Error('workspace tools: at most 12 combined tools are supported');
  const ids = new Set<string>();
  for (const tool of tools) { if (ids.has(tool.id)) throw new Error('workspace tools: tool IDs must be distinct across plugins and workspace configuration'); ids.add(tool.id); }
  validatePathOwnership(tools.flatMap((tool) => isManagedTool(tool) ? [tool.route, ...tool.endpoints, ...(tool.aliases ?? [])] : []), 'workspace tools');
  return tools;
}

export function validateToolLinks(value: unknown): ToolLink[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as { tools?: unknown }).tools))
    throw new Error(`${TOOLS_FILE}: tools must be a list`);
  return validateInventory(validateItems((value as { tools: unknown[] }).tools, TOOLS_FILE));
}

async function readWorkspaceTools(workspace: string): Promise<ToolLink[]> {
  let file;
  try { file = await fs.open(path.join(workspace, TOOLS_FILE), 'r'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  try {
    const bytes = Buffer.alloc(16 * 1024 + 1), { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 16 * 1024) throw new Error(`${TOOLS_FILE}: configuration exceeds 16 KiB`);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error(`${TOOLS_FILE}: invalid JSON`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray((parsed as {tools?:unknown}).tools)) throw new Error(`${TOOLS_FILE}: tools must be a list`);
    return validateItems((parsed as {tools:unknown[]}).tools,TOOLS_FILE);
  } finally { await file.close(); }
}

/** Read-only tool registration; process/device lifecycle remains in the panel's managed-tool service. */
export async function readToolLinks(workspace: string, core?: string): Promise<ToolLink[]> {
  const tools = await readWorkspaceTools(workspace), catalog = await resolvePluginCatalog(workspace, core);
  if (catalog.problems.length) throw new Error(catalog.problems.join('; '));
  for (const plugin of catalog.selected) {
    if (!plugin.meta.panelTools?.length) continue;
    const declarations = validateItems(plugin.meta.panelTools, `${plugin.key}: xrb-plugin.json`, '', true);
    tools.push(...declarations.map(tool => {
      if (!isManagedTool(tool)) return tool;
      return { ...tool, module: `plugins/${plugin.id}/${tool.module}`, owner: { key: plugin.key, root: plugin.sourceRoot, module: tool.module } };
    }));
  }
  return validateInventory(tools);
}
