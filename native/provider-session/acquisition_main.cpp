#include "acquisition.h"
#include <iostream>
#include <thread>
#include <atomic>
#include <nlohmann/json.hpp>
using nlohmann::json;
namespace {
bool line(json* out) {
  std::string text; char ch;
  while (std::cin.get(ch)) { if (ch == '\n') { *out = json::parse(text, nullptr, false); return out->is_object(); } if (text.size() == 16384) return false; text += ch; }
  return false;
}
void event(const json& data) { std::cout << "@acquisition " << data.dump(-1, ' ', false, json::error_handler_t::replace) << std::endl; }
bool legacyHost(const std::wstring& testScope) {
  HANDLE host = OpenMutexW(SYNCHRONIZE, FALSE, (L"Local\\XRBuildHost" + testScope).c_str());
  if (!host) return false;
  CloseHandle(host);
  HANDLE capable = OpenEventW(SYNCHRONIZE, FALSE, (L"Local\\XRBuildHostHandsLeaseV1" + testScope).c_str());
  if (capable) CloseHandle(capable);
  return !capable;
}
}
int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--version") { std::cout << "xrb-acquisition 1\n"; return 0; }
  json bootstrap;
  if (!line(&bootstrap) || !bootstrap.contains("label") || !bootstrap["label"].is_string() || bootstrap["label"].get<std::string>().size() > 255) return 2;
  acquisition::Lease lease; std::string why; std::wstring testScope;
#ifdef XRB_ACQUISITION_TEST
  if (!bootstrap.contains("testScope") || !bootstrap["testScope"].is_string()) return 2;
  const auto scope = bootstrap["testScope"].get<std::string>();
  if (scope.size() != 64 || scope.find_first_not_of("0123456789abcdef") != std::string::npos) return 2;
  testScope = L"-test-" + std::wstring(scope.begin(), scope.end());
#else
  if (bootstrap.contains("testScope")) return 2; // Misconfigured tests must never acquire the person's normal slot.
#endif
  if (!lease.open(&why, testScope) || !lease.take(bootstrap["label"].get<std::string>(), &why, true)) { event({{"phase", "busy"}, {"reason", why}}); return 3; }
  // Only the Hands worker checks for a legacy display host. New input-free hosts are allowed.
  if (bootstrap.value("checkLegacyHost", false) && legacyHost(testScope)) { event({{"phase", "busy"}, {"reason", "An older native host is running; close or update it before starting Hands"}}); return 3; }
  if (!bootstrap.contains("ticket") || !bootstrap["ticket"].is_string()) return 2;
  const std::string ticket = bootstrap["ticket"].get<std::string>();
  if (ticket.size() != 64 || ticket.find_first_not_of("0123456789abcdef") != std::string::npos) return 2;
  acquisition::Security security;
  const std::wstring name = L"\\\\.\\pipe\\xrb-hands-" + std::wstring(ticket.begin(), ticket.end());
  HANDLE pipe = CreateNamedPipeW(name.c_str(), PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
    PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS, 1, 128, 128, 5000, &security.attributes);
  if (pipe == INVALID_HANDLE_VALUE) { event({{"phase", "failed"}, {"reason", "Cannot create acquisition handoff"}}); return 4; }
  event({{"phase", "reserved"}});
  json command;
  if (!line(&command) || !command.contains("pid") || !command["pid"].is_number_unsigned()) { CloseHandle(pipe); return 2; }
  const auto pid = command["pid"].get<uint64_t>();
  if (!pid || pid > MAXDWORD) { CloseHandle(pipe); return 2; }
  HANDLE child = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, DWORD(pid));
  if (!child) { CloseHandle(pipe); return 4; }
  OVERLAPPED connect{}; connect.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  BOOL connected = ConnectNamedPipe(pipe, &connect); const DWORD connectError = GetLastError();
  if (!connected && connectError == ERROR_PIPE_CONNECTED) connected = TRUE;
  if (!connected && connectError == ERROR_IO_PENDING) {
    HANDLE waits[] = {connect.hEvent, child}; DWORD done = WaitForMultipleObjects(2, waits, FALSE, 5000);
    DWORD bytes = 0;
    if (done == WAIT_OBJECT_0) connected = GetOverlappedResult(pipe, &connect, &bytes, FALSE);
    else { CancelIoEx(pipe, &connect); GetOverlappedResult(pipe, &connect, &bytes, TRUE); }
  }
  CloseHandle(connect.hEvent);
  ULONG actual = 0; char secret[64]{}, go = 'G', ack = 0;
  bool ok = connected && GetNamedPipeClientProcessId(pipe, &actual) && actual == pid && WaitForSingleObject(child, 0) == WAIT_TIMEOUT &&
    acquisition::pipeIo(pipe, secret, 64, false) && memcmp(secret, ticket.data(), 64) == 0;
  if (ok) {
    lease.dropSlot(); // Transition gate remains owned until the designated child owns the slot.
    ok = acquisition::pipeIo(pipe, &go, 1, true) && acquisition::pipeIo(pipe, &ack, 1, false) && ack == 'A';
    if (ok) { lease.leave(); go = 'D'; ok = acquisition::pipeIo(pipe, &go, 1, true); }
  }
  CloseHandle(child); CloseHandle(pipe);
  event({{"phase", ok ? "transferred" : "failed"}, {"reason", ok ? "" : "Acquisition handoff failed"}});
  return ok ? 0 : 4;
}
