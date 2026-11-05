#pragma once
// Which provider runs each role and what configuration each gets (design D7).
//
// Sources, strongest first: the command line (--input= ..., --plugin.<name>.<key>=<value>), the
// config file (--config=, else <exe>\xrb-app.json written by a packager; a project manifest has
// the same shape), then the defaults (no input providers, display desktop, no platform).
// `inputs` selects multiple providers and gates browser Mouse/Keyboard; legacy `input` still works.
#include <string>
#include <vector>

#include "args.h"
#include "json_util.h"

namespace hostcfg {

struct Selection {
  std::string input, display, platform, displayFallback;
  std::vector<std::string> inputs;  // host providers only; mouse and keyboard are browser inputs
  bool mouse = true, keyboard = true;  // legacy configs leave both on
};

// Reads a JSON object from `path`. Missing file: false with an empty error.
bool loadFile(const std::wstring& path, nlohmann::json* out, std::string* error);

Selection selectRoles(const nlohmann::json& file, const HostArgs& args);

// "8000" -> 8000, "true" -> true, "[1,2]" -> [1,2], "\"x\"" -> "x", anything else -> the string itself.
nlohmann::json inferValue(const std::string& text);

// file.plugins[name] with every --plugin.<name>.<key>=<value> of `args` set on top; dotted keys
// create nested objects ("area.size" -> {"area":{"size":...}}).
nlohmann::json pluginConfig(const nlohmann::json& file, const std::string& name, const HostArgs& args);

}  // namespace hostcfg
