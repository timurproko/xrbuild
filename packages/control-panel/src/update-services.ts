#!/usr/bin/env node
// Run with current sources after a pull; no plugin module from the old panel is executed.
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { rebuildServiceInputs } from './service-artifacts.ts';
import { runProcess } from './jobs.ts';

const workspace = workspaceFromArgs(process.argv.slice(2)) ?? WORKSPACE;
try {
  await rebuildServiceInputs(REPO, workspace, {
    line: text => console.log(text),
    async run(command, args, options) {
      if (await runProcess(command, args, text => console.log(text), options) !== 0) throw new Error('Application component build failed; retry Update.');
    },
  });
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
