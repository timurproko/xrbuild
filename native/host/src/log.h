#pragma once
#include <string>

// One log for the whole process: every line goes to stdout and to
// %LOCALAPPDATA%\XRBuild\logs\xrb-host.log (previous run kept as .prev).
namespace logx {
void open(const std::wstring& dir);
void close();
void line(const char* fmt, ...);
std::wstring dataDir();   // %LOCALAPPDATA%\XRBuild
}  // namespace logx

#define LOGI(...) ::logx::line(__VA_ARGS__)

std::wstring widen(const std::string& s);
std::string narrow(const std::wstring& w);
