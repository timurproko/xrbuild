// This launcher owns both the exact worker handle and its kill-on-close job from process birth.
#include <windows.h>
#include <atomic>
#include <algorithm>
#include <string>
#include <thread>
#include <vector>
namespace {
unsigned long long birthOf(HANDLE process) {
  FILETIME birth{}, exit{}, kernel{}, user{};
  if (!GetProcessTimes(process, &birth, &exit, &kernel, &user)) return 0;
  ULARGE_INTEGER value{}; value.LowPart = birth.dwLowDateTime; value.HighPart = birth.dwHighDateTime; return value.QuadPart;
}
}
int wmain(int argc, wchar_t** argv) {
  // Read-only fallback after launcher death. Never terminate or signal the queried process.
  if (argc == 4 && std::wstring(argv[1]) == L"--join") {
    wchar_t *pidEnd = nullptr, *birthEnd = nullptr;
    const auto pid = wcstoul(argv[2], &pidEnd, 10); const auto expected = wcstoull(argv[3], &birthEnd, 10);
    if (!pid || !expected || *pidEnd || *birthEnd) return 2;
    HANDLE process = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return GetLastError() == ERROR_INVALID_PARAMETER ? 0 : 4;
    const auto birth = birthOf(process);
    const bool dead = birth && (birth != expected || WaitForSingleObject(process, 5000) == WAIT_OBJECT_0);
    CloseHandle(process); return dead ? 0 : 4;
  }
  if (argc == 2 && std::wstring(argv[1]) == L"--version") { DWORD bytes; const char* version = "xrb-provider-supervisor 1\n"; WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), version, 26, &bytes, nullptr); return 0; }
  if (argc != 3) return 2;
  wchar_t* end = nullptr; const auto id = wcstoul(argv[2], &end, 10);
  if (!id || !end || *end) return 2;
  HANDLE parent = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, id);
  if (!parent || WaitForSingleObject(parent, 0) != WAIT_TIMEOUT) { if (parent) CloseHandle(parent); return 3; }
  HANDLE job = CreateJobObjectW(nullptr, nullptr), stopping = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{}; limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!job || !stopping || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) { if (job) CloseHandle(job); if (stopping) CloseHandle(stopping); CloseHandle(parent); return 3; }
  HANDLE handles[3]{}, writer = nullptr, output = nullptr; SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
  bool ok = CreatePipe(&handles[0], &writer, &security, 32768) != 0;
  if (writer) SetHandleInformation(writer, HANDLE_FLAG_INHERIT, 0);
  ok = CreatePipe(&output, &handles[1], &security, 32768) && ok;
  if (output) SetHandleInformation(output, HANDLE_FLAG_INHERIT, 0);
  if (!DuplicateHandle(GetCurrentProcess(), GetStdHandle(STD_ERROR_HANDLE), GetCurrentProcess(), &handles[2], 0, TRUE, DUPLICATE_SAME_ACCESS)) ok = false;
  STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = handles[0]; startup.StartupInfo.hStdOutput = handles[1]; startup.StartupInfo.hStdError = handles[2];
  SIZE_T size = 0; InitializeProcThreadAttributeList(nullptr, 2, 0, &size);
  std::vector<unsigned char> storage(size); startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  const bool initialized = InitializeProcThreadAttributeList(startup.lpAttributeList, 2, 0, &size) != 0;
  ok = ok && initialized && UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles, sizeof(handles), nullptr, nullptr)
    && UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &job, sizeof(job), nullptr, nullptr);
  PROCESS_INFORMATION child{}; std::wstring command = L"\"" + std::wstring(argv[1]) + L"\"";
  if (ok) ok = CreateProcessW(argv[1], command.data(), nullptr, nullptr, TRUE, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT, nullptr, nullptr, &startup.StartupInfo, &child) != 0;
  for (HANDLE handle : handles) if (handle) CloseHandle(handle);
  if (initialized) DeleteProcThreadAttributeList(startup.lpAttributeList);
  BOOL inJob = FALSE;
  if (ok) ok = IsProcessInJob(child.hProcess, job, &inJob) && inJob && WaitForSingleObject(parent, 0) == WAIT_TIMEOUT;
  if (ok) {
    const auto birth = birthOf(child.hProcess);
    const std::string spawned = "@provider {\"phase\":\"spawned\",\"pid\":" + std::to_string(child.dwProcessId) + ",\"birth\":\"" + std::to_string(birth) + "\"}\n";
    DWORD written = 0;
    ok = birth && WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), spawned.data(), DWORD(spawned.size()), &written, nullptr) && written == spawned.size();
    if (ok) ok = ResumeThread(child.hThread) != DWORD(-1);
  }
  if (!ok) {
    if (child.hProcess) { TerminateProcess(child.hProcess, 3); WaitForSingleObject(child.hProcess, 5000); CloseHandle(child.hThread); CloseHandle(child.hProcess); }
    if (writer) CloseHandle(writer); if (output) CloseHandle(output); CloseHandle(job); CloseHandle(stopping); CloseHandle(parent); return 3;
  }
  CloseHandle(child.hThread);
  std::atomic<bool> done{false};
  // Only complete bounded worker lines reach the parent. TerminateProcess can cut std::cout
  // mid-JSON; never concatenate that tail with our authoritative joined receipt.
  std::thread events([&] {
    std::string pending; ULONGLONG drainBy = 0;
    auto overflow = [&] {
      const std::string text = "@provider {\"phase\":\"failed\",\"reason\":\"Provider output exceeded its bound\"}\n";
      DWORD written; WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), text.data(), DWORD(text.size()), &written, nullptr); SetEvent(stopping);
    };
    for (;;) {
      if (done && !drainBy) drainBy = GetTickCount64() + 200;
      if (drainBy && GetTickCount64() > drainBy) break;
      DWORD available = 0, read = 0;
      if (!PeekNamedPipe(output, nullptr, 0, nullptr, &available, nullptr)) break;
      if (!available) { if (done) break; Sleep(5); continue; }
      char bytes[4096];
      if (!ReadFile(output, bytes, (std::min)(available, DWORD(sizeof(bytes))), &read, nullptr) || !read) break;
      pending.append(bytes, read);
      size_t end;
      while ((end = pending.find('\n')) != std::string::npos) {
        if (end > 4096) { overflow(); CloseHandle(output); return; }
        const auto line = pending.substr(0, end + 1); pending.erase(0, end + 1);
        DWORD written;
        if (!WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), line.data(), DWORD(line.size()), &written, nullptr)) { SetEvent(stopping); CloseHandle(output); return; }
      }
      if (pending.size() > 4096) { overflow(); break; }
    }
    CloseHandle(output); // Incomplete final line is deliberately discarded, not a lifecycle event.
  });
  // Forward controls ourselves, so even a worker hung before its reader starts has a bounded Stop.
  std::thread controls([&] {
    const HANDLE input = GetStdHandle(STD_INPUT_HANDLE); std::string line; bool bootstrapped = false;
    while (!done) {
      DWORD available = 0, read = 0;
      if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) break;
      if (!available) { Sleep(10); continue; }
      char ch;
      if (!ReadFile(input, &ch, 1, &read, nullptr) || read != 1 || line.size() > 16384) break;
      line += ch;
      if (ch != '\n') continue;
      DWORD written = 0;
      if (!WriteFile(writer, line.data(), DWORD(line.size()), &written, nullptr) || written != line.size()) break;
      if (bootstrapped) { SetEvent(stopping); break; } // The sole post-bootstrap control is Stop.
      bootstrapped = true; line.clear();
    }
    CloseHandle(writer); SetEvent(stopping);
  });
  HANDLE wait[] = {child.hProcess, parent, stopping};
  const DWORD result = WaitForMultipleObjects(3, wait, FALSE, INFINITE);
  bool joined = result == WAIT_OBJECT_0;
  if (!joined && result == WAIT_OBJECT_0 + 2) joined = WaitForSingleObject(child.hProcess, 6000) == WAIT_OBJECT_0;
  if (!joined) { TerminateJobObject(job, 4); joined = WaitForSingleObject(child.hProcess, 5000) == WAIT_OBJECT_0; }
  done = true; controls.join(); events.join();
  DWORD code = 4; if (joined) GetExitCodeProcess(child.hProcess, &code);
  // Receipt proves the exact process, not a recycled numeric PID, has ended. Parent still joins this launcher.
  const std::string receipt = "@provider {\"phase\":\"" + std::string(joined ? "joined" : "teardown-failed") + "\",\"pid\":" + std::to_string(child.dwProcessId) + "}\n";
  DWORD written; WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), receipt.data(), DWORD(receipt.size()), &written, nullptr);
  CloseHandle(child.hProcess); CloseHandle(parent); CloseHandle(stopping); CloseHandle(job);
  return code == STILL_ACTIVE || !joined ? 4 : int(code);
}
