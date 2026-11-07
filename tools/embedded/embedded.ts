#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO } from '../../packages/control-panel/src/env.ts';
import { runProcess } from '../../packages/control-panel/src/jobs.ts';
import { setupEmbeddedServices } from '../../packages/control-panel/src/service-artifacts.ts';
import { runEmbeddedWorkspace, type EmbeddedOperation } from '../../packages/control-panel/src/embedded-workspace.ts';

export function parseEmbeddedArgs(args: string[]) {
  if (args.length === 1 && args[0] === '--help') return null;
  const operation = args[0];
  if (!['setup', 'build', 'test', 'services'].includes(operation)) throw new Error('Expected embedded setup, build, test or services');
  const options = new Map<string, string>();
  for (const arg of args.slice(1)) {
    const match = /^(--core|--workspace)=(.+)$/.exec(arg);
    const key = match?.[1] ?? arg;
    if ((!match && arg !== '--if-present') || options.has(key)) throw new Error('Unknown or duplicate embedded option');
    options.set(key, match?.[2] ?? 'true');
  }
  return { operation: operation as EmbeddedOperation | 'services', core: path.resolve(options.get('--core') ?? REPO), workspace: options.has('--workspace') ? path.resolve(options.get('--workspace')!) : null, ifPresent: options.has('--if-present') };
}
export async function embeddedMain(args: string[]) {
  const options = parseEmbeddedArgs(args);
  if (!options) { console.log('embedded <setup|build|test|services> --workspace=<writable-root> [--core=<product-root>] [--if-present]\nTest builds declared prerequisites before package tests. No source installation or runtime activation.'); return; }
  const exists = await fs.lstat(path.join(options.core, 'embedded')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (!exists && options.ifPresent) { console.log('Embedded workspace absent; explicitly skipped.'); return; }
  if (!exists) throw new Error('Embedded workspace is missing');
  if (!options.workspace) throw new Error('An explicit writable --workspace is required');
  const ctx = {
    line: (line: string) => console.log(line),
    async run(command: string, commandArgs: string[], spawnOptions?: import('node:child_process').SpawnOptions) {
      const code = await runProcess(command, commandArgs, line => console.log(line), spawnOptions);
      if (code !== 0) throw new Error(`Embedded command failed with exit code ${code}`);
    },
  };
  if (options.operation === 'services') {
    const result = await setupEmbeddedServices(options.core, options.workspace, ctx);
    console.log(`Activated public service workspace: ${result.runtime}`);
  } else {
    const result = await runEmbeddedWorkspace(options.core, options.workspace, options.operation, ctx);
    console.log(`Retained validation workspace: ${result.workspace}`);
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  embeddedMain(process.argv.slice(2)).catch(error => { console.error((error as Error).message); process.exitCode = 1; });
}
