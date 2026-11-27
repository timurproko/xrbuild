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
bool readControl(json* out, const std::atomic<bool>* cancelled = nullptr) {
  std::string text; char ch; const HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  for (;;) {
    if (cancelled) {
      if (*cancelled) return false;
      DWORD available = 0;
      if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) return false;
      if (!available) { Sleep(10); continue; }
    }
    DWORD read = 0;
    if (!ReadFile(input, &ch, 1, &read, nullptr) || read != 1) return false;
    if (ch == '\n') { *out = json::parse(text, nullptr, false); return out->is_object(); }
    if (text.size() == 16384) return false;
    text += ch;
  }
}
void event(const json& data) { std::cout << "@provider " << data.dump(-1, ' ', false, json::error_handler_t::replace) << std::endl; }
}
int main(int argc, char** argv) {
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
  if (argc == 2 && std::string(argv[1]) == "--version") { std::cout << "xrb-provider-session 1\n"; return 0; }
  json bootstrap;
  if (!readControl(&bootstrap) || bootstrap.value("version", 0) != 1 || !bootstrap.contains("runtimeName") || !bootstrap["runtimeName"].is_string() ||
      !bootstrap.contains("config") || !bootstrap["config"].is_object() || !bootstrap.contains("parentPid") || !bootstrap["parentPid"].is_number_unsigned()) return 2;
  const auto name = bootstrap["runtimeName"].get<std::string>();
  if (name.empty() || name.size() > 64 || name == "none") return 2;
  for (const char* key : {"token", "epoch"}) if (!bootstrap.contains(key) || !bootstrap[key].is_string() || bootstrap[key].get<std::string>().size() != 64 || bootstrap[key].get<std::string>().find_first_not_of("0123456789abcdef") != std::string::npos) return 2;
  if (!bootstrap.contains("origin") || !bootstrap["origin"].is_string()) return 2;
  const auto origin = bootstrap["origin"].get<std::string>(), epoch = bootstrap["epoch"].get<std::string>();
  if (!origin.starts_with("http://127.0.0.1:") || origin.size() > 64 || origin.find_first_of("\r\n/?#", 7) != std::string::npos) return 2;
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
#else
  if (bootstrap.contains("testScope")) { CloseHandle(parent); return 2; }
#endif
  event({{"phase", "acquiring"}, {"pid", GetCurrentProcessId()}});
  bool acquired = lease.open(&why, scope);
  if (acquired && bootstrap.contains("ticket") && bootstrap["ticket"].is_string())
    acquired = acquisition::acceptHandoff(lease, widen(bootstrap["ticket"].get<std::string>()), "Hands provider session", &why);
  else if (acquired) acquired = lease.take("Hands provider session", &why);
  if (!acquired) { event({{"phase", "failed"}, {"reason", why}}); CloseHandle(parent); return 3; }
  std::atomic<bool> quit{false}, done{false}, starting{true};
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
  // Cancellation is state, not a one-shot CancelSynchronousIo call: failure can precede the
  // reader's first pending read. Polling an owned pipe keeps join bounded even in that ordering.
  const auto commands = [&] { json command; while (readControl(&command, &quit)) { if (command.value("stop", false)) break; } quit = true; };
  bool deferReader = false;
#ifdef XRB_PROVIDER_TEST
  deferReader = bootstrap.value("deferControlReader", false);
#endif
  std::thread reader;
  if (!deferReader) reader = std::thread(commands);
  plugins::Catalog catalog; providers::Input input; providers::Sink sink; session::Frames frames;
  sink.log = [&](const std::string&, int, const std::string& text) { std::lock_guard<std::mutex> lock(reasonMutex); providerLog = text.substr(0, 1024); };
  double invalidWindowMs = 10000;
#ifdef XRB_PROVIDER_TEST
  invalidWindowMs = (std::max)(100.0, (std::min)(10000.0, bootstrap.value("invalidWindowMs", 10000.0)));
#endif
  session::RejectionWindow invalid(invalidWindowMs);
  std::mutex admissionMutex;
  sink.hands = [&](const XrbHandFrame& frame) {
    std::lock_guard<std::mutex> lock(admissionMutex);
    if (quit) return;
    std::string reason;
    const auto now = channel::hostTimeMs();
    const bool intact = frames.publish(frame, now, &reason);
    const auto snapshot = frames.newest();
    const bool healthy = intact || snapshot.sequence && snapshot.publicationMs == now && snapshot.count > 0;
    if (invalid.observe(now, healthy)) fail("Persistently malformed provider stream (recent rejection rate); " + snapshot.diagnostic.text());
    if (reason == "capture-clock-backwards") fail("Provider capture clock moved backwards; " + snapshot.diagnostic.text());
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
#ifndef XRB_PROVIDER_TEST
    // Preserve the app's existing provider-owned calibration/data lookup. New core state is workspace-owned.
    config["xrb"]["dataDir"] = narrow(logx::dataDir());
#endif
    config["xrb"]["view"] = "3d";
    config["xrb"]["debugImages"] = false;
    if (!quit && !providers::createInput(name, catalog, config.dump(), &sink, &input, &why)) {
      std::string detail; { std::lock_guard<std::mutex> lock(reasonMutex); detail = providerLog; }
      fail(detail.empty() ? why : why + ": " + detail);
    }
    if (!quit && input.api->start(input.self) != 0) fail(input.error().empty() ? "Provider failed to start" : input.error());
  }
  channel::Server transport;
  transport.sessionToken = bootstrap["token"].get<std::string>(); transport.sessionOrigin = origin;
  transport.onDisconnect = [&] { quit = true; };
  transport.onMessage = [&](const uint8_t* data, size_t size) {
    if (size == 9 && data[0] == 111) {
      double p0 = 0; memcpy(&p0, data + 1, 8);
      if (!std::isfinite(p0) || p0 < 0) { fail("Invalid hand session clock sample"); return; }
      const double clocks[3] = {p0, channel::hostTimeMs(), channel::hostTimeMs()};
      transport.publish(static_cast<channel::MessageType>(22), clocks, sizeof(clocks));
    } else fail("Invalid hand session control message"); // Frames-only peers cannot control acquisition or arbitrary channel messages.
  };
  if (!quit && !transport.start()) fail("Cannot start authenticated loopback hand transport");
  if (!quit) event({{"phase", "running"}, {"url", transport.url()}, {"pid", GetCurrentProcessId()}});
  starting = false;
  const auto connectedBy = GetTickCount64() + 5000;
  const auto streamBegan = channel::hostTimeMs();
  uint64_t last = 0, sent = 0; double reported = 0;
  while (!quit) {
    const auto snapshot = frames.newest();
    if (snapshot.sequence >= 0xffffffffu) { fail("Provider frame sequence exhausted; start a new session"); break; }
    if (!transport.clientCount() && GetTickCount64() > connectedBy) { fail("Hands page did not connect before the session deadline"); break; }
    if (channel::hostTimeMs() - (snapshot.sequence ? snapshot.publicationMs : streamBegan) > 10000) { fail("Provider stopped delivering usable frames for 10 seconds; " + snapshot.diagnostic.text()); break; }
    if (snapshot.sequence != sent && transport.clientCount()) {
      std::vector<uint8_t> payload(72 + snapshot.packet.size());
      memcpy(payload.data(), epoch.data(), 64); memcpy(payload.data() + 64, &snapshot.sequence, 8);
      memcpy(payload.data() + 72, snapshot.packet.data(), snapshot.packet.size());
      transport.publish(static_cast<channel::MessageType>(snapshot.filtered ? 23 : 21), payload.data(), payload.size()); sent = snapshot.sequence;
    }
    if (snapshot.sequence != last || channel::hostTimeMs() - reported >= 1000) {
      event({{"phase", "running"}, {"sequence", snapshot.sequence}, {"hands", snapshot.count}, {"captureTimeMs", snapshot.captureMs}, {"publicationTimeMs", snapshot.publicationMs},
        {"diagnostic", snapshot.diagnostic.text()}, {"rejectedFrames", snapshot.diagnostic.frames}, {"rejectedHands", snapshot.diagnostic.hands}});
      last = snapshot.sequence; reported = channel::hostTimeMs();
    }
    Sleep(20);
  }
  transport.stop();
  if (input) { input.api->stop(input.self); input.reset(); }
  catalog.unload();
  lease.release(); // stop promised callback quiescence; destroy has completed.
  if (deferReader) reader = std::thread(commands); // Deterministically exercise failure before the first read.
  reader.join();
  done = true; watchdog.join(); CloseHandle(parent);
  { std::lock_guard<std::mutex> lock(reasonMutex); event({{"phase", failure.empty() ? "stopped" : "failed"}, {"reason", failure}, {"diagnostic", frames.newest().diagnostic.text()}}); }
  return failure.empty() ? 0 : 4;
}
