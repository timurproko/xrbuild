// Repository lifetime guard over the supported A1 package boundary. No private coordination files, leases or claim tokens.
import { contextEnvironment } from './git-environment.mjs';
const scopes = new WeakMap();
const failure = message => Object.assign(new Error(message), { code: 'worktree-cleanup-exclusion' });
const binding = context => JSON.stringify(['root', 'target', 'common', 'admin', 'branch', 'head', 'identity'].map(key => context[key]));
export function requireOwnershipFacilities(runtime, options) {
  if (!options || typeof runtime?.snapshot?.captureWorktreeCleanupSnapshot !== 'function'
    || typeof runtime.snapshot?.assertWorktreeCleanupSnapshot !== 'function' || typeof runtime.boundary?.withUnclaimedWorktree !== 'function'
    || typeof runtime.boundary?.executeCleanupCommand !== 'function') throw failure('Supported packaged cleanup boundary unavailable');
}
export function assertOwnershipExclusion(scope, context) {
  const state = scopes.get(scope);
  if (!state?.active || binding(context) !== state.binding) throw failure('Ownership exclusion is missing, expired or bound to another checkout');
  return scope;
}
export async function recheckOwnershipExclusion(scope, context) {
  assertOwnershipExclusion(scope, context);
  const state = scopes.get(scope);
  state.runtime.snapshot.assertWorktreeCleanupSnapshot(state.approved, await state.runtime.snapshot.captureWorktreeCleanupSnapshot(context.target));
  // The supported nested boundary validates the sealed namespace/reservation and actual editing claims.
  await state.runtime.boundary.withUnclaimedWorktree(state.approved, state.options, async () => assertOwnershipExclusion(scope, context));
}
export async function withA1OwnershipExclusion({ runtime, options, context, approved }, operation) {
  requireOwnershipFacilities(runtime, options);
  runtime.snapshot.assertWorktreeCleanupSnapshot(approved, await runtime.snapshot.captureWorktreeCleanupSnapshot(context.target));
  return runtime.boundary.withUnclaimedWorktree(approved, options, async () => {
    const scope = Object.freeze({});
    const state = { active: true, binding: binding(context), runtime, options, approved }; scopes.set(scope, state);
    try { return await operation(scope); } finally { state.active = false; }
  });
}
/** Await the actual Git child through A1's tracked descendant runner; no untracked execFile fallback. */
export async function executeOwnershipCommand(scope, context, command, args) {
  assertOwnershipExclusion(scope, context);
  const state = scopes.get(scope);
  await recheckOwnershipExclusion(scope, context);
  return state.runtime.boundary.executeCleanupCommand(command, args, {
    ...state.options, cwd: context.root, environment: contextEnvironment(), protectTarget: true,
    timeoutMs: 30_000, maxBuffer: 8 * 1024 * 1024,
  });
}
