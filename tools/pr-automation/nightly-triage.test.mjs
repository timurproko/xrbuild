import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { OPENSPEC_BIN } from './finalize.mjs';
import { apiClients, failureComment, failureSummary, jobLog, logTail, planTriage, prBody, scaffold } from './nightly-triage.mjs';
import { parseLink } from './pr-body.mjs';
import { inspectProgress } from './promote.mjs';

test('first failure opens a PR, a repeat comments, green comments only with a PR open', () => {
  assert.equal(planTriage({ conclusion: 'failure', openPr: null }), 'open');
  assert.equal(planTriage({ conclusion: 'failure', openPr: { number: 3 } }), 'comment-failure');
  assert.equal(planTriage({ conclusion: 'success', openPr: { number: 3 } }), 'comment-green');
  assert.equal(planTriage({ conclusion: 'success', openPr: null }), 'none');
  assert.equal(planTriage({ conclusion: 'cancelled', openPr: null }), 'none');
});

test('the log tail ends at the last error, without timestamps or colours', () => {
  const log = ['2026-10-11T23:47:01.1234567Z step one', '2026-10-11T23:47:02.0Z \x1b[31mnot ok 3 - hands\x1b[0m', '2026-10-11T23:47:03.0Z ##[error]Process completed with exit code 1.', '2026-10-11T23:47:04.0Z Post job cleanup.'].join('\n');
  assert.equal(logTail(log), 'step one\nnot ok 3 - hands\n##[error]Process completed with exit code 1.');
  assert.equal(logTail(log, 1), 'not ok 3 - hands\n...\n##[error]Process completed with exit code 1.');
});

test('failing tests scrolled out of the tail by later output are listed first, once each', () => {
  const log = ['pkg-a test: ✖ throwaway fails (1ms)', 'pkg-a test: ✖ throwaway fails (1ms)', 'pkg-b test: ✔ fine', 'pkg-b test: ✔ fine too', '##[error]Process completed with exit code 1.'].join('\n');
  assert.equal(logTail(log, 2), 'pkg-a test: ✖ throwaway fails (1ms)\n...\npkg-b test: ✔ fine too\n##[error]Process completed with exit code 1.');
});

test('the log tail drops a leading byte order mark and every terminal escape, not only colours', () => {
  const log = ['﻿2026-10-11T23:47:01.0Z \x1b[36;1mnode test\x1b[0m\x1b[K', '2026-10-11T23:47:02.0Z ##[error]boom'].join('\n');
  assert.equal(logTail(log), 'node test\n##[error]boom');
});

test('the summary names the run, the failed jobs and steps, with their log tails', () => {
  const s = failureSummary({ runUrl: 'https://example.invalid/run/1', sha: 'abcdef1234', jobs: [{ name: 'Node tests', steps: ['Run pnpm test'], tail: 'not ok 3' }] });
  assert.match(s, /failed at abcdef1: https:\/\/example.invalid\/run\/1/);
  assert.match(s, /### Node tests\n\nFailed step: Run pnpm test\n\n```text\nnot ok 3\n```/);
});

test('Actions and Issues operations stay on the workflow token while PR creation uses the App', () => {
  const seen = [];
  const execute = (_file, args, options) => {
    seen.push({ path: args[3], token: options.env.GH_TOKEN });
    return '{}';
  };
  const clients = apiClients({ repositoryToken: 'app-token', workflowToken: 'workflow-token', execute });
  clients.actions('repos/example/project/actions/runs/1');
  clients.workflow('repos/example/project/issues?labels=nightly-failure');
  clients.workflow('repos/example/project/issues/4/comments', 'POST', { body: 'evidence' });
  clients.repository('repos/example/project/pulls', 'POST', { title: 'repair' });
  assert.deepEqual(seen, [
    { path: 'repos/example/project/actions/runs/1', token: 'workflow-token' },
    { path: 'repos/example/project/issues?labels=nightly-failure', token: 'workflow-token' },
    { path: 'repos/example/project/issues/4/comments', token: 'workflow-token' },
    { path: 'repos/example/project/pulls', token: 'app-token' },
  ]);
});

test('job logs use the read-only Actions credential', async () => {
  let authorization;
  const text = await jobLog('example/project', 9, 'read-token', async (_url, options) => {
    authorization = options.headers.authorization;
    return { ok: true, text: async () => 'failure log' };
  });
  assert.equal(authorization, 'Bearer read-token');
  assert.equal(text, 'failure log');
});

test('the scaffold is valid, preserves evidence, and the PR body is promotion-compatible but incomplete', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-'));
  fs.mkdirSync(path.join(repo, 'openspec', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
  const input = {
    change: 'fix-nightly-2026-10-11', date: '2026-10-11', runUrl: 'https://example.invalid/run/1',
    sha: 'abcdef1234', jobs: [{ name: 'Node tests' }], summary: 'Nightly CI failed in Node tests at step Run tests.\n\n```text\nnot ok 3\n```',
  };
  const files = scaffold(input);
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  }
  execFileSync(process.execPath, [OPENSPEC_BIN, 'validate', '--all', '--strict', '--no-interactive'], { cwd: repo, stdio: 'pipe', env: { ...process.env, CI: '1' } });
  const tasks = files['openspec/changes/fix-nightly-2026-10-11/tasks.md'];
  const body = prBody(input);
  assert.match(tasks, /- \[ \] 1\.1/);
  assert.match(files['openspec/changes/fix-nightly-2026-10-11/design.md'], /Run tests[\s\S]*not ok 3/);
  assert.deepEqual(parseLink(body).link, { version: 1, change: 'fix-nightly-2026-10-11' });
  assert.deepEqual(inspectProgress(body, tasks), { status: 'incomplete', reason: 'Implementation has open items' });
  assert.match(failureComment({ summary: input.summary }), /opened this repair[\s\S]*Run tests[\s\S]*not ok 3/);
  assert.match(failureComment({ summary: input.summary, repeated: true }), /another failure/);
});
