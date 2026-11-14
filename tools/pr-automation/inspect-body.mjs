#!/usr/bin/env node
// Optional local inspection: one secret-free {body,tasks} JSON object on stdin. No remote mutations/setup.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inspectBodyProgress } from './pr-body.mjs';
export const inspectLocalBody = input => inspectBodyProgress(input?.body, input?.tasks);
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = inspectLocalBody(JSON.parse(fs.readFileSync(0, 'utf8')));
    console.log(JSON.stringify(result));
    if (result.status === 'blocked') process.exitCode = 1;
  } catch { console.error('Expected one {body,tasks} JSON object on stdin'); process.exitCode = 1; }
}
