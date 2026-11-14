// Symbolic shared inputs -> actual repository boundaries and observed effects. Never import expected assertions here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { executeGit, attachA1 } from './portable-context.mjs';
import { hashOf } from '../name-guard/name-guard.mjs';
import { APPROVED_HASHES, ROUTING_PARAGRAPH } from './delivery-contract.mjs';
import { candidateBinding } from '../pr-automation/integrate.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const git = (root, ...args) => executeGit(root, ['-c', 'commit.gpgsign=false', ...args]);
const H = 'a'.repeat(40), B = 'b'.repeat(40), F = 'c'.repeat(40), T = 'd'.repeat(40);
const repository = 'timurproko/xrbuild', tasks = '- [x] Implement the reviewed behavior; verify focused checks.\n';
const body = (done = true, finalized = false) => `## Proposal\n\nImprove [coverage](https://example.invalid) and testing.\n\n## Implementation\n\n- [${done ? 'x' : ' '}] Deliver the reviewed behavior.\n\n${done ? '## Acceptance\n\n- The reviewed behavior preserves state.\n\n' : ''}## Automation\n\n\`\`\`openspec-implementation\n${JSON.stringify({ version: 1, change: 'fixture', ...(finalized ? { archive: 'openspec/changes/archive/2026-11-13-fixture', finalizedHead: F } : {}) })}\n\`\`\`\n`;
const pull = overrides => ({ number: 1, node_id: 'PR_fixture', state: 'open', draft: true, labels: [], body: body(), changed_files: 1,
  mergeable: true, mergeable_state: 'clean', head: { ref: 'chore/fixture', sha: H, repo: { full_name: repository } }, base: { ref: 'main', sha: B, repo: { full_name: repository } }, ...overrides });
const gates = overrides => ({ tasks, archiveVerified: true, trustedPolicy: true, protectionVerified: true, threadsResolved: true,
  checks: [{ name: 'CI required', head_sha: H, status: 'completed', conclusion: 'success', app: { id: 15368 } }], ...overrides });
const readyPull = overrides => pull({ draft: false, body: body(true, true), ...overrides });
const actor = { login: 'maintainer', type: 'User', permission: 'write' };
const requestFor = pr => ({ version: 1, operation: 'merge-once', confirmation: 'merge this exact candidate once', decisionId: randomUUID(), actor: actor.login, expected: candidateBinding(pr) });
const capture = async action => { try { return { value: await action() }; } catch (error) { return { error }; } };
const observed = observation => ({ observation });

function sandbox(ctx) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-case-'));
  ctx.cleanup(() => fs.rmSync(directory, { recursive: true, force: true }));
  return fs.realpathSync.native(directory);
}

function gitFixture(ctx, { proposal = false, checkout = true } = {}) {
  const box = sandbox(ctx), seed = path.join(box, 'seed'), remote = path.join(box, 'remote.git'), root = path.join(box, 'primary');
  fs.mkdirSync(seed); git(seed, 'init', '--quiet', '-b', 'main'); git(seed, 'config', 'user.name', 'Fixture'); git(seed, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(seed, '.gitignore'), '.worktrees/\n.artifacts/\n.xrbuild/\n*.local\nnode_modules/\n');
  fs.writeFileSync(path.join(seed, 'source.txt'), 'reviewed source\n');
  fs.mkdirSync(path.join(seed, 'folder')); fs.writeFileSync(path.join(seed, 'folder', 'public.txt'), 'reviewed nested source\n');
  fs.mkdirSync(path.join(seed, 'openspec/changes/fixture'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'openspec/changes/fixture/tasks.md'), '- [ ] Future implementation; verify focused fixtures.\n');
  git(seed, 'add', '.'); git(seed, 'commit', '--quiet', '-m', 'reviewed source');
  git(seed, 'init', '--quiet', '--bare', remote); git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', '--quiet', 'origin', 'main');
  git(box, 'clone', '--quiet', '--no-local', remote, root);
  git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  const branch = 'chore/fixture', target = path.join(root, '.worktrees', 'fixture');
  if (proposal) {
    git(seed, 'switch', '--quiet', '-c', branch);
    fs.mkdirSync(path.join(seed, 'openspec/changes/fixture'), { recursive: true });
    fs.writeFileSync(path.join(seed, 'openspec/changes/fixture/proposal.md'), '## Why\n\nPreserve this reviewed real proposal.\n');
    git(seed, 'add', '.'); git(seed, 'commit', '--quiet', '-m', 'reviewed proposal'); git(seed, 'push', '--quiet', 'origin', branch);
  }
  if (checkout) { git(root, 'worktree', 'add', '--quiet', '-b', branch, target); git(root, 'push', '--quiet', 'origin', branch); }
  const calls = [], execute = (cwd, args, options) => { calls.push([...args]); return executeGit(cwd, args, options); };
  const identify = directory => git(directory, 'remote', 'get-url', 'origin') === remote ? repository : 'foreign/repository';
  const readClaims = context => ({ state: 'available', target: context.target, generation: 'fixture-owned-generation' });
  return { root, target, seed, remote, branch, calls, execute, identify, readClaims,
    options: { root, target, execute, identify, readClaims, log: () => {} } };
}

