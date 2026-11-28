import fs from 'node:fs/promises';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';

export async function componentSettingsFixture(t: TestContext) {
  const artifacts = process.env.XRB_TEST_ROOT ?? path.join(REPO, '.artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const root = await fs.mkdtemp(path.join(artifacts, 'component-settings-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace');
  const writeProject = async (owner: string, name: string, extra = {}) => {
    const dir = path.join(owner, 'projects/unsorted', name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'xrb-project.json'), JSON.stringify({ name, kind: 'app', entry: '.', ...extra }));
    await fs.writeFile(path.join(dir, 'index.html'), '<html><body>fixture</body></html>');
    return dir;
  };
  const kit = JSON.parse(await fs.readFile(path.join(REPO, 'embedded/projects/core/ui-kit/xrb-project.json'), 'utf8'));
  const launcher = JSON.parse(await fs.readFile(path.join(REPO, 'embedded/projects/core/launcher/xrb-project.json'), 'utf8'));
  await writeProject(path.join(core, 'embedded'), 'ui-kit', { name: 'UI Kit', componentLibrary: kit.componentLibrary });
  await writeProject(workspace, 'launcher', { componentLibraries: launcher.componentLibraries, description: 'Keep me' });
  await writeProject(workspace, 'plain');
  const source = await writeProject(path.join(core, 'embedded'), 'launcher', { componentLibraries: launcher.componentLibraries });
  const port = await freePort(), server = createServer({ repo: core, workspace, port });
  await new Promise<void>(resolve => server.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await server.close(); await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }); });
  const request = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() as any };
  };
  const get = async (id = 'launcher') => (await request('GET', `/api/projects/${encodeURIComponent(id)}`)).json;
  const save = (p: any, value: string) => request('PUT', `/api/projects/${encodeURIComponent(p.id)}/manifest`, { manifest: { ...p.manifest, componentSettings: { 'bundled:ui-kit': { theme: value } } }, mtimeMs: p.manifestMtimeMs, revision: p.manifestRevision });
  return { server, core, workspace, source, request, get, save };
}
