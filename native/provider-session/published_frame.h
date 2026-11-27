#pragma once
#include "host_channel.h"
#include <cmath>
#include <cstring>
#include <deque>
#include <mutex>
#include <set>

namespace session {
// A recent-window rate, reset by healthy output; never a lifetime error limit.
class RejectionWindow {
 public:
  explicit RejectionWindow(double windowMs = 10000) : window_(windowMs) {}
  bool observe(double now, bool healthy) {
    if (healthy) { since_ = -1; rejected_.clear(); return false; }
    if (since_ < 0) since_ = now;
    while (!rejected_.empty() && now - rejected_.front() > window_) rejected_.pop_front();
    if (rejected_.size() == 512) rejected_.pop_front();
    rejected_.push_back(now);
    return now - since_ >= window_ && rejected_.size() >= 3;
  }
 private:
  double window_, since_ = -1;
  std::deque<double> rejected_;
};
struct Diagnostic {
  uint64_t frames = 0, hands = 0;
  std::string kind;
  int joint = -1;
  std::string text() const {
    return frames ? "Rejected " + kind + "; joint " + (joint < 0 ? std::string("n/a") : std::to_string(joint)) +
      "; count " + std::to_string(frames) + " frames, " + std::to_string(hands) + " hands" : "";
  }
};
// Owns borrowed bytes before the callback returns. A filtered snapshot is explicitly NOT raw recording input.
class Frames {
 public:
  bool publish(const XrbHandFrame& frame, double publicationMs, std::string* reason) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto bad = [&](const char* kind, int joint = -1) { diagnostic_.kind = kind; diagnostic_.joint = joint; if (reason) *reason = kind; };
    if (frame.size < sizeof(XrbHandFrame) || frame.count > 255 || frame.count && !frame.hands || frame.capabilities & ~7u ||
        !std::isfinite(frame.capture_time_ms) || frame.capture_time_ms < 0 || !std::isfinite(publicationMs) || publicationMs < frame.capture_time_ms ||
        !std::isfinite(frame.tracking_hz) || frame.tracking_hz < 0 || frame.tracking_hz > 1000) {
      bad("frame-header"); ++diagnostic_.frames; return false;
    }
    if (frame.capture_time_ms < capture_) { bad("capture-clock-backwards"); ++diagnostic_.frames; return false; }
    std::vector<XrbHand> admitted;
    std::set<int32_t> ids;
    for (uint32_t i = 0; i < frame.count; i++) {
      const XrbHand& hand = frame.hands[i];
      const char* kind = nullptr; int joint = -1;
      if (!ids.insert(hand.id).second || hand.handedness < -1 || hand.handedness > 1 || hand.flags & ~XRB_HAND_GRABBING) kind = "hand-identity-flags";
      for (auto pinch : hand.pinch) if (pinch > 1) kind = "pinch-flag";
      for (int j = 0; !kind && j < 84; j++) {
        if (!std::isfinite(hand.keypoints[j])) { kind = j % 4 == 3 ? "confidence-nonfinite" : "joint-nonfinite"; joint = j / 4; }
        else if (j % 4 == 3 && (hand.keypoints[j] < 0 || hand.keypoints[j] > 1)) { kind = "confidence-range"; joint = j / 4; }
      }
      for (float value : hand.pinch_positions) if (!kind && !std::isfinite(value)) kind = "pinch-position-nonfinite";
      for (float value : hand.grab_position) if (!kind && !std::isfinite(value)) kind = "grab-position-nonfinite";
      for (float value : hand.palm) if (!kind && !std::isfinite(value)) kind = "palm-nonfinite";
      if (kind) { bad(kind, joint); ++diagnostic_.hands; }
      else admitted.push_back(hand);
    }
    filtered_ = admitted.size() != frame.count;
    if (filtered_) ++diagnostic_.frames;
    // No fabricated joints: only intact hands, or a marked empty clearing observation.
    const XrbHandFrame safe{frame.size, frame.capabilities, frame.capture_time_ms, frame.tracking_hz, static_cast<uint32_t>(admitted.size()), admitted.data()};
    capture_ = frame.capture_time_ms; published_ = publicationMs; count_ = safe.count; ++sequence_;
    packet_.resize(32 + safe.count * sizeof(XrbHand));
    channel::Header header{channel::kHands, 2, 0, static_cast<uint32_t>(sequence_), publicationMs};
    memcpy(packet_.data(), &header, sizeof(header));
    const auto payload = channel::encodeHands(safe);
    memcpy(packet_.data() + 16, payload.data(), payload.size()); return !filtered_;
  }
  struct Snapshot { uint64_t sequence; double captureMs, publicationMs; uint32_t count; std::vector<uint8_t> packet; bool filtered; Diagnostic diagnostic; };
  Snapshot newest() { std::lock_guard<std::mutex> lock(mutex_); return {sequence_, capture_, published_, count_, packet_, filtered_, diagnostic_}; }
 private:
  std::mutex mutex_;
  uint64_t sequence_ = 0;
  double capture_ = -1, published_ = 0;
  uint32_t count_ = 0;
  bool filtered_ = false;
  Diagnostic diagnostic_;
  std::vector<uint8_t> packet_;
};
}  // namespace session