function planningService({ lostResponse = false, stale = false } = {}) {
  const plan = { repository: 'example/public-core', base: 'main', head: 'docs/fixture', change: 'fixture', title: 'docs(openspec): propose fixture', body: body(false), publicReviewed: true,
    files: ['proposal.md', 'design.md', 'tasks.md'].map(name => ({ path: `openspec/changes/fixture/${name}`, content: name === 'tasks.md' ? '- [ ] Deliver behavior; verify focused checks.\n' : '# Reviewed real public plan\n' })) };
  let tip = stale ? F : null, pr = null, first = true; const calls = [];
  const request = (endpoint, options = {}) => {
    const method = options.method ?? 'GET'; calls.push({ endpoint, method, body: options.body });
    if (endpoint === 'repos/example/public-core') return { full_name: plan.repository, private: false };
    if (endpoint.endsWith('/git/ref/heads/main')) return { object: { sha: H } };
    if (endpoint.endsWith('/git/ref/heads/docs%2Ffixture')) { if (!tip) throw Object.assign(Error('missing'), { status: 404 }); return { object: { sha: tip } }; }
    if (endpoint.includes('/compare/')) return { status: 'ahead', files: [{ filename: plan.files[0].path }] };
    if (/\/git\/commits\//.test(endpoint)) return { tree: { sha: tip ? T : B } };
    if (endpoint.endsWith('/git/trees')) return { sha: T };
    if (endpoint.endsWith('/git/commits')) return { sha: F };
    if (endpoint.endsWith('/git/refs') || endpoint.includes('/git/refs/heads/')) { tip = options.body.sha; return {}; }
    if (endpoint.includes('/pulls?')) return pr ? [pr] : [];
    if (endpoint.endsWith('/pulls')) {
      pr = { number: 1, title: plan.title, body: plan.body, state: 'open', draft: true, head: { sha: tip, ref: plan.head, repo: { full_name: plan.repository } }, base: { ref: plan.base } };
      if (lostResponse && first) { first = false; throw Error('response lost'); }
      return pr;
    }
    if (endpoint.endsWith('/pulls/1')) return pr;
    throw Error('Unexpected mocked planning request');
  };
  return { plan, request, calls, tip: () => tip, options: { request, banned: new Set([hashOf('restrictedword')]) } };
}

function integrationFixture(pr = readyPull(), evidence = gates()) {
  const mutations = [], consumed = new Set();
  return { mutations, pr, options: { request: requestFor(pr), readCandidate: () => pr, readEvidence: () => evidence, readActor: () => actor,
    consumeDecision: request => { if (consumed.has(request.decisionId)) return false; consumed.add(request.decisionId); return true; },
    merge: payload => { mutations.push(payload); return { merged: true }; } } };
}

export const deliveryCaseBindings = {
  async C01(ctx) {
    const writes = []; const result = await ctx.call('scope', { paths: ['.claude/skills/openspec-apply-change/SKILL.md'] });
    if (result.allowed) writes.push('framework');
    return observed({ blocked: !result.allowed, frameworkEdits: writes.length, requiresSeparateScope: result.requiresSeparateScope });
  },
  async C02(ctx) { const result = await ctx.call('scope', { paths: ['AGENTS.md'], frameworkOverrideRequested: true }); return observed({ blocked: !result.allowed, indirectOverrideAllowed: result.allowed }); },
  async C03(ctx) {
    const service = planningService(), result = await ctx.call('planning', service.plan, service.options);
    const tree = service.calls.find(call => call.endpoint.endsWith('/git/trees')).body.tree;
    return observed({ draft: service.calls.find(call => call.endpoint.endsWith('/pulls') && call.method === 'POST').body.draft,
      implementationEdits: tree.filter(file => !file.path.startsWith('openspec/changes/fixture/')).length,
      setupCalls: service.calls.filter(call => /install/.test(call.endpoint)).length, sweepCalls: service.calls.filter(call => /sweep/.test(call.endpoint)).length,
      implementationOutcomesChecked: result.publication === 'verified' ? (service.plan.body.match(/\[[xX]\]/g) ?? []).length : -1 });
  },
  async C04(ctx) {
    const root = sandbox(ctx), counts = { pushCalls: 0, prMutationCalls: 0, mergeCalls: 0 };
    const authority = await ctx.call('authority', { kind: 'edit', scopeApproved: true, frameworkRequirementsSatisfied: true });
    await ctx.call('operation', { authority, operation: 'edit', action: () => fs.writeFileSync(path.join(root, 'source.txt'), 'local edit') });
    for (const [operation, field] of [['push', 'pushCalls'], ['update-pr', 'prMutationCalls'], ['merge', 'mergeCalls']]) await ctx.call('operation', { authority, operation, action: () => counts[field]++ });
    if (!fs.existsSync(path.join(root, 'source.txt'))) throw Error('Local edit did not occur'); return observed(counts);
  },
  async C05(ctx) {
    const authority = await ctx.call('authority', { kind: 'deliver-approved', scopePresented: true, frameworkRequirementsSatisfied: true });
    return observed({ duplicateApprovalRequired: !authority.allowed.includes('edit'), scopedPublicationAllowed: authority.allowed.includes('push'), mergeAuthorized: authority.mergeAuthorized, remoteDeletionAuthorized: authority.remoteDeletionAuthorized });
  },
  async C06(ctx) {
    let edits = 0; const authority = await ctx.call('authority', { kind: 'deliver-approved', scopePresented: true, scopeApproved: true, materialChangeRequestedByAgent: true });
    const result = await ctx.call('operation', { authority, operation: 'edit', action: () => edits++ });
    return observed({ blocked: !result.performed, approvalRequired: authority.approvalRequired, affectedImplementationEdits: edits });
  },
  async C07(ctx) {
    const service = planningService({ stale: true }), before = service.tip();
    const result = await capture(() => ctx.call('planning', { ...service.plan, expectedHead: H }, service.options));
    return observed({ existingHeadReplaced: service.tip() !== before, forceUpdates: service.calls.filter(call => call.body?.force === true).length,
      remoteDeletionCalls: service.calls.filter(call => call.method === 'DELETE').length, concurrencyConflictReported: Boolean(result.error && /changed|expectedHead/.test(result.error.message)) });
  },
  async C08(ctx) {
    const service = planningService({ lostResponse: true }); await capture(() => ctx.call('planning', service.plan, service.options));
    const result = await ctx.call('planning', { ...service.plan, expectedHead: service.tip() }, service.options);
    return observed({ matchingPrReused: result.reused, duplicatePrCreated: service.calls.filter(call => call.endpoint.endsWith('/pulls') && call.method === 'POST').length > 1, branchDeleted: service.calls.some(call => call.method === 'DELETE') });
  },
  async C09(ctx) {
    const f = gitFixture(ctx, { proposal: true, checkout: false }), before = git(f.root, 'rev-parse', 'HEAD'); let installs = 0;
    const target = await ctx.call('enter', f.branch, { ...f.options, installFn: () => installs++ });
    return observed({ proposalHistoryPreserved: git(target, 'rev-parse', 'HEAD') === git(f.seed, 'rev-parse', 'HEAD'),
      sameBranchAndPr: git(target, 'branch', '--show-current') === f.branch && git(f.remote, 'rev-parse', f.branch) === git(target, 'rev-parse', 'HEAD'),
      primaryChanged: git(f.root, 'rev-parse', 'HEAD') !== before || git(f.root, 'branch', '--show-current') !== 'main', dependencyInstallImplicit: installs > 0 });
  },
  async C10(ctx) {
    const f = gitFixture(ctx); fs.appendFileSync(path.join(f.target, 'source.txt'), 'owned edit\n'); const before = fs.readFileSync(path.join(f.target, 'source.txt'));
    const target = await ctx.call('enter', f.branch, { ...f.options, acquireOwnership: directory => attachA1(directory, () => {}) });
    return observed({ dirtyEditsPreserved: before.equals(fs.readFileSync(path.join(target, 'source.txt'))), resetCalls: f.calls.filter(args => args[0] === 'reset').length,
      replacementCheckoutCreated: fs.readdirSync(path.join(f.root, '.worktrees')).length !== 1 });
  },
  async C11(ctx) {
    const f = gitFixture(ctx), attempts = []; const before = fs.readFileSync(path.join(f.target, 'source.txt'));
    const result = await capture(() => ctx.call('enter', f.branch, { ...f.options, acquireOwnership: directory => attachA1(directory, (_command, args) => { attempts.push(args); throw Error('live owner'); }) }));
    return observed({ blocked: Boolean(result.error), takeover: attempts.some(args => args.includes('--force') || args.includes('--takeover')),
      primaryFallback: f.calls.some(args => ['switch', 'checkout'].includes(args[0])), existingFilesPreserved: before.equals(fs.readFileSync(path.join(f.target, 'source.txt'))) });
  },
  async C12(ctx) {
    const f = gitFixture(ctx, { checkout: false }), messages = []; let edits = 0;
    await capture(() => ctx.call('enter', f.branch, { ...f.options, install: true, installFn: () => edits++, acquireOwnership: () => false, log: message => messages.push(message) }));
    return observed({ implementationEdits: edits, successClaimed: messages.some(message => message.startsWith('Git checkout:')), primaryFallback: git(f.root, 'branch', '--show-current') !== 'main' });
  },
  async C13(ctx) {
    const f = gitFixture(ctx, { checkout: false }); let installs = 0;
    const target = await ctx.call('enter', f.branch, { ...f.options, installFn: () => installs++ });
    fs.appendFileSync(path.join(target, 'source.txt'), 'external owned edit\n');
    return observed({ a1InstallationRequired: installs > 0, runtimeIdentityForged: fs.existsSync(path.join(target, '.artifacts', 'runtime.json')) });
  },
  async C14(ctx) {
    const root = sandbox(ctx), file = path.join(root, 'tasks.md'); fs.writeFileSync(file, '- [ ] First outcome\n- [ ] Second outcome\n- [ ] Third outcome\n');
    const evidence = await ctx.call('completion', { codeWritten: true, testsWritten: true, published: false }); let writes = 0;
    const result = await ctx.call('operation', { authority: { allowed: ['record-local-progress', 'edit'] }, operation: 'record-local-progress',
      action: () => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('[ ] First', '[x] First')) });
    await ctx.call('operation', { authority: { allowed: ['edit'] }, operation: 'edit', action: () => { writes++; fs.writeFileSync(path.join(root, 'second.txt'), 'next local outcome'); } });
    return observed({ nextOutcomeBlockedByPush: writes === 0, localProgressRecorded: result.performed && fs.readFileSync(file, 'utf8').includes('[x] First'), unpublishedPrCheckboxChecked: evidence.publishedComplete });
  },
  async C15(ctx) { const result = await ctx.call('body', body(), tasks); return observed({ accepted: result.status === 'complete', inventedOutcomeRequired: Boolean(result.reason?.includes('second')), testingVocabularyRejected: Boolean(result.reason?.includes('testing')) }); },
  async C16(ctx, fixture) {
    const text = body().replace('- [x] Deliver the reviewed behavior.', Array.from({ length: fixture.given.meaningfulOutcomes }, (_, i) => `- [x] Cover [behavior ${i}](https://example.invalid) and testing.`).join('\n'));
    const result = await ctx.call('body', text, tasks); return observed({ styleOnlyRejection: result.status !== 'complete', outcomeCountRejection: Boolean(result.reason?.includes('count')) });
  },
  async C17(ctx) {
    let writes = 0; const result = await ctx.call('promotion', { repository, number: 1, get: () => pull({ body: body().replace('"version":1', '"version":8') }), read: () => tasks, head: () => H, ready: () => writes++ });
    return observed({ promoted: result.status === 'promoted', finalizationWrites: writes, blockerReported: result.status === 'blocked' });
  },
  async C18(ctx) { let pushes = 0; const result = await ctx.call('operation', { authority: { allowed: ['push'] }, operation: 'push', targetedCheckFailed: true, action: () => pushes++ }); return observed({ pushAllowed: pushes > 0, failureDisclosed: result.failureDisclosed, assertionsWeakened: result.performed }); },
  async C19(ctx) { const result = await ctx.call('completion', { codeWritten: true, testsWritten: true, published: true, ciObserved: 'pending', deviceObserved: false }); return observed({ implementationMayBeChecked: result.publishedComplete, ciSuccessClaimed: result.ciPassed, deviceAcceptanceClaimed: result.deviceAccepted, agentReadyMutation: Object.hasOwn(result, 'ready') }); },
  async C20(ctx) { let reads = 0, writes = 0; const result = await ctx.call('promotion', { repository, number: 1, get: () => ++reads === 1 ? pull() : pull({ head: { ...pull().head, sha: F } }), read: () => tasks, head: () => H, ready: () => writes++ }); return observed({ promoted: result.status === 'promoted', staleSnapshotUsed: writes > 0 }); },
  async C21(ctx) {
    const writes = { promotionWrites: 0, finalizationWrites: 0, automaticRefreshWrites: 0, automationOwnedMergeWrites: 0 }, held = pull({ labels: [{ name: 'delivery-hold' }] });
    await ctx.call('promotion', { repository, number: 1, get: () => held, read: () => tasks, head: () => H, ready: () => writes.promotionWrites++ });
    await ctx.call('finalization', { repository, number: 1, get: () => ({ ...held, draft: false }), head: () => H, finalize: () => writes.finalizationWrites++, push: () => writes.finalizationWrites++, update: () => writes.finalizationWrites++ });
    await ctx.call('refresh', { repository, request: (endpoint, options) => { if (options?.method) writes.automaticRefreshWrites++; return { body: endpoint.includes('/pulls?') ? [{ number: 1 }] : { ...held, draft: false } }; } });
    await ctx.call('documentation', { repository, number: 1, get: () => ({ ...held, draft: false }), readFiles: () => [{ filename: 'README.md', status: 'modified', patch: '+ Clear intro' }], mutate: () => writes.automationOwnedMergeWrites++ });
    return observed(writes);
  },
  async C22(ctx) {
    let reads = 0, writes = 0, activeReads = 0;
    const result = await ctx.call('promotion', { repository, number: 1, get: () => { reads++; return pull({ body: body(true, true) }); }, head: () => H, ancestor: object => object === F,
      read: file => { if (file === 'openspec/changes/fixture/tasks.md') { activeReads++; return null; } return file === 'openspec/changes/archive/2026-11-13-fixture/tasks.md' ? tasks : null; }, ready: () => writes++ });
    if (result.status !== 'promoted' || writes !== 1) throw Error('Verified archived draft did not resume');
    return observed({ freshValidationRequired: reads >= 2 && activeReads >= 2, activeArtifactsRecreated: result.status === 'restored', oldMergeAuthorityReused: result.status === 'merged' });
  },
  async C23(ctx) { const f = integrationFixture(); await ctx.call('integration', { ...f.options, request: null }); return observed({ mergeCalls: f.mutations.length, agentAutoMergeArms: f.mutations.filter(item => item.auto_merge).length }); },
  async C24(ctx) {
    const f = integrationFixture(); await ctx.call('integration', f.options);
    return observed({ protectedSquashCalls: f.mutations.filter(item => item.merge_method === 'squash').length, expectedHeadEnforced: f.mutations[0]?.sha === H,
      adminBypass: f.mutations.some(item => item.bypass || item.force || item.admin), manualTestRequired: Object.hasOwn(f.options.request, 'manualTest') });
  },
  async C25(ctx) { const f = integrationFixture(readyPull(), gates({ checks: [] })), result = await ctx.call('integration', f.options); return observed({ mergeCalls: f.mutations.length, waitOrPollCalls: f.mutations.filter(item => item.wait || item.poll).length, autoMergeArms: f.mutations.filter(item => item.auto_merge).length, retainedFutureAuthority: result.futureAuthority }); },
  async C26(ctx) { const pr = readyPull({ mergeable_state: 'behind' }), result = await ctx.call('integrationCurrency', pr, gates(), candidateBinding(pr)); return observed({ eligible: result.status === 'eligible', newStrictBaseGateApplied: result.strictBaseGateApplied }); },
  async C27(ctx) { const original = readyPull(), changed = readyPull({ body: original.body.replace('preserves state', 'preserves changed state') }), result = await ctx.call('integrationCurrency', changed, gates(), candidateBinding(original)); return observed({ previousAuthorityValid: result.status === 'eligible', freshDecisionRequired: /fresh decision/.test(result.reason) }); },
  async C28(ctx) { const result = await ctx.call('personalArm', readyPull({ auto_merge: { enabled_by: { login: 'maintainer', type: 'User' }, enabled_at: '2026-11-13T12:00:00Z' } })); return observed({ acceptanceInferred: result.acceptanceInferred, unrelatedHumanArmCancelled: result.unrelatedHumanArmCancelled, safePauseOrContinuationPromised: result.continuationPromised, blockerReported: result.status === 'blocked' }); },
  async C29(ctx) {
    const calls = []; const result = await ctx.call('documentation', { repository, number: 1, get: () => readyPull({ body: '' }), readFiles: () => [{ filename: 'README.md', status: 'modified', patch: '+ Clear intro' }], getWorkflow: () => ({ state: 'disabled_manually' }), mutate: action => calls.push(action) });
    return observed({ automationRouteEligible: result.status === 'arm', workflowEnabledAsSideEffect: calls.includes('enable') });
  },
  async C30(ctx, fixture) { const result = await ctx.call('documentationDiff', [{ filename: fixture.given.renamedTo, previous_filename: fixture.given.renamedFrom, status: 'renamed', patch: '+ Clarified prose' }]); return observed({ automationRouteEligible: result.routine, renameSourceInspected: result.paths.includes(fixture.given.renamedFrom) }); },
  async C31(ctx) { const calls = []; await ctx.call('documentation', { repository, number: 1, get: () => readyPull({ body: '', labels: [{ name: 'no-auto-merge' }] }), readFiles: () => [{ filename: 'README.md', status: 'modified', patch: '+ Clear intro' }], mutate: action => calls.push(action) }); return observed({ automationOwnedMergeWrites: calls.filter(item => item === 'merge').length, automationOwnedArmWrites: calls.filter(item => item === 'arm').length }); },
  async C32(ctx) {
    const f = gitFixture(ctx); const head = git(f.target, 'rev-parse', 'HEAD'), local = git(f.root, 'commit-tree', `${head}^{tree}`, '-p', head, '-m', 'local continuation'); git(f.target, 'checkout', '--quiet', '--detach', local);
    const result = await ctx.call('handoff', { ...f.options, worktree: f.target, branch: null, change: 'fixture', pr: 1 });
    return observed({ publicationVerified: result.record.publicationVerified, unpublishedWorkReported: result.record.unpublishedWork, remotelyAvailableClaimed: result.report.includes('Publication: HEAD contained') });
  },
  async C33(ctx) { const service = planningService(), result = await ctx.call('planning', service.plan, service.options); return observed({ localRegistrationRequired: service.calls.some(call => /handoff|worktree/.test(call.endpoint)), inventedLocalPath: Object.hasOwn(result, 'worktree') || Object.hasOwn(result, 'path'), branchAndPrReported: result.branch === service.plan.head && result.pr === 1 }); },
  async C34(ctx) { const f = gitFixture(ctx), head = git(f.target, 'rev-parse', 'HEAD'), result = await ctx.call('removal', f.options); return observed({ checkoutRemoved: !fs.existsSync(f.target), localBranchPreserved: git(f.root, 'rev-parse', f.branch) === head, remoteWrites: f.calls.filter(args => args[0] === 'push').length, acceptanceClaimed: Object.hasOwn(result, 'acceptance') }); },
  async C35(ctx) {
    const f = gitFixture(ctx), head = git(f.target, 'rev-parse', 'HEAD'), next = git(f.remote, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', `${head}^{tree}`, '-p', head, '-m', 'remote descendant'); git(f.remote, 'update-ref', `refs/heads/${f.branch}`, next);
    const result = await ctx.call('publication', f.root, f.branch, head, { identify: f.identify, execute: f.execute }); return observed({ publicationVerified: result.publicationVerified, identicalTipsRequired: result.localHead === result.remoteHead });
  },
  async C36(ctx) {
    const f = gitFixture(ctx), before = git(f.root, 'rev-parse', f.branch); fs.renameSync(f.remote, f.remote + '.offline');
    const result = await capture(() => ctx.call('removal', f.options)); return observed({ checkoutRemoved: !fs.existsSync(f.target), refsPreserved: git(f.root, 'rev-parse', f.branch) === before, publicationBlockerReported: /Publication blocker/.test(result.error?.message ?? '') });
  },
  async C37(ctx, fixture) {
    const rows = [];
    for (const hazard of fixture.given.preservationHazards) {
      const f = gitFixture(ctx), options = { ...f.options };
      if (hazard === 'dirty') fs.appendFileSync(path.join(f.target, 'source.txt'), 'local edit');
      else if (hazard === 'untracked') fs.writeFileSync(path.join(f.target, 'personal.txt'), 'untracked data');
      else if (hazard === 'unknown-ignored') fs.writeFileSync(path.join(f.target, 'personal.local'), 'ignored data');
      else if (hazard === 'private-workspace') { fs.mkdirSync(path.join(f.target, '.xrbuild')); fs.writeFileSync(path.join(f.target, '.xrbuild', 'private.txt'), 'synthetic private data'); }
      else if (hazard === 'KEEP') { fs.mkdirSync(path.join(f.target, '.artifacts')); fs.writeFileSync(path.join(f.target, '.artifacts', 'KEEP'), 'keep synthetic data'); }
      else if (hazard === 'nested-Git') git(path.join(f.target, 'folder'), 'init', '--quiet');
      else if (hazard === 'gitlink') { git(f.target, 'update-index', '--add', '--cacheinfo', `160000,${git(f.target, 'rev-parse', 'HEAD')},module`); git(f.target, 'commit', '--quiet', '-m', 'published gitlink fixture'); git(f.target, 'push', '--quiet', 'origin', f.branch); }
      else if (hazard === 'unsafe-link') fs.symlinkSync(f.root, path.join(f.target, 'folder', 'linked'), 'junction');
      else if (hazard === 'live-owner') options.readClaims = context => ({ state: 'live', target: context.target, generation: 'busy' });
      else if (hazard === 'unverifiable-owner') options.readClaims = () => ({ state: 'unknown' });
      else if (hazard === 'primary-or-current-directory') options.cwd = f.target;
      else throw Error('Unbound shared hazard');
      const before = fs.readFileSync(path.join(f.target, 'source.txt')), head = git(f.root, 'rev-parse', f.branch);
      const result = await capture(() => ctx.call('removal', options));
      rows.push({ blocked: Boolean(result.error), present: fs.existsSync(f.target), data: before.equals(fs.readFileSync(path.join(f.target, 'source.txt'))) && git(f.root, 'rev-parse', f.branch) === head, calls: f.calls });
    }
    const calls = rows.flatMap(row => row.calls);
    return observed({ checkoutRemoved: rows.some(row => !row.present), privateExportCalls: calls.filter(args => ['archive', 'clone', 'push', 'bundle'].includes(args[0])).length,
      forceRemovalCalls: calls.filter(args => args.includes('--force') || args.includes('-f')).length, processTerminationCalls: calls.filter(args => ['kill', 'taskkill'].includes(args[0])).length,
      userDataPreserved: rows.length === fixture.given.preservationHazards.length && rows.every(row => row.blocked && row.data) });
  },
  async C38(ctx) {
    const f = gitFixture(ctx); fs.writeFileSync(path.join(f.target, '.gitmodules'), '# Regular descriptor, no gitlinks or initialized modules.\n'); git(f.target, 'add', '.gitmodules'); git(f.target, 'commit', '--quiet', '-m', 'regular descriptor'); git(f.target, 'push', '--quiet', 'origin', f.branch);
    const result = await capture(() => ctx.call('inspection', f.options)); return observed({ blockedSolelyByGitmodules: Boolean(result.error) });
  },
  async C39(ctx) { const result = await capture(() => ctx.call('runtime')); return { incomplete: result.error?.message ?? 'Compatible released runtime sequencing is not verified' }; },
  async C40(ctx) { const result = await capture(() => ctx.call('runtime')); return observed({ unavailableReported: /unavailable/.test(result.error?.message ?? ''), completeSubstituted: Boolean(result.value?.complete), discardSubstituted: Boolean(result.value?.discard), sweepSubstituted: Boolean(result.value?.sweep), runtimeDeletionCalls: result.value?.deletions ?? 0 }); },
  async C41(ctx) {
    const f = gitFixture(ctx), before = git(f.root, 'rev-parse', f.branch);
    const execute = (root, args, options) => {
      const result = f.execute(root, args, options);
      if (args[0] === 'worktree' && args[1] === 'remove') { git(f.root, 'worktree', 'add', '--quiet', f.target, f.branch); fs.writeFileSync(path.join(f.target, 'personal.txt'), 'recreated data'); throw Error('interrupted settlement'); }
      return result;
    };
    await capture(() => ctx.call('removal', { ...f.options, execute })); await capture(() => ctx.call('removal', f.options));
    return observed({ recreatedCheckoutPreserved: fs.readFileSync(path.join(f.target, 'personal.txt'), 'utf8') === 'recreated data', retainedRefsPreserved: git(f.root, 'rev-parse', f.branch) === before });
  },
  async C42(ctx) { const service = planningService(), result = await ctx.call('planning', service.plan, service.options); return observed({ worktreeRequired: Object.hasOwn(result, 'worktree'), credentialPersistence: service.calls.some(call => call.body?.credentials || call.body?.token) }); },
  async C43(ctx) {
    const root = sandbox(ctx), result = await ctx.call('scratch', root, 'body.json'); fs.mkdirSync(path.dirname(result.path)); fs.writeFileSync(result.path, 'secret-free scratch');
    const escape = await capture(() => ctx.call('scratch', root, '../other/body.json'));
    return observed({ underOwningArtifacts: path.dirname(result.path) === path.join(root, '.artifacts'), crossCheckoutScratch: !escape.error, durableEvidenceScratchOnly: result.durableEvidence });
  },
  async C44(ctx) {
    const file = path.join(ctx.root, 'docs/delivery-rules.md'), bytes = fs.readFileSync(file), changed = Buffer.from(bytes); changed[0] ^= 1;
    const result = await capture(() => ctx.call('installation', { root: ctx.root, read: relative => relative === 'docs/delivery-rules.md' ? changed : fs.readFileSync(path.join(ctx.root, relative)) }));
    return observed({ passed: !result.error, selfRehashAllowed: hash(changed) === APPROVED_HASHES['delivery-rules.md'] });
  },
  async C45(ctx) {
    const data = JSON.parse(fs.readFileSync(path.join(ctx.root, 'docs/delivery-adapters.json'))); data.repositories.xrbuild.baseCurrency = 'strict-current-target';
    const changed = Buffer.from(JSON.stringify(data) + '\n'), manifest = JSON.parse(fs.readFileSync(path.join(ctx.root, 'docs/delivery-contract.json'))); manifest.files['delivery-adapters.json'].sha256 = hash(changed);
    const result = await capture(() => ctx.call('installation', { root: ctx.root, read: relative => relative.endsWith('/delivery-adapters.json') ? changed : relative.endsWith('/delivery-contract.json') ? Buffer.from(JSON.stringify(manifest) + '\n') : fs.readFileSync(path.join(ctx.root, relative)) }));
    return observed({ passed: !result.error, approvalInferredFromDigest: !result.error && hash(changed) === manifest.files['delivery-adapters.json'].sha256 });
  },
  async C46(ctx) { const rows = ctx.caseIds.filter(id => id !== 'C20').map(id => ({ id, status: 'passed' })), result = await ctx.call('coverage', rows); return observed({ passed: result.complete, missingCoverageReported: result.missing.length > 0 }); },
  async C47(ctx) { const fakeAdapter = () => ({ accepted: true }), result = await ctx.call('behavior', { calls: [], required: ['body'], observation: fakeAdapter() }); return observed({ verificationAccepted: Boolean(result) }); },
  async C48(ctx) {
    const root = sandbox(ctx), work = path.join(root, 'owned.txt'), file = path.join(root, 'tasks.md'); fs.writeFileSync(work, 'preserved owned work'); fs.writeFileSync(file, '- [x] Prior unrelated completion.\n');
    const before = await ctx.call('reconciliation', { implementationStarted: true, contractChanged: true, reconciliationRecorded: false, currentHead: H });
    fs.writeFileSync(path.join(root, 'contract-reconciliation.md'), `Inspected ${H}; preserved work and recorded blockers.`);
    const after = await ctx.call('reconciliation', { implementationStarted: true, contractChanged: true, reconciliationRecorded: true, inspectedHead: H, currentHead: H });
    if (!after.allowed) throw Error('Head-bound reconciliation was not accepted');
    return observed({ reconciliationRequiredFirst: before.reconciliationRequired, existingWorkDiscarded: !fs.existsSync(work) || fs.readFileSync(work, 'utf8') !== 'preserved owned work', earlierInterpretationGrandfathered: before.allowed, unrelatedCompletedTasksReset: !fs.readFileSync(file, 'utf8').includes('[x]') });
  },
  async C49(ctx) {
    const result = await ctx.call('installation', { root: ctx.root }), framework = await ctx.call('framework', { root: ctx.root });
    const count = fs.readFileSync(path.join(ctx.root, 'AGENTS.md'), 'utf8').split(ROUTING_PARAGRAPH).length - 1;
    return observed({ passed: result.contract === 'portable-delivery-v1' && framework.unchanged && count === 1, companionNetworkReadRequiredForOfflineUse: Object.hasOwn(result, 'companionNetwork') });
  },
  async C50(ctx) { const result = await ctx.call('reconciliation', { materialConflict: true, refinementApproved: false }); return observed({ affectedActionBlocked: !result.allowed, agentInventedException: result.allowed, clarificationRequested: result.clarificationRequired }); },
};
