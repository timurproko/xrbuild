// A scoped capability is evidence of an actual coordination critical section, not an invented claim generation.
// INACTIVE: current A1 uses a reclaimable lease. Pre-mutation loss checks cannot fence an already-running child
// during owner suspension. Production requires child-lifetime exclusion; the CLI remains unavailable.
import fs from 'node:fs';
import path from 'node:path';
const scopes = new WeakMap();
const failure = message => Object.assign(new Error(message), { code: 'worktree-cleanup-exclusion' });
const binding = context => JSON.stringify(['root', 'target', 'common', 'admin', 'branch', 'head', 'identity'].map(key => context[key]));
const gateIdentity = file => {
  const stat = fs.lstatSync(file, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino === 0n) throw failure('Unverifiable native coordination gate');
  return { identity: `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`, mtime: Number(stat.mtimeMs) };
};
export function assertOwnershipExclusion(scope, context) {
  const state = scopes.get(scope);
  if (!state?.active || binding(context) !== state.binding) throw failure('Ownership exclusion is missing, expired or bound to another checkout');
  state.assertNative(); return scope;
}
export async function recheckOwnershipExclusion(scope, context) {
  assertOwnershipExclusion(scope, context);
  const state = scopes.get(scope);
  if (await state.readState() !== 'absent') throw failure('Live or unverifiable owner; checkout preserved');
  assertOwnershipExclusion(scope, context);
}
export function ownershipExclusionSignal(scope) {
  const state = scopes.get(scope); if (!state?.active) throw failure('Expired ownership exclusion'); return state.controller.signal;
}

export function requireOwnershipFacilities(runtime, options) {
  if (!options?.dataDir || typeof runtime?.coordination?.withSessionClaimSnapshot !== 'function'
    || typeof runtime.context?.sessionWorktreeClaimState !== 'function'
    || typeof runtime.identity?.state?.sessionWorktreeClaimDirectory !== 'string') throw failure('Supported scoped ownership facility unavailable');
}
/** Current proposed A1 source facilities; not installed-runtime discovery or live adoption. */
export async function withA1OwnershipExclusion({ runtime, options, context }, operation) {
  requireOwnershipFacilities(runtime, options);
  const dataDir = fs.realpathSync.native(options.dataDir);
  const directory = path.join(dataDir, runtime.identity.state.sessionWorktreeClaimDirectory), boundOptions = { ...options, dataDir };
  const readState = () => runtime.context.sessionWorktreeClaimState(context.common, context.admin, boundOptions);
  return await runtime.coordination.withSessionClaimSnapshot(directory, boundOptions, async () => {
    const file = path.join(fs.realpathSync.native(directory), 'mutation.authority.gate'), original = gateIdentity(file);
    const controller = new AbortController(); let state;
    const assertNative = () => {
      const current = gateIdentity(file);
      // The inspected A1 gate has a 10s stale interval. Never start a mutation using an already-stale lease.
      if (current.identity !== original.identity || Date.now() - current.mtime >= 8_000 || controller.signal.aborted) throw failure('Native coordination exclusion changed, expired or was lost');
    };
    assertNative(); if (await readState() !== 'absent') throw failure('Live or unverifiable owner; checkout preserved');
    const scope = Object.freeze({});
    state = { binding: binding(context), active: true, assertNative, readState, controller }; scopes.set(scope, state);
    const monitor = setInterval(() => { try { assertNative(); } catch (error) { controller.abort(error); } }, 100);
    try { return await operation(scope); }
    catch (error) { if (!error.code) error.code = 'worktree-cleanup-execution'; throw error; }
    finally { state.active = false; clearInterval(monitor); controller.abort(); }
  });
}
