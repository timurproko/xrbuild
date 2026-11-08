#include <windows.h>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstring>
#include <iostream>
#include <limits>
#include <mutex>
#include <stdexcept>
#include <thread>
#include "synthetic.h"

namespace {
int checks = 0;
void check(bool ok, const char* message) { ++checks; if (!ok) throw std::runtime_error(message); }
struct Sink {
  std::atomic<int> callbacks{0};
  std::mutex mutex;
  std::condition_variable wake;
  int frames = 0;
  bool bad = false;
  int states = 0;
};
double XRB_CALL now(void*) {
  LARGE_INTEGER counter, frequency;
  QueryPerformanceCounter(&counter); QueryPerformanceFrequency(&frequency);
  return double(counter.QuadPart) * 1000 / double(frequency.QuadPart);
}
void XRB_CALL hands(void* ctx, const XrbHandFrame* frame) {
  auto& sink = *static_cast<Sink*>(ctx);
  ++sink.callbacks;
  std::lock_guard<std::mutex> lock(sink.mutex);
  if (frame->size != sizeof(*frame) || frame->capabilities != 0 || frame->count > 2 || !std::isfinite(frame->capture_time_ms)) sink.bad = true;
  for (uint32_t h = 0; h < frame->count; ++h) if (!hand_tracking::valid(frame->hands[h]) || frame->hands[h].flags) sink.bad = true;
  ++sink.frames;
  sink.wake.notify_all();
}
void XRB_CALL status(void* ctx, int32_t, float, const char*) { auto& sink = *static_cast<Sink*>(ctx); ++sink.callbacks; ++sink.states; }
void XRB_CALL log(void*, int32_t, const char*) {}
void waitFrames(Sink& sink, int target) {
  std::unique_lock<std::mutex> lock(sink.mutex);
  check(sink.wake.wait_for(lock, std::chrono::seconds(2), [&] { return sink.frames >= target; }), "producer did not deliver frames");
}
}
int main(int argc, char** argv) {
  try {
    check(argc == 2, "pass plugin DLL path");
    hand_tracking::Config config;
    std::string error;
    check(hand_tracking::parseConfig("{}", config, error), "default configuration");
    for (const char* bad : {"{", "[]", "{\"hz\":0}", "{\"hz\":121}", "{\"hz\":2.5}", "{\"hands\":3}", "{\"hands\":true}", "{\"scenario\":\"camera\"}"})
      check(!hand_tracking::parseConfig(bad, config, error) && !error.empty(), "reject malformed/unsupported configuration");
    check(hand_tracking::parseConfig("{\"hz\":60.0,\"hands\":2,\"scenario\":\"stationary\",\"xrb\":{}}", config, error), "panel numeric values / host metadata");
    auto stationary = hand_tracking::generate(config, 0), later = hand_tracking::generate(config, 20);
    check(std::memcmp(stationary.hands.data(), later.hands.data(), sizeof(stationary.hands)) == 0, "stationary determinism");
    check(stationary.count == 2 && stationary.hands[0].id == 1 && stationary.hands[1].id == 2, "two stable IDs");
    check(hand_tracking::valid(stationary.hands[0]) && hand_tracking::valid(stationary.hands[1]), "fixture geometry valid");
    check(std::abs(stationary.hands[0].keypoints[0] + 0.11f) < 1e-6f, "known wrist fixture");
    for (int k = 0; k < 21; ++k) check(std::abs(stationary.hands[0].keypoints[k*4] + stationary.hands[1].keypoints[k*4]) < 1e-6f, "left/right mirror");
    config.scenario = "motion";
    auto motion = hand_tracking::generate(config, 3.5), repeat = hand_tracking::generate(config, 3.5);
    check(std::memcmp(motion.hands.data(), repeat.hands.data(), sizeof(motion.hands)) == 0, "motion deterministic at given time");
    check(hand_tracking::discardInvalid(motion) == 0, "pinch-cycle geometry accepted");
    config.scenario = "teleport";
    auto before = hand_tracking::generate(config, 1.999), after = hand_tracking::generate(config, 2.0);
    check(std::abs(after.hands[0].keypoints[0] - before.hands[0].keypoints[0] - 0.16f) < 1e-6f, "teleport boundary");
    config.scenario = "dropout";
    check(hand_tracking::generate(config, 1.999).count == 2 && hand_tracking::generate(config, 2).count == 0 && hand_tracking::generate(config, 3).count == 2, "dropout and reacquisition boundaries");
    config.scenario = "invalid";
    auto invalid = hand_tracking::generate(config, 2.5);
    check(hand_tracking::discardInvalid(invalid) == 2 && invalid.count == 0, "invalid fingers never published as accepted poses");
    auto badHand = stationary.hands[0];
    badHand.keypoints[0] = std::numeric_limits<float>::quiet_NaN();
    check(!hand_tracking::valid(badHand), "reject NaN");
    badHand = stationary.hands[0]; badHand.keypoints[3] = 0;
    check(!hand_tracking::valid(badHand), "reject partial validity");
    bool threw = false;
    try { hand_tracking::generate(config, -1); } catch (const std::invalid_argument&) { threw = true; }
    check(threw, "reject invalid sample time");

    HMODULE dll = LoadLibraryA(argv[1]);
    check(dll != nullptr, "load built plugin");
    auto query = reinterpret_cast<XrbPluginQueryFn>(GetProcAddress(dll, "xrb_plugin_query"));
    auto create = reinterpret_cast<XrbInputCreateFn>(GetProcAddress(dll, "xrb_input_create"));
    check(query && create, "ABI exports");
    struct Extended { XrbPluginInfo info; unsigned char guard[16]; } extended{};
    std::memset(extended.guard, 0xA5, sizeof(extended.guard));
    extended.info.size = sizeof(extended);
    check(query(&extended.info) == 0 && extended.info.abi_major == XRB_ABI_MAJOR && extended.info.role == XRB_ROLE_INPUT && std::strcmp(extended.info.name, "hand-tracking") == 0, "query identity");
    for (auto byte : extended.guard) check(byte == 0xA5, "query leaves unknown caller fields intact");
    XrbPluginInfo undersized{}; undersized.size = 4;
    check(query(&undersized) != 0 && query(nullptr) != 0, "query validates destination size");
    Sink sink;
    XrbHost host{}; host.size = sizeof(host); host.ctx = &sink; host.now_ms = now; host.publish_hands = hands; host.set_input_status = status; host.log = log;
    const XrbInputApi* api = nullptr;
    check(create(nullptr, "{}", &api) == nullptr, "missing host rejected");
    auto missingClock = host; missingClock.now_ms = nullptr;
    check(create(&missingClock, "{}", &api) == nullptr, "missing clock rejected");
    void* broken = create(&host, "{\"hz\":0}", &api);
    check(broken && api->start(broken) != 0 && std::strlen(api->last_error(broken)) > 0, "invalid config fails start usefully");
    api->stop(broken); api->destroy(broken);
    check(sink.callbacks.load() == 0, "create/query/bad config start have no producer side effects");
    void* input = create(&host, "{\"hz\":120}", &api);
    check(input && api && api->size == sizeof(XrbInputApi), "create returns function table");
    for (int cycle = 0; cycle < 20; ++cycle) {
      int target;
      { std::lock_guard<std::mutex> lock(sink.mutex); target = sink.frames + 3; }
      check(api->start(input) == 0 && api->start(input) == 0, "start is idempotent");
      waitFrames(sink, target);
      api->stop(input); api->stop(input);
      const int stopped = sink.callbacks.load();
      std::this_thread::sleep_for(std::chrono::milliseconds(15));
      check(sink.callbacks.load() == stopped, "no callback after stop returns");
    }
    check(!sink.bad && sink.states > 0, "only safe frames / generic statuses delivered");
    check(api->start(input) == 0, "restart before destroy");
    api->destroy(input);  // also stops a live producer
    const int destroyed = sink.callbacks.load();
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    check(sink.callbacks.load() == destroyed, "no callback after destroy");
    FreeLibrary(dll);
    std::cout << "hand-tracking: " << checks << " checks passed; 20 start/stop cycles; no late callbacks\n";
    return 0;
  } catch (const std::exception& e) { std::cerr << "FAIL: " << e.what() << '\n'; return 1; }
}
