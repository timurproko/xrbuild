#include "providers.h"
namespace providers {
std::vector<BuiltinEntry> builtinInputs();
const std::vector<BuiltinEntry>& builtinRegistry() { static const auto inputs = builtinInputs(); return inputs; }
}
