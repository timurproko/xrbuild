// The project list's sections, arranged by the developer (create, rename, delete, drag projects
// between them). Sections are folders: projects/<section>/<project> in the workspace; projects in no
// section are in projects/Unsorted/ and show under "Unsorted". xrb-panel.json in the workspace keeps only
// what folders cannot: the order of sections and projects, colours, and where archived projects came from.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE, discoverProjects, liveId, moveProject, PROJECTS, removeIfEmpty, sectionFolders, sectionNameProblem, UNSORTED, type Project } from './projects.ts';

export const LAYOUT_FILE = 'xrb-panel.json';

export interface Section {
  name: string;
  /** project ids (folder names) in display order */
  items: string[];
  /** set by the UI on a rename: the section's previous name (its folder is renamed, with everything in it) */
  from?: string;
}

/** Stripe colours a project can be given from the list's right-click menu. */
export const COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'teal', 'grey'] as const;

export interface Layout {
  /** the section folders except Unsorted, in display order */
  sections: Section[];
  /** project id (live form) -> one of COLORS; projects without one keep their kind's colour */
  colors?: Record<string, string>;
  /** archived project id (live form) -> the section it was archived from */
  archivedFrom?: Record<string, string>;
  /** the order of the platform tabs (choice values like "host:" or "webxr:<name>"), arranged by dragging */
  platformOrder?: string[];
}

/** Checks a layout from the UI; returns the problem or null. */
export function validateLayout(l: unknown): string | null {
  if (!l || typeof l !== 'object' || !Array.isArray((l as Layout).sections)) return 'layout must have a sections list';
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const s of (l as Layout).sections) {
    if (!s || typeof s.name !== 'string' || !s.name.trim()) return 'every section needs a name';
    if (s.name.length > 60) return `section name "${s.name.slice(0, 20)}…" is too long`;
    const problem = sectionNameProblem(s.name.trim());
    if (problem) return problem;
    const key = s.name.trim().toLowerCase();
    if (names.has(key)) return `there are two sections named "${s.name.trim()}"`;
    names.add(key);
    if (!Array.isArray(s.items) || s.items.some((i) => typeof i !== 'string')) return `section "${s.name}" has a bad item list`;
    if (s.from !== undefined && (typeof s.from !== 'string' || !s.from.trim())) return `section "${s.name}" has a bad previous name`;
    for (const i of s.items) {
      if (seen.has(i)) return `${i} is in two sections`;
      seen.add(i);
    }
  }
  const order = (l as Layout).platformOrder;
  if (order !== undefined && (!Array.isArray(order) || order.some((v) => typeof v !== 'string' || v.length > 80))) return 'platformOrder must be a list of platform choices';
  const colors = (l as Layout).colors;
  if (colors !== undefined) {
    if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return 'colors must be an object';
    for (const [id, c] of Object.entries(colors)) if (!(COLORS as readonly string[]).includes(c)) return `unknown colour "${c}" for ${id}`;
  }
  return null;
}

async function readSaved(ws: string): Promise<Layout> {
  try {
    const l = JSON.parse((await fs.readFile(path.join(ws, LAYOUT_FILE), 'utf8')).replace(/^﻿/, '')) as Layout;
    if (l && Array.isArray(l.sections)) return { sections: l.sections, colors: { ...(l.colors ?? {}) }, archivedFrom: { ...(l.archivedFrom ?? {}) }, platformOrder: Array.isArray(l.platformOrder) ? l.platformOrder : undefined };
  } catch { /* no layout yet, or unreadable */ }
  return { sections: [], colors: {}, archivedFrom: {} };
}

async function save(ws: string, l: Layout): Promise<void> {
  const clean: Layout = { sections: l.sections.map((s) => ({ name: s.name.trim(), items: s.items })), colors: l.colors ?? {}, archivedFrom: l.archivedFrom ?? {}, ...(l.platformOrder?.length ? { platformOrder: l.platformOrder } : {}) };
  await fs.writeFile(path.join(ws, LAYOUT_FILE), JSON.stringify(clean, null, 2) + '\n', 'utf8');
}

/** Orders `names` like `order` (known ones first, in that order), the rest alphabetically after them. */
function ordered(names: string[], order: string[]): string[] {
  const rank = new Map(order.map((n, i) => [n.toLowerCase(), i]));
  return [...names].sort((a, b) => (rank.get(a.toLowerCase()) ?? 1e9) - (rank.get(b.toLowerCase()) ?? 1e9) || a.localeCompare(b));
}

/**
 * The layout as the folders are: one section per section folder (Unsorted excluded: its projects show as
 * "Unsorted"), with the saved order of sections and projects, colours and archive origins.
 */
export async function readLayout(ws: string, live: Project[]): Promise<Layout> {
  const saved = await readSaved(ws);
  const occupied = new Set(live.map((project) => project.section?.toLowerCase()).filter((name): name is string => !!name));
  const savedNames = new Set(saved.sections.map((section) => section.name.toLowerCase()));
  const folders = (await sectionFolders(ws)).filter((folder) => folder !== UNSORTED
    && (occupied.has(folder.toLowerCase()) || savedNames.has(folder.toLowerCase())));
  const sections = ordered(folders, saved.sections.map((s) => s.name)).map((name) => {
    const items = live.filter((p) => p.section === name).map((p) => p.id);
    const savedItems = saved.sections.find((s) => s.name.toLowerCase() === name.toLowerCase())?.items ?? [];
    return { name, items: ordered(items, savedItems) };
  });
  return { sections, colors: saved.colors, archivedFrom: saved.archivedFrom, platformOrder: saved.platformOrder };
}

