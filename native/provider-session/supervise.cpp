// This launcher owns both the exact worker handle and its kill-on-close job from process birth.
#include <windows.h>
#include <atomic>
#include <string>
#include <thread>
#include <vector>
int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && std::wstring(argv[1]) == L"--version") { DWORD bytes; const char* version = "xrb-provider-supervisor 1\n"; WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), version, 26, &bytes, nullptr); return 0; }
  if (argc != 3) return 2;
  wchar_t* end = nullptr; const auto id = wcstoul(argv[2], &end, 10);
  if (!id || !end || *end) return 2;
  HANDLE parent = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, id);
  if (!parent || WaitForSingleObject(parent, 0) != WAIT_TIMEOUT) { if (parent) CloseHandle(parent); return 3; }
  HANDLE job = CreateJobObjectW(nullptr, nullptr), stopping = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{}; limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!job || !stopping || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) { if (job) CloseHandle(job); if (stopping) CloseHandle(stopping); CloseHandle(parent); return 3; }
  HANDLE handles[3]{}, writer = nullptr; SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
  bool ok = CreatePipe(&handles[0], &writer, &security, 32768) != 0;
  if (writer) SetHandleInformation(writer, HANDLE_FLAG_INHERIT, 0);
  for (int i = 1; i < 3; i++) if (!DuplicateHandle(GetCurrentProcess(), GetStdHandle(i == 1 ? STD_OUTPUT_HANDLE : STD_ERROR_HANDLE), GetCurrentProcess(), &handles[i], 0, TRUE, DUPLICATE_SAME_ACCESS)) ok = false;
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
  if (ok) ok = ResumeThread(child.hThread) != DWORD(-1);
  if (!ok) {
    if (child.hProcess) { TerminateProcess(child.hProcess, 3); WaitForSingleObject(child.hProcess, 5000); CloseHandle(child.hThread); CloseHandle(child.hProcess); }
    if (writer) CloseHandle(writer); CloseHandle(job); CloseHandle(stopping); CloseHandle(parent); return 3;
  }
  CloseHandle(child.hThread);
  std::atomic<bool> done{false};
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
  done = true; controls.join();
  DWORD code = 4; if (joined) GetExitCodeProcess(child.hProcess, &code);
  // Receipt proves the exact process, not a recycled numeric PID, has ended. Parent still joins this launcher.
  const std::string receipt = "@provider {\"phase\":\"" + std::string(joined ? "joined" : "teardown-failed") + "\",\"pid\":" + std::to_string(child.dwProcessId) + "}\n";
  DWORD written; WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), receipt.data(), DWORD(receipt.size()), &written, nullptr);
  CloseHandle(child.hProcess); CloseHandle(parent); CloseHandle(stopping); CloseHandle(job);
  return code == STILL_ACTIVE || !joined ? 4 : int(code);
}
