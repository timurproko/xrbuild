#include "status_report.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <limits>

#include "host_channel.h"

bool decodePageFrame(const uint8_t* d, size_t n, PageReport* out) {
  const size_t p = sizeof(channel::Header);
  if (!d || n < p + 12 || d[0] != channel::kPageFrame) return false;
  float f = 0;
  memcpy(&f, d + p + 8, 4);
  PageReport r;
  r.fps = f;
  const double nan = std::numeric_limits<double>::quiet_NaN();
  r.frameMs = r.latencyMs = nan;
  if (n >= p + 24) {
    memcpy(&f, d + p + 12, 4);
    r.frameMs = f;
    memcpy(&f, d + p + 16, 4);
    r.latencyMs = f;
    uint16_t w = 0, h = 0;
    memcpy(&w, d + p + 20, 2);
    memcpy(&h, d + p + 22, 2);
    r.eyeW = w;
    r.eyeH = h;
  }
  *out = r;
  return true;
}

bool decodeSetView(const uint8_t* d, size_t n, bool* stereo) {
  const size_t p = sizeof(channel::Header);
  if (!d || n < p + 1 || d[0] != channel::kSetView) return false;
  *stereo = d[p] != 0;
  return true;
}

bool decodeSetCameras(const uint8_t* d, size_t n, bool* enabled) {
  const size_t p = sizeof(channel::Header);
  if (!d || n < p + 1 || d[0] != channel::kSetCameras) return false;
  *enabled = d[p] != 0;
  return true;
}

bool decodeSetProjection(const uint8_t* d, size_t n, bool* orthographic) {
  const size_t p = sizeof(channel::Header);
  if (!d || n < p + 1 || d[0] != channel::kSetProjection || d[p] > 1) return false;
  *orthographic = d[p] == 1;
  return true;
}

static std::string num(double v, int decimals) {
  if (!std::isfinite(v)) return "null";
  char b[64];
  snprintf(b, sizeof(b), "%.*f", decimals, v);
  return b;
}

static std::string str(const std::string& s) {
  std::string o = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') o += '\\', o += c;
    else if ((unsigned char)c < 0x20) o += ' ';
    else o += c;
  }
  return o + "\"";
}

std::string statusJson(const HostStatus& s) {
  const double nan = std::numeric_limits<double>::quiet_NaN();
  const PageReport& p = s.page;
  std::string j = "{";
  j += "\"uptimeS\":" + num(s.uptimeS, 1);
  j += std::string(",\"session\":") + (s.session ? "true" : "false");
  j += std::string(",\"stereo\":") + (s.stereo ? "true" : "false");
  j += ",\"pageFps\":" + num(s.pageSeen ? p.fps : nan, 1);
  j += ",\"frameMs\":" + num(s.pageSeen ? p.frameMs : nan, 2);
  j += ",\"latencyMs\":" + num(s.pageSeen ? p.latencyMs : nan, 1);
  j += ",\"eyeW\":" + (s.pageSeen && p.eyeW > 0 ? std::to_string(p.eyeW) : std::string("null"));
  j += ",\"eyeH\":" + (s.pageSeen && p.eyeH > 0 ? std::to_string(p.eyeH) : std::string("null"));
  j += ",\"pageAgeMs\":" + num(s.pageSeen ? s.pageAgeMs : nan, 0);
  j += ",\"handsHz\":" + num(s.handsHz, 1);
  j += ",\"handState\":" + str(s.handState);
  j += ",\"hands\":" + std::to_string(s.handCount);
  j += ",\"clients\":" + std::to_string(s.clients);
  return j + "}";
}
