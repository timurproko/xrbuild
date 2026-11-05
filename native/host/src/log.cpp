#include "log.h"

#include <windows.h>
#include <shlobj.h>

#include <cstdarg>
#include <cstdio>
#include <mutex>

namespace {
std::mutex g_mutex;
FILE* g_file = nullptr;
LARGE_INTEGER g_freq{}, g_start{};
}  // namespace

std::wstring widen(const std::string& s) {
  if (s.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
  std::wstring w((size_t)n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), w.data(), n);
  return w;
}

std::string narrow(const std::wstring& w) {
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s((size_t)n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), s.data(), n, nullptr, nullptr);
  return s;
}

namespace logx {

std::wstring dataDir() {
  wchar_t* base = nullptr;
  std::wstring dir = L".";
  if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &base))) {
    dir = std::wstring(base) + L"\\XRBuild";
    CoTaskMemFree(base);
  }
  SHCreateDirectoryExW(nullptr, dir.c_str(), nullptr);
  return dir;
}

void open(const std::wstring& dir) {
  QueryPerformanceFrequency(&g_freq);
  QueryPerformanceCounter(&g_start);
  SHCreateDirectoryExW(nullptr, dir.c_str(), nullptr);
  std::wstring path = dir + L"\\xrb-host.log";
  MoveFileExW(path.c_str(), (path + L".prev").c_str(), MOVEFILE_REPLACE_EXISTING);
  _wfopen_s(&g_file, path.c_str(), L"wb");
}

void close() {
  std::lock_guard<std::mutex> g(g_mutex);
  if (g_file) fclose(g_file);
  g_file = nullptr;
}

void line(const char* fmt, ...) {
  char buf[4096];
  va_list ap;
  va_start(ap, fmt);
  _vsnprintf_s(buf, sizeof(buf), _TRUNCATE, fmt, ap);
  va_end(ap);
  LARGE_INTEGER now;
  QueryPerformanceCounter(&now);
  double t = g_freq.QuadPart ? double(now.QuadPart - g_start.QuadPart) / g_freq.QuadPart : 0.0;
  std::lock_guard<std::mutex> g(g_mutex);
  fprintf(stdout, "%9.3f %s\n", t, buf);
  fflush(stdout);
  if (g_file) {
    fprintf(g_file, "%9.3f %s\n", t, buf);
    fflush(g_file);
  }
}

}  // namespace logx
