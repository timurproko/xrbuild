// A native launcher is needed because Node cannot assign a Job Object before a child first runs.
#include <windows.h>
#include <string>
#include <vector>
int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && std::wstring(argv[1]) == L"--version") { DWORD bytes; const char* version = "xrb-provider-supervisor 1\n"; WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), version, 26, &bytes, nullptr); return 0; }
  if (argc != 3) return 2;
  wchar_t* end = nullptr; const auto id = wcstoul(argv[2], &end, 10);
  if (!id || !end || *end) return 2;
  HANDLE parent = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, id);
  if (!parent || WaitForSingleObject(parent, 0) != WAIT_TIMEOUT) { if (parent) CloseHandle(parent); return 3; }
  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{}; limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!job || !SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) { if (job) CloseHandle(job); CloseHandle(parent); return 3; }
  HANDLE handles[3]{}; const DWORD streams[] = {STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE};
  bool ok = true;
  for (int i = 0; i < 3; i++) if (!DuplicateHandle(GetCurrentProcess(), GetStdHandle(streams[i]), GetCurrentProcess(), &handles[i], 0, TRUE, DUPLICATE_SAME_ACCESS)) ok = false;
  STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = handles[0]; startup.StartupInfo.hStdOutput = handles[1]; startup.StartupInfo.hStdError = handles[2];
  SIZE_T size = 0; InitializeProcThreadAttributeList(nullptr, 2, 0, &size);
  std::vector<unsigned char> storage(size); startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  const bool initialized = InitializeProcThreadAttributeList(startup.lpAttributeList, 2, 0, &size) != 0;
  ok = ok && initialized && UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles, sizeof(handles), nullptr, nullptr)
    && UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &job, sizeof(job), nullptr, nullptr);
  PROCESS_INFORMATION child{};
  std::wstring command = L"\"" + std::wstring(argv[1]) + L"\"";
  if (ok) ok = CreateProcessW(argv[1], command.data(), nullptr, nullptr, TRUE, CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT, nullptr, nullptr, &startup.StartupInfo, &child) != 0;
  for (HANDLE handle : handles) if (handle) CloseHandle(handle);
  if (initialized) DeleteProcThreadAttributeList(startup.lpAttributeList);
  BOOL inJob = FALSE;
  // Job-list creation is atomic: launcher death cannot strand a suspended child between spawn and assignment.
  if (ok) ok = IsProcessInJob(child.hProcess, job, &inJob) && inJob && WaitForSingleObject(parent, 0) == WAIT_TIMEOUT;
  if (!ok) {
    if (child.hProcess) { TerminateProcess(child.hProcess, 3); WaitForSingleObject(child.hProcess, 5000); CloseHandle(child.hThread); CloseHandle(child.hProcess); }
    CloseHandle(job); CloseHandle(parent); return 3;
  }
  if (ResumeThread(child.hThread) == DWORD(-1)) { CloseHandle(job); WaitForSingleObject(child.hProcess, 5000); CloseHandle(child.hThread); CloseHandle(child.hProcess); CloseHandle(parent); return 3; }
  CloseHandle(child.hThread);
  HANDLE wait[] = {child.hProcess, parent};
  const DWORD result = WaitForMultipleObjects(2, wait, FALSE, INFINITE);
  if (result != WAIT_OBJECT_0) { CloseHandle(job); job = nullptr; WaitForSingleObject(child.hProcess, 5000); }
  DWORD code = 4; GetExitCodeProcess(child.hProcess, &code);
  CloseHandle(child.hProcess); CloseHandle(parent); if (job) CloseHandle(job);
  return code == STILL_ACTIVE ? 4 : int(code);
}
