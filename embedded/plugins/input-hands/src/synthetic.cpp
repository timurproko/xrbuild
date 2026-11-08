#include "synthetic.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <tuple>
#include <nlohmann/json.hpp>
#include "fixture.h"

namespace hand_tracking {
namespace {
constexpr int kBones[][2] = {{0,1},{1,2},{2,3},{3,4},{0,5},{5,6},{6,7},{7,8},
  {5,9},{9,10},{10,11},{11,12},{9,13},{13,14},{14,15},{15,16},{13,17},{0,17},{17,18},{18,19},{19,20}};
const std::array<std::array<float, 3>, 21>& pose() {
  static const auto points = [] {
    auto json = nlohmann::json::parse(kHandFixture);
    return json.at("points").get<std::array<std::array<float, 3>, 21>>();
  }();
  return points;
}
}

bool parseConfig(const char* text, Config& out, std::string& error) {
  auto json = nlohmann::json::parse(text ? text : "{}", nullptr, false);
  if (!json.is_object()) { error = "configuration must be a JSON object"; return false; }
  Config parsed;
  if (json.contains("scenario")) {
    if (!json["scenario"].is_string()) { error = "scenario must be text"; return false; }
    parsed.scenario = json["scenario"].get<std::string>();
  }
  if (parsed.scenario != "stationary" && parsed.scenario != "motion" && parsed.scenario != "teleport" && parsed.scenario != "dropout" && parsed.scenario != "invalid") {
    error = "scenario must be stationary, motion, teleport, dropout or invalid"; return false;
  }
  for (auto [key, target, low, high] : {std::tuple{"hands", &parsed.hands, 1, 2}, std::tuple{"hz", &parsed.hz, 1, 120}}) {
    if (!json.contains(key)) continue;
    const auto& value = json[key];
    // The panel's number fields serialize integral values as doubles too.
    if (!value.is_number() || !std::isfinite(value.get<double>()) || value.get<double>() < low || value.get<double>() > high || std::floor(value.get<double>()) != value.get<double>()) {
      error = std::string(key) + " must be an integer in " + std::to_string(low) + ".." + std::to_string(high); return false;
    }
    *target = static_cast<int>(value.get<double>());
  }
  out = parsed;
  error.clear();
  return true;
}

Sample generate(const Config& config, double seconds) {
  if (!std::isfinite(seconds) || seconds < 0 || config.hands < 1 || config.hands > 2) throw std::invalid_argument("invalid synthetic sample time/count");
  Sample sample;
  const double phase = std::fmod(seconds, 4.0);
  if (config.scenario == "dropout" && phase >= 2 && phase < 3) return sample;
  sample.count = static_cast<uint32_t>(config.hands);
  const float dx = config.scenario == "motion" ? float(0.06 * std::sin(seconds)) : config.scenario == "teleport" && phase >= 2 ? 0.16f : 0.0f;
  const float dy = config.scenario == "motion" ? float(0.025 * std::sin(seconds * 0.7)) : 0.0f;
  const float dz = config.scenario == "motion" ? float(0.02 * std::sin(seconds * 0.5)) : 0.0f;
  for (uint32_t h = 0; h < sample.count; ++h) {
    auto& hand = sample.hands[h];
    hand.id = int(h + 1);
    hand.handedness = int8_t(h);
    const float mirror = h == 0 ? 1.0f : -1.0f;
    for (int k = 0; k < 21; ++k) {
      auto point = pose()[k];
      // Authored synthetic pinch cycle, not inferred/native gesture flags.
      if (config.scenario == "motion" && k == 4 && std::fmod(seconds, 6.0) >= 3 && std::fmod(seconds, 6.0) < 5) {
        point = pose()[8]; point[0] += 0.012f;
      }
      hand.keypoints[k * 4] = (h == 0 ? -0.11f : 0.11f) + mirror * point[0] + dx;
      hand.keypoints[k * 4 + 1] = -0.08f + point[1] + dy;
      hand.keypoints[k * 4 + 2] = 0.07f + point[2] + dz;
      hand.keypoints[k * 4 + 3] = 1.0f;  // Known fixture, not ML confidence.
    }
    if (config.scenario == "invalid" && phase >= 2) hand.keypoints[8 * 4] += 0.25f;
  }
  return sample;
}

bool valid(const XrbHand& hand) {
  if (hand.id < 0 || hand.handedness < -1 || hand.handedness > 1) return false;
  for (int k = 0; k < 21; ++k) {
    for (int a = 0; a < 4; ++a) if (!std::isfinite(hand.keypoints[k * 4 + a])) return false;
    if (hand.keypoints[k * 4 + 3] != 1.0f) return false;
  }
  for (const auto& edge : kBones) {
    float squared = 0;
    for (int a = 0; a < 3; ++a) { float d = hand.keypoints[edge[0] * 4 + a] - hand.keypoints[edge[1] * 4 + a]; squared += d * d; }
    if (squared < 0.005f * 0.005f || squared > 0.12f * 0.12f) return false;
  }
  return true;
}

uint32_t discardInvalid(Sample& sample) {
  uint32_t accepted = 0;
  const auto original = sample.count;
  for (uint32_t h = 0; h < original; ++h) if (valid(sample.hands[h])) sample.hands[accepted++] = sample.hands[h];
  sample.count = accepted;
  return original - accepted;
}
}  // namespace hand_tracking
