#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include "synthetic.h"

namespace {
struct Input {
  const XrbHost* host;
  hand_tracking::Config config;
  std::string error;
  std::atomic<bool> stopping{true};
  std::mutex mutex;
  std::condition_variable wake;
  std::thread thread;
  explicit Input(const XrbHost* h) : host(h) {}
  void stop() {
    stopping.store(true);
    wake.notify_all();
    if (thread.joinable()) thread.join();
  }
  ~Input() { stop(); }
};
void status(Input& input, int state, float hz, const char* text) {
  input.host->set_input_status(input.host->ctx, state, hz, text);
}
void produce(Input* input) noexcept {
  try {
    using Clock = std::chrono::steady_clock;
    const auto origin = Clock::now();
    auto rateStart = origin;
    uint64_t tick = 0;
    uint32_t rateFrames = 0;
    float hz = 0;
    while (!input->stopping.load()) {
      const auto begin = Clock::now();
      const auto due = static_cast<uint64_t>(std::chrono::duration<double>(begin - origin).count() * input->config.hz);
      tick = std::max(tick, due);  // Skip missed slots rather than slowing simulation time or queuing catch-up work.
      auto sample = hand_tracking::generate(input->config, double(tick) / input->config.hz);
      ++tick;
      const auto rejected = hand_tracking::discardInvalid(sample);
      const double capture = input->host->now_ms(input->host->ctx);
      if (!std::isfinite(capture)) throw std::runtime_error("host clock returned a non-finite timestamp");
      XrbHandFrame frame{sizeof(XrbHandFrame), 0, capture, hz, sample.count, sample.hands.data()};
      input->host->publish_hands(input->host->ctx, &frame);
      ++rateFrames;
      const double elapsed = std::chrono::duration<double>(begin - rateStart).count();
      if (tick == 1 || elapsed >= 1) {
        if (elapsed >= 1) { hz = float(rateFrames / elapsed); rateFrames = 0; rateStart = begin; }
        const std::string text = "SYNTHETIC ONLY / " + input->config.scenario + (rejected ? " / invalid fixtures rejected" : " / panel metres; no camera");
        status(*input, XRB_INPUT_RUNNING, hz, text.c_str());
      }
      std::unique_lock<std::mutex> lock(input->mutex);
      const auto deadline = origin + std::chrono::duration_cast<Clock::duration>(std::chrono::duration<double>(double(tick) / input->config.hz));
      input->wake.wait_until(lock, deadline, [&] { return input->stopping.load(); });
      // Absolute deadlines avoid accumulating Windows timer rounding; no unbounded queue.
    }
  } catch (const std::exception& e) {
    status(*input, XRB_INPUT_FAILED, 0, e.what());
  } catch (...) {
    status(*input, XRB_INPUT_FAILED, 0, "synthetic producer failed");
  }
}
const char* XRB_CALL lastError(void* self) { return static_cast<Input*>(self)->error.c_str(); }
int32_t XRB_CALL start(void* self) {
  auto& input = *static_cast<Input*>(self);
  if (!input.error.empty()) return 1;
  if (input.thread.joinable()) return 0;
  status(input, XRB_INPUT_STARTING, 0, "starting synthetic-only Hand Tracking diagnostic");
  input.stopping.store(false);
  try { input.thread = std::thread(produce, &input); }
  catch (const std::exception& e) { input.stopping.store(true); input.error = e.what(); return 1; }
  return 0;
}
void XRB_CALL stop(void* self) { static_cast<Input*>(self)->stop(); }
void XRB_CALL destroy(void* self) { delete static_cast<Input*>(self); }
const XrbInputApi kApi{sizeof(XrbInputApi), lastError, start, stop, destroy};
}

extern "C" XRB_EXPORT int32_t XRB_CALL xrb_plugin_query(XrbPluginInfo* info) {
  if (!info || info->size < offsetof(XrbPluginInfo, name)) return 1;
  XrbPluginInfo value{};
  value.size = info->size;
  value.abi_major = XRB_ABI_MAJOR;
  value.abi_minor = XRB_ABI_MINOR;
  value.role = XRB_ROLE_INPUT;
  std::snprintf(value.name, sizeof(value.name), "hand-tracking");
  std::snprintf(value.version, sizeof(value.version), "0.1.0");
  std::snprintf(value.description, sizeof(value.description), "Hand Tracking — synthetic hands (no cameras or ML)");
  std::memcpy(info, &value, std::min<size_t>(info->size, sizeof(value)));
  return 0;
}

extern "C" XRB_EXPORT void* XRB_CALL xrb_input_create(const XrbHost* host, const char* config, const XrbInputApi** api) {
  if (!api) return nullptr;
  *api = nullptr;
  if (!host || host->size < offsetof(XrbHost, publish_image) || !host->now_ms || !host->publish_hands || !host->set_input_status) return nullptr;
  try {
    auto* input = new Input(host);
    try { hand_tracking::parseConfig(config, input->config, input->error); }
    catch (...) { delete input; return nullptr; }
    *api = &kApi;
    return input;
  } catch (...) { return nullptr; }
}
