// Explicit public application smoke test; separate from the fast *.test.ts suite.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { REPO } from '../src/env.ts';
import { Panel } from '../src/panel.ts';
import { EventHub } from '../src/http.ts';
import { discoverProjectCatalog } from '../src/extension-catalog.ts';
import { buildInventory } from '../src/embedded-inputs.ts';
import { effectiveProjectOutput } from '../src/embedded-project-output.ts';

test('normal embedded workflow builds the real public launcher with frozen public dependencies and no product writes', { timeout: 180000 }, async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/public-project-workflow-'));
  const workspace = path.join(root, 'integration'), projects = path.join(root, 'projects');
  await fs.mkdir(workspace); await fs.mkdir(projects);
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const before = (await buildInventory(path.join(REPO, 'embedded'))).fingerprint;
  const p = (await discoverProjectCatalog(REPO, workspace, projects)).projects.find(p => p.key === 'bundled:launcher')!.project;
  assert.ok(p.manifest?.scripts?.build);
  const panel = new Panel(REPO, workspace, new EventHub(), projects);
  const job = panel.rebuildApp(p); await panel.jobs.wait(job);
  await fs.writeFile(path.join(REPO, '.artifacts/public-project-workflow.log'), job.lines.join('\n'));
  assert.equal(job.state, 'done', job.error ?? job.lines.slice(-20).join('\n'));
  const effective = (await discoverProjectCatalog(REPO, workspace, projects)).projects.find(p => p.key === 'bundled:launcher')!.project;
  const output = await effectiveProjectOutput(REPO, workspace, effective);
  assert.match(await fs.readFile(path.join(output.entry, 'index.html'), 'utf8'), /xrb-app-icon/);
  assert.ok(effective.dir.startsWith(path.join(projects, '.xrb/embedded-projects')));
  assert.equal((await buildInventory(path.join(REPO, 'embedded'))).fingerprint, before);
  await assert.rejects(panel.deleteProject(effective), /cannot be deleted/);
});
