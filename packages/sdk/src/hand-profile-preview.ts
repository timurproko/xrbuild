import type { HandProfileAck } from './hand-profile-control.ts';
/** Authenticated managed-preview transport. Deployment metadata never enables this subscription. */
export function previewHandScope(search: string): { runId: string; endpoint: URL } | null {
  try {
    const q = new URLSearchParams(search), panel = new URL(q.get('xrb-preview-panel') ?? '');
    const token = q.get('xrb-preview-token'), session = q.get('xrb-preview-session'), route = q.get('xrb-preview-route'), project = q.get('xrb-hand-project') ?? q.get('xrb-project');
    if (panel.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(panel.hostname) || panel.username || panel.password
      || !/^[a-zA-Z0-9-]{16,80}$/.test(token ?? '') || !/^[a-zA-Z0-9-]{16,80}$/.test(session ?? '') || !route?.startsWith('/preview/') || !project) return null;
    const endpoint = new URL('/api/preview/hands', panel);
    for (const [k, v] of Object.entries({ token, session, route, project })) endpoint.searchParams.set(k, v!);
    return { runId: session!, endpoint };
  } catch { return null; }
}
export function subscribeHandProfile(endpoint: URL, receive: (value: unknown) => void): { close(): void; ack(e: HandProfileAck): void } {
  let closed = false, timer: ReturnType<typeof setTimeout> | null = null, ack: HandProfileAck | null = null;
  const controller = new AbortController();
  const poll = async () => {
    try {
      const url = new URL(endpoint); if (ack) { url.searchParams.set('ack', String(ack.sequence)); url.searchParams.set('revision', ack.revision); }
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!closed && response.ok) receive(await response.json());
    } catch { /* Retain the last validated snapshot; no identity fallback on disconnect. */ }
    if (!closed) timer = setTimeout(poll, 250);
  };
  void poll();
  return { close() { closed = true; if (timer) clearTimeout(timer); controller.abort(); }, ack(e) { ack = e; } };
}
