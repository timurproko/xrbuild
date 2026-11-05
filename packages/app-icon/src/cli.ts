#!/usr/bin/env node
// app-icon render --app <dist> --out <icon.png> [--size 512] [--runtime <xrb-host Release dir>]
//   The app renders its own icon (SDK iconRender/iconReady) in xrb-host's hidden icon view.
// app-icon default-ico <out.ico>
//   The default icon as .ico, embedded in xrb-host.exe (native/host/src/app.ico). Regenerate it when
//   the default icon changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultIco } from './icon.ts';
import { renderIcon } from './render.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function args(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else out[a.slice(2)] = argv[++i] ?? '';
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'render') {
  const a = args(rest);
  const out = path.resolve(a.out ?? 'icon.png');
  try {
    await renderIcon({ app: a.app ?? '', out, size: a.size ? Number(a.size) : undefined, runtimeDir: path.resolve(a.runtime ?? path.join(REPO, 'native/host/build/Release')) });
  } catch (e) {
    console.error(`app-icon: ${(e as Error).message}`);
    process.exit(1);
  }
  console.log(`icon: ${out}`);
} else if (cmd === 'default-ico') {
  await fs.writeFile(path.resolve(rest[0] ?? 'app.ico'), defaultIco());
} else {
  console.log('usage: app-icon render --app <dist> --out <icon.png> [--size N] [--runtime <dir>] | app-icon default-ico <out.ico>');
  process.exit(cmd ? 1 : 0);
}
