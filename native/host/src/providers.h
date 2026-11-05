#pragma once
// Running providers: any number of inputs, one display and at most one platform, each either built into
// the host or a plugin DLL. Built-ins expose the same C function tables as plugins, so the host
// drives both the same way (and a built-in can move into a plugin without changing the host).
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "plugins.h"
#include "xrb_plugin.h"

namespace providers {

// What the host does with provider callbacks. Called from provider threads: must be thread-safe.
struct Sink {
  std::function<void(const std::string& source, int level, const std::string& text)> log;
  std::function<void(const XrbHandFrame& frame)> hands;
  std::function<void(int state, float trackingHz, const std::string& text)> inputStatus;
  std::function<void(const XrbImage& image)> image;
  std::function<void(int event, const std::string& json)> lifecycle;
};

// The XrbHost table handed to one provider; its ctx is this object.
class Bridge {
 public:
  Bridge(std::string source, Sink* sink);
  const XrbHost* host() const { return &host_; }

 private:
  static void XRB_CALL log(void* ctx, int32_t level, const char* text);
  static double XRB_CALL nowMs(void* ctx);
  static void XRB_CALL publishHands(void* ctx, const XrbHandFrame* frame);
  static void XRB_CALL setInputStatus(void* ctx, int32_t state, float hz, const char* text);
  static void XRB_CALL publishImage(void* ctx, const XrbImage* image);
  static void XRB_CALL lifecycle(void* ctx, int32_t event, const char* json);
  XrbHost host_{};
  std::string source_;
  Sink* sink_;
};

template <class Api>
struct Handle {
  std::string name;
  bool builtin = false;
  void* self = nullptr;
  const Api* api = nullptr;
  std::unique_ptr<Bridge> bridge;

  Handle() = default;
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  ~Handle() { reset(); }
  explicit operator bool() const { return self != nullptr; }
  void reset() {
    if (self && api) api->destroy(self);
    self = nullptr;
    api = nullptr;
    bridge.reset();
  }
  std::string error() const {
    const char* e = self && api && api->last_error ? api->last_error(self) : nullptr;
    return e ? e : "";
  }
};
using Input = Handle<XrbInputApi>;
using Display = Handle<XrbDisplayApi>;
using Platform = Handle<XrbPlatformApi>;

// Creates provider `name` of the role: a built-in, else a plugin from the catalog. On failure
// returns false with `error` (an unknown name lists the available ones).
bool createInput(const std::string& name, plugins::Catalog& catalog, const std::string& configJson, Sink* sink, Input* out,
                 std::string* error);
bool createDisplay(const std::string& name, plugins::Catalog& catalog, const std::string& configJson, Sink* sink, Display* out,
                   std::string* error);
bool createPlatform(const std::string& name, plugins::Catalog& catalog, const std::string& configJson, Sink* sink, Platform* out,
                    std::string* error);

// Starts the input. A failure never stops the app: the sink gets a FAILED status with the
// provider's message, and false is returned (the app runs without hands).
bool startInput(Input& input, Sink& sink);

// Creates and opens the display `name`; if that fails and `fallback` is set, the fallback instead.
// `configFor` gives each provider's configuration JSON. False with `error` when nothing opened.
bool openDisplay(const std::string& name, const std::string& fallback, plugins::Catalog& catalog,
                 const std::function<std::string(const std::string&)>& configFor, Sink* sink, Display* out,
                 XrbDisplayInfo* info, std::string* error);

// All built-in providers, for --list-plugins.
std::vector<plugins::Builtin> builtins();

// ---- built-in providers (builtin_providers.cpp) and their registry entries
template <class Api>
using CreateFn = void*(XRB_CALL*)(const XrbHost*, const char*, const Api**);
struct BuiltinEntry {
  int role;
  const char* name;
  const char* description;
  void* create;  // CreateFn<the role's Api>
};
const std::vector<BuiltinEntry>& builtinRegistry();

}  // namespace providers
