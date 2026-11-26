#pragma once
#include <array>
#include <cmath>
#include <stdexcept>

// Select the first actual color frame in a shared reported-clock bucket, not
// every 200 ms relative to this process's independently phased start time.
// 211 ms also avoids locking the buckets to an integer number of frames at
// common slower profiles (e.g. 200 ms = four 20 Hz or three 15 Hz frames).
// This schedules detection only: it never changes a frame's timestamp/domain.
class MarkerSchedule {
  bool initialized_ = false;
  double bucket_ = 0;
public:
  static constexpr double interval_ms = 211.0;
  bool due(double color_timestamp_ms) {
    if (!std::isfinite(color_timestamp_ms)) throw std::runtime_error("Invalid marker frame timestamp");
    const double bucket = std::floor(color_timestamp_ms / interval_ms);
    if (initialized_ && bucket == bucket_) return false;
    initialized_ = true; bucket_ = bucket; return true;
  }
  // Exercised by the existing native --self-test without opening a device.
  static bool self_test() {
    MarkerSchedule a, b;
    std::array<double, 180> observed_a{}, observed_b{};
    std::size_t na = 0, nb = 0;
    for (int n = 0; n < 180; ++n) {
      const double at = 1000.0 + n * (1000.0 / 30.0);
      if (a.due(at)) observed_a[na++] = at;
      if (b.due(at + 100.0)) observed_b[nb++] = at + 100.0;
    }
    std::size_t matched = 0;
    for (std::size_t i = 0; i < na; ++i) {
      for (std::size_t j = 0; j < nb; ++j) {
        if (std::abs(observed_a[i] - observed_b[j]) <= 40.0) { ++matched; break; }
      }
    }
    return matched >= 12 && na <= 32 && nb <= 32;
  }
};
