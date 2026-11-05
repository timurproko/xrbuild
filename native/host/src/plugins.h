#pragma once
// Plugin discovery and loading (design D6). Plugins are DLLs named xrb_*.dll in
// <root>\<name>\ (or directly in <root>), where root is <exe>\plugins and every --plugin-dir=.
// Each is loaded with its own folder first on the DLL search path, queried for its ABI version,
// role and name, and kept only when its ABI major matches the host's. Call only in the browser
// process: CEF's sub-processes (same exe) never load plugins.
#include <windows.h>

#include <cstdint>
#include <string>
#include <vector>

#include "xrb_plugin.h"

namespace plugins {

struct Plugin {
  std::wstring path;  // the DLL
  std::wstring dir;   // its folder: its own dependencies and data live here
  XrbPluginInfo info{};
};

struct Rejected {
  std::wstring path;
  std::string reason;
};

const char* roleName(int role);  // "input", "display", "platform"

class Catalog {
 public:
  ~Catalog();
  // Finds and queries every plugin under `roots`. Missing roots are skipped.
  void scan(const std::vector<std::wstring>& roots);
  const std::vector<Plugin>& all() const { return plugins_; }
  const std::vector<Rejected>& rejected() const { return rejected_; }
  const Plugin* find(int role, const std::string& name) const;
  // Names of the plugins of `role`, e.g. "tracker, test" ("none found" when empty).
  std::string names(int role) const;
  // Loads a plugin for use and returns its module (kept until the catalog is destroyed).
  HMODULE load(const Plugin& p, std::string* error);

 private:
  void scanDir(const std::wstring& dir);
  void tryDll(const std::wstring& path);
  std::vector<Plugin> plugins_;
  std::vector<Rejected> rejected_;
  std::vector<HMODULE> loaded_;
};

// A provider compiled into the host (desktop display, none/replay/simulated input).
struct Builtin {
  int role;
  const char* name;
  const char* description;
};

// --list-plugins: {"abi":"1.0","plugins":[{"role","name","version","description","builtin","path"}],
// "rejected":[{"path","reason"}]} on one line.
std::string catalogJson(const Catalog& catalog, const std::vector<Builtin>& builtins);

// Loads a DLL with its own folder first on the search path (then the system folders).
HMODULE loadWithOwnDir(const std::wstring& path);

}  // namespace plugins
