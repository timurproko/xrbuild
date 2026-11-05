#include "plugins.h"

#include <algorithm>
#include <cstdio>

#include "log.h"

namespace plugins {

const char* roleName(int role) {
  switch (role) {
    case XRB_ROLE_INPUT: return "input";
    case XRB_ROLE_DISPLAY: return "display";
    case XRB_ROLE_PLATFORM: return "platform";
    default: return "unknown";
  }
}

HMODULE loadWithOwnDir(const std::wstring& path) {
  // LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR: the plugin's dependencies resolve from its own folder before
  // System32 (which can hold older copies of a runtime DLL a plugin ships).
  return LoadLibraryExW(path.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
}

static std::string lastErrorText() {
  const DWORD e = GetLastError();
  char buf[256] = {};
  FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, nullptr, e, 0, buf, sizeof(buf), nullptr);
  std::string s(buf);
  while (!s.empty() && (s.back() == '\n' || s.back() == '\r' || s.back() == '.')) s.pop_back();
  return "error " + std::to_string(e) + (s.empty() ? "" : " (" + s + ")");
}

Catalog::~Catalog() {
  for (HMODULE m : loaded_) FreeLibrary(m);
}

void Catalog::scan(const std::vector<std::wstring>& roots) {
  for (const std::wstring& root : roots) {
    if (root.empty()) continue;
    scanDir(root);  // xrb_*.dll directly in the root
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileW((root + L"\\*").c_str(), &fd);
    if (h == INVALID_HANDLE_VALUE) continue;
    do {
      if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || fd.cFileName[0] == L'.') continue;
      scanDir(root + L"\\" + fd.cFileName);
    } while (FindNextFileW(h, &fd));
    FindClose(h);
  }
}

void Catalog::scanDir(const std::wstring& dir) {
  WIN32_FIND_DATAW fd;
  HANDLE h = FindFirstFileW((dir + L"\\xrb_*.dll").c_str(), &fd);
  if (h == INVALID_HANDLE_VALUE) return;
  do {
    if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) tryDll(dir + L"\\" + fd.cFileName);
  } while (FindNextFileW(h, &fd));
  FindClose(h);
}

void Catalog::tryDll(const std::wstring& path) {
  auto reject = [&](const std::string& why) {
    rejected_.push_back({path, why});
    LOGI("[plugins] skipped %s: %s", narrow(path).c_str(), why.c_str());
  };
  HMODULE m = loadWithOwnDir(path);
  if (!m) return reject("cannot load: " + lastErrorText());
  auto query = (XrbPluginQueryFn)GetProcAddress(m, "xrb_plugin_query");
  if (!query) {
    FreeLibrary(m);
    return reject("no xrb_plugin_query export");
  }
  XrbPluginInfo info{};
  info.size = sizeof(info);
  const int32_t rc = query(&info);
  FreeLibrary(m);  // loaded again when selected; an unselected plugin stays out of the process
  info.name[sizeof(info.name) - 1] = info.version[sizeof(info.version) - 1] = info.description[sizeof(info.description) - 1] = 0;
  if (rc != 0) return reject("xrb_plugin_query failed (" + std::to_string(rc) + ")");
  if (info.abi_major != XRB_ABI_MAJOR)
    return reject("plugin ABI " + std::to_string(info.abi_major) + "." + std::to_string(info.abi_minor) + ", host ABI " +
                  std::to_string(XRB_ABI_MAJOR) + "." + std::to_string(XRB_ABI_MINOR));
  if (info.role < XRB_ROLE_INPUT || info.role > XRB_ROLE_PLATFORM) return reject("unknown role " + std::to_string(info.role));
  if (!info.name[0]) return reject("empty name");
  if (find(info.role, info.name)) return reject(std::string("another ") + roleName(info.role) + " plugin is already named " + info.name);
  const size_t slash = path.find_last_of(L"\\/");
  plugins_.push_back({path, path.substr(0, slash), info});
  LOGI("[plugins] %s %s %s (ABI %u.%u) from %s", roleName(info.role), info.name, info.version, info.abi_major, info.abi_minor,
       narrow(path).c_str());
}

const Plugin* Catalog::find(int role, const std::string& name) const {
  for (const Plugin& p : plugins_)
    if (p.info.role == role && name == p.info.name) return &p;
  return nullptr;
}

std::string Catalog::names(int role) const {
  std::vector<std::string> n;
  for (const Plugin& p : plugins_)
    if (p.info.role == role) n.push_back(p.info.name);
  std::sort(n.begin(), n.end());
  std::string s;
  for (const std::string& x : n) s += (s.empty() ? "" : ", ") + x;
  return s.empty() ? "none found" : s;
}

static std::string jsonString(const std::string& s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') o += '\\', o += (char)c;
    else if (c < 0x20) {
      char b[8];
      snprintf(b, sizeof(b), "\\u%04x", c);
      o += b;
    } else o += (char)c;
  }
  return o + "\"";
}

std::string catalogJson(const Catalog& catalog, const std::vector<Builtin>& builtins) {
  std::string o = "{\"abi\":\"" + std::to_string(XRB_ABI_MAJOR) + "." + std::to_string(XRB_ABI_MINOR) + "\",\"plugins\":[";
  bool first = true;
  for (const Builtin& b : builtins) {
    o += std::string(first ? "" : ",") + "{\"role\":\"" + roleName(b.role) + "\",\"name\":" + jsonString(b.name) +
         ",\"version\":\"\",\"description\":" + jsonString(b.description) + ",\"builtin\":true,\"path\":null}";
    first = false;
  }
  for (const Plugin& p : catalog.all()) {
    o += std::string(first ? "" : ",") + "{\"role\":\"" + roleName(p.info.role) + "\",\"name\":" + jsonString(p.info.name) +
         ",\"version\":" + jsonString(p.info.version) + ",\"description\":" + jsonString(p.info.description) +
         ",\"builtin\":false,\"path\":" + jsonString(narrow(p.path)) + "}";
    first = false;
  }
  o += "],\"rejected\":[";
  first = true;
  for (const Rejected& r : catalog.rejected()) {
    o += std::string(first ? "" : ",") + "{\"path\":" + jsonString(narrow(r.path)) + ",\"reason\":" + jsonString(r.reason) + "}";
    first = false;
  }
  return o + "]}";
}

HMODULE Catalog::load(const Plugin& p, std::string* error) {
  HMODULE m = loadWithOwnDir(p.path);
  if (!m) {
    if (error) *error = "cannot load " + narrow(p.path) + ": " + lastErrorText();
    return nullptr;
  }
  loaded_.push_back(m);
  return m;
}

}  // namespace plugins
