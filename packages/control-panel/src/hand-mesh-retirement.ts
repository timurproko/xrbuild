import type { HandMeshRun } from './hand-mesh-run.ts';

type Retired = { pending: Promise<boolean> | null; failed: boolean };
/** One optional-process reuse fence for every consumer in a panel, independent of camera ownership. */
export class HandMeshRetirement {
  private retired = new Map<HandMeshRun, Retired>();
  private draining: Promise<boolean> | null = null;
  private joining = new Map<HandMeshRun, Promise<boolean>>();
  get blocked(): boolean { return this.retired.size > 0; }
  get cleanupFailed(): boolean { return [...this.retired.values()].some(entry => entry.failed); }
  /** Register and retire credentials synchronously, before releasing provider/runner ownership. */
  retire(run: HandMeshRun): Promise<boolean> {
    let entry = this.retired.get(run);
    if (!entry) { entry = { pending: null, failed: false }; this.retired.set(run, entry); }
    const pending = this.attempt(run, entry); // Never put a new owner's Stop behind an older slow join.
    if (this.draining) this.joining.set(run, pending);
    return this.drain();
  }
  private attempt(run: HandMeshRun, entry: Retired): Promise<boolean> {
    if (entry.pending) return entry.pending;
    let finish: (verified: boolean) => void = () => {};
    // Install the coalescing barrier before stop() can synchronously call a status listener.
    const pending = new Promise<boolean>(resolve => { finish = verified => {
      if (verified) this.retired.delete(run); else { entry.failed = true; entry.pending = null; }
      resolve(verified);
    }; });
    entry.pending = pending;
    let stopped: Promise<void>;
    try { stopped = run.stop(); } catch (error) { stopped = Promise.reject(error); }
    void Promise.resolve(stopped).then(() => finish(true), () => finish(false));
    return pending;
  }
  /** Coalesce pending joins; retry failed verification only on a new explicit drain attempt. */
  drain(): Promise<boolean> {
    if (this.draining) return this.draining;
    const attempted = new Set<HandMeshRun>();
    this.joining = new Map([...this.retired].flatMap(([run, entry]) => entry.pending ? [[run, entry.pending] as const] : []));
    const operation = Promise.resolve().then(async () => {
      while (true) {
        const batch = [...this.retired].filter(([run]) => !attempted.has(run));
        if (!batch.length) return !this.blocked;
        await Promise.all(batch.map(([run, entry]) => {
          attempted.add(run); return this.joining.get(run) ?? this.attempt(run, entry);
        }));
      }
    }).finally(() => {
      if (this.draining === operation) this.draining = null;
      if ([...this.retired].some(([run, entry]) => !attempted.has(run) && entry.pending)) void this.drain();
    });
    this.draining = operation;
    return operation;
  }
}
