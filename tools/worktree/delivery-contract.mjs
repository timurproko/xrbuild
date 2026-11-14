// Offline verification of the approved portable-delivery-v1 installation, not a policy reimplementation.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { contextEnvironment } from './git-environment.mjs';

export const ROUTING_PARAGRAPH = "Read and follow [Shared delivery rules](docs/delivery-rules.md). Use only this repository's entry in [Delivery adapters](docs/delivery-adapters.json). Do not paraphrase these rules, invent exceptions, or modify OpenSpec skills/framework; report conflicts before proceeding.";

// Approved in 8b3b5f98b21ce7c1672dbf7c9a6c82d68b91ccdf, with the maintainer-approved paired R11 clarification.
// Only ordinary documentation auto-merge is restricted; existing release automation is unchanged.
// These anchors remain independent of mutable manifests; unapproved rehashing is not approval.
export const APPROVED_HASHES = Object.freeze({
  'delivery-rules.md': 'f2518a1e49317eef3c64c79733162b80613afee0cbdaf6e6945117e1a6be9876',
  'delivery-adapters.json': '8a8b0c4e395003457ce0f2f7d0eae78a9cde227d4db6f4fc550f764e609fd741',
  'delivery-cases.json': 'e35a6024a97fe355f7eb9d6efbc8502fd67f2191949b08f6338f07d283d61f4c',
  'delivery-contract.json': '940f241fbdb925c79b2c9717ead2b41e64f05e93b5ff4d9edd96fb3b11f1faa1',
});

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };

export function findPlanningSnapshot(root) {
  const active = 'openspec/changes/simplify-change-delivery';
  if (fs.existsSync(path.join(root, active))) return active;
  const archive = path.join(root, 'openspec/changes/archive');
  const matches = fs.existsSync(archive) ? fs.readdirSync(archive)
    .filter(name => /^\d{4}-\d{2}-\d{2}-simplify-change-delivery$/.test(name)) : [];
  if (matches.length !== 1) fail('Approved delivery planning snapshot is missing or ambiguous');
  return `openspec/changes/archive/${matches[0]}`;
}

/** `read` permits isolated negative fixtures; ordinary verification reads only the selected checkout. */
export function verifyContractInstallation({ root, planningDirectory = findPlanningSnapshot(root),
  read = relative => fs.readFileSync(path.join(root, relative)) } = {}) {
  const installed = {};
  for (const [name, digest] of Object.entries(APPROVED_HASHES)) {
    const deployed = Buffer.from(read(`docs/${name}`));
    const planned = Buffer.from(read(`${planningDirectory}/${name}`));
    if (hash(deployed) !== digest || hash(planned) !== digest || !deployed.equals(planned)) {
      fail(`Approved contract bytes differ: ${name}; a new digest alone is not approval`);
    }
    const text = deployed.toString('utf8');
    if (text.startsWith('\uFEFF') || text.includes('\r') || !text.endsWith('\n') || text.endsWith('\n\n')) {
      fail(`Invalid contract encoding: ${name}`);
    }
    installed[name] = text;
  }
  const manifest = JSON.parse(installed['delivery-contract.json']);
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (entry.sha256 !== APPROVED_HASHES[name] || entry.installTo !== `docs/${name}`) fail(`Invalid contract binding: ${name}`);
  }
  const adapters = JSON.parse(installed['delivery-adapters.json']);
  const adapter = adapters.repositories.xrbuild;
  if (adapter.repository !== 'timurproko/xrbuild' || adapter.baseBranch !== 'main'
    || adapter.newDeliveryMetadataVersion !== 1 || adapter.requiredCheck !== 'CI required') fail('Unsupported xrbuild adapter');
  const cases = JSON.parse(installed['delivery-cases.json']).cases;
  const ids = Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
  if (!Array.isArray(cases) || cases.map(item => item.id).join(',') !== ids.join(',')) fail('Shared cases are missing or reordered');
  const agents = Buffer.from(read('AGENTS.md')).toString('utf8').replaceAll('\r\n', '\n');
  if (agents.split('\n\n').filter(paragraph => paragraph.trim() === ROUTING_PARAGRAPH).length !== 1
      || agents.split(ROUTING_PARAGRAPH).length !== 2) fail('AGENTS.md needs the exact R17 routing paragraph once');
  return { contract: manifest.contract, adapter, cases };
}

