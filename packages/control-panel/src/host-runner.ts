// Runs xrb-host for a project (design D4): built mode (--app-dir=<entry>) or dev mode (the
// project's dev server with live reload, --url=http://127.0.0.1:<port>/). Reads the host's
// stdout: "@channel <url>" once, "@status {json}" every second, everything else is the log.
// Stop is always the host's clean exit (taskkill without /F = WM_CLOSE: the display plugin ends its
// session); a forced end is the last resort after 20 s, because it can leave a 3D display in 3D or
// its device in a bad state.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { LineSplitter, stripAnsi } from './jobs.ts';
import type { CursorStyle } from '../../sdk/src/cursor-style.ts';

export type RunMode = 'built' | 'dev';

export interface HostStatusLine {
  uptimeS: number;
  /** the display has a switchable session: the view can switch between 2D and 3D while the app runs (older hosts: absent) */
  session?: boolean;
  /** the page is side by side and shown in 3D */
  stereo?: boolean;
  pageFps: number | null;
  frameMs: number | null;
  latencyMs: number | null;
  eyeW: number | null;
  eyeH: number | null;
  pageAgeMs: number | null;
  handsHz: number;
  handState: string;
  hands: number;
  clients: number;
}

export interface ForeignHost {
  pid: number;
  exe: string;
}

export interface RunState {
  projectId: string | null;
  mode: RunMode | null;
  /** 2D intent: Orthographic managed camera and, when switchView is true, a mono physical display view. */
  flat: boolean;
  /** the host's display has a switchable session: 2D/3D can be switched while the app runs (known from the first status line) */
  switchable: boolean;
  /** this run uses a display whose physical 2D/3D view follows the 2D checkbox */
  switchView: boolean;
  /** input provider can produce debug images during this run */
  cameraAvailable: boolean;
  /** debug images are currently streamed to the Running card */
  cameraView: boolean;
  phase: 'idle' | 'starting' | 'running' | 'stopping';
  pid: number | null;
  startedMs: number | null;
  channelUrl: string | null;
  devUrl: string | null;
  status: HostStatusLine | null;
  last: { projectId: string; exitCode: number | null; endedMs: number; lines: string[]; forced: boolean } | null;
  warning: string | null;
  foreign: ForeignHost[];
}

export interface PreviewRequest {
  projectId: string;
  projectDir: string;
  devScript?: string;
  devEnv?: Record<string, string>;
  devEnvIsolated?: boolean;
  flat?: boolean;
}

export interface RunRequest {
  projectId: string;
  mode: RunMode;
  hostExe: string;
  projectDir: string;
  /** built mode: the folder served at https://app.local/ */
  entryDir: string;
  /** built mode: optional initial page while entryDir remains served at https://app.local/ */
  builtUrl?: string;
  /** Mouse input selection forwarded to the SDK in dev previews. */
  mouseEnabled?: boolean;
  cursor?: CursorStyle;
  /** dev mode: panel address exposed to apps that need the active workspace catalog */
  panelUrl?: string;
  /** dev mode: the dev script name in the project's package.json */
  devScript?: string;
  /** dev mode: extra environment for the dev server (XRB_CORE: where the app's SDK comes from) */
  devEnv?: Record<string, string>;
  /** Treat devEnv as the complete environment instead of inheriting ambient configuration. */
  devEnvIsolated?: boolean;
  flat?: boolean;
  /** true when 2D also controls the display session; false for the desktop mono display */
  switchView?: boolean;
  cameraView?: boolean;
  cameraAvailable?: boolean;
  hostArgs: string[];
}

export function devProcessEnvironment(env?: Record<string, string>, isolated = false): NodeJS.ProcessEnv {
  return isolated ? { ...env } : { ...process.env, ...env };
}

const STOP_GRACE_MS = 20_000;
const LOG_KEEP = 500;

/** Channel message kSetView (native/host/src/host_channel.h): 16-byte header, then u8 stereo. */
export function encodeSetView(stereo: boolean): Uint8Array {
  const b = new Uint8Array(17);
  b[0] = 101;  // kSetView
  b[1] = 1;    // protocol version
  b[16] = stereo ? 1 : 0;
  return b;
}

export function encodeSetCameras(enabled: boolean): Uint8Array {
  const b = encodeSetView(enabled);
  b[0] = 102;  // kSetCameras
  return b;
}

export function encodeSetProjection(orthographic: boolean): Uint8Array {
  const b = encodeSetView(orthographic);
  b[0] = 103;  // kSetProjection
  return b;
}

