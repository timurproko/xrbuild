// Optional executable operation boundaries for the frozen shared rules, not an alternative guidance source.
import path from 'node:path';
import fs from 'node:fs';
import { isProtectedOpenSpecPath } from './delivery-contract.mjs';

export function reviewDeliveryScope({ paths = [], frameworkOverrideRequested = false, materialAmbiguity = false }) {
  if (frameworkOverrideRequested || paths.some(isProtectedOpenSpecPath)) return { allowed: false, requiresSeparateScope: true, reason: 'OpenSpec scope/indirect override requires separate approval' };
  if (materialAmbiguity) return { allowed: false, clarificationRequired: true, reason: 'Unresolved material scope' };
  return { allowed: true };
}

export function deliveryAuthority({ kind, scopeApproved = false, scopePresented = false, materialAmbiguity = false,
  materialChangeRequestedByAgent = false, frameworkRequirementsSatisfied = false }) {
  const allowed = [];
  if (kind === 'planning') allowed.push('plan', 'publish-plan');
  if (frameworkRequirementsSatisfied && !materialAmbiguity && !materialChangeRequestedByAgent) {
    if (kind === 'edit' && scopeApproved || kind === 'deliver-approved' && scopePresented) allowed.push('edit', 'record-local-progress');
    if (kind === 'deliver-approved' && scopePresented) allowed.push('commit', 'push', 'update-pr');
  }
  return { allowed, approvalRequired: materialAmbiguity || materialChangeRequestedByAgent,
    // Merge/deletion authority never flows from implementation/publication approval.
    mergeAuthorized: false, remoteDeletionAuthorized: false };
}

export async function performDeliveryOperation({ authority, operation, scope = { allowed: true }, targetedCheckFailed = false, action }) {
  if (!['plan', 'publish-plan', 'edit', 'record-local-progress', 'commit', 'push', 'update-pr'].includes(operation) || !scope.allowed || !authority.allowed.includes(operation)) return { performed: false, reason: scope.reason ?? 'Operation not authorized', clarificationRequired: Boolean(scope.clarificationRequired) };
  if (targetedCheckFailed && operation === 'push') return { performed: false, reason: 'Known targeted check failed; repair and rerun before publication', failureDisclosed: true };
  await action(); return { performed: true };
}

export function completionEvidence({ codeWritten, testsWritten, published, ciObserved = 'pending', deviceObserved = false }) {
  return { locallyComplete: codeWritten === true && testsWritten === true,
    publishedComplete: codeWritten === true && testsWritten === true && published === true,
    ciPassed: ciObserved === 'passed', deviceAccepted: deviceObserved === true };
}

export function implementationScratch(root, relative = 'scratch.json') {
  const realRoot = fs.realpathSync.native(root), directory = path.join(realRoot, '.artifacts');
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)
    || relative.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error('Scratch path must stay under the owning artifacts');
  let current = realRoot;
  for (const part of ['.artifacts', ...relative.split('/')]) {
    current = path.join(current, part);
    try { const stat = fs.lstatSync(current); if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1) throw new Error('Linked scratch paths are not admitted'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { path: path.join(directory, ...relative.split('/')), durableEvidence: false };
}

export function reconciliationGate({ implementationStarted, contractChanged, reconciliationRecorded, inspectedHead, currentHead, materialConflict = false }) {
  if (materialConflict) return { allowed: false, clarificationRequired: true, reason: 'Frozen contract conflict requires explicit clarification' };
  if (implementationStarted && contractChanged && (!reconciliationRecorded || inspectedHead !== currentHead)) return { allowed: false, reconciliationRequired: true, reason: 'Preserve work and record the new-contract checkpoint first' };
  return { allowed: true };
}
