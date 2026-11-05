// xrb-host: the XR Build host. Shows a web app on a display (3D or a window) with hand input, each
// provided by a plugin or a built-in provider (see providers.h, plugins.h).
//
//   xrb-host.exe --url=<url>             show a page
//   xrb-host.exe --app-dir=<folder>      show <folder>/index.html (served as https://app.local/)
//   xrb-host.exe --title=<app name>      set the native window title (default: XR Build)
//   xrb-host.exe --display=<name>        desktop (built in) or a display plugin; --input=, --platform= likewise
//   xrb-host.exe --plugin.<name>.<key>=<value>   configuration for one provider
//   xrb-host.exe --view=2d               start a stereo display in 2D (mono page); the view can be
//                                        switched between 2D and 3D while the app runs (channel kSetView)
//   xrb-host.exe --camera-projection=orthographic  start the managed app camera in Orthographic mode
//   xrb-host.exe --list-plugins          print the available providers ("@plugins {json}") and exit
//
// Frame: Chromium renders the page (2 x eye width side by side for a stereo display) into a shared
// D3D11 texture -> Presenter copies it and draws it on the display's monitor -> on a 3D display its
// runtime turns that window into the 3D image.
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>

#include <atomic>
#include <algorithm>
#include <cstring>
#include <stdexcept>
#include <memory>
#include <unordered_map>
#include <vector>

#include "app_icon.h"
#include "app_scheme.h"
#include "args.h"
#include "hand_recording.h"
#include "host_channel.h"
#include "host_config.h"
#include "cef_client.h"
#include "log.h"
#include "plugins.h"
#include "presenter.h"
#include "providers.h"
#include "status_report.h"

#include <mutex>

// Hybrid-graphics laptops: run on the discrete GPU. Chromium's GPU process is this
// same exe, so these exports also steer it (without them it may render on the iGPU).
extern "C" {
__declspec(dllexport) DWORD NvOptimusEnablement = 1;
__declspec(dllexport) int AmdPowerXpressRequestHighPerformance = 1;
}

// Last-chance crash report: which module faulted and where, so field logs are useful.
static LONG WINAPI logCrash(EXCEPTION_POINTERS* ep) {
  void* at = ep->ExceptionRecord->ExceptionAddress;
  HMODULE mod = nullptr;
  wchar_t name[MAX_PATH] = L"?";
  if (GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)at, &mod))
    GetModuleFileNameW(mod, name, MAX_PATH);
  LOGI("[host] CRASH 0x%08lX at %s+0x%llX (thread %lu)", ep->ExceptionRecord->ExceptionCode, narrow(name).c_str(),
       (unsigned long long)((char*)at - (char*)mod), GetCurrentThreadId());
  logx::close();
  return EXCEPTION_CONTINUE_SEARCH;
}

static std::wstring exeDir() {
  wchar_t p[MAX_PATH];
  GetModuleFileNameW(nullptr, p, MAX_PATH);
  std::wstring s(p);
  return s.substr(0, s.find_last_of(L"\\/"));
}

static std::vector<std::wstring> pluginRoots(const std::wstring& dir, const HostArgs& args) {
  std::vector<std::wstring> roots{dir + L"\\plugins"};
  roots.insert(roots.end(), args.pluginDirs.begin(), args.pluginDirs.end());
  return roots;
}

// Providers compiled into the host, listed next to the plugins.
static std::vector<plugins::Builtin> builtinProviders() { return providers::builtins(); }

static std::string fileUrl(const std::wstring& path) {
  std::string p = narrow(path);
  for (char& c : p)
    if (c == '\\') c = '/';
  return "file:///" + p;
}

