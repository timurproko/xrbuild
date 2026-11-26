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
    frame.count = 256; check(!frames.publish(frame, 110, &why), "oversize count refused without reading hands");
    frame.count = 1; frame.hands = nullptr; check(!frames.publish(frame, 110, &why), "missing borrowed pointer refused"); frame.hands = &hand;
    hand.keypoints[3] = 2; check(!frames.publish(frame, 110, &why), "out of range confidence refused"); hand.keypoints[3] = 0;
    hand.keypoints[0] = std::numeric_limits<float>::quiet_NaN(); check(!frames.publish(frame, 110, &why), "nonfinite joints refused"); hand.keypoints[0] = 0;
    hand.pinch[0] = 2; check(!frames.publish(frame, 110, &why), "invalid native signals refused"); hand.pinch[0] = 0;
    frame.capture_time_ms = 99; check(!frames.publish(frame, 110, &why), "backwards capture time refused"); frame.capture_time_ms = 100;
    // Multiple provider callback threads race only on the bounded owned latest slot.
    std::thread a([&] { for (int i = 0; i < 1000; i++) { std::string error; check(frames.publish(frame, 110, &error), "callback A"); } });
    std::thread b([&] { for (int i = 0; i < 1000; i++) { std::string error; check(frames.publish(frame, 110, &error), "callback B"); } });
    a.join(); b.join(); check(frames.newest().sequence == 2001, "concurrent source sequences remain monotonic");
    frame.count = 0; frame.hands = nullptr;
    check(frames.publish(frame, 111, &why) && frames.newest().packet.size() == 32, "empty detection frame retained");
    std::cout << "provider frames: ABI, borrowed lifetime, validation, no hands and concurrent newest slot passed\n";
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
