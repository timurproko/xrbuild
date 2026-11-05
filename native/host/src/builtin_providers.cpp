// Providers built into the core: they need no device and no vendor runtime.
//   display desktop  a window (or full screen on a monitor), mono, a fixed viewer
//   input   none     no hands
// (replay and simulated inputs: builtin_inputs.cpp)
#include <windows.h>

#include <algorithm>
#include <cwchar>
#include <string>
#include <vector>

#include "json_util.h"

#include "providers.h"

namespace providers {

std::vector<BuiltinEntry> builtinInputs();    // builtin_inputs.cpp

namespace {

struct Desktop {
  const XrbHost* host;
  nlohmann::json cfg;
};

bool monitorRect(int index, RECT* out) {
  struct Screen { RECT rect; std::wstring device; bool primary; };
  std::vector<Screen> screens;
  EnumDisplayMonitors(nullptr, nullptr, [](HMONITOR monitor, HDC, LPRECT, LPARAM data) -> BOOL {
    MONITORINFOEXW info{};
    info.cbSize = sizeof(info);
    if (GetMonitorInfoW(monitor, reinterpret_cast<MONITORINFO*>(&info)))
      reinterpret_cast<std::vector<Screen>*>(data)->push_back({info.rcMonitor, info.szDevice, !!(info.dwFlags & MONITORINFOF_PRIMARY)});
    return TRUE;
  }, reinterpret_cast<LPARAM>(&screens));
  // Match list-monitors.ps1: primary first, then the GDI device name. EnumDisplayMonitors itself
  // does not guarantee that order (and index 1 could otherwise point at the primary display).
  std::sort(screens.begin(), screens.end(), [](const Screen& a, const Screen& b) {
    return a.primary != b.primary ? a.primary : std::wcscmp(a.device.c_str(), b.device.c_str()) < 0;
  });
  if (index < 0 || static_cast<size_t>(index) >= screens.size()) return false;
  *out = screens[index].rect;
  return true;
}

const char* XRB_CALL noError(void*) { return ""; }

int32_t XRB_CALL desktopOpen(void* self, XrbDisplayInfo* info) {
  auto* d = (Desktop*)self;
  // Default geometry: a 27-inch 16:9 panel leaning back 45 degrees, the one the SDK's emulation was tuned on.
  info->width_m = jsonOr(d->cfg, "widthM", 0.596736f);
  info->height_m = jsonOr(d->cfg, "heightM", 0.335664f);
  info->tilt_rad = jsonOr(d->cfg, "tiltRad", 0.785398f);
  info->layout = XRB_LAYOUT_MONO;
  info->presentation = XRB_PRESENT_WINDOW;
  RECT r{};
  const int monitor = jsonOr(d->cfg, "monitor", 0);
  if (!monitorRect(monitor, &r)) {
    d->host->log(d->host->ctx, XRB_LOG_WARN, ("monitor " + std::to_string(monitor) + " not found, using the primary").c_str());
    if (!monitorRect(0, &r)) return 1;
  }
  // Even a windowed app belongs on the selected Display. Previously only fullscreen runs received
  // its bounds, so Windows placed windowed apps on the default (usually primary) screen.
  info->has_monitor = 1;
  info->monitor_left = r.left, info->monitor_top = r.top, info->monitor_right = r.right, info->monitor_bottom = r.bottom;
  info->fullscreen = jsonOr(d->cfg, "fullscreen", false) ? 1 : 0;
  return 0;
}
int32_t XRB_CALL desktopStart(void*, int32_t, XrbDisplayInfo*) { return 0; }
void XRB_CALL desktopEyes(void*, XrbEyes* eyes) {
  // A viewer 0.6 m in front of the panel centre, eyes 63 mm apart: always valid.
  eyes->left[0] = -0.0315f, eyes->left[1] = 0, eyes->left[2] = 0.6f;
  eyes->right[0] = 0.0315f, eyes->right[1] = 0, eyes->right[2] = 0.6f;
  eyes->stale = 0;
}
int32_t XRB_CALL desktopSetStereo(void*, int32_t on) { return on ? 1 : 0; }
uint32_t XRB_CALL desktopBeginExit(void*) { return 0; }
uint32_t XRB_CALL desktopEnd(void*) { return 0; }
void XRB_CALL desktopDestroy(void* self) { delete (Desktop*)self; }
const XrbDisplayApi kDesktop = {sizeof(XrbDisplayApi), noError, desktopOpen, desktopStart, desktopEyes, desktopSetStereo,
                                desktopBeginExit, desktopEnd, desktopDestroy};
void* XRB_CALL createDesktop(const XrbHost* host, const char* config, const XrbDisplayApi** api) {
  *api = &kDesktop;
  nlohmann::json cfg = nlohmann::json::parse(config ? config : "{}", nullptr, false);
  return new Desktop{host, cfg.is_object() ? cfg : nlohmann::json::object()};
}

int32_t XRB_CALL noneStart(void*) { return 0; }
void XRB_CALL noneStop(void*) {}
void XRB_CALL noneDestroy(void*) {}
const XrbInputApi kNone = {sizeof(XrbInputApi), noError, noneStart, noneStop, noneDestroy};
int gNoneHandle;
void* XRB_CALL createNone(const XrbHost*, const char*, const XrbInputApi** api) {
  *api = &kNone;
  return &gNoneHandle;
}

}  // namespace

const std::vector<BuiltinEntry>& builtinRegistry() {
  static const std::vector<BuiltinEntry> all = [] {
    std::vector<BuiltinEntry> r = {
        {XRB_ROLE_DISPLAY, "desktop", "a window or a full-screen monitor, mono, fixed viewer", (void*)&createDesktop},
        {XRB_ROLE_INPUT, "none", "no hands", (void*)&createNone},
    };
    for (const BuiltinEntry& e : builtinInputs()) r.push_back(e);
    return r;
  }();
  return all;
}

}  // namespace providers
