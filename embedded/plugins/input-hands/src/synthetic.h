#pragma once
#include <array>
#include <string>
#include "xrb_plugin.h"

namespace hand_tracking {
struct Config {
  std::string scenario = "motion";
  int hands = 2;
  int hz = 60;
};
struct Sample {
  std::array<XrbHand, 2> hands{};
  uint32_t count = 0;
};
bool parseConfig(const char* json, Config& out, std::string& error);
Sample generate(const Config& config, double seconds);
bool valid(const XrbHand& hand);
uint32_t discardInvalid(Sample& sample);
}  // namespace hand_tracking
