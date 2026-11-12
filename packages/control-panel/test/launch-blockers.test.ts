import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { launchBlocker, type LaunchState } from '../src/launch-blockers.ts';

test('no blocker when the panel is idle', () => {
  assert.equal(launchBlocker({}), null);
});

test('each cause has its own reason and message', () => {
  const cases: Array<[LaunchState, string]> = [
    [{ restartPending: true }, 'restarting'],
    [{ servicesPending: true, servicesNeedRestart: true, servicesProblem: 'x' }, 'restart-required'],
    [{ changingPlugins: true }, 'plugins-changing'],
    [{ servicesPending: true, servicesProblem: 'Plugin discovery changed; wait for running work to finish' }, 'plugins-pending'],
    [{ maintainingCache: true }, 'cache-maintenance'],
    [{ preparingNativeRun: true }, 'launch-preparing'],
    [{ preparingPreview: true }, 'preview-preparing'],
    [{ settingsSaving: true }, 'settings-saving'],
  ];
  const messages = new Set<string>();
  for (const [state, reason] of cases) {
    const blocked = launchBlocker(state);
    assert.equal(blocked?.reason, reason);
    assert.equal(blocked!.restart, reason === 'restart-required');
    messages.add(blocked!.message);
  }
  assert.equal(messages.size, cases.length, 'every cause reads differently');
});

test('restart-required wins over transient causes and never tells the user to wait', () => {
  const blocked = launchBlocker({ servicesPending: true, servicesNeedRestart: true, changingPlugins: true, preparingPreview: true, settingsSaving: true, servicesProblem: 'changed' });
  assert.equal(blocked?.reason, 'restart-required');
  assert.match(blocked!.message, /Restart the panel/);
  assert.doesNotMatch(blocked!.message, /wait|try again/i);
});

test('a pending refresh reports its recorded problem', () => {
  assert.equal(launchBlocker({ servicesPending: true, servicesProblem: 'Plugin discovery unavailable: bad metadata' })?.message, 'Plugin discovery unavailable: bad metadata');
});

test('the panel no longer uses the generic launch refusal', async () => {
  const panel = await fs.readFile(path.resolve(import.meta.dirname, '..', 'src', 'panel.ts'), 'utf8');
  assert.doesNotMatch(panel, /Wait for launch preparation or settings saving to finish/);
  assert.match(panel, /this\.servicesNeedRestart = !snapshot\.problem && restartRequired/);
});

async function reportHarness() {
  const app = (await fs.readFile(path.resolve(import.meta.dirname, '..', 'ui', 'app.js'), 'utf8')).replace(/\r\n/g, '\n');
  const start = app.indexOf('function report(e)');
  const source = app.slice(start, app.indexOf('\n}\n', start) + 2);
  const asked: Array<Record<string, unknown>> = [];
  let restarts = 0, answer: unknown = true;
  const ask = async (options: Record<string, unknown>) => { asked.push(options); return options.closeOnly ? null : answer; };
  const report = new Function('ask', 'restartPanel', 'console', `${source}; return report;`)(ask, async () => { restarts++; }, { error() {} }) as (e: unknown) => void;
  return { asked, report, restarts: () => restarts, answer: (value: unknown) => { answer = value; } };
}

test('error dialog offers Restart only for restart-required refusals', async () => {
  const h = await reportHarness();
  h.report({ message: 'Plugin code changed. Restart the panel to use them.', data: { details: { reason: 'restart-required', restart: true } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.asked[0].ok, 'Restart');
  assert.equal(h.asked[0].closeOnly, undefined);
  assert.equal(h.restarts(), 1);

  h.report({ message: "This project's settings are being saved", data: { details: { reason: 'settings-saving', restart: false } } });
  assert.equal(h.asked[1].closeOnly, true);
  assert.equal(h.asked[1].details, "This project's settings are being saved", 'reason metadata stays out of the copied details');
});

test('declining Restart leaves the panel running', async () => {
  const h = await reportHarness();
  h.answer(null);
  h.report({ message: 'Restart needed', data: { details: { reason: 'restart-required', restart: true } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.restarts(), 0);
});
