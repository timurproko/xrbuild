#include "../acquisition.h"
#include <iostream>
#include <thread>
#include <vector>
#include <stdexcept>
using acquisition::Lease;
void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
int wmain(int argc, wchar_t** argv) {
  if (argc == 3 && (std::wstring(argv[1]) == L"--child" || std::wstring(argv[1]) == L"--crash")) {
    Lease lease; std::string why;
    if (!lease.open(&why, argv[2]) || !lease.take("child app", &why)) return 3;
    if (std::wstring(argv[1]) == L"--crash") TerminateProcess(GetCurrentProcess(), 5);
    return 0;
  }
  if (argc == 3 && (std::wstring(argv[1]) == L"--legacy" || std::wstring(argv[1]) == L"--capable")) {
    HANDLE host = CreateMutexW(nullptr, FALSE, (std::wstring(L"Local\\XRBuildHost") + argv[2]).c_str());
    HANDLE capable = std::wstring(argv[1]) == L"--capable" ? CreateEventW(nullptr, TRUE, TRUE, (std::wstring(L"Local\\XRBuildHostHandsLeaseV1") + argv[2]).c_str()) : nullptr;
    std::cout << "ready" << std::endl; char ch; std::cin.get(ch); if (capable) CloseHandle(capable); CloseHandle(host); return 0;
  }
  if (argc == 3 && std::wstring(argv[1]) == L"--handoff") {
    Lease lease; std::string why; wchar_t ticket[65]{};
    if (GetEnvironmentVariableW(L"XRB_HAND_LEASE_TICKET", ticket, 65) != 64 || !lease.open(&why, argv[2]) || !acquisition::acceptHandoff(lease, ticket, "App designated test child", &why)) {
      std::cerr << why << '\n'; return 4;
    }
    std::cout << "held" << std::endl; char ch; std::cin.get(ch); return 0;
  }
  try {
    const std::string id = acquisition::randomId();
    const std::wstring scope = L"-test-" + std::wstring(id.begin(), id.end());
    auto child = [&](const wchar_t* mode = L"--child") {
      wchar_t exe[32768]{}; GetModuleFileNameW(nullptr, exe, 32768);
      std::wstring command = L"\"" + std::wstring(exe) + L"\" " + mode + L" " + scope;
      STARTUPINFOW startup{sizeof(startup)}; PROCESS_INFORMATION process{};
      check(CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process) != 0, "spawn isolated contender");
      check(WaitForSingleObject(process.hProcess, 5000) == WAIT_OBJECT_0, "contender finishes");
      DWORD code = 0; GetExitCodeProcess(process.hProcess, &code); CloseHandle(process.hThread); CloseHandle(process.hProcess); return code;
    };
    Lease owner; std::string why;
    check(owner.open(&why, scope), "open isolated slot");
    check(owner.take("App Example", &why), "first owner acquires");
    check(child() == 3, "another process cannot open the same acquisition");
    check(owner.busy().find("App Example") != std::string::npos, "busy names owner");
    owner.release();
    check(child() == 0, "a stopped owner releases acquisition");
    // Reservation keeps the gate while dropping the slot; ordinary entrants cannot steal the gap.
    check(owner.take("Hands reservation", &why, true), "reserve transition");
    owner.dropSlot();
    check(child() == 3, "transition gate protects handoff gap");
    owner.leave();
    check(child() == 0, "cancelled reservation releases gate");
    check(child(L"--crash") == 5, "test owner dies without releasing");
    check(child() == 0, "verified dead owner can be recovered");
    acquisition::Security security;
    HANDLE metadata = OpenFileMappingW(FILE_MAP_READ | FILE_MAP_WRITE, FALSE, (security.name + scope + L"-owner").c_str());
    check(metadata != nullptr, "test metadata access");
    auto* view = static_cast<acquisition::Owner*>(MapViewOfFile(metadata, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, sizeof(acquisition::Owner)));
    check(view != nullptr, "test metadata mapping");
    check(owner.enter(&why), "hold test transition during metadata mutation");
    view->version = 99; owner.leave();
    check(child() == 3, "corrupt metadata fails closed");
    check(owner.enter(&why), "repair only owned test metadata");
    acquisition::Owner reused{}; reused.pid = GetCurrentProcessId(); reused.birth = acquisition::created(GetCurrentProcess()) + 1;
    memcpy(view, &reused, sizeof(reused)); owner.leave();
    check(child() == 0, "a reused PID does not preserve an unrelated old identity");
    UnmapViewOfFile(view); CloseHandle(metadata);
    // A dying owning thread is not proof its process released cameras.
    Lease abandoned;
    check(abandoned.open(&why, scope), "open abandoned-thread owner");
    std::thread thread([&] { std::string error; check(abandoned.take("still-live process", &error), "thread owns"); }); thread.join();
    Lease contender; check(contender.open(&why, scope), "open abandoned contender");
    check(!contender.take("other", &why), "live abandoned-thread process cannot be stolen");
    check(why.find("alive or inaccessible") != std::string::npos, "live-owner recovery reason");
    std::cout << "acquisition lease: process exclusion, labels, stop, reservation and live-abandonment passed\n";
    return 0;
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
