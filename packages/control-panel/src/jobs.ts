// Background jobs (design D10): web build, package build, host rebuild, icon render. Output is
// kept per job (last lines, so a reloaded page shows the history) and streamed to the UI.
import { spawn, type SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';

export type JobKind = 'web-build' | 'package' | 'packager-setup' | 'tool-setup' | 'publication' | 'host-rebuild' | 'icon-render' | 'cache-cleanup';
export type JobState = 'queued' | 'running' | 'done' | 'failed';
export type JobOperation = 'publish' | 'update' | 'activate' | 'delete-release' | 'unpublish';

export interface JobPublication {
  enabled: boolean;
  publisher: string;
  id: string;
  slug: string;
  routes?: Record<string, string>;
  versions?: Record<string, string>;
}

/** The immutable release decision a versioned publication job was queued with. */
export interface JobRelease {
  /** requested version (publish/update) */
  version?: string;
  /** retained release to deploy (activate) or remove (delete-release) */
  releaseId?: string;
  /** the catalog revision the request was validated against */
  expectedRevision: string | null;
}

export interface Job {
  id: number;
  kind: JobKind;
  projectId: string | null;
  title: string;
  state: JobState;
  queuedMs: number | null;
  startedMs: number;
  endedMs: number | null;
  exitCode: number | null;
  error: string | null;
  operation: JobOperation | null;
  publication: JobPublication | null;
  release: JobRelease | null;
  result: unknown;
  lines: string[];
}

export const MAX_LINES = 2000;

export class JobRefused extends Error {}

export interface JobContext {
  /** Appends a line to the job output. */
  line(text: string): void;
  /** Runs a program (no shell), streaming its output; rejects on a non-zero exit. */
  run(cmd: string, args: string[], opts?: SpawnOptions): Promise<void>;
}

/** Removes terminal colour/control sequences (ESC [ ... letter). */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '');
}

/** Splits streamed output into lines; progress written with \r counts as a line too. */
export class LineSplitter {
  private rest = '';
  private readonly onLine: (l: string) => void;
  constructor(onLine: (l: string) => void) {
    this.onLine = onLine;
  }
  push(chunk: string): void {
    const parts = (this.rest + chunk).split(/\r\n|\n|\r/);
    this.rest = parts.pop() ?? '';
    for (const p of parts) if (p.trim()) this.onLine(p);
  }
  flush(): void {
    if (this.rest.trim()) this.onLine(this.rest);
    this.rest = '';
  }
}

/** Starts a process and resolves with its exit code; output goes to onLine. */
export function runProcess(cmd: string, args: string[], onLine: (l: string) => void, opts: SpawnOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = new LineSplitter(onLine), err = new LineSplitter(onLine);
    p.stdout!.setEncoding('utf8').on('data', (d: string) => out.push(d));
    p.stderr!.setEncoding('utf8').on('data', (d: string) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      out.flush();
      err.flush();
      resolve(code ?? 1);
    });
  });
}

interface JobWork {
  body: (ctx: JobContext) => Promise<unknown>;
  ctx: JobContext;
}

const terminal = (job: Job) => job.state === 'done' || job.state === 'failed';

export class JobRunner extends EventEmitter {
  private readonly jobs: Job[] = [];
  private readonly work = new Map<number, JobWork>();
  private nextId = 1;
  private readonly keep: number;

  constructor(keep = 30) {
    super();
    this.keep = keep;
  }

  list(): Job[] {
    return this.jobs.map((j) => ({ ...j, lines: j.lines.slice(-200) }));
  }

  get(id: number): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  running(): Job[] {
    return this.jobs.filter((j) => j.state === 'running');
  }

  active(): Job[] {
    return this.jobs.filter((j) => j.state === 'queued' || j.state === 'running');
  }

  /** Forgets finished jobs (done or failed); queued and running ones stay. Returns how many were removed. */
  clearFinished(): number {
    const before = this.jobs.length;
    for (let i = this.jobs.length - 1; i >= 0; i--) if (terminal(this.jobs[i]!)) this.jobs.splice(i, 1);
    return before - this.jobs.length;
  }

