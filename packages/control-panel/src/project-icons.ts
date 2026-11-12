import fs from 'node:fs/promises';
import path from 'node:path';
import { projectFile } from './embedded-projects.ts';
import type { Project } from './projects.ts';

/** Read-only source hints; discovery never prepares output or installs packages. */
export async function projectIconSource(core: string, p: Project) {
  const read = (relative: string) => projectFile(p, relative).then(file => fs.readFile(file, 'utf8'), () => null);
  const source = await read('src/icon.js');
  if (source === null) return { authored: await read('src/icon.ts') !== null, generated: false };
  const normalize = (text: string) => text.replaceAll('\r\n', '\n');
  const same = async (relative: string, actual?: string) => {
    try {
      const expected = await fs.readFile(path.join(core, 'templates/app', relative), 'utf8');
      const value = actual ?? await fs.readFile(await projectFile(p, relative), 'utf8');
      return normalize(value) === normalize(expected);
    } catch { return false; }
  };
  return { authored: true, generated: !p.manifest?.icon && await same('src/icon.js', source) && await same('src/icon-theme.js') };
}
