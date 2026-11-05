#pragma once
// The page's performance report (page heartbeat) and the host's once-per-second status line
// for tools (--status=stdout, read by the control panel).
#include <cstddef>
#include <cstdint>
#include <string>

// Decoded page heartbeat. Older pages send only fps (12-byte payload): the other values are
// then unknown (NaN, or 0 for the resolution).
struct PageReport {
  double fps = 0;
  double frameMs = 0;
  double latencyMs = 0;
  int eyeW = 0, eyeH = 0;
};

// Parses a complete kPageFrame message (header included). False if it is not one.
bool decodePageFrame(const uint8_t* data, size_t size, PageReport* out);
// Parses a complete kSetView message (header included): the page asks for 3D (true) or 2D (false).
bool decodeSetView(const uint8_t* data, size_t size, bool* stereo);
bool decodeSetCameras(const uint8_t* data, size_t size, bool* enabled);
// Parses a complete kSetProjection message: false Perspective, true Orthographic.
bool decodeSetProjection(const uint8_t* data, size_t size, bool* orthographic);

struct HostStatus {
  double uptimeS = 0;
  bool session = false;         // the display has a switchable session: the view can switch between 3D and 2D
  bool stereo = false;          // the page is side by side and shown in 3D
  bool pageSeen = false;        // a heartbeat arrived
  PageReport page;
  double pageAgeMs = 0;         // since the last heartbeat
  double handsHz = 0;
  std::string handState;        // "off", "starting", "running", ...
  int handCount = 0;
  int clients = 0;
};

// One JSON object on a single line; unknown numbers are null.
std::string statusJson(const HostStatus& s);
