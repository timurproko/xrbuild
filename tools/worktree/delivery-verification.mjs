// Offline shared-case verifier. A blocked runtime case is incomplete, never a skipped passing case.
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { verifyContractInstallation, verifyOpenSpecBoundary } from './delivery-contract.mjs';
import { publishPlan } from './publish-plan.mjs';
import { enter } from './worktree.mjs';
import { describeHandoff, publicationEvidence } from './portable-context.mjs';
import { inspectRemovalTarget, removePublishedCheckout, runtimeCleanupUnavailable } from './published-removal.mjs';
import { reviewDeliveryScope, deliveryAuthority, performDeliveryOperation, completionEvidence, implementationScratch, reconciliationGate } from './delivery-decisions.mjs';
import { inspectBodyProgress } from '../pr-automation/pr-body.mjs';
import { reconcile } from '../pr-automation/promote.mjs';
import { reconcileFinalization } from '../pr-automation/finalize.mjs';
import { refreshReadyPullRequests } from '../pr-automation/ready-pull-request-refresh.mjs';
import { reconcileDocumentation, classifyDocumentationDiff } from '../pr-automation/docs-auto-merge.mjs';
import { attemptOneShot, evaluateIntegration, inspectPersonalArm } from '../pr-automation/integrate.mjs';
import { verifyOfflineRuntimeSequence } from './offline-runtime-verification.mjs';

export const CASE_BOUNDARIES = Object.freeze({
  C01: ['scope'], C02: ['scope'], C03: ['planning'], C04: ['authority', 'operation'], C05: ['authority'], C06: ['authority', 'operation'],
  C07: ['planning'], C08: ['planning'], C09: ['enter'], C10: ['enter'], C11: ['enter'], C12: ['enter'], C13: ['enter'],
  C14: ['completion', 'operation'], C15: ['body'], C16: ['body'], C17: ['promotion'], C18: ['operation'], C19: ['completion'],
  C20: ['promotion'], C21: ['promotion', 'finalization', 'refresh', 'documentation'], C22: ['promotion'],
  C23: ['integration'], C24: ['integration'], C25: ['integration'], C26: ['integrationCurrency'], C27: ['integrationCurrency'], C28: ['personalArm'],
  C29: ['documentation'], C30: ['documentationDiff'], C31: ['documentation'], C32: ['handoff'], C33: ['planning'],
  C34: ['removal'], C35: ['publication'], C36: ['removal'], C37: ['removal'], C38: ['inspection'], C39: ['runtimeSequence'], C40: ['runtime'], C41: ['removal'],
  C42: ['planning'], C43: ['scratch'], C44: ['installation'], C45: ['installation'], C46: ['coverage'], C47: ['behavior'], C48: ['reconciliation'],
  C49: ['installation', 'framework'], C50: ['reconciliation'],
});

export function assessCoverage(records, ids = Object.keys(CASE_BOUNDARIES)) {
  const missing = ids.filter(id => records.filter(record => record.id === id && ['passed', 'failed', 'incomplete'].includes(record.status)).length !== 1);
  const unexpected = records.filter(record => !ids.includes(record.id));
  return { complete: !missing.length && !unexpected.length, missing, unexpected: unexpected.map(record => record.id) };
}

export function validBehavior({ calls, required, observation }) {
  return Array.isArray(calls) && required.length > 0 && required.every(boundary => calls.some(call => call.boundary === boundary))
    && observation && typeof observation === 'object' && !Array.isArray(observation);
}

const boundaries = Object.freeze({
  scope: reviewDeliveryScope, authority: deliveryAuthority, operation: performDeliveryOperation,
  completion: completionEvidence, scratch: implementationScratch, reconciliation: reconciliationGate,
  planning: publishPlan, enter, handoff: describeHandoff, publication: publicationEvidence,
  removal: removePublishedCheckout, inspection: inspectRemovalTarget, runtime: runtimeCleanupUnavailable, runtimeSequence: verifyOfflineRuntimeSequence,
  body: inspectBodyProgress, promotion: reconcile, finalization: reconcileFinalization, refresh: refreshReadyPullRequests,
  documentation: reconcileDocumentation, documentationDiff: classifyDocumentationDiff,
  integration: attemptOneShot, integrationCurrency: evaluateIntegration, personalArm: inspectPersonalArm,
  installation: verifyContractInstallation, framework: verifyOpenSpecBoundary, coverage: assessCoverage, behavior: validBehavior,
});

export async function verifySharedCases({ root, bindings, cases = verifyContractInstallation({ root }).cases } = {}) {
  const approved = verifyContractInstallation({ root }).cases, ids = approved.map(item => item.id);
  const rows = [];
  for (const fixture of cases) {
    const calls = [], cleanup = [];
    try {
      if (!ids.includes(fixture.id) || !isDeepStrictEqual(fixture, approved.find(item => item.id === fixture.id))) throw new Error('Shared verification input changed without approval');
      const binding = bindings[fixture.id]; if (typeof binding !== 'function') throw new Error('Behavioral binding missing');
      const context = {
        root, caseIds: Object.freeze([...ids]), cleanup: action => cleanup.push(action),
        call: async (boundary, ...args) => {
          if (!CASE_BOUNDARIES[fixture.id]?.includes(boundary) || !boundaries[boundary]) throw new Error('Unapproved or unrelated implementation boundary');
          const record = { boundary, result: 'started' }; calls.push(record);
          try { const result = await boundaries[boundary](...args); record.result = 'returned'; return result; }
          catch (error) { record.result = 'threw'; throw error; }
        },
      };
      // Expectations never reach binding callbacks: observations must come from effects/results, not fixture copies.
      const result = await binding(context, { id: fixture.id, rules: fixture.rules, given: structuredClone(fixture.given), when: fixture.when });
      if (result?.incomplete) {
        if (!calls.length) throw new Error('Incomplete claim did not inspect the actual boundary');
        rows.push({ id: fixture.id, status: 'incomplete', reason: result.incomplete, boundaries: calls }); continue;
      }
      if (!validBehavior({ calls, required: CASE_BOUNDARIES[fixture.id], observation: result?.observation })) throw new Error('Observation did not invoke all required implementation boundaries');
      const expected = fixture.expectByRepository?.xrbuild ?? fixture.expect;
      if (!isDeepStrictEqual(result.observation, expected)) throw new Error(`Observed assertions differ: ${JSON.stringify(result.observation)}`);
      rows.push({ id: fixture.id, status: 'passed', boundaries: calls, ...(result.evidence ? { evidence: result.evidence } : {}) });
    } catch (error) { rows.push({ id: fixture.id, status: 'failed', reason: error.message, boundaries: calls }); }
    finally { for (const action of cleanup.reverse()) await action(); }
  }
  const coverage = assessCoverage(rows, ids);
  return { contract: 'portable-delivery-v1', scope: 'offline-case-assertions-only', liveRuntimeAdoption: 'disabled', releasedRuntimeCompatibility: 'unverified', complete: coverage.complete && rows.every(row => row.status === 'passed'),
    passed: rows.filter(row => row.status === 'passed').length, incomplete: rows.filter(row => row.status === 'incomplete'),
    failures: rows.filter(row => row.status === 'failed'), coverage, cases: rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { deliveryCaseBindings } = await import('./delivery-case-bindings.mjs');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const result = await verifySharedCases({ root, bindings: deliveryCaseBindings });
  console.log(JSON.stringify(result, null, 2)); if (!result.complete) process.exitCode = 1;
}
