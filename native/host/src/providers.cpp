#include "providers.h"

#include <algorithm>

#include "host_channel.h"

namespace providers {

Bridge::Bridge(std::string source, Sink* sink) : source_(std::move(source)), sink_(sink) {
  host_.size = sizeof(host_);
  host_.ctx = this;
  host_.log = &Bridge::log;
  host_.now_ms = &Bridge::nowMs;
  host_.publish_hands = &Bridge::publishHands;
  host_.set_input_status = &Bridge::setInputStatus;
  host_.publish_image = &Bridge::publishImage;
  host_.lifecycle = &Bridge::lifecycle;
}

void XRB_CALL Bridge::log(void* ctx, int32_t level, const char* text) {
  auto* b = (Bridge*)ctx;
  if (b->sink_->log) b->sink_->log(b->source_, level, text ? text : "");
}
double XRB_CALL Bridge::nowMs(void*) { return channel::hostTimeMs(); }
void XRB_CALL Bridge::publishHands(void* ctx, const XrbHandFrame* frame) {
  auto* b = (Bridge*)ctx;
  if (frame && b->sink_->hands) b->sink_->hands(*frame);
}
void XRB_CALL Bridge::setInputStatus(void* ctx, int32_t state, float hz, const char* text) {
  auto* b = (Bridge*)ctx;
  if (b->sink_->inputStatus) b->sink_->inputStatus(state, hz, text ? text : "");
}
void XRB_CALL Bridge::publishImage(void* ctx, const XrbImage* image) {
  auto* b = (Bridge*)ctx;
  if (image && b->sink_->image) b->sink_->image(*image);
}
void XRB_CALL Bridge::lifecycle(void* ctx, int32_t event, const char* json) {
  auto* b = (Bridge*)ctx;
  if (b->sink_->lifecycle) b->sink_->lifecycle(event, json ? json : "");
}

const char* const kCreateExport[] = {nullptr, "xrb_input_create", "xrb_display_create", "xrb_platform_create"};

template <class Api>
static bool create(int role, const std::string& name, plugins::Catalog& catalog, const std::string& configJson, Sink* sink,
                   Handle<Api>* out, std::string* error) {
  out->reset();
  void* createFn = nullptr;
  for (const BuiltinEntry& b : builtinRegistry())
    if (b.role == role && name == b.name) createFn = b.create, out->builtin = true;
  if (!createFn) {
    const plugins::Plugin* p = catalog.find(role, name);
    if (!p) {
      std::string names;
      for (const BuiltinEntry& b : builtinRegistry())
        if (b.role == role) names += std::string(names.empty() ? "" : ", ") + b.name;
      const std::string fromPlugins = catalog.names(role);
      if (fromPlugins != "none found") names += (names.empty() ? "" : ", ") + fromPlugins;
      *error = std::string("no ") + plugins::roleName(role) + " provider named \"" + name + "\" (available: " +
               (names.empty() ? "none" : names) + ")";
      return false;
    }
    HMODULE m = catalog.load(*p, error);
    if (!m) return false;
    createFn = (void*)GetProcAddress(m, kCreateExport[role]);
    if (!createFn) {
      *error = "plugin " + name + " has no " + kCreateExport[role] + " export";
      return false;
    }
  }
  out->name = name;
  out->bridge = std::make_unique<Bridge>(name, sink);
  const Api* api = nullptr;
  void* self = ((CreateFn<Api>)createFn)(out->bridge->host(), configJson.c_str(), &api);
  if (!self || !api) {
    *error = std::string(plugins::roleName(role)) + " provider " + name + " could not be created (see its log lines)";
    out->bridge.reset();
    return false;
  }
  if (api->size < sizeof(Api)) {
    *error = std::string(plugins::roleName(role)) + " provider " + name + " has an incomplete function table";
    if (api->destroy) api->destroy(self);
    out->bridge.reset();
    return false;
  }
  out->self = self;
  out->api = api;
  return true;
}

bool createInput(const std::string& name, plugins::Catalog& catalog, const std::string& configJson, Sink* sink, Input* out,
                 std::string* error) {
  return create(XRB_ROLE_INPUT, name, catalog, configJson, sink, out, error);
}
bool createDisplay(const std::string& name, plugins::Catalog& catalog, const std::string& configJson, Sink* sink, Display* out,
                   std::string* error) {
  return create(XRB_ROLE_DISPLAY, name, catalog, configJson, sink, out, error);
}
bool createPlatform(const std::string& name, plugins::Catalog& catalog, const std::string& configJson, Sink* sink, Platform* out,
                    std::string* error) {
  return create(XRB_ROLE_PLATFORM, name, catalog, configJson, sink, out, error);
}

bool startInput(Input& input, Sink& sink) {
  if (!input) return false;
  if (input.api->start(input.self) == 0) return true;
  const std::string why = input.error();
  if (sink.inputStatus)
    sink.inputStatus(XRB_INPUT_FAILED, 0.0f, "input " + input.name + " failed to start" + (why.empty() ? "" : ": " + why));
  return false;
}

bool openDisplay(const std::string& name, const std::string& fallback, plugins::Catalog& catalog,
                 const std::function<std::string(const std::string&)>& configFor, Sink* sink, Display* out,
                 XrbDisplayInfo* info, std::string* error) {
  auto tryOne = [&](const std::string& n, std::string* why) {
    *info = XrbDisplayInfo{};
    info->size = sizeof(XrbDisplayInfo);
    if (!createDisplay(n, catalog, configFor(n), sink, out, why)) return false;
    if (out->api->open(out->self, info) == 0) return true;
    const std::string e = out->error();
    *why = "display " + n + " failed to open" + (e.empty() ? "" : ": " + e);
    out->reset();
    return false;
  };
  if (tryOne(name, error)) return true;
  if (fallback.empty() || fallback == name) return false;
  if (sink->log) sink->log("host", XRB_LOG_WARN, *error + " - falling back to display " + fallback);
  std::string second;
  if (tryOne(fallback, &second)) return true;
  *error += "; fallback: " + second;
  return false;
}

std::vector<plugins::Builtin> builtins() {
  std::vector<plugins::Builtin> out;
  for (const BuiltinEntry& b : builtinRegistry()) out.push_back({b.role, b.name, b.description});
  return out;
}

}  // namespace providers