/**
 * Applies a layout from the UI to the folders: renames the folder of a renamed section (`from`), creates new
 * section folders, moves each live project into the folder of the section that lists it (Unsorted when none
 * does), and removes the folders of deleted sections (left-over files go to the Recycle Bin). Then saves the
 * order and colours.
 */
export async function applyLayout(ws: string, l: Layout, live: Project[], recycle: (dir: string) => Promise<void> = recycleFolder): Promise<void> {
  const saved = await readSaved(ws);
  // Section folders are lower case: a name with capitals is saved lower case, and its folder renamed to match.
  l = { ...l, sections: l.sections.map((s) => {
    const name = s.name.trim().toLowerCase();
    return name === s.name.trim() ? s : { ...s, name, from: s.from ?? s.name.trim() };
  }) };
  // A section that held projects disappears when this layout moves all of them elsewhere. A deliberately created
  // empty section has no occupied source and remains available as a drop target.
  const occupiedBefore = new Set(live.map((project) => project.section?.toLowerCase()).filter((name): name is string => !!name));
  l.sections = l.sections.filter((section) => section.items.length > 0
    || !occupiedBefore.has((section.from ?? section.name).trim().toLowerCase()));
  // A rename moves the whole folder (projects and any other files in it), unless the new name's folder exists.
  let renamed = false;
  for (const s of l.sections) {
    const from = s.from?.trim();
    if (!from || from === s.name.trim()) continue;
    const src = path.join(ws, PROJECTS, from);
    const dst = path.join(ws, PROJECTS, s.name.trim());
    const caseOnly = from.toLowerCase() === s.name.trim().toLowerCase();
    if (!existsSync(src) || (!caseOnly && existsSync(dst))) continue;
    await fs.rename(src, dst);
    renamed = true;
  }
  if (renamed) live = await discoverProjects(ws);
  const sectionOf = new Map<string, string>();
  for (const s of l.sections) for (const id of s.items) sectionOf.set(id, s.name.trim());
  for (const s of l.sections) {
    const dir = path.join(ws, PROJECTS, s.name.trim());
    await fs.mkdir(dir, { recursive: true });
    // An empty section folder stays in git only with a file in it.
    if (!(await fs.readdir(dir)).length) await fs.writeFile(path.join(dir, '.gitkeep'), '');
  }
  for (const p of live) {
    const want = sectionOf.get(p.id) ?? UNSORTED;
    if (p.section !== want) await moveProject(ws, p, want);
  }
  const keep = new Set([...l.sections.map((s) => s.name.trim().toLowerCase()), UNSORTED.toLowerCase()]);
  for (const f of await sectionFolders(ws)) {
    if (keep.has(f.toLowerCase())) continue;
    // A deleted section: its projects moved to Unsorted above; other files in it (a README) go to the Recycle Bin.
    const dir = path.join(ws, PROJECTS, f);
    await removeIfEmpty(dir);
    if (existsSync(dir)) await recycle(dir);
  }
  await removeIfEmpty(path.join(ws, PROJECTS, UNSORTED));
  await save(ws, { sections: l.sections, colors: l.colors ?? saved.colors, archivedFrom: saved.archivedFrom, platformOrder: l.platformOrder ?? saved.platformOrder });
}

/** Archives a live project into projects/archive/, remembering its section for unarchive. */
export async function archiveProject(ws: string, p: Project): Promise<string> {
  const to = await moveProject(ws, p, ARCHIVE);
  const saved = await readSaved(ws);
  saved.archivedFrom = { ...saved.archivedFrom, [p.id]: p.section ?? UNSORTED };
  await pruneEmptySection(ws, p.section, saved);
  await save(ws, saved);
  return to;
}

async function pruneEmptySection(ws: string, section: string | null, saved: Layout): Promise<boolean> {
  if (!section || section.toLowerCase() === UNSORTED.toLowerCase() || section.toLowerCase() === ARCHIVE) return false;
  if ((await discoverProjects(ws)).some((project) => project.section?.toLowerCase() === section.toLowerCase())) return false;
  const dir = path.join(ws, PROJECTS, section);
  await removeIfEmpty(dir);
  if (existsSync(dir)) return false;
  const before = saved.sections.length;
  saved.sections = saved.sections.filter((item) => item.name.toLowerCase() !== section.toLowerCase());
  return saved.sections.length !== before;
}

/** Removes saved layout state after an external lifecycle action deleted a section's final project. */
export async function removeEmptyProjectSection(ws: string, section: string | null): Promise<boolean> {
  const saved = await readSaved(ws);
  const removed = await pruneEmptySection(ws, section, saved);
  if (removed) await save(ws, saved);
  return removed;
}

/** Moves an archived project back into the section it came from (Unsorted when that is gone or unknown). */
export async function unarchiveProject(ws: string, p: Project): Promise<string> {
  const id = liveId(p.id);
  const saved = await readSaved(ws);
  const from = saved.archivedFrom?.[id];
  const sections = await sectionFolders(ws);
  // Matched without case: a section's folder may have been renamed to lower case since the project was archived.
  const back = from ? sections.find((s) => s.toLowerCase() === from.toLowerCase()) : undefined;
  const to = await moveProject(ws, p, back ?? UNSORTED);
  delete saved.archivedFrom?.[id];
  await save(ws, saved);
  return to;
}

/** Moves a folder to the Recycle Bin (recycle.ps1), so a deleted section's leftover files can be restored. */
export function recycleFolder(dir: string): Promise<void> {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'recycle.ps1');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Path', dir],
      { windowsHide: true }, (err, _out, stderr) => (err ? reject(new Error(`could not move ${path.basename(dir)} to the Recycle Bin: ${stderr.trim() || err.message}`)) : resolve()));
  });
}
