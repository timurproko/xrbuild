// Load only the explicitly provisioned repository dependency's public cleanup interface. No global/daily/cache discovery.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { requireOwnershipFacilities } from './ownership-exclusion.mjs';
export async function loadCleanupRuntime(root) {
  try {
    // Pin resolution to the explicitly provisioned slot (including ordinary pnpm links), not ancestor/NODE_PATH globals.
    const manifestPath = path.join(path.resolve(root), 'node_modules', '@timurproko', 'a1', 'package.json');
    const require = createRequire(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== '@timurproko/a1' || typeof manifest.version !== 'string') throw Error('Package identity mismatch');
    const load = name => import(pathToFileURL(require.resolve(`./dist/foundation/lifecycle/${name}.mjs`)).href);
    const runtime = { snapshot: await load('worktree-cleanup-snapshot'), boundary: await load('worktree-claim-boundary'), version: manifest.version };
    requireOwnershipFacilities(runtime, {});
    return runtime;
  } catch {
    throw Object.assign(Error('Compatible repository A1 package unavailable: provision a verified released @timurproko/a1 with public snapshot and tracked cleanup execution APIs before retrying. No detach, sweep/discard fallback or implicit installation is authorized.'), { code: 'XRB_RUNTIME_UNAVAILABLE' });
  }
}
