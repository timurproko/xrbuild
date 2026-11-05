#pragma once
// nlohmann/json in the host: never throws. The host is built with CEF's flags (no exceptions in the
// STL, no RTTI) and provider callbacks run behind C function tables, so config values are read with
// these type-checked getters instead of json::value()/get() (which throw on a wrong type).
//
// The host targets compile with JSON_DIAGNOSTICS=1, which puts this copy of nlohmann/json in its own
// inline namespace: code built with other flags (a statically linked third-party library) keeps its own, unmixed copy.
#include <string>
#include <type_traits>

#include <nlohmann/json.hpp>

template <class T>
T jsonOr(const nlohmann::json& j, const char* key, T fallback) {
  if (!j.is_object()) return fallback;
  auto it = j.find(key);
  if (it == j.end()) return fallback;
  if constexpr (std::is_same_v<T, bool>) {
    return it->is_boolean() ? it->template get<bool>() : fallback;
  } else if constexpr (std::is_arithmetic_v<T>) {
    return it->is_number() ? it->template get<T>() : fallback;
  } else {
    return it->is_string() ? it->template get<std::string>() : fallback;
  }
}

inline std::string jsonOr(const nlohmann::json& j, const char* key, const char* fallback) {
  return jsonOr<std::string>(j, key, std::string(fallback));
}

// Parses an object; anything else (bad JSON included) gives an empty object.
inline nlohmann::json jsonObject(const char* text) {
  nlohmann::json j = nlohmann::json::parse(text ? text : "{}", nullptr, false);
  return j.is_object() ? j : nlohmann::json::object();
}
