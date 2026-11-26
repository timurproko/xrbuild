#pragma once
// Neutral profile transport only. Geometry is applied once in the SDK, never in the host/provider.
#include "json_util.h"
#include <cmath>
#include <cstdint>

namespace handprofile {
constexpr uint8_t kProfile = 7, kProfileAck = 8, kSetProfile = 104, kAckProfile = 105;
constexpr size_t kMaxBytes = 8192;
inline bool bounded(const nlohmann::json& v, double lo, double hi) {
  if (!v.is_number()) return false;
  const double n = v.get<double>(); return std::isfinite(n) && n >= lo && n <= hi;
}
inline bool token(const nlohmann::json& j, const char* key, size_t lo, size_t hi, bool hex = false) {
  auto it = j.find(key); if (it == j.end() || !it->is_string()) return false;
  const auto s = it->get<std::string>(); if (s.size() < lo || s.size() > hi) return false;
  for (char c : s) if (!(hex ? (c >= 'a' && c <= 'f') || (c >= '0' && c <= '9') :
      (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-')) return false;
  return true;
}
inline bool validProfile(const nlohmann::json& p) {
  if (!p.is_object() || !p.contains("version") || p["version"] != 1 || !p.contains("offsetMm") || !p["offsetMm"].is_object()
      || !p.contains("sizeFactor") || !bounded(p["sizeFactor"], .5, 1.5) || !p.contains("appearance") || !p["appearance"].is_object()) return false;
  for (auto axis : {"x", "y", "z"}) if (!p["offsetMm"].contains(axis) || !bounded(p["offsetMm"][axis], -150, 150)) return false;
  for (auto it = p["appearance"].begin(); it != p["appearance"].end(); ++it) {
    const std::string k = it.key(); const auto& v = it.value();
    if (k == "showJoints" || k == "showBones" || k == "showPinchGrabIndicator") { if (!v.is_boolean()) return false; }
    else if (k == "jointColorLinear" || k == "boneColorLinear" || k == "indicatorColorLinear") {
      if (!v.is_array() || v.size() != 3) return false;
      for (const auto& c : v) if (!bounded(c, 0, 1)) return false;
    } else if (k == "opacity" || k == "indicatorOpacity") { if (!bounded(v, 0, 1)) return false; }
    else if (k == "jointDiameterMm") { if (!bounded(v, 1, 40)) return false; }
    else if (k == "boneDiameterMm") { if (!bounded(v, 1, 30)) return false; }
    else if (k == "indicatorDiameterMm") { if (!bounded(v, 1, 60)) return false; }
    else return false;
  }
  return true;
}
inline bool validEnvelope(const nlohmann::json& j) {
  return j.is_object() && j.contains("version") && j["version"] == 1 && token(j, "runId", 16, 80)
    && token(j, "revision", 64, 64, true) && j.contains("sequence") && bounded(j["sequence"], 0, 9007199254740991.)
    && std::floor(j["sequence"].get<double>()) == j["sequence"].get<double>() && j.contains("profile") && validProfile(j["profile"]);
}
inline nlohmann::json decode(const uint8_t* d, size_t n, uint8_t type) {
  if (n <= 16 || n > 16 + kMaxBytes || d[0] != type || d[1] != 2) return nullptr;
  auto j = nlohmann::json::parse(d + 16, d + n, nullptr, false);
  return j.is_discarded() ? nlohmann::json(nullptr) : j;
}
// Caller serializes access. Never adopts another run from a message.
struct State {
  nlohmann::json current;
  bool accept(const nlohmann::json& j) {
    if (!validEnvelope(j) || !validEnvelope(current) || j["runId"] != current["runId"] || j["sequence"] < current["sequence"]) return false;
    if (j["sequence"] == current["sequence"]) return j == current; // Retry only; SDK re-acks without resetting.
    current = j; return true;
  }
  bool acknowledge(const nlohmann::json& j) const {
    return j.is_object() && validEnvelope(current) && j.contains("runId") && j.contains("sequence") && j.contains("revision")
      && j["runId"] == current["runId"] && j["sequence"] == current["sequence"] && j["revision"] == current["revision"];
  }
};
}  // namespace handprofile