int main() {
  int argc = 0;
  wchar_t** argv = CommandLineToArgvW(GetCommandLineW(), &argc);

  // Chromium's sub-processes are this exe: they must branch off before anything else.
  std::wstring gpuFlag;
  bool gpu = !(rawFlag(argc, argv, L"gpu", &gpuFlag) && gpuFlag == L"0");
  CefMainArgs cefArgs(GetModuleHandleW(nullptr));
  CefRefPtr<HostApp> cefApp(new HostApp(gpu));
  if (int code = CefExecuteProcess(cefArgs, cefApp, nullptr); code >= 0) return code;
  // Only the browser process gets here: plugins are never loaded into CEF's sub-processes.

  // --list-plugins: a query for tools (the control panel); it runs beside a running host.
  if (const HostArgs early = parseArgs(argc, argv); early.listPlugins) {
    plugins::Catalog catalog;
    catalog.scan(pluginRoots(exeDir(), early));
    printf("@plugins %s\n", plugins::catalogJson(catalog, builtinProviders()).c_str());  // tagged like @channel/@status
    fflush(stdout);
    LocalFree(argv);
    return 0;
  }

  // GUI-subsystem exe that never joins a console: a console's Ctrl+C or close kills every
  // process attached to it at once, which skipped the display's exit when a station agent's
  // console was stopped and left a 3D display in 3D. Logs go to the log file.

  // Chromium's helper processes are our children: put the whole tree in a job that
  // the OS closes when this process dies, so a crash never leaves helpers behind.
  if (HANDLE job = CreateJobObjectW(nullptr, nullptr)) {
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION li{};
    li.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(job, JobObjectExtendedLimitInformation, &li, sizeof(li));
    AssignProcessToJobObject(job, GetCurrentProcess());  // handle intentionally kept open until exit
  }

  // One host per machine: a second copy would fight over the display, the cameras and
  // Chromium's cache, so it leaves immediately without touching any of them.
  HANDLE instance = CreateMutexW(nullptr, TRUE, L"Local\\XRBuildHost");
  if (instance && GetLastError() == ERROR_ALREADY_EXISTS) {
    fprintf(stderr, "xrb-host is already running\n");
    TerminateProcess(GetCurrentProcess(), 3);
  }

  const std::wstring dataDir = logx::dataDir();
  logx::open(dataDir + L"\\logs");
  SetUnhandledExceptionFilter(logCrash);
  const HostArgs args = parseArgs(argc, argv);
  const std::wstring dir = exeDir();
  LOGI("[host] xrb-host start, exe dir %s", narrow(dir).c_str());
  plugins::Catalog catalog;
  catalog.scan(pluginRoots(dir, args));

  std::atomic<bool> quit{false};
  int exitCode = 0;
  const bool iconRender = !args.renderIcon.empty();
  // Declared before the providers: their callbacks publish here, and they are destroyed after them.
  channel::Server chan;
  HandRecorder recorder;
  std::atomic<int> handState{-1};  // XRB_INPUT_* of the input provider, -1 = no status yet
  std::atomic<int> handCount{0};
  std::atomic<float> handsHz{0};
  std::string platformName;  // the platform provider ("" standalone), set before it starts
  // kPlatform: the station's configure parameters (a JSON object) for the page, newest kept for late pages.
  auto publishPlatform = [&chan, &platformName](const std::string& params) {
    nlohmann::json p = nlohmann::json::parse(params.empty() ? "{}" : params, nullptr, false);
    const std::string m = nlohmann::json{{"name", platformName}, {"params", p.is_object() ? p : nlohmann::json::object()}}
                            .dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);  // never throws (no exceptions here)
    chan.publish(channel::kPlatform, m.data(), m.size());
  };
  auto publishStatus = [&chan, &recorder](int s, float hz, const std::string& text) {
    const std::vector<uint8_t> p = channel::encodeStatus(s, hz, text);
    const std::vector<uint8_t> msg = chan.publish(channel::kStatus, p.data(), p.size());
    recorder.write(msg.data(), msg.size());
  };
  // What the host does with provider callbacks (any thread).
  providers::Sink sink;
  sink.log = [](const std::string& source, int level, const std::string& text) {
    // "[<plugin> debug]": the panel hides a plugin's debug output unless asked for.
    LOGI("[%s%s] %s", source.c_str(), level >= XRB_LOG_ERROR ? " error" : level == XRB_LOG_WARN ? " warn" : level <= XRB_LOG_DEBUG ? " debug" : "",
         text.c_str());
  };
  sink.hands = [&](const XrbHandFrame& f) {
    handCount = (int)f.count;
    handsHz = f.tracking_hz;
    const std::vector<uint8_t> payload = channel::encodeHands(f);
    const std::vector<uint8_t> msg = chan.publish(channel::kHands, payload.data(), payload.size());
    recorder.write(msg.data(), msg.size());
  };
  sink.inputStatus = [&](int s, float hz, const std::string& text) {
    handState = s;
    handsHz = hz;
    LOGI("[hands] %s", text.c_str());
    publishStatus(s, hz, text);
  };
  std::atomic<bool> cameraStream{args.cameraView && args.cameraStream};
  sink.image = [&](const XrbImage& image) {
    if (!cameraStream.load()) return;
    std::vector<uint8_t> p;
    channel::MessageType type;
    if (channel::encodeImage(image, &p, &type)) chan.publish(type, p.data(), p.size());
  };
  sink.lifecycle = [&](int event, const std::string& json) {
    switch (event) {
      case XRB_LIFECYCLE_CONFIGURE:
        LOGI("[platform] configure %s", json.c_str());
        publishPlatform(json);
        break;
      case XRB_LIFECYCLE_PLAY: LOGI("[platform] play"); break;
      default:  // stop, exit, lost: the clean exit
        LOGI("[platform] %s: stopping", event == XRB_LIFECYCLE_STOP ? "stop" : event == XRB_LIFECYCLE_EXIT ? "exit" : "station lost");
        quit = true;
    }
  };
  providers::Display display;
  std::vector<std::unique_ptr<providers::Input>> inputs;
  std::vector<std::unique_ptr<providers::Sink>> inputSinks;
  std::mutex inputMutex;
  std::vector<std::unordered_map<int32_t, int32_t>> inputIds;
  std::vector<int> inputCounts, inputStates;
  std::vector<float> inputRates;
  int32_t nextHandId = 0;
  bool inputsStopped = false;
  providers::Platform platform;
  try {
    // ---- which provider runs each role, and their configuration
    nlohmann::json fileCfg = nlohmann::json::object();
    {
      const std::wstring cfgPath = !args.configFile.empty() ? args.configFile : dir + L"\\xrb-app.json";
      std::string err;
      if (hostcfg::loadFile(cfgPath, &fileCfg, &err)) LOGI("[host] config %s", narrow(cfgPath).c_str());
      else if (!err.empty()) throw std::runtime_error("config " + narrow(cfgPath) + ": " + err);
      else if (!args.configFile.empty()) throw std::runtime_error("config " + narrow(cfgPath) + " not found");
    }
    hostcfg::Selection sel = hostcfg::selectRoles(fileCfg, args);
    if (iconRender) sel = {"none", "desktop", "", ""};  // an icon render is a build step: no device, no station
    std::string inputNames;
    for (const auto& name : sel.inputs) inputNames += (inputNames.empty() ? "" : ", ") + name;
    LOGI("[host] display %s, inputs %s, platform %s", sel.display.c_str(), inputNames.empty() ? "none" : inputNames.c_str(), sel.platform.empty() ? "none" : sel.platform.c_str());
    auto configFor = [&](const std::string& name) {
      nlohmann::json c = hostcfg::pluginConfig(fileCfg, name, args);
      std::wstring pluginDir = dir;
      for (const plugins::Plugin& p : catalog.all())
        if (name == p.info.name) pluginDir = p.dir;
      c["xrb"] = {{"exeDir", narrow(dir)}, {"dataDir", narrow(dataDir)}, {"pluginDir", narrow(pluginDir)},
                  {"debugImages", args.cameraView}, {"view", args.view}};
      return c.dump(-1, ' ', false, nlohmann::json::error_handler_t::replace);
    };

    // ---- display
    // stereo: the page is side by side and shown in 3D; on a switchable display it can change while
    // the app runs (the page or the control panel asks over the channel).
    XrbDisplayInfo dinfo{};
    std::string err;
    if (!providers::openDisplay(sel.display, sel.displayFallback, catalog, configFor, &sink, &display, &dinfo, &err))
      throw std::runtime_error(err);
    const bool switchable = dinfo.can_switch != 0;
    bool stereo = dinfo.can_stereo && dinfo.layout == XRB_LAYOUT_SBS && args.view != "2d";
    bool orthographic = args.cameraProjection == "orthographic";
    RECT monitor{0, 0, args.windowW, args.windowH};
    if (dinfo.has_monitor) monitor = {dinfo.monitor_left, dinfo.monitor_top, dinfo.monitor_right, dinfo.monitor_bottom};
    // The display provider chooses whether its window is fullscreen, including in 2D.
    const bool fullscreen = dinfo.fullscreen != 0;
    if (!fullscreen) LOGI("[host] display %s: windowed 2D", display.name.c_str());

    Presenter presenter;
    presenter.onQuit = [&] { quit = true; };
    // The window exists before the display's output starts (what stereo display runtimes expect).
    bool sceneCursor = true;
    presenter.hideCursor = !sel.mouse || sceneCursor;
    presenter.leftHalf = dinfo.mono_left_half && !stereo;  // see Presenter::leftHalf
    presenter.hidden = iconRender;
    presenter.createWindow(monitor, fullscreen, args.title.c_str(), display.name == "desktop",
                           display.name == "desktop" ? args.windowW : 0,
                           display.name == "desktop" ? args.windowH : 0);
    // Same icon as the package thumbnail: a package ships it as app-icon.png next to the exe.
    LOGI("[host] window icon %s",
         applyWindowIcon(presenter.hwnd(), args.icon.empty() ? dir + L"\\app-icon.png" : args.icon).c_str());
    if (display.api->start(display.self, stereo ? 1 : 0, &dinfo) != 0)
      throw std::runtime_error("display " + display.name + ": " + display.error());

    int eyeW = dinfo.eye_width > 0 ? dinfo.eye_width : presenter.clientW();
    int eyeH = dinfo.eye_height > 0 ? dinfo.eye_height : presenter.clientH();
    if (args.eyeW > 0) eyeW = args.eyeW, eyeH = args.eyeH;
    int pageW = stereo ? eyeW * 2 : eyeW;
    const int pageH = eyeH;
    presenter.createDevice(pageW, pageH);

    // ---- page
    std::wstring appDir;
    // Installed from a package, a station agent starts the exe without arguments: the app
    // then lives in the "app" folder next to it.
    std::wstring requestedAppDir = args.appDir;
    if (requestedAppDir.empty() && args.url.empty() && GetFileAttributesW((dir + L"\\app\\index.html").c_str()) != INVALID_FILE_ATTRIBUTES)
      requestedAppDir = dir + L"\\app";
    if (!requestedAppDir.empty()) {
      wchar_t full[MAX_PATH * 2];
      DWORD n = GetFullPathNameW(requestedAppDir.c_str(), MAX_PATH * 2, full, nullptr);
      appDir = (n > 0 && n < MAX_PATH * 2) ? full : requestedAppDir;
      while (!appDir.empty() && (appDir.back() == L'\\' || appDir.back() == L'/')) appDir.pop_back();
      if (GetFileAttributesW((appDir + L"\\index.html").c_str()) == INVALID_FILE_ATTRIBUTES)
        throw std::runtime_error("--app-dir has no index.html: " + narrow(appDir));
    }
    std::string url = args.url;
    if (url.empty() && !appDir.empty()) url = std::string(kAppOrigin) + "/index.html";
    if (url.empty()) url = fileUrl(dir + L"\\testpages\\sbs.html");
    if (iconRender) {
      // The app sees ?xrb-icon=<size> (SDK iconRender()) and shows only its icon subject.
      const size_t hash = url.find('#');
      const std::string q = std::string(url.find('?') < hash ? "&" : "?") + "xrb-icon=" + std::to_string(args.iconSize);
      url.insert(hash == std::string::npos ? url.size() : hash, q);
    }
    LOGI("[host] page %s, view %dx%d (%s)", url.c_str(), pageW, pageH, stereo ? "side by side" : "mono");

    CefSettings cs;
    cs.no_sandbox = true;
    cs.windowless_rendering_enabled = true;
    cs.multi_threaded_message_loop = false;
    // Icon renders keep the page's transparency; the panel always gets an opaque black page.
    const cef_color_t background = iconRender ? CefColorSetARGB(0, 0, 0, 0) : CefColorSetARGB(255, 0, 0, 0);
    cs.background_color = background;
    CefString(&cs.root_cache_path) = dataDir + L"\\cef_cache";
    CefString(&cs.cache_path) = dataDir + L"\\cef_cache";
    CefString(&cs.log_file) = dataDir + L"\\logs\\cef.log";
    CefString(&cs.locale) = "en-US";
    cs.log_severity = LOGSEVERITY_WARNING;  // Chromium's own reasons end up in logs\cef.log
    if (!CefInitialize(cefArgs, cs, cefApp, nullptr)) {
      // CefGetExitCode says why (cef_resultcode_t): 21 profile in use, 24 another process owns
      // the cache, 7 missing data files, 31 invalid sandbox state, ...
      const int code = CefGetExitCode();
      const char* why = code == 21 ? "cache folder in use by another process (profile in use)"
                      : code == 24 ? "another browser process owns the cache folder (process notified)"
                      : code == 7  ? "CEF data files missing next to the exe"
                      : code == 31 ? "invalid sandbox state"
                                   : "see cef_resultcode_t";
      throw std::runtime_error("CefInitialize failed: code " + std::to_string(code) + " (" + why + "), cache " +
                               narrow(dataDir) + "\\cef_cache, elevated " + (IsUserAnAdmin() ? "yes" : "no"));
    }
    if (!appDir.empty()) registerAppScheme(appDir);

    HICON pageIconBig = nullptr, pageIconSmall = nullptr;
    CefRefPtr<HostClient> client(new HostClient(pageW, pageH));
    client->fullscreen = fullscreen;
    client->onShellClose = [&] { quit = true; };
    client->onCursorStyle = [&](const std::string& style) {
      sceneCursor = style != "system";
      presenter.hideCursor = !sel.mouse || sceneCursor;
    };
    client->onSharedTexture = [&](HANDLE h) { presenter.copySharedTexture(h); };
    client->onSoftwareFrame = [&](const void* px, int w, int h) { presenter.copySoftwareFrame(px, w, h); };
    std::atomic<ULONGLONG> iconReadyAt{0};
    client->onConsole = [&](const std::string& m) {
      LOGI("[page] %s", m.c_str());
      if (iconRender && iconReadyAt == 0 && m.find("[xrb-icon] ready") != std::string::npos) iconReadyAt = GetTickCount64();
    };
    client->onLoadError = [](const std::string& m) { LOGI("[host] page load %s", m.c_str()); };
    client->onTitle = [&](const std::wstring& title) { if (!title.empty()) SetWindowTextW(presenter.hwnd(), title.c_str()); };
    client->onFavicon = [&](CefRefPtr<CefImage> image) {
      int width = 0, height = 0;
      CefRefPtr<CefBinaryValue> bitmap = image->GetAsBitmap(1.0f, CEF_COLOR_TYPE_BGRA_8888,
                                                            CEF_ALPHA_TYPE_PREMULTIPLIED, width, height);
      if (!bitmap || width <= 0 || height <= 0) return;
      std::vector<unsigned char> pixels(bitmap->GetSize());
      if (bitmap->GetData(pixels.data(), pixels.size(), 0) != pixels.size()) return;
      if (applyWindowIconPixels(presenter.hwnd(), pixels.data(), width, height, pageIconBig, pageIconSmall))
        LOGI("[host] window icon page favicon");
    };
    // Mouse on the window -> page pixels across the whole page, so that
    // (clientX - rect.left) / rect.width is the position on the panel for any canvas,
    // mono or side by side. The SDK's hand pointer follows the same rule.
    presenter.onMouse = [&](int x, int y, bool down, bool up) {
      if (!sel.mouse) return;
      int px = presenter.clientW() > 0 ? x * pageW / presenter.clientW() : x;
      int py = presenter.clientH() > 0 ? y * pageH / presenter.clientH() : y;
      client->mouse(px, py, down, up);
    };
    presenter.onKey = [&](UINT m, WPARAM w, LPARAM l) {
      // Escape is a shell action even when app keyboard input is disabled.
      if (sel.keyboard || w == VK_ESCAPE) client->key(m, w, l);
    };
    CefWindowInfo wi;
    wi.SetAsWindowless(presenter.hwnd());
    wi.shared_texture_enabled = gpu;
    CefBrowserSettings bs;
    bs.windowless_frame_rate = 60;
    bs.background_color = background;
    // ---- host channel + window.__XRB_HOST__
    // The page's performance report (heartbeat), written on a channel thread.
    std::mutex pageMutex;
    PageReport pageReport;
    std::atomic<double> lastPageFrameMs{0};
    // 2D/3D and managed-camera projection changes asked by channel clients: -1 none.
    std::atomic<int> viewRequest{-1};
    std::atomic<int> projectionRequest{-1};
    chan.onMessage = [&](const uint8_t* d, size_t n) {
      if (bool want = false; decodeSetView(d, n, &want)) {
        viewRequest = want ? 1 : 0;
        return;
      }
      if (bool want = false; decodeSetCameras(d, n, &want)) {
        cameraStream = args.cameraView && want;
        return;
      }
      if (bool want = false; decodeSetProjection(d, n, &want)) {
        projectionRequest = want ? 1 : 0;
        return;
      }
      PageReport r;
      if (!decodePageFrame(d, n, &r)) return;
      std::lock_guard<std::mutex> g(pageMutex);
      pageReport = r;
      lastPageFrameMs = channel::hostTimeMs();
    };
    if (!chan.start()) throw std::runtime_error("host channel: cannot open a loopback socket");
    // Tools (the control panel) read the channel address and the status lines from stdout.
    const bool statusOut = args.status == "stdout";
    if (statusOut) {
      printf("@channel %s\n", chan.url().c_str());
      fflush(stdout);
    }
    // The current view, kept as the newest kView for pages that connect later (reloads).
    auto publishView = [&] {
      struct {
        uint8_t stereo, switchable;
        uint16_t eyeW, eyeH;
      } v{(uint8_t)(stereo ? 1 : 0), (uint8_t)(switchable ? 1 : 0), (uint16_t)eyeW, (uint16_t)eyeH};
      chan.publish(channel::kView, &v, sizeof(v));
    };
    auto publishProjection = [&] {
      const uint8_t value = orthographic ? 1 : 0;
      chan.publish(channel::kProjection, &value, sizeof(value));
    };
    publishView();
    publishProjection();
    platformName = sel.platform == "none" ? "" : sel.platform;
    publishPlatform("{}");
    CefRefPtr<CefDictionaryValue> info = CefDictionaryValue::Create();
    info->SetInt("version", 1);
    info->SetBool("stereo", stereo);
    info->SetBool("fullscreen", fullscreen);
    info->SetBool("mouseEnabled", sel.mouse);
    info->SetBool("switchable", switchable);  // the view can change at run time (see kView on the channel)
    CefRefPtr<CefDictionaryValue> panel = CefDictionaryValue::Create();
    panel->SetDouble("widthM", dinfo.width_m);
    panel->SetDouble("heightM", dinfo.height_m);
    panel->SetDouble("tiltRad", dinfo.tilt_rad);
    panel->SetInt("pixelsW", eyeW);
    panel->SetInt("pixelsH", eyeH);
    info->SetDictionary("display", panel);
    CefRefPtr<CefDictionaryValue> eye = CefDictionaryValue::Create();
    eye->SetInt("width", eyeW);
    eye->SetInt("height", eyeH);
    info->SetDictionary("eye", eye);
    CefRefPtr<CefDictionaryValue> chanInfo = CefDictionaryValue::Create();
    chanInfo->SetString("url", chan.url());
    info->SetDictionary("channel", chanInfo);
    // The platform's name; its parameters arrive on the channel (kPlatform), as the station sends them.
    CefRefPtr<CefDictionaryValue> platformInfo = CefDictionaryValue::Create();
    platformInfo->SetString("name", platformName);
    platformInfo->SetDictionary("params", CefDictionaryValue::Create());
    info->SetDictionary("platform", platformInfo);
    CefBrowserHost::CreateBrowser(wi, client, url, bs, info, nullptr);

    // ---- input (own threads; results go straight to the channel)
    if (!args.recordHands.empty()) {
      if (recorder.open(args.recordHands)) LOGI("[hands] recording to %s", narrow(args.recordHands).c_str());
      else LOGI("[hands] cannot write %s", narrow(args.recordHands).c_str());
    }
    inputIds.resize(sel.inputs.size());
    inputCounts.assign(sel.inputs.size(), 0);
    inputStates.assign(sel.inputs.size(), -1);
    inputRates.assign(sel.inputs.size(), 0);
    if (sel.inputs.empty()) LOGI("[hands] off");
    for (size_t i = 0; i < sel.inputs.size(); ++i) {
      const std::string name = sel.inputs[i];
      auto source = std::make_unique<providers::Sink>(sink);
      source->hands = [&, i](const XrbHandFrame& frame) {
        // The SDK keeps hands from different messages until they time out. Give each provider's
        // local hand IDs a stable, process-wide ID so two plugins can both track hand 0.
        std::vector<XrbHand> hands;
        if (frame.count && frame.hands) hands.assign(frame.hands, frame.hands + frame.count);
        {
          std::lock_guard<std::mutex> lock(inputMutex);
          inputCounts[i] = (int)hands.size();
          int total = 0;
          for (int count : inputCounts) total += count;
          handCount = total;
          inputRates[i] = frame.tracking_hz;
          handsHz = *std::max_element(inputRates.begin(), inputRates.end());
          for (auto& hand : hands) {
            if (hand.id < 0) continue;
            auto [it, inserted] = inputIds[i].try_emplace(hand.id, nextHandId);
            if (inserted) ++nextHandId;
            hand.id = it->second;
          }
        }
        XrbHandFrame combined = frame;
        combined.hands = hands.data();
        combined.count = (uint32_t)hands.size();
        sink.hands(combined);
      };
      source->inputStatus = [&, i, name](int state, float hz, const std::string& text) {
        int overall = XRB_INPUT_FAILED;
        {
          std::lock_guard<std::mutex> lock(inputMutex);
          inputStates[i] = state;
          inputRates[i] = hz;
          if (state != XRB_INPUT_RUNNING && state != XRB_INPUT_STARTING) inputCounts[i] = 0;
          int total = 0;
          for (int count : inputCounts) total += count;
          handCount = total;
          handsHz = *std::max_element(inputRates.begin(), inputRates.end());
          // Running input remains usable if another provider is missing or fails.
          for (int s : inputStates) {
            if (s == XRB_INPUT_RUNNING) { overall = XRB_INPUT_RUNNING; break; }
            if (s == XRB_INPUT_STARTING || s < 0) overall = XRB_INPUT_STARTING;
            else if (overall != XRB_INPUT_STARTING && s != XRB_INPUT_FAILED) overall = s;
          }
          handState = overall;
        }
        LOGI("[hands] %s: %s", name.c_str(), text.c_str());
        publishStatus(overall, handsHz.load(), name + ": " + text);
      };
      auto provider = std::make_unique<providers::Input>();
      if (!providers::createInput(name, catalog, configFor(name), source.get(), provider.get(), &err)) {
        source->inputStatus(XRB_INPUT_FAILED, 0.0f, err);
        continue;
      }
      inputSinks.push_back(std::move(source));
      inputs.push_back(std::move(provider));
      providers::startInput(*inputs.back(), *inputSinks.back());
    }

    // ---- platform: the station runtime announces the app; stop/exit from the station ends it
    // cleanly (back to 2D). Without a station (local runs) the app simply runs standalone.
    if (!sel.platform.empty()) {
      if (!providers::createPlatform(sel.platform, catalog, configFor(sel.platform), &sink, &platform, &err))
        LOGI("[platform] %s - running standalone", err.c_str());
      else if (platform.api->start(platform.self) != 0)
        LOGI("[platform] %s: no station%s - running standalone", platform.name.c_str(),
             platform.error().empty() ? "" : (" (" + platform.error() + ")").c_str());
    }

    // ---- loop
    XrbEyes eyes{sizeof(XrbEyes)};
    // What the page gets in 2D on a stereo display: a viewer 0.6 m in front of the panel centre.
    const struct {
      float left[3], right[3];
    } nominalEyes{{-0.0315f, 0.0f, 0.6f}, {0.0315f, 0.0f, 0.6f}};
    long long frame = 0;
    bool firstFrameLogged = false;
    const ULONGLONG startMs = GetTickCount64();
    ULONGLONG nextStatusMs = startMs + 1000;
    // View switch in progress: black is presented until the page painted at its new size and the
    // display had this long to change its mode (3D<->2D), as the clean exit gives it time too.
    constexpr ULONGLONG kViewSwitchBlackMs = 600;
    bool viewSwitching = false;
    ULONGLONG viewBlackUntilMs = 0;
    while (!quit) {
      if (args.exitAfter > 0 && GetTickCount64() - startMs > args.exitAfter * 1000) quit = true;
      if (!args.capture.empty() && GetTickCount64() - startMs > args.captureAfter * 1000) {
        LOGI("[host] capture %s: %s", narrow(args.capture).c_str(), presenter.savePagePng(args.capture) ? "saved" : "FAILED");
        const_cast<HostArgs&>(args).capture.clear();
      }
      presenter.pumpMessages();
      CefDoMessageLoopWork();
      if (client->closed()) break;
      if (iconRender) {
        // A few frames after iconReady() the icon frame is surely in the page texture.
        if (iconReadyAt != 0 && GetTickCount64() - iconReadyAt > 300 && presenter.hasFrame()) {
          if (!presenter.savePagePng(args.renderIcon, true)) throw std::runtime_error("cannot write icon " + narrow(args.renderIcon));
          LOGI("[host] icon %dx%d saved to %s", args.iconSize, args.iconSize, narrow(args.renderIcon).c_str());
          quit = true;
        } else if (GetTickCount64() - startMs > 30000) {
          throw std::runtime_error("icon render: the page did not call iconReady() within 30 s (does the app support ?xrb-icon?)");
        }
      }
      if (const int want = projectionRequest.exchange(-1); want >= 0 && (want == 1) != orthographic) {
        orthographic = want == 1;
        LOGI("[host] camera projection -> %s", orthographic ? "Orthographic" : "Perspective");
        publishProjection();
      }
      if (switchable) {
        if (const int want = viewRequest.exchange(-1); want >= 0 && (want == 1) != stereo) {
          // The display keeps running, only its 3D output stops or resumes. The page switches between side by side and mono at the same time (the SDK follows kView).
          stereo = want == 1;
          pageW = stereo ? eyeW * 2 : eyeW;
          LOGI("[host] view -> %s: page %dx%d", stereo ? "3D (side by side)" : "2D (mono)", pageW, pageH);
          display.api->set_stereo(display.self, stereo ? 1 : 0);
          client->resize(pageW, pageH);
          presenter.setPageSize(pageW, pageH);
          presenter.hideCursor = !sel.mouse || sceneCursor;
          presenter.leftHalf = dinfo.mono_left_half && !stereo;
          publishView();
          viewSwitching = true;
          viewBlackUntilMs = GetTickCount64() + kViewSwitchBlackMs;
        }
        if (viewSwitching && presenter.hasPage() && GetTickCount64() >= viewBlackUntilMs) {
          viewSwitching = false;
          LOGI("[host] view switch done: %s", stereo ? "3D" : "2D");
        }
      }
      display.api->poll_eyes(display.self, &eyes);
      {
        // Eye poses go out every displayed frame. A stereo display in its 2D view sends a fixed, stale pose.
        struct {
          float left[3], right[3];
          uint8_t stale, pad[3];
        } msg{};
        const bool live = stereo || !dinfo.can_stereo;
        memcpy(msg.left, live ? eyes.left : nominalEyes.left, sizeof(msg.left));
        memcpy(msg.right, live ? eyes.right : nominalEyes.right, sizeof(msg.right));
        msg.stale = live ? (uint8_t)(eyes.stale ? 1 : 0) : 1;
        chan.publish(channel::kEyes, &msg, sizeof(msg));
      }
      if (frame % 600 == 300 && lastPageFrameMs > 0) {
        double fps;
        {
          std::lock_guard<std::mutex> g(pageMutex);
          fps = pageReport.fps;
        }
        LOGI("[host] page %.1f fps, hands %.0f Hz, %d channel client(s)", fps, handsHz.load(), chan.clientCount());
      }
      if (statusOut && GetTickCount64() >= nextStatusMs) {
        nextStatusMs += 1000;
        static const char* kStates[] = {"starting", "running", "needs-setup", "device-missing", "failed"};
        HostStatus st;
        st.uptimeS = (GetTickCount64() - startMs) / 1000.0;
        st.session = switchable;
        st.stereo = stereo;
        st.pageSeen = lastPageFrameMs > 0;
        {
          std::lock_guard<std::mutex> g(pageMutex);
          st.page = pageReport;
        }
        st.pageAgeMs = st.pageSeen ? channel::hostTimeMs() - lastPageFrameMs : 0;
        const int hs = handState;
        const bool handsOn = !sel.inputs.empty();
        st.handState = hs < 0 ? (handsOn ? "starting" : "off") : hs < 5 ? kStates[hs] : "failed";
        st.handsHz = handsOn ? handsHz.load() : 0;
        st.handCount = handCount;
        st.clients = chan.clientCount();
        printf("@status %s\n", statusJson(st).c_str());
        fflush(stdout);
      }
      if (presenter.hasFrame() && !firstFrameLogged) {
        firstFrameLogged = true;
        LOGI("[host] first page frame (%s)", presenter.sharedFrames() ? "GPU shared texture" : "software");
      }
      if (viewSwitching) presenter.presentBlack();
      else presenter.present();
      frame++;
    }

    LOGI("[host] shutting down after %lld frames", frame);
    // The display's own exit, with the window still up (e.g. stereo off -> black frames -> end of
    // its session -> time for the panel to switch back to 2D).
    for (uint32_t i = 0, n = display.api->begin_exit(display.self); i < n; i++) presenter.presentBlack();
    if (const uint32_t blackMs = display.api->end(display.self); blackMs > 0) {
      const ULONGLONG until = GetTickCount64() + blackMs;
      while (GetTickCount64() < until) {
        presenter.pumpMessages();
        CefDoMessageLoopWork();
        presenter.presentBlack();
      }
    }
    for (auto& input : inputs) if (*input) input->api->stop(input->self);  // releases every input device
    inputsStopped = true;
    if (platform) platform.api->stop(platform.self);
    recorder.close();
    chan.stop();
    client->close();
    for (int i = 0; i < 300 && !client->closed(); i++) {
      CefDoMessageLoopWork();
      Sleep(10);
    }
    // CefShutdown still pumps window messages: a mouse move must not reach the released client.
    presenter.onMouse = nullptr;
    presenter.onKey = nullptr;
    client = nullptr;
    cefApp = nullptr;
    CefShutdown();
  } catch (const std::exception& e) {
    LOGI("[host] ERROR %s", e.what());
    exitCode = 1;
  }
  // Providers end here on every path (an error included): devices released, the display's session ended.
  if (!inputsStopped) for (auto& input : inputs) if (*input) input->api->stop(input->self);
  inputs.clear();
  inputSinks.clear();
  platform.reset();
  display.reset();
  LOGI("[host] exit %d", exitCode);
  logx::close();
  LocalFree(argv);
  // Everything that matters is released above (display session ended, devices stopped,
  // CEF shut down). Skip DLL unload at process exit: GPU runtime teardown inside a
  // plugin (a GPU runtime, for one) can block the process from ending, which would keep the station waiting.
  TerminateProcess(GetCurrentProcess(), (UINT)exitCode);
  return exitCode;
}
