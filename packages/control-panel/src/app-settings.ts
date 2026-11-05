import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isCursorStyle, resolveCursorStyle, type CursorStyle } from '../../sdk/src/cursor-style.ts';

export interface AppSettings { cursor: CursorStyle }
const file = (workspace: string) => path.join(workspace, '.xrb', 'app-settings.json');
async function readRaw(workspace: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await fs.readFile(file(workspace), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return {};
  }
}
export async function readAppSettings(workspace: string): Promise<AppSettings> {
  return { cursor: resolveCursorStyle((await readRaw(workspace)).cursor) };
}
export async function saveAppSettings(workspace: string, value: unknown): Promise<AppSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isCursorStyle((value as AppSettings).cursor)
    || Object.keys(value).some(key => key !== 'cursor')) throw new Error('cursor must be system, ring, or ring-dot');
  const settings = { cursor: (value as AppSettings).cursor };
  const destination = file(workspace), temporary = `${destination}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.writeFile(temporary, JSON.stringify({ ...await readRaw(workspace), ...settings }, null, 2) + '\n');
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, { force: true }); }
  return settings;
}