/** Sends one kSetView to the host's channel: a short-lived client like a page would be. */
export function sendSetView(channelUrl: string, stereo: boolean, Socket: typeof WebSocket = WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new Socket(channelUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('the host channel did not answer within 3 s')); }, 3000);
    ws.onopen = () => {
      ws.send(encodeSetView(stereo));
      // Let the frame leave before closing (the server reads and drops the socket otherwise).
      setTimeout(() => { clearTimeout(timer); ws.close(); resolve(); }, 50);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('cannot reach the host channel')); };
  });
}

/** Exit code of a second host (the single-instance mutex is taken). */
export const EXIT_ALREADY_RUNNING = 3;

export function parseHostLine(line: string): { kind: 'channel'; url: string } | { kind: 'status'; status: HostStatusLine } | { kind: 'log'; text: string } {
  if (line.startsWith('@channel ')) return { kind: 'channel', url: line.slice(9).trim() };
  if (line.startsWith('@status ')) {
    try {
      return { kind: 'status', status: JSON.parse(line.slice(8)) as HostStatusLine };
    } catch {
      /* fall through: show it as a log line */
    }
  }
  return { kind: 'log', text: line };
}

export function sendSetCameras(channelUrl: string, enabled: boolean, Socket: typeof WebSocket = WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new Socket(channelUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('the host channel did not answer within 3 s')); }, 3000);
    ws.onopen = () => {
      ws.send(encodeSetCameras(enabled));
      setTimeout(() => { clearTimeout(timer); ws.close(); resolve(); }, 50);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('cannot reach the host channel')); };
  });
}

export function sendSetProjection(channelUrl: string, orthographic: boolean, Socket: typeof WebSocket = WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new Socket(channelUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('the host channel did not answer within 3 s')); }, 3000);
    ws.onopen = () => {
      ws.send(encodeSetProjection(orthographic));
      setTimeout(() => { clearTimeout(timer); ws.close(); resolve(); }, 50);
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('cannot reach the host channel')); };
  });
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

function httpReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1000 }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** taskkill: without force it posts WM_CLOSE (the host's clean exit). */
export function taskkill(pid: number, force: boolean): Promise<void> {
  const args = force ? ['/PID', String(pid), '/T', '/F'] : ['/PID', String(pid)];
  return new Promise((resolve) => execFile('taskkill.exe', args, { windowsHide: true }, () => resolve()));
}

/**
 * Hosts running outside the panel: processes whose exe folder holds libcef.dll and a plugins
 * folder or xrb-app.json (repo builds and installed packages). CEF helpers (same exe, child of a
 * host) are left out.
 */
export function findHosts(): Promise<ForeignHost[]> {
  const ps = [
    "$all = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | Where-Object {",
    "  $d = Split-Path $_.ExecutablePath;",
    "  (Test-Path (Join-Path $d 'libcef.dll')) -and ((Test-Path (Join-Path $d 'plugins')) -or (Test-Path (Join-Path $d 'xrb-app.json'))) };",
    '$ids = @($all | ForEach-Object { $_.ProcessId });',
    "$all | Where-Object { $ids -notcontains $_.ParentProcessId } | ForEach-Object { \"$($_.ProcessId)`t$($_.ExecutablePath)\" }",
  ].join(' ');
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(
        stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .map((l) => {
            const [pid, exe] = l.split('\t');
            return { pid: Number(pid), exe };
          })
          .filter((h) => h.pid > 0),
      );
    });
  });
}

export class HostRunner extends EventEmitter {
  private host: ChildProcess | null = null;
  private preview: ChildProcess | null = null;
  private previewStopping = false;
  private dev: ChildProcess | null = null;
  private log: string[] = [];
  private s: RunState = { projectId: null, mode: null, flat: false, switchable: false, switchView: false, cameraAvailable: false, cameraView: false, phase: 'idle', pid: null, startedMs: null, channelUrl: null, devUrl: null, status: null, last: null, warning: null, foreign: [] };

  private readonly findForeign: typeof findHosts;
  private readonly kill: typeof taskkill;
  private readonly send: typeof sendSetView;
  private readonly sendCameras: typeof sendSetCameras;
  private readonly sendProjection: typeof sendSetProjection;

  /** The process and channel helpers can be replaced in tests. */
  constructor(findForeign = findHosts, kill = taskkill, send = sendSetView, sendCameras = sendSetCameras, sendProjection = sendSetProjection) {
    super();
    this.findForeign = findForeign;
    this.kill = kill;
    this.send = send;
    this.sendCameras = sendCameras;
    this.sendProjection = sendProjection;
  }

