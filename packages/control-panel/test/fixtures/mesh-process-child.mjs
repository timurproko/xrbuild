// Uncooperative isolated ownership fixture. Never opens devices or user data.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mode = process.argv[2];
if (mode === 'echo') {
  process.stdin.on('data', bytes => process.stdout.write(bytes));
  process.stdin.on('end', () => process.exit(0));
} else {
  const leaf = mode === 'leaf' ? null : spawn(process.execPath, [fileURLToPath(import.meta.url), 'leaf'], { stdio: 'ignore', windowsHide: true });
  if (leaf) process.stdout.write(JSON.stringify({ pid: process.pid, leaf: leaf.pid, args: process.argv.slice(3) }) + '\n');
  process.stdin.on('data', () => { if (mode === 'crash-tree') process.exit(7); });
  process.stdin.on('end', () => {}); // Deliberately violates cooperative EOF cleanup.
  setInterval(() => {}, 1000);
}
