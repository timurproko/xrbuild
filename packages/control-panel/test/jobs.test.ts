import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JobRefused, JobRunner, LineSplitter, MAX_LINES } from '../src/jobs.ts';

const node = process.execPath;

test('splits streamed output into lines, including \\r progress', () => {
  const lines: string[] = [];
  const s = new LineSplitter((l) => lines.push(l));
  s.push('one\r\ntw');
  s.push('o\nprogress 10%\rprogress 20%\r');
  s.push('\n\nlast');
  s.flush();
  assert.deepEqual(lines, ['one', 'two', 'progress 10%', 'progress 20%', 'last']);
});

test('runs a process, keeps its output, reports success', async () => {
  const jobs = new JobRunner();
  const job = jobs.start('web-build', 'apps/a', 'web build: A', (ctx) => ctx.run(node, ['-e', 'console.log("built"); console.error("warn")']));
  assert.equal(job.state, 'running');
  const done = await jobs.wait(job);
  assert.equal(done.state, 'done');
  assert.equal(done.exitCode, 0);
  assert.ok(done.lines.includes('built') && done.lines.includes('warn'));
});

test('publication jobs retain explicit operation and identity metadata', async () => {
  const jobs = new JobRunner();
  const publication = { enabled: true, publisher: 'web', id: 'one', slug: 'demo', routes: { web: 'demo' } };
  const job = jobs.start('publication', 'apps/a', 'publication: A', async () => {}, 'unpublish', publication);
  assert.equal(job.operation, 'unpublish');
  assert.deepEqual(jobs.list()[0]?.publication, publication);
  await jobs.wait(job);
});

test('publication jobs queue in order, reserve their projects and continue after failure', async () => {
  const jobs = new JobRunner();
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const first = jobs.start('publication', 'apps/a', 'publish: A', async () => { order.push('a:start'); await gate; order.push('a:end'); }, 'publish');
  const second = jobs.start('publication', 'apps/b', 'publish: B', async () => { order.push('b'); }, 'publish');
  const third = jobs.start('publication', 'apps/c', 'unpublish: C', async () => { order.push('c'); throw new Error('remote failed'); }, 'unpublish');
  const fourth = jobs.start('publication', 'apps/d', 'publish: D', async () => { order.push('d'); }, 'publish');
  assert.equal(first.state, 'running');
  assert.equal(second.state, 'queued');
  assert.equal(third.state, 'queued');
  assert.equal(fourth.state, 'queued');
  assert.match(second.lines.join('\n'), /Waiting for the current publication job/);
  assert.throws(() => jobs.start('web-build', 'apps/b', 'build: B', async () => {}), JobRefused, 'queued publication reserves its output');
  assert.equal(jobs.clearFinished(), 0, 'queued jobs are not cleared');
  release();
  await Promise.all([first, second, third, fourth].map((job) => jobs.wait(job)));
  assert.deepEqual(order, ['a:start', 'a:end', 'b', 'c', 'd']);
  assert.equal(third.state, 'failed');
  assert.equal(fourth.state, 'done');
  assert.match(second.lines.join('\n'), /Starting queued publication job/);
  assert.equal(jobs.active().length, 0);
});

test('a non-zero exit fails the job with the exit code', async () => {
  const jobs = new JobRunner();
  const done = await jobs.wait(jobs.start('web-build', 'apps/a', 'web build: A', (ctx) => ctx.run(node, ['-e', 'console.log("x"); process.exit(3)'])));
  assert.equal(done.state, 'failed');
  assert.equal(done.exitCode, 3);
  assert.match(done.error!, /exit code 3/);
  assert.match(done.lines.at(-1)!, /FAILED/);
});

test('concurrency: one job per kind; publication, package and web build exclude unsafe pairs', async () => {
  const jobs = new JobRunner();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const pkg = jobs.start('package', 'apps/a', 'package: A', () => gate);
  assert.throws(() => jobs.start('package', 'apps/b', 'package: B', async () => {}), JobRefused, 'second package');
  assert.throws(() => jobs.start('web-build', 'apps/a', 'web build: A', async () => {}), JobRefused, 'web build of the packaged project');
  assert.throws(() => jobs.start('publication', 'apps/a', 'publish: A', async () => {}), JobRefused, 'publication of the packaged project');
  assert.throws(() => jobs.start('packager-setup', 'apps/b', 'setup: B', async () => {}), JobRefused, 'setup cannot race another package');
  const other = jobs.start('web-build', 'apps/b', 'web build: B', async () => {});
  const rebuild = jobs.start('host-rebuild', null, 'rebuild', async () => {});
  await Promise.all([jobs.wait(other), jobs.wait(rebuild)]);
  release();
  await jobs.wait(pkg);
  const setup = jobs.start('packager-setup', 'apps/a', 'setup: A', () => gate);
  assert.throws(() => jobs.start('package', 'apps/b', 'package: B', async () => {}), JobRefused, 'package cannot race setup');
  await jobs.wait(setup);
  const again = jobs.start('package', 'apps/a', 'package: A', async () => {});
  await jobs.wait(again);
  assert.equal(again.state, 'done');
});

test('clearing forgets finished jobs and keeps running ones', async () => {
  const jobs = new JobRunner();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await jobs.wait(jobs.start('web-build', 'apps/a', 'done one', async () => {}));
  await jobs.wait(jobs.start('package', 'apps/a', 'failed one', async () => { throw new Error('x'); }));
  const running = jobs.start('host-rebuild', null, 'running one', () => gate);
  assert.equal(jobs.clearFinished(), 2);
  assert.deepEqual(jobs.list().map((j) => j.title), ['running one']);
  release();
  await jobs.wait(running);
});

test('keeps at most MAX_LINES lines per job', async () => {
  const jobs = new JobRunner();
  const done = await jobs.wait(jobs.start('web-build', null, 'many', async (ctx) => {
    for (let i = 0; i < MAX_LINES + 50; i++) ctx.line(`line ${i}`);
  }));
  assert.equal(done.lines.length, MAX_LINES);
  assert.equal(done.lines.at(-1), `line ${MAX_LINES + 49}`);
});

test('job output has no terminal colour codes', async () => {
  const { stripAnsi } = await import('../src/jobs.ts');
  assert.equal(stripAnsi('[32m✓ built in 1.66s[39m'), '✓ built in 1.66s');
  assert.equal(stripAnsi('[2mdist/[22m[36massets/a.js[39m'), 'dist/assets/a.js');
});
