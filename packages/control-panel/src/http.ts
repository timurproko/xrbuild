// HTTP plumbing: local-only request checks, JSON bodies and replies, static files, and the
// Server-Sent Events stream the UI listens to.
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { isInside } from './projects.ts';

/**
 * Local-only access (design D11): the Host header must name the panel on a loopback name
 * (blocks DNS rebinding), and every state-changing request must come from the panel's own
 * origin (blocks other sites). Returns the reason for a rejection, or null.
 */
export function checkRequest(method: string, headers: Record<string, string | string[] | undefined>, port: number): string | null {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  const host = String(headers.host ?? '').toLowerCase();
  if (!allowed.includes(host)) return `host "${host}" is not the panel`;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  const origin = String(headers.origin ?? '').toLowerCase();
  if (!allowed.map((h) => `http://${h}`).includes(origin)) return `origin "${origin}" is not the panel`;
  return null;
}

export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, `request body larger than ${limit} bytes`);
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson<T>(req: IncomingMessage): Promise<T> {
  const body = await readBody(req, 1_000_000);
  if (!body.length) return {} as T;
  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    throw new HttpError(400, 'body is not valid JSON');
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves `urlPath` (already stripped of its prefix, still percent-encoded) from `root`.
 * Paths that leave `root` are refused; a folder serves its index.html.
 */
export function serveStatic(res: ServerResponse, root: string, urlPath: string): void {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  } catch {
    throw new HttpError(400, 'bad path');
  }
  rel = rel.replace(/^\/+/, '');
  if (rel.includes('\0') || !isInside(root, rel)) throw new HttpError(403, 'path outside the served folder');
  let file = path.resolve(root, rel);
  let stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat?.isDirectory()) {
    file = path.join(file, 'index.html');
    stat = fs.statSync(file, { throwIfNoEntry: false });
  }
  if (!stat?.isFile()) throw new HttpError(404, `not found: ${rel}`);
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

/** Server-Sent Events: every connected UI gets every event. */
export class EventHub {
  private readonly clients = new Set<ServerResponse>();

  attach(res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': connected\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  send(type: string, data: unknown): void {
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) c.write(msg);
  }

  get size(): number {
    return this.clients.size;
  }

  closeAll(): void {
    for (const c of this.clients) c.end();
    this.clients.clear();
  }
}
