#pragma once
// A process-owned acquisition slot, independent of checkout/workspace/provider aliases.
// All entry paths take the transition gate; only an authenticated designated child may bypass it.
#include <windows.h>
#include <sddl.h>
#include <bcrypt.h>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace acquisition {
inline uint64_t created(HANDLE process) {
  FILETIME c{}, e{}, k{}, u{};
  return GetProcessTimes(process, &c, &e, &k, &u) ? (uint64_t(c.dwHighDateTime) << 32) | c.dwLowDateTime : 0;
}
inline std::string randomId() {
  unsigned char bytes[32]{};
  if (BCryptGenRandom(nullptr, bytes, sizeof(bytes), BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0) return {};
  std::string out; const char* hex = "0123456789abcdef";
  for (auto b : bytes) { out += hex[b >> 4]; out += hex[b & 15]; }
  return out;
}
class Security {
 public:
  SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES), nullptr, FALSE};
  std::wstring name;
  Security() {
    HANDLE token = nullptr; DWORD bytes = 0;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return;
    GetTokenInformation(token, TokenUser, nullptr, 0, &bytes);
    std::vector<unsigned char> buffer(bytes);
    bool ok = GetTokenInformation(token, TokenUser, buffer.data(), bytes, &bytes) != 0;
    CloseHandle(token); LPWSTR sid = nullptr;
    if (!ok || !ConvertSidToStringSidW(reinterpret_cast<TOKEN_USER*>(buffer.data())->User.Sid, &sid)) return;
    std::wstring user(sid); LocalFree(sid);
    // Local object namespace supplies logon-session scope. Explicit user ACL also covers elevation.
    name = L"Local\\XRBuildHands-v1-" + user;
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (ConvertStringSecurityDescriptorToSecurityDescriptorW((L"D:P(A;;GA;;;" + user + L")").c_str(), SDDL_REVISION_1, &descriptor, nullptr))
      attributes.lpSecurityDescriptor = descriptor;
  }
  ~Security() { if (attributes.lpSecurityDescriptor) LocalFree(attributes.lpSecurityDescriptor); }
  bool valid() const { return attributes.lpSecurityDescriptor != nullptr && !name.empty(); }
};
struct Owner {
  uint32_t version = 1, pid = 0;
  uint64_t birth = 0;
  char label[256]{};
};
class Lease {
 public:
  Lease() = default;
  Lease(const Lease&) = delete;
  Lease& operator=(const Lease&) = delete;
  ~Lease() { release(); if (view_) UnmapViewOfFile(view_); if (mapping_) CloseHandle(mapping_); if (slot_) CloseHandle(slot_); if (gate_) CloseHandle(gate_); }
  // Main lifetime thread owns both mutexes. Tests use a unique namespace, never the live slot.
  bool open(std::string* reason, const std::wstring& testScope = L"") {
    Security security;
    if (!security.valid()) return fail(reason, "Cannot secure hand acquisition ownership");
    const auto name = security.name + testScope;
    gate_ = CreateMutexW(&security.attributes, FALSE, (name + L"-gate").c_str());
    slot_ = CreateMutexW(&security.attributes, FALSE, name.c_str());
    mapping_ = CreateFileMappingW(INVALID_HANDLE_VALUE, &security.attributes, PAGE_READWRITE, 0, sizeof(Owner), (name + L"-owner").c_str());
    const bool newMapping = mapping_ && GetLastError() != ERROR_ALREADY_EXISTS;
    if (!gate_ || !slot_ || !mapping_) return fail(reason, "Cannot open secured hand acquisition ownership");
    view_ = static_cast<Owner*>(MapViewOfFile(mapping_, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, sizeof(Owner)));
    if (view_ && newMapping) { Owner empty{}; memcpy(view_, &empty, sizeof(empty)); }
    return view_ != nullptr || fail(reason, "Cannot read hand acquisition ownership");
  }
  std::string busy() const {
    Owner owner{}; if (view_) memcpy(&owner, view_, sizeof(owner)); owner.label[255] = 0;
    std::string label;
    if (owner.version == 1 && owner.pid) for (unsigned char c : std::string(owner.label)) if (c >= 32 && c != 127) label += char(c);
    return (label.empty() ? "Another native hand session" : label) + " holds hand acquisition; stop it first";
  }
  bool enter(std::string* reason, DWORD timeout = 0) {
    const DWORD result = WaitForSingleObject(gate_, timeout);
    if (result != WAIT_OBJECT_0 && result != WAIT_ABANDONED) return fail(reason, busy());
    gated_ = true; return true;
  }
  void leave() { if (gated_) { ReleaseMutex(gate_); gated_ = false; } }
  bool take(const std::string& label, std::string* reason, bool keepGate = false) {
    if (!enter(reason)) return false;
    const bool ok = takeSlot(label, reason);
    if (!ok || !keepGate) leave();
    return ok;
  }
  bool takeSlot(const std::string& label, std::string* reason, DWORD timeout = 0) {
    const DWORD result = WaitForSingleObject(slot_, timeout);
    if (result != WAIT_OBJECT_0 && result != WAIT_ABANDONED) return fail(reason, busy());
    owned_ = true;
    // A mutex can be abandoned by a dead thread in a still-live process. Never steal its devices.
    Owner old{}; memcpy(&old, view_, sizeof(old));
    if (old.version != 1) { dropSlot(false); return fail(reason, "Invalid hand owner metadata; recovery requires stopping its process"); }
    if (old.pid) {
      HANDLE prior = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, old.pid);
      const DWORD error = GetLastError();
      bool uncertain = !prior && error != ERROR_INVALID_PARAMETER;
      if (prior) { uncertain = created(prior) == 0 || created(prior) == old.birth && WaitForSingleObject(prior, 0) != WAIT_OBJECT_0; CloseHandle(prior); }
      if (uncertain) { dropSlot(false); return fail(reason, "Previous hand acquisition process is alive or inaccessible; stop it first"); }
    }
    Owner owner{}; owner.pid = GetCurrentProcessId(); owner.birth = created(GetCurrentProcess());
    size_t i = 0; for (unsigned char c : label) if (c >= 32 && c != 127 && i < 255) owner.label[i++] = char(c);
    memcpy(view_, &owner, sizeof(owner)); return true;
  }
  void dropSlot(bool clear = true) { if (owned_) { if (clear && view_) { Owner empty{}; memcpy(view_, &empty, sizeof(empty)); } ReleaseMutex(slot_); owned_ = false; } }
  void release() { dropSlot(); leave(); }
 private:
  static bool fail(std::string* reason, const std::string& message) { if (reason) *reason = message; return false; }
  HANDLE gate_ = nullptr, slot_ = nullptr, mapping_ = nullptr;
  Owner* view_ = nullptr;
  bool gated_ = false, owned_ = false;
};
// Bounded overlapped named-pipe I/O. A peer cannot strand a reservation by ceasing to read/write.
inline bool pipeIo(HANDLE pipe, void* data, DWORD bytes, bool write, DWORD timeout = 5000) {
  OVERLAPPED operation{}; operation.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  if (!operation.hEvent) return false;
  DWORD done = 0;
  BOOL ok = write ? WriteFile(pipe, data, bytes, &done, &operation) : ReadFile(pipe, data, bytes, &done, &operation);
  if (!ok && GetLastError() == ERROR_IO_PENDING) {
    if (WaitForSingleObject(operation.hEvent, timeout) == WAIT_OBJECT_0) ok = GetOverlappedResult(pipe, &operation, &done, FALSE);
    else { CancelIoEx(pipe, &operation); GetOverlappedResult(pipe, &operation, &done, TRUE); }
  }
  CloseHandle(operation.hEvent); return ok && done == bytes;
}
inline bool acceptHandoff(Lease& lease, const std::wstring& ticket, const std::string& label, std::string* error) {
  if (ticket.size() != 64 || ticket.find_first_not_of(L"0123456789abcdef") != std::wstring::npos) { *error = "Invalid acquisition handoff"; return false; }
  const auto name = L"\\\\.\\pipe\\xrb-hands-" + ticket;
  if (!WaitNamedPipeW(name.c_str(), 5000)) { *error = "Acquisition reservation expired"; return false; }
  HANDLE pipe = CreateFileW(name.c_str(), GENERIC_READ | GENERIC_WRITE, 0, nullptr, OPEN_EXISTING, FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION, nullptr);
  if (pipe == INVALID_HANDLE_VALUE) { *error = "Cannot reach acquisition reservation"; return false; }
  std::string secret; for (wchar_t ch : ticket) secret += static_cast<char>(ch);
  char go = 0, ack = 'A';
  bool ok = pipeIo(pipe, secret.data(), 64, true) && pipeIo(pipe, &go, 1, false) && go == 'G' && lease.takeSlot(label, error, 5000);
  if (ok) ok = pipeIo(pipe, &ack, 1, true) && pipeIo(pipe, &go, 1, false) && go == 'D';
  CloseHandle(pipe);
  if (!ok) { lease.release(); if (error->empty()) *error = "Acquisition handoff failed"; }
  return ok;
}
}  // namespace acquisition
