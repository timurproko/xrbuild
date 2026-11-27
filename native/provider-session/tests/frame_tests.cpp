#include "../published_frame.h"
#include <iostream>
#include <limits>
#include <thread>
#include <stdexcept>
void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
int main() {
  try {
    session::Frames frames; std::string why; XrbHand hand{}; hand.id = 7; hand.handedness = 1;
    hand.keypoints[0] = .125f; hand.pinch[0] = 1; hand.pinch_positions[0] = .25f;
    XrbHandFrame frame{sizeof(XrbHandFrame), XRB_CAP_PINCH, 100, 60, 1, &hand};
    check(frames.publish(frame, 110, &why), "valid ABI frame admitted");
    const auto original = frames.newest();
    hand.keypoints[0] = 9;
    check(frames.newest().packet == original.packet, "borrowed memory is copied before return");
    check(original.packet.size() == 32 + 456 && original.sequence == 1, "unchanged HANDS v2 layout");
    check(original.packet[0] == 2 && original.packet[1] == 2 && original.packet[29] == XRB_CAP_PINCH, "native capabilities retained");
    bool healthy = true;
    frame.count = 256; check(!frames.publish(frame, 110, &why, &healthy), "oversize count refused without reading hands");
    check(!healthy, "same-timestamp malformed callback cannot inherit previous healthy snapshot");
    frame.count = 1; frame.hands = nullptr; check(!frames.publish(frame, 110, &why), "missing borrowed pointer refused"); frame.hands = &hand;
    check(frames.publish(frame, 110, &why), "zero confidence and optional zero buffers are valid");
    for (float value : {-1.f, 2.f, std::numeric_limits<float>::infinity(), std::numeric_limits<float>::quiet_NaN()}) {
      hand.keypoints[8 * 4 + 3] = value;
      check(!frames.publish(frame, 110, &why), "invalid confidence rejected");
      const auto rejected = frames.newest();
      check(rejected.count == 0 && rejected.filtered && rejected.diagnostic.joint == 8, "marked empty observation and joint diagnostic");
      check(rejected.diagnostic.text().find("joint 8; count") != std::string::npos, "safe reportable count");
    }
    hand.keypoints[8 * 4 + 3] = 0;
    hand.keypoints[0] = std::numeric_limits<float>::quiet_NaN(); check(!frames.publish(frame, 110, &why), "nonfinite joints refused");
    check(frames.newest().diagnostic.kind == "joint-nonfinite", "coordinate kind distinguished"); hand.keypoints[0] = 0;
    XrbHand peers[2]{hand, hand}; peers[1].id = 8; peers[0].keypoints[3] = 2;
    frame.count = 2; frame.hands = peers;
    check(!frames.publish(frame, 110, &why, &healthy) && healthy && frames.newest().count == 1, "intact peer retained without malformed hand");
    check(frames.newest().packet[32] == 8, "intact peer bytes preserved"); frame.count = 1; frame.hands = &hand;
    hand.pinch[0] = 2; check(!frames.publish(frame, 110, &why), "invalid native signals refused"); hand.pinch[0] = 0;
    frame.capture_time_ms = 99; check(!frames.publish(frame, 110, &why), "backwards capture time refused"); frame.capture_time_ms = 100;
    // Multiple provider callback threads race only on the bounded owned latest slot.
    const auto beforeConcurrent = frames.newest().sequence;
    std::thread a([&] { for (int i = 0; i < 1000; i++) { std::string error; check(frames.publish(frame, 110, &error), "callback A"); } });
    std::thread b([&] { for (int i = 0; i < 1000; i++) { std::string error; check(frames.publish(frame, 110, &error), "callback B"); } });
    a.join(); b.join(); check(frames.newest().sequence == beforeConcurrent + 2000, "concurrent source sequences remain monotonic");
    frame.count = 0; frame.hands = nullptr;
    check(frames.publish(frame, 111, &why) && frames.newest().packet.size() == 32, "empty detection frame retained");
    session::RejectionWindow window(1000);
    for (int i = 0; i < 100; i++) { check(!window.observe(i * 2000, false), "isolated error never accumulates"); check(!window.observe(i * 2000 + 1, true), "healthy resets recent rate"); }
    check(!window.observe(200000, false) && !window.observe(200100, false), "short burst tolerated");
    check(window.observe(201000, false), "persistent recent rate fails");
    window.observe(201001, true);
    check(!window.observe(203000, false), "recovery resets window");
    session::RejectionWindow sparse(1000);
    check(!sparse.observe(0, false) && !sparse.observe(2000, false) && !sparse.observe(4000, false), "old rejects expire out of rate window");
    std::cout << "provider frames: ABI, borrowed lifetime, validation, no hands and concurrent newest slot passed\n";
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
