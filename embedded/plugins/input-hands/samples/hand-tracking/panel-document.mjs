// The production build may contain a standalone development return address.
// A panel-served document must have exactly one authoritative address/managed-mode marker.
export function managedPanelDocument(source, panelOrigin) {
  const url = new URL(panelOrigin);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid local panel origin');
  const markers = /<meta\b[^>]*\bname\s*=\s*(["'])(?:xrbuild-panel-url|handtracking-panel-managed|handtracking-managed-bridge)\1[^>]*>/gi;
  const html = source.replace(markers, '');
  if (!/<\/head\s*>/i.test(html)) throw new Error('Managed tool document has no head');
  return html.replace(/<\/head\s*>/i, `<meta name="handtracking-managed-bridge" content="1"><meta name="handtracking-panel-managed" content="1"><meta name="xrbuild-panel-url" content="${url.origin}"></head>`);
}
