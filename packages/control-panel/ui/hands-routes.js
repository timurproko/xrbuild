// Retired product routes are tombstones, not aliases or managed-tool destinations.
export function isRetiredHandsPath(pathname) {
  return ['/hands-diagnostics', '/hand-tracking'].some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
export function isRetiredHandsTool(tool) {
  if (typeof tool?.route === 'string' && isRetiredHandsPath(tool.route)) return true;
  try { return typeof tool?.url === 'string' && isRetiredHandsPath(new URL(tool.url).pathname); } catch { return false; }
}
