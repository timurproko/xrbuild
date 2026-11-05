// Built-in inputs that need no device:
//   replay     plays a .hands recording (any provider's, see --record-hands=) at its recorded timing
//              config: file (path), loop (bool, default false)
//   simulated  scripted hands for tests and development: a hand circling in front of the panel that
//              pinches every 3 s. config: hands (1 or 2, default 1), rateHz (default 60)
#include <windows.h>

#include <atomic>
#include <cmath>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

#include "hand_recording.h"
#include "host_channel.h"
#include "json_util.h"
#include "log.h"
#include "providers.h"

namespace providers {
namespace {

// Sleeps until host time `dueMs` or until `running` drops. False when stopped.
bool waitUntil(double dueMs, const std::atomic<bool>& running) {
  for (;;) {
    if (!running) return false;
    const double left = dueMs - channel::hostTimeMs();
    if (left <= 0) return true;
    if (left > 2) Sleep((DWORD)(left - 1));
    else SwitchToThread();
  }
}

// ---- replay

struct Replay {
  const XrbHost* host;
  nlohmann::json cfg;
  std::vector<std::vector<uint8_t>> messages;
  std::thread thread;
  std::atomic<bool> running{false};
  std::string error;
};

const char* XRB_CALL replayError(void* self) { return ((Replay*)self)->error.c_str(); }

void replayOne(Replay* r, const std::vector<uint8_t>& m, double shiftMs) {
  if (m.size() < 16) return;
  const uint8_t type = m[0], version = m[1];
  const uint8_t* p = m.data() + 16;
  const size_t n = m.size() - 16;
  if (type == channel::kHands && n >= 16) {
    XrbHandFrame f{};
    f.size = sizeof(f);
    memcpy(&f.capture_time_ms, p, 8);
    memcpy(&f.tracking_hz, p + 8, 4);
    f.count = p[12];
    if (n < 16 + (size_t)f.count * sizeof(XrbHand)) return;
    f.capture_time_ms += shiftMs;  // keeps the recorded capture-to-delivery latency
    // Version 1 recordings predate capabilities: their only provider filled every optional field.
    f.capabilities = version >= 2 ? p[13] : (XRB_CAP_PINCH | XRB_CAP_GRAB | XRB_CAP_PALM);
    f.hands = reinterpret_cast<const XrbHand*>(p + 16);
    r->host->publish_hands(r->host->ctx, &f);
  } else if (type == channel::kStatus && n >= 10) {
    float hz;
    uint16_t len;
    memcpy(&hz, p + 4, 4);
    memcpy(&len, p + 8, 2);
    const std::string text((const char*)p + 10, (std::min)((size_t)len, n - 10));
    r->host->set_input_status(r->host->ctx, p[0], hz, text.c_str());
  }
}

int32_t XRB_CALL replayStart(void* self) {
  auto* r = (Replay*)self;
  const std::string file = jsonOr(r->cfg, "file", "");
  if (file.empty()) {
    r->error = "no recording given (set plugins.replay.file, e.g. --plugin.replay.file=out\\touch.hands)";
    return 1;
  }
  r->messages.clear();
  if (!readHandRecording(widen(file), &r->messages) || r->messages.empty()) {
    r->error = "cannot read the recording " + file;
    return 1;
  }
  const bool loop = jsonOr(r->cfg, "loop", false);
  r->running = true;
  r->thread = std::thread([r, loop, file] {
    const std::string msg = "replaying " + file + " (" + std::to_string(r->messages.size()) + " messages" + (loop ? ", looped)" : ")");
    r->host->log(r->host->ctx, XRB_LOG_INFO, msg.c_str());
    do {
      double first;
      memcpy(&first, r->messages[0].data() + 8, 8);
      const double shift = channel::hostTimeMs() - first;
      for (const std::vector<uint8_t>& m : r->messages) {
        double t;
        memcpy(&t, m.data() + 8, 8);
        if (!waitUntil(t + shift, r->running)) return;
        replayOne(r, m, shift);
      }
    } while (loop && r->running);
    r->host->log(r->host->ctx, XRB_LOG_INFO, "replay finished");
  });
  return 0;
}

void XRB_CALL replayStop(void* self) {
  auto* r = (Replay*)self;
  r->running = false;
  if (r->thread.joinable()) r->thread.join();
}
void XRB_CALL replayDestroy(void* self) {
  replayStop(self);
  delete (Replay*)self;
}
const XrbInputApi kReplay = {sizeof(XrbInputApi), replayError, replayStart, replayStop, replayDestroy};
void* XRB_CALL createReplay(const XrbHost* host, const char* config, const XrbInputApi** api) {
  *api = &kReplay;
  return new Replay{host, jsonObject(config)};
}

// ---- simulated

struct Simulated {
  const XrbHost* host;
  nlohmann::json cfg;
  std::thread thread;
  std::atomic<bool> running{false};
};

const char* XRB_CALL simulatedError(void*) { return ""; }

// One hand at time t (s): wrist circling 4 cm around a point 15 cm in front of the panel, palm toward
// the panel, fingers up; every 3 s the thumb tip closes onto the index tip for 0.6 s (a pinch).
XrbHand simulatedHand(int id, bool right, double t) {
  XrbHand h{};
  h.id = id;
  h.handedness = right ? 1 : 0;
  const float side = right ? 1.0f : -1.0f;
  const float wx = side * 0.08f + 0.04f * (float)std::cos(t * 1.3), wy = -0.06f + 0.04f * (float)std::sin(t * 1.3), wz = 0.15f;
  auto set = [&](int k, float x, float y, float z) {
    h.keypoints[k * 4] = x, h.keypoints[k * 4 + 1] = y, h.keypoints[k * 4 + 2] = z, h.keypoints[k * 4 + 3] = 0.9f;
  };
  set(0, wx, wy, wz);
  // Fingers index..pinky: knuckles 7.5 cm above the wrist, spread across the palm, three segments up.
  const float seg[3] = {0.035f, 0.025f, 0.02f};
  for (int f = 0; f < 4; f++) {
    const float x = wx + side * (0.03f - 0.02f * f);
    float y = wy + 0.075f - 0.005f * f;
    set(5 + f * 4, x, y, wz);
    for (int s = 0; s < 3; s++) set(6 + f * 4 + s, x, y += seg[s], wz);
  }
  // Thumb: from beside the wrist toward the index finger; a pinch moves its tip onto the index tip.
  const double phase = std::fmod(t, 3.0);
  const float close = phase < 0.6 ? (float)std::sin(phase / 0.6 * 3.14159265) : 0.0f;
  const float tx0 = wx + side * 0.045f, ty0 = wy + 0.02f;
  for (int s = 0; s < 3; s++) set(1 + s, tx0 + side * 0.01f * s, ty0 + 0.02f * (s + 1), wz + 0.01f);
  const float* index = &h.keypoints[8 * 4];
  const float openX = tx0 + side * 0.03f, openY = ty0 + 0.08f;
  set(4, openX + (index[0] - openX) * close, openY + (index[1] - openY) * close, wz + 0.01f * (1 - close));
  return h;
}

int32_t XRB_CALL simulatedStart(void* self) {
  auto* s = (Simulated*)self;
  const int count = jsonOr(s->cfg, "hands", 1) >= 2 ? 2 : 1;
  const double rate = (std::max)(1.0, (std::min)(240.0, jsonOr(s->cfg, "rateHz", 60.0)));
  s->running = true;
  s->thread = std::thread([s, count, rate] {
    const std::string text = "simulated: " + std::to_string(count) + " hand(s) at " + std::to_string((int)rate) + " Hz";
    s->host->set_input_status(s->host->ctx, XRB_INPUT_RUNNING, (float)rate, text.c_str());
    const double t0 = channel::hostTimeMs();
    for (long long i = 0;; i++) {
      const double due = t0 + i * 1000.0 / rate;
      if (!waitUntil(due, s->running)) return;
      const double t = (due - t0) / 1000.0;
      XrbHand hands[2] = {simulatedHand(1, true, t), simulatedHand(2, false, t + 1.5)};
      XrbHandFrame f{};
      f.size = sizeof(f);
      f.capabilities = 0;  // keypoints only: gestures are derived from them
      f.capture_time_ms = due;
      f.tracking_hz = (float)rate;
      f.count = (uint32_t)count;
      f.hands = hands;
      s->host->publish_hands(s->host->ctx, &f);
    }
  });
  return 0;
}

void XRB_CALL simulatedStop(void* self) {
  auto* s = (Simulated*)self;
  s->running = false;
  if (s->thread.joinable()) s->thread.join();
}
void XRB_CALL simulatedDestroy(void* self) {
  simulatedStop(self);
  delete (Simulated*)self;
}
const XrbInputApi kSimulated = {sizeof(XrbInputApi), simulatedError, simulatedStart, simulatedStop, simulatedDestroy};
void* XRB_CALL createSimulated(const XrbHost* host, const char* config, const XrbInputApi** api) {
  *api = &kSimulated;
  return new Simulated{host, jsonObject(config)};
}

}  // namespace

std::vector<BuiltinEntry> builtinInputs() {
  return {
      {XRB_ROLE_INPUT, "replay", "plays a .hands recording at its recorded timing", (void*)&createReplay},
      {XRB_ROLE_INPUT, "simulated", "scripted hands, no device", (void*)&createSimulated},
  };
}

}  // namespace providers
