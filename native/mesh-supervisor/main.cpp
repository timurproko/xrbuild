// Byte-transparent optional-stage containment. No provider, camera, CEF or model dependency.
#include <windows.h>
#include <atomic>
#include <algorithm>
#include <cstdint>
#include <string>
#include <thread>
#include <vector>
namespace {
unsigned long long birthOf(HANDLE p) {
  FILETIME birth{}, exit{}, kernel{}, user{};
  if (!GetProcessTimes(p, &birth, &exit, &kernel, &user)) return 0;
  ULARGE_INTEGER n{}; n.LowPart = birth.dwLowDateTime; n.HighPart = birth.dwHighDateTime; return n.QuadPart;
}
bool readExact(HANDLE h, void* data, DWORD size) {
  auto p = static_cast<char*>(data);
  while (size) { DWORD n = 0; if (!ReadFile(h, p, size, &n, nullptr) || !n) return false; p += n; size -= n; }
  return true;
}
bool writeAll(HANDLE h, const char* data, DWORD size) {
  while (size) { DWORD n = 0; if (!WriteFile(h, data, size, &n, nullptr) || !n) return false; data += n; size -= n; }
  return true;
}
void receipt(const std::string& phase, DWORD pid, unsigned long long birth) {
  const auto text = "{\"phase\":\"" + phase + "\",\"pid\":" + std::to_string(pid) + ",\"birth\":\"" + std::to_string(birth) + "\"}\n";
  writeAll(GetStdHandle(STD_ERROR_HANDLE), text.data(), DWORD(text.size()));
}
std::wstring quote(const std::wstring& value) {
  std::wstring out = L"\""; unsigned slashes = 0;
  for (wchar_t c : value) {
    if (c == L'\\') { ++slashes; continue; }
    if (c == L'\"') { out.append(slashes * 2 + 1, L'\\'); out += c; }
    else { out.append(slashes, L'\\'); out += c; }
    slashes = 0;
  }
  out.append(slashes * 2, L'\\'); return out + L"\"";
}
bool emptyJob(HANDLE job) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};
  return QueryInformationJobObject(job, JobObjectBasicAccountingInformation, &info, sizeof(info), nullptr) && !info.ActiveProcesses;
}
}
int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && std::wstring(argv[1]) == L"--version") {
    const char* text = "xrb-mesh-supervisor 1\n"; writeAll(GetStdHandle(STD_OUTPUT_HANDLE), text, 22); return 0;
  }
  // Read-only fallback: exact creation identity and owned job accounting, never PID-based termination.
  if (argc == 5 && std::wstring(argv[1]) == L"--verify") {
    wchar_t *pe = nullptr, *be = nullptr;
    const auto pid = wcstoul(argv[3], &pe, 10); const auto birth = wcstoull(argv[4], &be, 10);
    if ((!pid != !birth) || *pe || *be || std::wstring(argv[2]).find(L"Local\\xrb-mesh-") != 0) return 2;
    HANDLE p = pid ? OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid) : nullptr;
    if (p) {
      const auto actual = birthOf(p);
      const bool dead = actual && (actual != birth || WaitForSingleObject(p, 5000) == WAIT_OBJECT_0);
      CloseHandle(p); if (!dead) return 4;
    } else if (pid && GetLastError() != ERROR_INVALID_PARAMETER) return 4;
    HANDLE job = OpenJobObjectW(JOB_OBJECT_QUERY, FALSE, argv[2]);
    if (!job) return GetLastError() == ERROR_FILE_NOT_FOUND ? 0 : 4;
    const auto end = GetTickCount64() + 5000;
    while (!emptyJob(job) && GetTickCount64() < end) Sleep(10);
    const bool empty = emptyJob(job); CloseHandle(job); return empty ? 0 : 4;
  }
  if (argc != 1) return 2;
  // Private bounded bootstrap: u32 payload length, parent PID, argument count, then length-prefixed UTF-8 strings:
  // job name, cwd, absolute program, arguments. Subsequent stdin is unmodified processor packets.
  DWORD size = 0; HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  if (!readExact(input, &size, 4) || size < 20 || size > 65536) return 2;
  std::vector<char> boot(size); if (!readExact(input, boot.data(), size)) return 2;
  size_t at = 0;
  auto integer = [&](DWORD& n) { if (at + 4 > boot.size()) return false; memcpy(&n, boot.data() + at, 4); at += 4; return true; };
  auto text = [&](std::wstring& out) {
    DWORD n; if (!integer(n) || n > 32768 || at + n > boot.size()) return false;
    const auto count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, boot.data() + at, int(n), nullptr, 0);
    if (n && !count) return false;
    out.resize(count); if (count) MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, boot.data() + at, int(n), out.data(), count);
    at += n; return out.find(L'\0') == std::wstring::npos;
  };
  DWORD parentId, count; std::wstring name, cwd, program;
  if (!integer(parentId) || !integer(count) || !parentId || count > 16 || !text(name) || !text(cwd) || !text(program)
      || name.find(L"Local\\xrb-mesh-") != 0 || name.size() > 100 || cwd.empty() || program.empty()) return 2;
  std::wstring command = quote(program);
  for (DWORD i = 0; i < count; ++i) { std::wstring arg; if (!text(arg)) return 2; command += L" " + quote(arg); }
  if (at != boot.size() || command.size() > 32766) return 2;
  HANDLE parent = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, parentId);
  if (!parent || WaitForSingleObject(parent, 0) != WAIT_TIMEOUT) { if (parent) CloseHandle(parent); return 3; }
  HANDLE job = CreateJobObjectW(nullptr, name.c_str());
  if (!job || GetLastError() == ERROR_ALREADY_EXISTS) { if (job) CloseHandle(job); CloseHandle(parent); return 3; }
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{}; limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  HANDLE stopped = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  bool ok = stopped && SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits));
  SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
  HANDLE handles[3]{}, writer = nullptr, output = nullptr;
  ok = CreatePipe(&handles[0], &writer, &security, 65536) && ok;
  if (writer) SetHandleInformation(writer, HANDLE_FLAG_INHERIT, 0);
  ok = CreatePipe(&output, &handles[1], &security, 65536) && ok;
  if (output) SetHandleInformation(output, HANDLE_FLAG_INHERIT, 0);
  handles[2] = CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &security, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
  ok = ok && handles[2] != INVALID_HANDLE_VALUE;
  STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = handles[0]; startup.StartupInfo.hStdOutput = handles[1]; startup.StartupInfo.hStdError = handles[2];
  SIZE_T bytes = 0; InitializeProcThreadAttributeList(nullptr, 2, 0, &bytes);
  std::vector<unsigned char> storage(bytes); startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  const bool initialized = InitializeProcThreadAttributeList(startup.lpAttributeList, 2, 0, &bytes) != 0;
  ok = ok && initialized && UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles, sizeof(handles), nullptr, nullptr)
    && UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &job, sizeof(job), nullptr, nullptr);
  PROCESS_INFORMATION child{};
  if (ok) ok = CreateProcessW(program.c_str(), command.data(), nullptr, nullptr, TRUE,
    CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT, nullptr, cwd.c_str(), &startup.StartupInfo, &child) != 0;
  for (HANDLE h : handles) if (h && h != INVALID_HANDLE_VALUE) CloseHandle(h);
  if (initialized) DeleteProcThreadAttributeList(startup.lpAttributeList);
  BOOL inJob = FALSE;
  if (ok) ok = IsProcessInJob(child.hProcess, job, &inJob) && inJob && WaitForSingleObject(parent, 0) == WAIT_TIMEOUT;
  const auto birth = ok ? birthOf(child.hProcess) : 0;
  if (ok) { receipt("spawned", child.dwProcessId, birth); ok = birth && ResumeThread(child.hThread) != DWORD(-1); }
  if (!ok) {
    if (child.hProcess) { TerminateJobObject(job, 3); WaitForSingleObject(child.hProcess, 5000); CloseHandle(child.hThread); CloseHandle(child.hProcess); }
    if (writer) CloseHandle(writer); if (output) CloseHandle(output); if (stopped) CloseHandle(stopped); CloseHandle(job); CloseHandle(parent); return 3;
  }
  CloseHandle(child.hThread); std::atomic<bool> done{false};
  std::thread events([&] {
    char buffer[16384];
    while (!done) {
      DWORD n = 0; if (!ReadFile(output, buffer, sizeof(buffer), &n, nullptr) || !n) break;
      if (!writeAll(GetStdHandle(STD_OUTPUT_HANDLE), buffer, n)) { SetEvent(stopped); break; }
    }
    CloseHandle(output);
  });
  std::thread controls([&] {
    char buffer[16384];
    while (!done) {
      DWORD n = 0; if (!ReadFile(input, buffer, sizeof(buffer), &n, nullptr) || !n) break;
      if (!writeAll(writer, buffer, n)) break;
    }
    CloseHandle(writer); SetEvent(stopped);
  });
  HANDLE wait[] = {child.hProcess, parent, stopped};
  const auto result = WaitForMultipleObjects(3, wait, FALSE, INFINITE);
  if (result == WAIT_OBJECT_0 + 2) WaitForSingleObject(child.hProcess, 2000);
  // Also terminate descendants on a normal/crashed direct-child exit. Only this exact owned job is affected.
  TerminateJobObject(job, 4);
  const auto end = GetTickCount64() + 5000;
  while (!emptyJob(job) && GetTickCount64() < end) Sleep(10);
  const bool joined = emptyJob(job) && WaitForSingleObject(child.hProcess, 0) == WAIT_OBJECT_0;
  done = true; CancelSynchronousIo(controls.native_handle()); CancelSynchronousIo(events.native_handle());
  controls.join(); events.join();
  receipt(joined ? "joined" : "teardown-failed", child.dwProcessId, birth);
  CloseHandle(child.hProcess); CloseHandle(parent); CloseHandle(stopped); CloseHandle(job);
  return joined ? 0 : 4;
}