// Canonical Git-text digests of the unchanged protected assets at the same approved checkpoint.
// This works in shallow/offline checkouts and also detects deletions/renames of original assets.
const OPEN_SPEC_HASHES = Object.freeze({
  '.claude/commands/opsx/apply.md': '9a980fe310f04f662f8426c89a69c286cf764a73191c2541f0f281c11d97dbe0',
  '.claude/commands/opsx/archive.md': '0c48963c41c06b12553b405cd87b0ce0af09b3a8d93dce27a8505fe32d8d88e6',
  '.claude/commands/opsx/explore.md': '308878c7539da2b8754e03b840332a600520c74238c238c1dea54e54b3a36202',
  '.claude/commands/opsx/propose.md': '6cb69de2ff28d549ca6a49b0783dcf8013fc33ee42b8962b89f61c65d01ff027',
  '.claude/commands/opsx/sync.md': 'a946e1a29b7421e1a6fd1fe1008f23c8b3739b8345f8487bbe1ffcf934fd0bec',
  '.claude/commands/opsx/update.md': '341d2648a4686ea080e3db2af1ed25cd160da56d558eb9b127eee4f813a2c9b8',
  '.claude/skills/openspec-apply-change/SKILL.md': 'e1c7b1a5dc403b511ebeb734e718b075ccab0ebdfe45fe180bb746ea0e730e6b',
  '.claude/skills/openspec-archive-change/SKILL.md': '0453cfa549b9d22007af5ab547b049b2f6d200224f6e6b4df24873bf659c0819',
  '.claude/skills/openspec-explore/SKILL.md': '6d608a81e9d475684ff705e7f811167dc4434fdb8c3bc31c019ddefac6a5a589',
  '.claude/skills/openspec-propose/SKILL.md': 'aad01b96faad2790707e01adefb23ac85c3e646e52a62d554390ebdb76201e18',
  '.claude/skills/openspec-sync-specs/SKILL.md': '489cd9bd56e16248f7a19fb7331f95737adba78fa3aa270207b57c0d900d0e5c',
  '.claude/skills/openspec-update-change/SKILL.md': 'a40a7d8e7181353f74ff2706589b6489233337253119ea127d2e6cca2c6ca625',
});

export function isProtectedOpenSpecPath(file) {
  return /(?:^|\/)(?:skills\/openspec-[^/]+(?:\/|$)|commands\/opsx(?:\/|[-:.]|$))/.test(file)
    || /^openspec\/(?:schemas?|templates?|framework|src|lib)(?:\/|$)/.test(file);
}

export function verifyOpenSpecBoundary({ root,
  paths = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, env: contextEnvironment(), encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }).split('\0').filter(Boolean),
  read = relative => fs.readFileSync(path.join(root, relative)), stat = relative => fs.lstatSync(path.join(root, relative)) } = {}) {
  for (const file of paths.filter(isProtectedOpenSpecPath)) {
    if (!Object.hasOwn(OPEN_SPEC_HASHES, file)) fail(`Unapproved OpenSpec asset added or renamed: ${file}`);
  }
  for (const [file, digest] of Object.entries(OPEN_SPEC_HASHES)) {
    if (!stat(file).isFile()) fail(`Protected OpenSpec asset is not a regular file: ${file}`);
    // Existing framework assets have ordinary Git text line endings, not the frozen contract's byte requirement.
    const canonical = Buffer.from(read(file)).toString('utf8').replaceAll('\r\n', '\n');
    if (hash(canonical) !== digest) fail(`Protected OpenSpec asset changed: ${file}`);
  }
  return { unchanged: true, protectedAssets: Object.keys(OPEN_SPEC_HASHES).length };
}
