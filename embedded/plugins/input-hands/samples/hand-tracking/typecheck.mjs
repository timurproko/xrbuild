// Resolve the core through XRB_CORE, just like Vite. Machine-specific config stays ignored.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {userPath} from './state-paths.mjs';
const core = process.env.XRB_CORE;
if (!core) throw new Error('XRB_CORE is required');
const root = path.dirname(fileURLToPath(import.meta.url));
const liveOnly = process.argv.includes('--live');
const config = userPath({core},'cacheRoot',liveOnly?'types/tsconfig-live.json':'types/tsconfig.json',true);
fs.mkdirSync(path.dirname(config), { recursive: true });
fs.writeFileSync(config, JSON.stringify({
  compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, resolveJsonModule: true,
    paths: { '@xr-build/sdk': [path.join(core, 'packages/sdk/src/index.ts')],
      '@xr-build/panel-navigation': [path.join(core, 'packages/control-panel/ui/navigation.d.ts')],
      '@xr-build/design-system': [path.join(core, 'packages/control-panel/ui/design-system.d.ts')],
      'three': [path.join(root, 'node_modules/@types/three/index.d.ts')],
      'three/*': [path.join(root, 'node_modules/@types/three/*')] },
  },
  include: liveOnly ? [path.join(root,'src/live/**/*.ts').replaceAll('\\','/'),path.join(root,'src/ui/**/*.ts').replaceAll('\\','/')] : [path.join(root,'src/**/*.ts').replaceAll('\\','/')],
}, null, 2));
execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/lib/tsc.js'), '--project', config], { stdio: 'inherit', cwd: root });
