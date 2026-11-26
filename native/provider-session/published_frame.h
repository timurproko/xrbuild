#pragma once
#include "host_channel.h"
#include <cmath>
#include <cstring>
#include <mutex>
#include <set>

namespace session {
// Owns the bytes before a borrowed provider callback returns. One newest slot, never a FIFO.
class Frames {
 public:
  bool publish(const XrbHandFrame& frame, double publicationMs, std::string* reason) {
    auto bad = [&](const char* text) { if (reason) *reason = text; return false; };
    if (frame.size < sizeof(XrbHandFrame) || frame.count > 255 || frame.count && !frame.hands || frame.capabilities & ~7u ||
        !std::isfinite(frame.capture_time_ms) || frame.capture_time_ms < 0 || !std::isfinite(publicationMs) ||
        !std::isfinite(frame.tracking_hz) || frame.tracking_hz < 0 || frame.tracking_hz > 1000) return bad("Invalid provider frame header");
    std::set<int32_t> ids;
    for (uint32_t i = 0; i < frame.count; i++) {
      const XrbHand& hand = frame.hands[i];
      if (!ids.insert(hand.id).second || hand.handedness < -1 || hand.handedness > 1 || hand.flags & ~XRB_HAND_GRABBING) return bad("Invalid provider hand identity or flags");
      for (auto pinch : hand.pinch) if (pinch > 1) return bad("Invalid native pinch flag");
      for (int j = 0; j < 84; j++) if (!std::isfinite(hand.keypoints[j]) || j % 4 == 3 && (hand.keypoints[j] < 0 || hand.keypoints[j] > 1)) return bad("Invalid provider joint/confidence");
      for (float value : hand.pinch_positions) if (!std::isfinite(value)) return bad("Invalid native pinch position");
      for (float value : hand.grab_position) if (!std::isfinite(value)) return bad("Invalid native grab position");
      for (float value : hand.palm) if (!std::isfinite(value)) return bad("Invalid native palm");
    }
    std::lock_guard<std::mutex> lock(mutex_);
    if (frame.capture_time_ms < capture_) return bad("Provider capture clock moved backwards");
    // Sequence is source-only, allocated under the same lock as the owned snapshot.
    capture_ = frame.capture_time_ms; published_ = publicationMs; count_ = frame.count; ++sequence_;
    packet_.resize(32 + frame.count * sizeof(XrbHand));
    channel::Header header{channel::kHands, 2, 0, static_cast<uint32_t>(sequence_), publicationMs};
    memcpy(packet_.data(), &header, sizeof(header));
    const auto payload = channel::encodeHands(frame);
    memcpy(packet_.data() + 16, payload.data(), payload.size()); return true;
  }
  struct Snapshot { uint64_t sequence; double captureMs, publicationMs; uint32_t count; std::vector<uint8_t> packet; };
  Snapshot newest() { std::lock_guard<std::mutex> lock(mutex_); return {sequence_, capture_, published_, count_, packet_}; }
 private:
  std::mutex mutex_;
  uint64_t sequence_ = 0;
  double capture_ = -1, published_ = 0;
  uint32_t count_ = 0;
  std::vector<uint8_t> packet_;
};
}  // namespace session
