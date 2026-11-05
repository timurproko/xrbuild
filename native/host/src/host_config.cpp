#include "host_config.h"

#include <cstdio>
#include <algorithm>

namespace hostcfg {

bool loadFile(const std::wstring& path, nlohmann::json* out, std::string* error) {
  error->clear();
  FILE* f = nullptr;
  if (_wfopen_s(&f, path.c_str(), L"rb") != 0 || !f) return false;
  std::string text;
  char buf[4096];
  for (size_t n; (n = fread(buf, 1, sizeof(buf), f)) > 0;) text.append(buf, n);
  fclose(f);
  *out = nlohmann::json::parse(text, nullptr, false);  // never throws (see json_util.h)
  if (out->is_discarded()) {
    *error = "not valid JSON";
    return false;
  }
  if (!out->is_object()) {
    *error = "not a JSON object";
    return false;
  }
  return true;
}

static std::string stringAt(const nlohmann::json& j, const char* key) { return jsonOr(j, key, ""); }

Selection selectRoles(const nlohmann::json& file, const HostArgs& args) {
  Selection s;
  s.input = !args.input.empty() ? args.input : stringAt(file, "input");
  s.display = !args.display.empty() ? args.display : stringAt(file, "display");
  s.platform = !args.platform.empty() ? args.platform : stringAt(file, "platform");
  s.displayFallback = !args.displayFallback.empty() ? args.displayFallback : stringAt(file, "displayFallback");
  if (s.input.empty()) s.input = "none";
  if (!args.input.empty()) {
    if (s.input != "none") s.inputs.push_back(s.input);
  } else if (auto list = file.find("inputs"); list != file.end() && list->is_array()) {
    s.mouse = s.keyboard = false;
    for (const auto& item : *list) {
      if (!item.is_string()) continue;
      const std::string name = item.get<std::string>();
      if (name == "mouse") s.mouse = true;
      else if (name == "keyboard") s.keyboard = true;
      else if (name != "none" && !name.empty() && std::find(s.inputs.begin(), s.inputs.end(), name) == s.inputs.end())
        s.inputs.push_back(name);
    }
  } else if (s.input != "none") s.inputs.push_back(s.input);
  if (s.display.empty()) s.display = "desktop";
  if (s.platform == "none") s.platform.clear();
  return s;
}

nlohmann::json inferValue(const std::string& text) {
  if (text.empty()) return text;
  nlohmann::json v = nlohmann::json::parse(text, nullptr, false);
  return v.is_discarded() ? nlohmann::json(text) : v;
}

nlohmann::json pluginConfig(const nlohmann::json& file, const std::string& name, const HostArgs& args) {
  nlohmann::json cfg = nlohmann::json::object();
  if (auto ps = file.find("plugins"); ps != file.end() && ps->is_object())
    if (auto p = ps->find(name); p != ps->end() && p->is_object()) cfg = *p;
  for (const HostArgs::PluginOption& o : args.pluginOptions) {
    if (o.plugin != name) continue;
    nlohmann::json* at = &cfg;
    size_t start = 0;
    for (size_t dot; (dot = o.key.find('.', start)) != std::string::npos; start = dot + 1) {
      nlohmann::json& next = (*at)[o.key.substr(start, dot - start)];
      if (!next.is_object()) next = nlohmann::json::object();
      at = &next;
    }
    (*at)[o.key.substr(start)] = inferValue(o.value);
  }
  return cfg;
}

}  // namespace hostcfg