  get projectId(): string | null {
    return this.s.phase === 'idle' ? null : this.s.projectId;
  }

  get busy(): boolean {
    return this.s.phase !== 'idle';
  }

  state(): RunState {
    return { ...this.s };
  }

  logLines(): string[] {
    return [...this.log];
  }

  /** Empties the kept log (the UI's Clear); new host lines keep arriving. */
  clearLog(): void {
    this.log = [];
  }

  private set(patch: Partial<RunState>): void {
    this.s = { ...this.s, ...patch };
    this.emit('state', this.state());
  }

  private addLog(text: string): void {
    text = stripAnsi(text);
    this.log.push(text);
    if (this.log.length > LOG_KEEP) this.log.splice(0, this.log.length - LOG_KEEP);
    this.emit('log', text);
  }

  private async startDev(req: PreviewRequest): Promise<string> {
    if (!req.devScript) throw new Error('this project has no dev script');
    const port = await freePort();
    const devUrl = `http://127.0.0.1:${port}/`;
    this.addLog(`[panel] starting the dev server: corepack pnpm run ${req.devScript} on ${devUrl}`);
    this.dev = spawn('cmd.exe', ['/d', '/s', '/c', `corepack pnpm run ${req.devScript} --host 127.0.0.1 --port ${port} --strictPort`], {
      cwd: req.projectDir, env: devProcessEnvironment(req.devEnv, req.devEnvIsolated), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const devOut = new LineSplitter((l) => this.addLog(`[dev] ${l}`));
    this.dev.stdout!.setEncoding('utf8').on('data', (d: string) => devOut.push(d));
    this.dev.stderr!.setEncoding('utf8').on('data', (d: string) => devOut.push(d));
    const until = Date.now() + 30_000;
    while (!(await httpReady(devUrl))) {
      if (this.dev.exitCode !== null) throw new Error(`the dev server exited (code ${this.dev.exitCode})`);
      if (Date.now() > until) throw new Error('the dev server did not answer within 30 s');
      await sleep(300);
    }
    this.set({ devUrl });
    return devUrl;
  }

  /** Starts and owns one standalone browser preview, including its optional dev server. */
  async startPreview(req: PreviewRequest, mode: RunMode, launch: (devUrl: string | null) => Promise<ChildProcess>): Promise<void> {
    if (this.busy) throw new Error(`${this.s.projectId} is already running; stop it first`);
    this.log = [];
    this.set({ projectId: req.projectId, mode, flat: !!req.flat, switchable: false, switchView: false, cameraAvailable: false, cameraView: false, phase: 'starting', pid: null, startedMs: Date.now(), channelUrl: null, devUrl: null, status: null, warning: null, foreign: [] });
    try {
      const devUrl = mode === 'dev' ? await this.startDev(req) : null;
      const browser = await launch(devUrl);
      if (!browser.pid) throw new Error('the preview browser did not start');
      this.preview = browser;
      this.previewStopping = false;
      browser.on('error', (error) => this.addLog(`[panel] preview browser error: ${error.message}`));
      browser.on('close', (code) => this.onPreviewExit(browser, code));
      if (mode === 'dev') {
        const dev = this.dev!;
        dev.on('close', (code) => {
          if (this.dev !== dev || this.preview !== browser) return;
          this.dev = null;
          this.addLog(`[panel] dev server exited with code ${code}`);
          if (browser.pid && browser.exitCode === null) void this.kill(browser.pid, true);
        });
      }
      this.set({ pid: browser.pid, phase: 'running' });
    } catch (e) {
      const browser = this.preview;
      this.preview = null;
      this.previewStopping = false;
      if (browser?.pid && browser.exitCode === null) await this.kill(browser.pid, true);
      this.stopDev();
      this.addLog(`[panel] ${(e as Error).message}`);
      this.set({ phase: 'idle', pid: null, devUrl: null, last: { projectId: req.projectId, exitCode: null, endedMs: Date.now(), lines: this.log.slice(-30), forced: false }, warning: (e as Error).message });
      throw e;
    }
  }

  private onPreviewExit(browser: ChildProcess, code: number | null): void {
    if (this.preview !== browser) return;
    this.preview = null;
    this.stopDev();
    const projectId = this.s.projectId!;
    const forced = this.previewStopping;
    this.previewStopping = false;
    this.addLog(forced ? '[panel] preview browser stopped' : `[panel] preview browser exited with code ${code}`);
    this.set({ phase: 'idle', pid: null, devUrl: null, last: { projectId, exitCode: code, endedMs: Date.now(), lines: this.log.slice(-30), forced } });
  }

  async start(req: RunRequest): Promise<void> {
    if (this.busy) throw new Error(`${this.s.projectId} is already running; stop it first`);
    this.log = [];
    this.set({ projectId: req.projectId, mode: req.mode, flat: !!req.flat, switchable: false, switchView: !!req.switchView, cameraAvailable: req.cameraAvailable ?? !!req.cameraView, cameraView: !!req.cameraView, phase: 'starting', pid: null, startedMs: Date.now(), channelUrl: null, devUrl: null, status: null, warning: null, foreign: [] });
    try {
      const args = [...req.hostArgs, '--status=stdout', ...(this.s.cameraAvailable ? ['--camera-view=on', `--camera-stream=${req.cameraView ? 'on' : 'off'}`] : [])];
      if (req.mode === 'dev') {
        const devUrl = new URL(await this.startDev(req));
        if (req.panelUrl) {
          devUrl.searchParams.set('xrb-panel', req.panelUrl);
          devUrl.searchParams.set('xrb-project', req.projectId);
        }
        if (req.mouseEnabled !== undefined) devUrl.searchParams.set('xrb-mouse', req.mouseEnabled ? '1' : '0');
        if (req.cursor) devUrl.searchParams.set('xrb-cursor', req.cursor);
        args.push(`--url=${devUrl.href}`);
      } else {
        await fs.access(path.join(req.entryDir, 'index.html')).catch(() => {
          throw new Error(`${req.entryDir} has no index.html: run Build first`);
        });
        args.push(`--app-dir=${req.entryDir}`);
        if (req.builtUrl) args.push(`--url=${req.builtUrl}`);
      }
      this.addLog(`[panel] ${path.basename(req.hostExe)} ${args.join(' ')}`);
      const host = spawn(req.hostExe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.host = host;
      const out = new LineSplitter((l) => this.onHostLine(l));
      host.stdout!.setEncoding('utf8').on('data', (d: string) => out.push(d));
      host.stderr!.setEncoding('utf8').on('data', (d: string) => out.push(d));
      host.on('error', (e) => this.addLog(`[panel] cannot start the host: ${e.message}`));
      host.on('close', (code) => void this.onHostExit(host, code, out));
      this.set({ pid: host.pid ?? null, phase: 'running' });
    } catch (e) {
      this.stopDev();
      this.addLog(`[panel] ${(e as Error).message}`);
      this.set({ phase: 'idle', last: { projectId: req.projectId, exitCode: null, endedMs: Date.now(), lines: this.log.slice(-30), forced: false }, warning: (e as Error).message });
      throw e;
    }
  }

  private onHostLine(line: string): void {
    // A display runtime writes to the same stdout without line locking: a host line can arrive
    // glued to the end of one of its partial lines ("[clien@status {...}"). Split it off.
    const glued = line.search(/@(status|channel) /);
    if (glued > 0) {
      this.onHostLine(line.slice(0, glued));
      this.onHostLine(line.slice(glued));
      return;
    }
    const m = parseHostLine(line);
    if (m.kind === 'channel') this.set({ channelUrl: m.url });
    else if (m.kind === 'status') {
      this.s = { ...this.s, status: m.status };
      this.emit('status', m.status);
      // With a session the host owns the view: the panel shows what it reports (a page may switch too).
      const switchable = m.status.session === true;
      const flat = switchable ? m.status.stereo !== true : this.s.flat;
      if (switchable !== this.s.switchable || flat !== this.s.flat) this.set({ switchable, flat });
    } else this.addLog(m.text);
  }

  private forced = false;

  private async onHostExit(host: ChildProcess, code: number | null, out: LineSplitter): Promise<void> {
    out.flush();
    if (this.host !== host) return;
    this.host = null;
    this.stopDev();
    const projectId = this.s.projectId!;
    const quick = this.s.startedMs !== null && Date.now() - this.s.startedMs < 5000;
    let warning = this.forced ? 'the host did not exit within 20 s and was ended by force: if the display stays in 3D or does not start next time, replug its USB and power' : null;
    let foreign: ForeignHost[] = [];
    if (code === EXIT_ALREADY_RUNNING && quick) {
      foreign = await this.findForeign();
      warning = `another host is already running${foreign.length ? `: ${foreign.map((f) => `${path.basename(f.exe)} (pid ${f.pid})`).join(', ')}` : ''}`;
    }
    this.addLog(`[panel] host exited with code ${code}`);
    this.set({ phase: 'idle', pid: null, channelUrl: null, devUrl: null, last: { projectId, exitCode: code, endedMs: Date.now(), lines: this.log.slice(-30), forced: this.forced }, warning, foreign });
    this.forced = false;
    this.emit('exit', code);
  }

  private stopDev(): void {
    if (this.dev?.pid && this.dev.exitCode === null) void this.kill(this.dev.pid, true);
    this.dev = null;
  }

  /** Clean stop; forced only if the host is still there after the grace period. */
  async stop(graceMs = STOP_GRACE_MS): Promise<void> {
    const preview = this.preview;
    if (preview?.pid) {
      const projectId = this.s.projectId!;
      this.previewStopping = true;
      this.set({ phase: 'stopping' });
      const exited = new Promise<void>((resolve) => preview.once('close', () => resolve()));
      await this.kill(preview.pid, true);
      const done = await Promise.race([exited.then(() => true), sleep(Math.min(graceMs, 5_000)).then(() => false)]);
      if (!done && this.preview === preview) {
        this.preview = null;
        this.previewStopping = false;
        this.stopDev();
        this.addLog('[panel] preview browser stopped');
        this.set({ phase: 'idle', pid: null, devUrl: null, last: { projectId, exitCode: null, endedMs: Date.now(), lines: this.log.slice(-30), forced: true } });
      }
      while (this.s.phase !== 'idle') await sleep(20);
      return;
    }
    const host = this.host;
    if (!host?.pid) {
      const dev = this.dev;
      if (dev?.pid && dev.exitCode === null) {
        const projectId = this.s.projectId!;
        this.set({ phase: 'stopping' });
        this.dev = null;
        await this.kill(dev.pid, true);
        this.addLog('[panel] dev preview stopped');
        this.set({ phase: 'idle', pid: null, devUrl: null, last: { projectId, exitCode: null, endedMs: Date.now(), lines: this.log.slice(-30), forced: false } });
      } else {
        this.stopDev();
        if (this.s.phase !== 'idle') this.set({ phase: 'idle' });
      }
      return;
    }
    this.set({ phase: 'stopping' });
    const exited = new Promise<void>((r) => host.once('close', () => r()));
    await this.kill(host.pid, false);
    const done = await Promise.race([exited.then(() => true), sleep(graceMs).then(() => false)]);
    if (!done) {
      this.forced = true;
      this.addLog(`[panel] the host did not exit within ${graceMs / 1000} s: ending it by force`);
      await this.kill(host.pid, true);
      await exited;
    }
    // onHostExit runs from 'close' and may still be finishing (foreign check).
    while (this.s.phase !== 'idle') await sleep(20);
  }

  /** Bounded app-shell closure cannot stop a native host or a stale/stopping preview. */
  async closePreview(): Promise<void> {
    if (!this.preview || this.s.phase !== 'running') throw new Error('no browser preview is running');
    await this.stop();
  }

  /** Publishes the accepted browser projection so the panel follows the live preview, not its launch preference. */
  setPreviewView(flat: boolean): void {
    if (!this.preview || this.s.phase !== 'running') throw new Error('no browser preview is running');
    if (this.s.flat !== flat) this.set({ flat });
  }

  /** Changes the managed mono camera projection and, for a display session, its physical 2D/3D view. */
  async setView(flat: boolean): Promise<void> {
    if (this.s.phase !== 'running' || !this.s.channelUrl) throw new Error('no app is running');
    if (this.s.switchView && !this.s.switchable) throw new Error('this host cannot switch between 2D and 3D: its display has no switchable session');
    await this.sendProjection(this.s.channelUrl, flat);
    if (this.s.switchView) await this.send(this.s.channelUrl, !flat);
    this.addLog(`[panel] asked the host for ${flat ? '2D / Orthographic' : '3D / Perspective'}`);
    this.set({ flat });  // projection applies at once; a switchable host's next status line confirms the view
  }

  /** Show or hide input debug images during a run without restarting the host. */
  async setCameras(enabled: boolean): Promise<void> {
    if (this.s.phase !== 'running' || !this.s.channelUrl) throw new Error('no app is running');
    if (!this.s.cameraAvailable) throw new Error('this app has no input camera views');
    await this.sendCameras(this.s.channelUrl, enabled);
    this.set({ cameraView: enabled });
  }

  /** Stops a host the panel did not start, the clean way. */
  async stopForeign(pid: number): Promise<void> {
    await this.kill(pid, false);
    this.set({ foreign: this.s.foreign.filter((f) => f.pid !== pid) });
  }
}
