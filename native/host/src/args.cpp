#include "args.h"

#include <cwchar>

#include "log.h"

bool rawFlag(int argc, wchar_t** argv, const wchar_t* name, std::wstring* value) {
  std::wstring prefix = std::wstring(L"--") + name + L"=";
  for (int i = 1; i < argc; i++) {
    std::wstring a = argv[i];
    if (a.rfind(prefix, 0) == 0) {
      if (value) *value = a.substr(prefix.size());
      return true;
    }
  }
  return false;
}

static bool parseSize(const std::wstring& v, int* w, int* h) {
  return swscanf_s(v.c_str(), L"%dx%d", w, h) == 2 && *w > 0 && *h > 0;
}

HostArgs parseArgs(int argc, wchar_t** argv) {
  HostArgs a;
  std::wstring v;
  if (rawFlag(argc, argv, L"url", &v)) a.url = narrow(v);
  if (rawFlag(argc, argv, L"app-dir", &v)) a.appDir = v;
  if (rawFlag(argc, argv, L"title", &v) && !v.empty()) a.title = v;
  if (rawFlag(argc, argv, L"view", &v)) a.view = narrow(v);
  if (rawFlag(argc, argv, L"camera-projection", &v)) {
    const std::string projection = narrow(v);
    if (projection == "perspective" || projection == "orthographic") a.cameraProjection = projection;
    else LOGI("[host] ignoring bad --camera-projection=%s", projection.c_str());
  }
  if (rawFlag(argc, argv, L"eye-res", &v) && !parseSize(v, &a.eyeW, &a.eyeH)) LOGI("[host] ignoring bad --eye-res=%s", narrow(v).c_str());
  if (rawFlag(argc, argv, L"window", &v) && !parseSize(v, &a.windowW, &a.windowH)) LOGI("[host] ignoring bad --window=%s", narrow(v).c_str());
  if (rawFlag(argc, argv, L"gpu", &v)) a.gpu = v != L"0";
  if (rawFlag(argc, argv, L"exit-after", &v)) a.exitAfter = _wtof(v.c_str());
  if (rawFlag(argc, argv, L"icon", &v)) a.icon = v;
  if (rawFlag(argc, argv, L"status", &v)) a.status = narrow(v);
  if (rawFlag(argc, argv, L"capture", &v)) a.capture = v;
  if (rawFlag(argc, argv, L"capture-after", &v)) a.captureAfter = _wtof(v.c_str());
  if (rawFlag(argc, argv, L"record-hands", &v)) a.recordHands = v;
  if (rawFlag(argc, argv, L"camera-view", &v)) a.cameraView = v == L"on" || v == L"1";
  if (rawFlag(argc, argv, L"camera-stream", &v)) a.cameraStream = v == L"on" || v == L"1";
  if (rawFlag(argc, argv, L"icon-size", &v)) {
    const int s = _wtoi(v.c_str());
    if (s >= 16 && s <= 2048) a.iconSize = s;
    else LOGI("[host] ignoring bad --icon-size=%s", narrow(v).c_str());
  }
  if (rawFlag(argc, argv, L"input", &v)) a.input = narrow(v);
  if (rawFlag(argc, argv, L"display", &v)) a.display = narrow(v);
  if (rawFlag(argc, argv, L"platform", &v)) a.platform = narrow(v);
  if (rawFlag(argc, argv, L"display-fallback", &v)) a.displayFallback = narrow(v);
  if (rawFlag(argc, argv, L"config", &v)) a.configFile = v;
  for (int i = 1; i < argc; i++) {
    const std::wstring arg = argv[i];
    if (arg.rfind(L"--plugin.", 0) == 0) {
      // --plugin.<name>.<key>=<value>; the key may itself contain dots (nested objects).
      const size_t dot = arg.find(L'.', 9), eq = arg.find(L'=');
      if (dot != std::wstring::npos && eq != std::wstring::npos && dot < eq && dot > 9 && eq > dot + 1)
        a.pluginOptions.push_back({narrow(arg.substr(9, dot - 9)), narrow(arg.substr(dot + 1, eq - dot - 1)), narrow(arg.substr(eq + 1))});
      else
        LOGI("[host] ignoring bad plugin option %s (use --plugin.<name>.<key>=<value>)", narrow(arg).c_str());
    }
    if (arg.rfind(L"--plugin-dir=", 0) == 0) a.pluginDirs.push_back(arg.substr(13));
    if (arg == L"--list-plugins" || arg.rfind(L"--list-plugins=", 0) == 0) a.listPlugins = true;
  }
  if (rawFlag(argc, argv, L"render-icon", &v)) {
    a.renderIcon = v;
    a.windowW = a.windowH = a.eyeW = a.eyeH = a.iconSize;
  }
  return a;
}
