// Dependency-free fresh-process entry point used after Update changes public dependency inputs.
// Reuses the shortcut's graph validation, pinned manager, sanitized environment and frozen hook-disabled install.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installCore, redact } from './runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try {
  await installCore(root, { write: line => console.log(redact(line)) });
} catch (error) {
  console.error(redact(`Core dependency setup failed: ${error.message}`));
  process.exitCode = 1;
}
