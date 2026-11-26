// Hardware-free regression runner for the production native scheduling policy.
#include "../bridge/marker-schedule.hpp"
#include <iomanip>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
  if (!MarkerSchedule::self_test()) return 1;
  if (argc == 1) { std::cout << "marker schedule self-test passed\n"; return 0; }
  if (argc != 2 && argc != 3) return 2;
  const double offset = std::stod(argv[1]), fps = argc == 3 ? std::stod(argv[2]) : 30.0;
  if (!std::isfinite(fps) || fps <= 0 || fps > 90) return 2;
  MarkerSchedule schedule;
  std::cout << std::setprecision(17);
  for (int n = 0; n < 100; ++n) {
    const double at = 1000.0 + n * (1000.0 / fps) + offset;
    if (schedule.due(at)) std::cout << n + 1 << ',' << at << '\n';
  }
  return 0;
}