  /**
   * Why a new job may not be accepted now, or null. Publication jobs queue behind each other;
   * queued publication still reserves its project against web/package work that uses the same output.
   */
  conflict(kind: JobKind, projectId: string | null): string | null {
    for (const j of this.active()) {
      if (kind === 'cache-cleanup' || j.kind === 'cache-cleanup') return `${j.title} is active: cache maintenance cannot overlap other jobs`;
      if (j.kind === kind) {
        if (kind === 'publication') continue;
        return `a ${kind} job is already running (${j.title})`;
      }
      const pair = new Set([j.kind, kind]);
      if (pair.has('host-rebuild') && (pair.has('package') || pair.has('icon-render')))
        return `${j.title} is running: native rebuild cannot overlap packaging or icon rendering`;
      if (pair.has('packager-setup') && pair.has('package')) return `${j.title} is running: wait for toolchain setup or packaging to finish`;
      if (j.projectId && j.projectId === projectId && (
        (pair.has('package') && pair.has('web-build')) ||
        (pair.has('publication') && (pair.has('web-build') || pair.has('package')))
      )) return `${j.title} is ${j.state} for this project`;
    }
    return null;
  }

  private launch(job: Job): void {
    const work = this.work.get(job.id);
    if (!work) return;
    const waited = job.state === 'queued';
    job.state = 'running';
    job.startedMs = Date.now();
    this.emit('change', job);
    if (waited) work.ctx.line('Starting queued publication job.');
    void (async () => {
      try {
        job.result = await work.body(work.ctx);
        job.state = 'done';
      } catch (e) {
        job.state = 'failed';
        job.error = (e as Error).message;
        work.ctx.line(`FAILED: ${job.error}`);
      }
      job.endedMs = Date.now();
      this.work.delete(job.id);
      this.emit('change', job);
      this.emit('end', job);
      this.pumpPublications();
    })();
  }

  private pumpPublications(): void {
    if (this.running().some((job) => job.kind === 'publication')) return;
    const next = this.jobs.find((job) => job.kind === 'publication' && job.state === 'queued');
    if (next) this.launch(next);
  }

  /** Starts a job or queues a publication job; throws JobRefused for other conflicts. Returns at once. */
  start(
    kind: JobKind,
    projectId: string | null,
    title: string,
    body: (ctx: JobContext) => Promise<unknown>,
    operation: JobOperation | null = null,
    publication: JobPublication | null = null,
    release: JobRelease | null = null,
  ): Job {
    const why = this.conflict(kind, projectId);
    if (why) throw new JobRefused(why);
    const queued = kind === 'publication' && this.active().some((job) => job.kind === 'publication');
    const now = Date.now();
    const job: Job = {
      id: this.nextId++, kind, projectId, title, state: queued ? 'queued' : 'running', queuedMs: queued ? now : null,
      startedMs: now, endedMs: null, exitCode: null, error: null, operation, publication, release: release ? { ...release } : null, result: null, lines: [],
    };
    const line = (raw: string) => {
      const text = stripAnsi(raw);  // tools like vite colour their output even into a pipe
      job.lines.push(text);
      if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES);
      this.emit('line', job, text);
    };
    const ctx: JobContext = {
      line,
      run: async (cmd, args, opts) => {
        line(`> ${[cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
        const code = await runProcess(cmd, args, line, opts);
        job.exitCode = code;
        if (code !== 0) throw new Error(`exit code ${code}`);
      },
    };
    this.jobs.push(job);
    this.work.set(job.id, { body, ctx });
    while (this.jobs.length > this.keep) {
      const i = this.jobs.findIndex(terminal);
      if (i < 0) break;
      this.jobs.splice(i, 1);
    }
    if (queued) {
      this.emit('change', job);
      line('Waiting for the current publication job to finish.');
    } else this.launch(job);
    return job;
  }

  /** Resolves when the job has ended. */
  wait(job: Job): Promise<Job> {
    if (terminal(job)) return Promise.resolve(job);
    return new Promise((resolve) => {
      const on = (j: Job) => {
        if (j.id !== job.id) return;
        this.off('end', on);
        resolve(j);
      };
      this.on('end', on);
    });
  }
}
