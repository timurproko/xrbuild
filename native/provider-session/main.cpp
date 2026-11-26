// Input-only worker. No display, platform, browser or CEF entry point is linked.
#include "host_channel.h"
#include "acquisition.h"
#include "published_frame.h"
#include "providers.h"
#include "log.h"
#include <nlohmann/json.hpp>
#include <atomic>
#include <iostream>
#include <thread>
using nlohmann::json;
namespace {
bool readControl(json* out) {
  std::string text; char ch;
  while (std::cin.get(ch)) { if (ch == '\n') { *out = json::parse(text, nullptr, false); return out->is_object(); } if (text.size() == 16384) return false; text += ch; }
  return false;
}
void event(const json& data) { std::cout << "@provider " << data.dump(-1, ' ', false, json::error_handler_t::replace) << std::endl; }
}
int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--version") { std::cout << "xrb-provider-session 1\n"; return 0; }
  json bootstrap;
  if (!readControl(&bootstrap) || bootstrap.value("version", 0) != 1 || !bootstrap.contains("runtimeName") || !bootstrap["runtimeName"].is_string() ||
      !bootstrap.contains("config") || !bootstrap["config"].is_object() || !bootstrap.contains("parentPid") || !bootstrap["parentPid"].is_number_unsigned()) return 2;
  const auto name = bootstrap["runtimeName"].get<std::string>();
  if (name.empty() || name.size() > 64 || name == "none") return 2;
  const uint64_t pid = bootstrap["parentPid"].get<uint64_t>();
  if (!pid || pid > MAXDWORD) return 2;
  HANDLE parent = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, DWORD(pid));
  if (!parent) return 2;
  acquisition::Lease lease; std::string why; std::wstring scope;
#ifdef XRB_PROVIDER_TEST
  if (!bootstrap.contains("testScope") || !bootstrap["testScope"].is_string()) return 2;
  const auto test = bootstrap["testScope"].get<std::string>();
  if (test.size() != 64 || test.find_first_not_of("0123456789abcdef") != std::string::npos) return 2;
  scope = L"-test-" + std::wstring(test.begin(), test.end());
#endif
  if (!lease.open(&why, scope) || !lease.take("Hands provider session", &why)) { event({{"phase", "failed"}, {"reason", why}}); CloseHandle(parent); return 3; }
  std::atomic<bool> quit{false}, done{false}, starting{true}; std::atomic<int> invalid{0};
  std::mutex reasonMutex; std::string failure, providerLog;
  auto fail = [&](const std::string& text) { std::lock_guard<std::mutex> lock(reasonMutex); if (failure.empty()) failure = text.substr(0, 1024); quit = true; };
  const auto begun = GetTickCount64();
  ULONGLONG startTimeout = 30000, stopTimeout = 5000;
#ifdef XRB_PROVIDER_TEST
  if (bootstrap.contains("startTimeoutMs") && bootstrap["startTimeoutMs"].is_number_unsigned()) startTimeout = (std::max)(100ull, (std::min)(30000ull, bootstrap["startTimeoutMs"].get<ULONGLONG>()));
  if (bootstrap.contains("stopTimeoutMs") && bootstrap["stopTimeoutMs"].is_number_unsigned()) stopTimeout = (std::max)(100ull, (std::min)(5000ull, bootstrap["stopTimeoutMs"].get<ULONGLONG>()));
#endif
  std::thread watchdog([&] {
    ULONGLONG stopping = 0;
    while (!done) {
      if (WaitForSingleObject(parent, 0) == WAIT_OBJECT_0) quit = true;
      const auto now = GetTickCount64();
      if (starting && now - begun > startTimeout) fail("Provider start timed out");
      if (quit && !stopping) stopping = now;
      if (stopping && now - stopping >= stopTimeout) TerminateProcess(GetCurrentProcess(), 4);
      Sleep(20);
    }
  });
  // EOF is an owning-process loss signal, not an unbounded detached worker. This thread is joined
  // after CancelSynchronousIo on normal shutdown, including failures before any command arrived.
  std::thread reader([&] { json command; while (readControl(&command)) { if (command.value("stop", false)) break; } quit = true; });
  plugins::Catalog catalog; providers::Input input; providers::Sink sink; session::Frames frames;
  sink.log = [&](const std::string&, int, const std::string& text) { std::lock_guard<std::mutex> lock(reasonMutex); providerLog = text.substr(0, 1024); };
  sink.hands = [&](const XrbHandFrame& frame) {
    if (quit) return;
    std::string reason;
    if (!frames.publish(frame, channel::hostTimeMs(), &reason) && (++invalid >= 3 || reason.find("clock") != std::string::npos)) fail(reason);
  };
  sink.inputStatus = [&](int state, float, const std::string& text) { if (state >= XRB_INPUT_NEEDS_SETUP) fail(text.empty() ? "Provider requires setup or failed" : text); };
  // Never enable debug image delivery. The worker transports skeletons only.
  sink.image = [](const XrbImage&) {};
  if (!quit) {
    std::wstring selectedPath;
    if (bootstrap.contains("pluginPath") && bootstrap["pluginPath"].is_string()) {
      selectedPath = widen(bootstrap["pluginPath"].get<std::string>());
      const auto slash = selectedPath.find_last_of(L"\\/");
      if (slash == std::wstring::npos) fail("Input plugin path must be absolute and owned");
      else {
        catalog.scan({selectedPath.substr(0, slash)});
        const auto* plugin = catalog.find(XRB_ROLE_INPUT, name);
        if (!plugin || _wcsicmp(plugin->path.c_str(), selectedPath.c_str()) != 0) fail("Selected input binary identity changed");
      }
    } else if (name != "simulated" && name != "replay") fail("Selected input binary is missing");
    auto config = bootstrap["config"]; if (!config.contains("xrb") || !config["xrb"].is_object()) config["xrb"] = json::object();
    config["xrb"]["debugImages"] = false;
    if (!quit && !providers::createInput(name, catalog, config.dump(), &sink, &input, &why)) {
      std::string detail; { std::lock_guard<std::mutex> lock(reasonMutex); detail = providerLog; }
      fail(detail.empty() ? why : why + ": " + detail);
    }
    if (!quit && input.api->start(input.self) != 0) fail(input.error().empty() ? "Provider failed to start" : input.error());
  }
  starting = false;
  uint64_t last = 0; double reported = 0;
  while (!quit) {
    const auto snapshot = frames.newest();
    if (snapshot.sequence >= 0xffffffffu) { fail("Provider frame sequence exhausted; start a new session"); break; }
    if (snapshot.sequence != last || channel::hostTimeMs() - reported >= 1000) {
      event({{"phase", "running"}, {"sequence", snapshot.sequence}, {"hands", snapshot.count}, {"captureTimeMs", snapshot.captureMs}, {"publicationTimeMs", snapshot.publicationMs}});
      last = snapshot.sequence; reported = channel::hostTimeMs();
    }
    Sleep(20);
  }
  if (input) { input.api->stop(input.self); input.reset(); }
  catalog.unload();
  lease.release(); // stop promised callback quiescence; destroy has completed.
  CancelSynchronousIo(reader.native_handle()); reader.join();
  done = true; watchdog.join(); CloseHandle(parent);
  { std::lock_guard<std::mutex> lock(reasonMutex); event({{"phase", failure.empty() ? "stopped" : "failed"}, {"reason", failure}}); }
  return failure.empty() ? 0 : 4;
}
