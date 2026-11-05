// What the core puts into third_party/: CEF and nlohmann/json, pinned in deps.lock.json next to this
// file. Each plugin lists its own binaries in plugins/<plugin>/deps.json (pinned in its own
// deps.lock.json); fetch-deps.mjs collects the core and the plugins present.

export const CEF_NAME =
  'cef_binary_151.3.24+g2384915+chromium-151.0.7922.174_windows64_minimal';

/**
 * kind:
 *   'file'     copy one file to `dest`
 *   'download' download `url` to `dest` (single file, hash pinned on first --update-lock)
 *   'dir'     copy every file under `from` (recursively) into `dest`
 *   'archive' download `url`, verify, extract into `dest` (strip top folder)
 */
export const SOURCES = [
  {
    id: 'cef',
    kind: 'archive',
    url: `https://cef-builds.spotifycdn.com/${encodeURIComponent(CEF_NAME)}.tar.bz2`,
    dest: 'cef',
  },
  {
    id: 'nlohmann-json',
    kind: 'download',
    url: 'https://github.com/nlohmann/json/releases/download/v3.12.0/json.hpp',
    dest: 'nlohmann/nlohmann/json.hpp',
  },
];
