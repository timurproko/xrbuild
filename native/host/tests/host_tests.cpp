// Unit tests for the host's pure functions. Run: build\Release\host-tests.exe
#include <cmath>
#include <cstring>
#include <cstdio>
#include <string>

#include "app_icon.h"
#include "app_scheme.h"
#include "args.h"
#include "host_channel.h"
#include "hand_recording.h"
#include "host_config.h"
#include "log.h"
#include "plugins.h"
#include "providers.h"
#include "status_report.h"
#include "xrb_plugin.h"

#include <cstddef>
#include <vector>

extern "C" size_t xrb_abi_check_c(int which);  // native/plugin-sdk/tests/abi_check.c, compiled as C

static int g_failures = 0;
#define EXPECT(cond)                                                     \
  do {                                                                   \
    if (!(cond)) {                                                       \
      std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);        \
      g_failures++;                                                      \
    }                                                                    \
  } while (0)

static bool approx(float a, float b, float eps = 1e-4f) { return std::fabs(a - b) < eps; }

static void testArgs() {
  wchar_t exe[] = L"xrb-host.exe";
  wchar_t perspective[] = L"--camera-projection=perspective";
  wchar_t orthographic[] = L"--camera-projection=orthographic";
  wchar_t invalid[] = L"--camera-projection=parallel";
  wchar_t* perspectiveArgs[] = {exe, perspective};
  wchar_t* orthographicArgs[] = {exe, orthographic};
  wchar_t* invalidArgs[] = {exe, invalid};
  EXPECT(parseArgs(2, perspectiveArgs).cameraProjection == "perspective");
  EXPECT(parseArgs(2, orthographicArgs).cameraProjection == "orthographic");
  EXPECT(parseArgs(2, invalidArgs).cameraProjection == "perspective");
}

static void testFaviconPixels() {
  const unsigned char bgra[] = {
      0x00, 0x00, 0xff, 0xff, 0x00, 0xff, 0x00, 0xff,
      0xff, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff,
  };
  HICON icon = loadIconPixels(bgra, 2, 2, 16);
  EXPECT(icon != nullptr);
  if (icon) DestroyIcon(icon);
}

static void testResolveAppPath() {
  const std::wstring root = L"C:\\app";
  std::wstring f;
  EXPECT(resolveAppPath(root, "/", &f) && f == L"C:\\app\\index.html");
  EXPECT(resolveAppPath(root, "/assets/main.js?v=3#x", &f) && f == L"C:\\app\\assets\\main.js");
  EXPECT(resolveAppPath(root, "/a/./b//c.png", &f) && f == L"C:\\app\\a\\b\\c.png");
  EXPECT(resolveAppPath(root, "/models/my%20model.glb", &f) && f == L"C:\\app\\models\\my model.glb");
  EXPECT(resolveAppPath(root, "/sub/", &f) && f == L"C:\\app\\sub\\index.html");
  // Anything that could leave the app folder is refused.
  EXPECT(!resolveAppPath(root, "/../secret.txt", &f));
  EXPECT(!resolveAppPath(root, "/a/../../secret.txt", &f));
  EXPECT(!resolveAppPath(root, "/%2e%2e/secret.txt", &f));
  EXPECT(!resolveAppPath(root, "/C:/Windows/win.ini", &f));
  // An encoded backslash is either refused or stays a literal name inside the root.
  EXPECT(!resolveAppPath(root, "/a%5c..%5c..%5csecret", &f) ||
         (f.rfind(L"C:\\app\\", 0) == 0 && f.find(L"\\..") == std::wstring::npos));
}

static void testWebSocket() {
  // RFC 6455 section 1.3 example.
  EXPECT(channel::acceptKey("dGhlIHNhbXBsZSBub25jZQ==") == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  uint8_t small[3] = {1, 2, 3};
  auto f = channel::encodeBinaryFrame(small, 3);
  EXPECT(f.size() == 5 && f[0] == 0x82 && f[1] == 3 && f[4] == 3);
  std::vector<uint8_t> mid(300, 7);
  f = channel::encodeBinaryFrame(mid.data(), mid.size());
  EXPECT(f.size() == 304 && f[1] == 126 && f[2] == 1 && f[3] == 44);
  std::vector<uint8_t> big(70000, 9);
  f = channel::encodeBinaryFrame(big.data(), big.size());
  EXPECT(f.size() == 70010 && f[1] == 127 && f[7] == 1 && f[8] == 0x11 && f[9] == 0x70);
}

// Channel v2 payloads as protocol.ts decodes them (packages/sdk/test/channel.test.ts mirrors these bytes).
static void testChannelV2() {
  EXPECT(channel::kVersion == 2);
  EXPECT(channel::kProjection == 6 && channel::kSetProjection == 103);
  XrbHand hand{};
  hand.id = 7;
  XrbHandFrame f{};
  f.size = sizeof(f);
  f.capabilities = XRB_CAP_PINCH | XRB_CAP_PALM;
  f.capture_time_ms = 1234.5;
  f.tracking_hz = 60;
  f.count = 1;
  f.hands = &hand;
  std::vector<uint8_t> h = channel::encodeHands(f);
  EXPECT(h.size() == 16 + 456 && h[12] == 1 && h[13] == (XRB_CAP_PINCH | XRB_CAP_PALM) && h[16] == 7);

  std::vector<uint8_t> st = channel::encodeStatus(XRB_INPUT_DEVICE_MISSING, 0, "no camera");
  EXPECT(st.size() == 19 && st[0] == 3 && st[8] == 9 && memcmp(&st[10], "no camera", 9) == 0);

  const uint8_t rgb[8] = {1, 2, 3, 4, 5, 6, 0xEE, 0xEE};  // one row of 2 RGB pixels, stride 8: the pad is dropped
  XrbBox box{10, 20, 30, 40, 0.9f};
  XrbImage img{};
  img.size = sizeof(img);
  img.stream = 3;
  img.label = "Camera 2 colour";
  img.format = XRB_IMAGE_RGB8;
  img.width = 2, img.height = 1, img.full_width = 4, img.full_height = 2;
  img.stride = 8;
  img.pixels = rgb;
  img.box_count = 1;
  img.boxes = &box;
  std::vector<uint8_t> p;
  channel::MessageType type{};
  EXPECT(channel::encodeImage(img, &p, &type));
  EXPECT(type == channel::kDebugImage + 3);
  EXPECT(p.size() == 12 + 15 + 20 + 6);
  EXPECT(p[0] == 3 && p[1] == XRB_IMAGE_RGB8 && p[2] == 1 && p[3] == 15);
  uint16_t dims[4];
  memcpy(dims, &p[4], 8);
  EXPECT(dims[0] == 2 && dims[1] == 1 && dims[2] == 4 && dims[3] == 2);
  EXPECT(memcmp(&p[12], "Camera 2 colour", 15) == 0);
  float bx[5];
  memcpy(bx, &p[27], 20);
  EXPECT(bx[0] == 10 && bx[3] == 40 && approx(bx[4], 0.9f));
  EXPECT(p[47] == 1 && p[52] == 6);
  img.stream = channel::kDebugStreams;  // no message type left
  EXPECT(!channel::encodeImage(img, &p, &type));
  img.stream = 0, img.format = 99;
  EXPECT(!channel::encodeImage(img, &p, &type));
}

// Page heartbeat in both forms (old: fps only), and the status line for tools.
static void testStatusReport() {
  auto frame = [](size_t payload) {
    std::vector<uint8_t> m(sizeof(channel::Header) + payload, 0);
    m[0] = channel::kPageFrame;
    m[1] = channel::kVersion;
    return m;
  };
  const size_t p = sizeof(channel::Header);
  std::vector<uint8_t> oldMsg = frame(12);
  float fps = 59.5f;
  memcpy(&oldMsg[p + 8], &fps, 4);
  PageReport r;
  EXPECT(decodePageFrame(oldMsg.data(), oldMsg.size(), &r));
  EXPECT(std::fabs(r.fps - 59.5) < 1e-6 && std::isnan(r.frameMs) && std::isnan(r.latencyMs) && r.eyeW == 0);

  std::vector<uint8_t> newMsg = frame(24);
  const float vals[] = {60.0f, 16.6f, 21.0f};
  memcpy(&newMsg[p + 8], vals, sizeof(vals));
  const uint16_t eye[] = {1920, 1080};
  memcpy(&newMsg[p + 20], eye, sizeof(eye));
  EXPECT(decodePageFrame(newMsg.data(), newMsg.size(), &r));
  EXPECT(std::fabs(r.frameMs - 16.6) < 1e-4 && std::fabs(r.latencyMs - 21.0) < 1e-6 && r.eyeW == 1920 && r.eyeH == 1080);

  std::vector<uint8_t> shortMsg = frame(8);
  EXPECT(!decodePageFrame(shortMsg.data(), shortMsg.size(), &r));
  newMsg[0] = channel::kEyes;
  EXPECT(!decodePageFrame(newMsg.data(), newMsg.size(), &r));

  // The page's 2D/3D request: one byte after the header.
  std::vector<uint8_t> setView = frame(1);
  setView[0] = channel::kSetView;
  bool want = true;
  EXPECT(decodeSetView(setView.data(), setView.size(), &want) && !want);
  setView[p] = 1;
  EXPECT(decodeSetView(setView.data(), setView.size(), &want) && want);
  EXPECT(!decodeSetView(setView.data(), p, &want));
  EXPECT(!decodeSetView(newMsg.data(), newMsg.size(), &want));
  setView[0] = channel::kSetCameras;
  EXPECT(decodeSetCameras(setView.data(), setView.size(), &want) && want);
  setView[p] = 0;
  EXPECT(decodeSetCameras(setView.data(), setView.size(), &want) && !want);
  EXPECT(!decodeSetCameras(setView.data(), p, &want));
  EXPECT(!decodeSetView(setView.data(), setView.size(), &want));
  setView[0] = channel::kSetProjection;
  setView[p] = 1;
  EXPECT(decodeSetProjection(setView.data(), setView.size(), &want) && want);
  setView[p] = 0;
  EXPECT(decodeSetProjection(setView.data(), setView.size(), &want) && !want);
  setView[p] = 2;
  EXPECT(!decodeSetProjection(setView.data(), setView.size(), &want));
  EXPECT(!decodeSetProjection(setView.data(), p, &want));

  HostStatus s;
  s.uptimeS = 3.25;
  s.handState = "off";
  s.clients = 1;
  EXPECT(statusJson(s) == "{\"uptimeS\":3.2,\"session\":false,\"stereo\":false,\"pageFps\":null,\"frameMs\":null,\"latencyMs\":null,\"eyeW\":null,\"eyeH\":null,"
                          "\"pageAgeMs\":null,\"handsHz\":0.0,\"handState\":\"off\",\"hands\":0,\"clients\":1}");
  s.pageSeen = true;
  s.page = r;  // the new-form report above
  s.page.latencyMs = std::nan("");
  s.pageAgeMs = 120;
  s.handsHz = 55.4;
  s.handState = "run\"ning";
  s.handCount = 2;
  s.session = true;
  s.stereo = true;
  EXPECT(statusJson(s) == "{\"uptimeS\":3.2,\"session\":true,\"stereo\":true,\"pageFps\":60.0,\"frameMs\":16.60,\"latencyMs\":null,\"eyeW\":1920,\"eyeH\":1080,"
                          "\"pageAgeMs\":120,\"handsHz\":55.4,\"handState\":\"run\\\"ning\",\"hands\":2,\"clients\":1}");
}

// The plugin ABI header means the same layouts to a C plugin and to the C++ host.
static void testPluginAbi() {
  const size_t cpp[] = {sizeof(XrbHand),     sizeof(XrbHandFrame), sizeof(XrbImage),     sizeof(XrbDisplayInfo), sizeof(XrbEyes),
                        sizeof(XrbHost),     sizeof(XrbInputApi),  sizeof(XrbDisplayApi), sizeof(XrbPlatformApi), sizeof(XrbPluginInfo)};
  for (int i = 0; i < (int)(sizeof(cpp) / sizeof(cpp[0])); i++) EXPECT(xrb_abi_check_c(i) == cpp[i]);
  EXPECT(XRB_INPUT_DEVICE_MISSING == 3 && XRB_INPUT_FAILED == 4);  // the channel's STATUS state numbers
}

static std::wstring testExeDir() {
  wchar_t p[MAX_PATH];
  GetModuleFileNameW(nullptr, p, MAX_PATH);
  std::wstring s(p);
  return s.substr(0, s.find_last_of(L"\\/"));
}

// Discovery against the test plugins (C, /MD) built next to host-tests.
static void testPluginCatalog() {
  plugins::Catalog c;
  c.scan({testExeDir() + L"\\test-plugins", L"C:\\does\\not\\exist"});
  const plugins::Plugin* in = c.find(XRB_ROLE_INPUT, "tinput");
  EXPECT(in != nullptr);
  EXPECT(in && std::string(in->info.version) == "0.0.1" && in->dir.find(L"test-plugins\\input") != std::wstring::npos);
  EXPECT(c.find(XRB_ROLE_DISPLAY, "tdisplay") != nullptr);
  EXPECT(c.find(XRB_ROLE_PLATFORM, "tplatform") != nullptr);
  EXPECT(c.find(XRB_ROLE_DISPLAY, "tinput") == nullptr);  // name and role must both match
  // Wrong ABI major: queried, then rejected with both versions.
  EXPECT(c.find(XRB_ROLE_INPUT, "oldabi") == nullptr);
  bool oldRejected = false;
  for (const plugins::Rejected& r : c.rejected())
    if (r.path.find(L"oldabi") != std::wstring::npos && r.reason.find("plugin ABI 99.") != std::string::npos) oldRejected = true;
  EXPECT(oldRejected);
  // Unknown name: the available ones can be listed.
  EXPECT(c.find(XRB_ROLE_INPUT, "missing") == nullptr);
  EXPECT(c.names(XRB_ROLE_INPUT) == "tinput");
  plugins::Catalog empty;
  EXPECT(empty.names(XRB_ROLE_INPUT) == "none found");
  const std::string json = plugins::catalogJson(c, {{XRB_ROLE_INPUT, "none", "no hands"}});
  EXPECT(json.rfind("{\"abi\":\"1.0\",\"plugins\":[{\"role\":\"input\",\"name\":\"none\"", 0) == 0);
  EXPECT(json.find("\"name\":\"tdisplay\"") != std::string::npos && json.find("\"builtin\":false") != std::string::npos);
  EXPECT(json.find("\"rejected\":[{\"path\":") != std::string::npos);
  std::string err;
  EXPECT(in && c.load(*in, &err) != nullptr);
}

// Roles and plugin configuration: command line over config file over defaults.
static void testHostConfig() {
  using nlohmann::json;
  EXPECT(hostcfg::inferValue("8000") == json(8000));
  EXPECT(hostcfg::inferValue("0.5") == json(0.5));
  EXPECT(hostcfg::inferValue("true") == json(true));
  EXPECT(hostcfg::inferValue("[1,2]") == json::array({1, 2}));
  EXPECT(hostcfg::inferValue("\"8000\"") == json("8000"));
  EXPECT(hostcfg::inferValue("C:\\cams") == json("C:\\cams"));
  EXPECT(hostcfg::inferValue("") == json(""));

  HostArgs a;
  json file = json::parse(R"({"input":"tracker","display":"stereo","plugins":{"tracker":{"exposureUs":5000,"laserPower":100},"stereo":{"mode":"3d"}}})");
  hostcfg::Selection s = hostcfg::selectRoles(file, a);
  EXPECT(s.input == "tracker" && s.inputs == std::vector<std::string>{"tracker"} && s.mouse && s.keyboard);
  EXPECT(s.display == "stereo" && s.platform.empty());
  const json multi = json::parse(R"({"inputs":["mouse","tracker","simulated","tracker"],"input":"tracker"})");
  s = hostcfg::selectRoles(multi, a);
  EXPECT(s.mouse && !s.keyboard && s.inputs == (std::vector<std::string>{"tracker", "simulated"}));
  a.input = "replay";
  a.platform = "none";
  s = hostcfg::selectRoles(file, a);
  EXPECT(s.input == "replay" && s.inputs == std::vector<std::string>{"replay"} && s.platform.empty());
  s = hostcfg::selectRoles(json::object(), HostArgs{});
  EXPECT(s.input == "none" && s.display == "desktop" && s.platform.empty());  // the defaults

  a.pluginOptions = {{"tracker", "exposureUs", "8000"}, {"tracker", "area.size", "[0.4,0.3,0.3]"}, {"stereo", "mode", "2d"}};
  const json hp = hostcfg::pluginConfig(file, "tracker", a);
  EXPECT(hp["exposureUs"] == 8000 && hp["laserPower"] == 100);  // command line over file, rest kept
  EXPECT(hp["area"]["size"] == json::array({0.4, 0.3, 0.3}));
  EXPECT(hostcfg::pluginConfig(file, "stereo", a)["mode"] == "2d");
  EXPECT(hostcfg::pluginConfig(file, "missing", a) == json::object());
}

// Creating and starting providers, and what happens when one fails.
static void testProviderFailures() {
  plugins::Catalog c;
  c.scan({testExeDir() + L"\\test-plugins"});
  std::vector<std::string> logs;
  int lastState = -1;
  std::string lastStatus, lastLifecycle;
  int frames = 0, firstId = -1;
  providers::Sink sink;
  sink.log = [&](const std::string& src, int, const std::string& t) { logs.push_back(src + ": " + t); };
  sink.inputStatus = [&](int s, float, const std::string& t) { lastState = s, lastStatus = t; };
  sink.hands = [&](const XrbHandFrame& f) { frames++, firstId = f.count ? f.hands[0].id : -1; };
  sink.lifecycle = [&](int e, const std::string& j) { lastLifecycle = std::to_string(e) + j; };
  std::string err;
  // Unknown name: built-ins and plugins of that role are listed.
  providers::Input in;
  EXPECT(!providers::createInput("missing", c, "{}", &sink, &in, &err));
  EXPECT(err.find("no input provider named \"missing\"") != std::string::npos && err.find("none") != std::string::npos &&
         err.find("tinput") != std::string::npos);
  // A plugin input that runs: one status, one frame with hand 7.
  EXPECT(providers::createInput("tinput", c, "{}", &sink, &in, &err) && !in.builtin);
  EXPECT(providers::startInput(in, sink) && lastState == XRB_INPUT_RUNNING && frames == 1 && firstId == 7);
  in.reset();
  // An input that fails to start: the app keeps going, the page is told why.
  EXPECT(providers::createInput("tinput", c, R"({"failStart":true})", &sink, &in, &err));
  EXPECT(!providers::startInput(in, sink));
  EXPECT(lastState == XRB_INPUT_FAILED && lastStatus.find("test failure on request") != std::string::npos);
  in.reset();
  EXPECT(!providers::createInput("tinput", c, R"({"failCreate":true})", &sink, &in, &err) && !in);
  // A display that fails: an error without fallback, the fallback with one.
  auto cfg = [](const std::string& n) { return n == "tdisplay" ? std::string(R"({"failStart":true})") : std::string("{}"); };
  providers::Display d;
  XrbDisplayInfo info{};
  EXPECT(!providers::openDisplay("tdisplay", "", c, cfg, &sink, &d, &info, &err));
  EXPECT(err.find("display tdisplay failed to open: test failure on request") != std::string::npos && !d);
  EXPECT(providers::openDisplay("tdisplay", "desktop", c, cfg, &sink, &d, &info, &err));
  EXPECT(d.name == "desktop" && d.builtin && info.layout == XRB_LAYOUT_MONO && !info.can_switch);
  d.reset();
  EXPECT(providers::openDisplay("tdisplay", "", c, [](const std::string&) { return std::string("{}"); }, &sink, &d, &info, &err));
  EXPECT(info.eye_width == 640 && info.layout == XRB_LAYOUT_SBS && info.can_switch == 1);
  XrbEyes eyes{sizeof(eyes)};
  d.api->poll_eyes(d.self, &eyes);
  EXPECT(approx(eyes.right[0], 0.03f) && !eyes.stale);
  EXPECT(d.api->begin_exit(d.self) == 3);
  // A platform: its configure reaches the host.
  providers::Platform p;
  EXPECT(providers::createPlatform("tplatform", c, "{}", &sink, &p, &err) && p.api->start(p.self) == 0);  EXPECT(lastLifecycle == std::to_string(XRB_LIFECYCLE_CONFIGURE) + "{\"k\":\"v\"}");
}

// --record-hands= of any provider replays as the same stream: record `simulated` the way the host
// does (channel messages into a .hands file), replay the file, compare what each delivered.
static void testRecordReplay() {
  struct Seen {
    std::vector<std::vector<uint8_t>> hands;  // XrbHand bytes per frame
    std::vector<double> captureMs;
    std::vector<std::string> status;
  };
  auto watch = [](Seen* seen, channel::Server* chan, HandRecorder* rec) {
    providers::Sink s;
    s.hands = [=](const XrbHandFrame& f) {
      seen->hands.emplace_back((const uint8_t*)f.hands, (const uint8_t*)f.hands + f.count * sizeof(XrbHand));
      seen->captureMs.push_back(f.capture_time_ms);
      if (chan && rec) {
        const std::vector<uint8_t> p = channel::encodeHands(f), m = chan->publish(channel::kHands, p.data(), p.size());
        rec->write(m.data(), m.size());
      }
    };
    s.inputStatus = [=](int st, float hz, const std::string& t) {
      seen->status.push_back(std::to_string(st) + " " + t);
      if (chan && rec) {
        const std::vector<uint8_t> p = channel::encodeStatus(st, hz, t), m = chan->publish(channel::kStatus, p.data(), p.size());
        rec->write(m.data(), m.size());
      }
    };
    return s;
  };
  plugins::Catalog none;
  std::string err;
  wchar_t tmp[MAX_PATH];
  GetTempPathW(MAX_PATH, tmp);
  const std::wstring file = std::wstring(tmp) + L"xrb-host-tests.hands";

  Seen live;
  channel::Server chan;
  HandRecorder rec;
  EXPECT(rec.open(file));
  providers::Sink liveSink = watch(&live, &chan, &rec);
  providers::Input sim;
  EXPECT(providers::createInput("simulated", none, R"({"hands":2,"rateHz":100})", &liveSink, &sim, &err) && sim.builtin);
  EXPECT(providers::startInput(sim, liveSink));
  Sleep(300);
  sim.api->stop(sim.self);
  rec.close();
  EXPECT(live.hands.size() >= 20 && live.status.size() == 1);
  EXPECT(!live.hands.empty() && live.hands[0].size() == 2 * sizeof(XrbHand));

  Seen replayed;
  providers::Sink replaySink = watch(&replayed, nullptr, nullptr);
  providers::Input rp;
  const nlohmann::json cfg = {{"file", narrow(file)}};
  EXPECT(providers::createInput("replay", none, cfg.dump(), &replaySink, &rp, &err) && providers::startInput(rp, replaySink));
  for (int i = 0; i < 200 && replayed.hands.size() < live.hands.size(); i++) Sleep(10);
  rp.api->stop(rp.self);
  EXPECT(replayed.status == live.status);
  EXPECT(replayed.hands == live.hands);  // byte for byte
  bool timing = replayed.captureMs.size() == live.captureMs.size();
  for (size_t i = 1; timing && i < live.captureMs.size(); i++)
    timing = std::fabs((replayed.captureMs[i] - replayed.captureMs[0]) - (live.captureMs[i] - live.captureMs[0])) < 1e-6;
  EXPECT(timing);  // same capture times, shifted as a whole

  // No file, or a missing one: the input fails with the reason.
  providers::Input bad;
  EXPECT(providers::createInput("replay", none, "{}", &replaySink, &bad, &err) && !providers::startInput(bad, replaySink));
  EXPECT(replayed.status.back().find("no recording given") != std::string::npos);
  DeleteFileW(file.c_str());
}

#include "shell_policy.h"

static void testShellPolicy() {
  PageShell shell;
  EXPECT(!shell.mayClose(true, "page-a", "page-a", "first"));
  EXPECT(!shell.registerPage("page-a", "page-b", "first"));
  EXPECT(shell.registerPage("page-a", "page-a", "first"));
  EXPECT(shell.mayClose(true, "page-a", "page-a", "first"));
  EXPECT(!shell.mayClose(false, "page-a", "page-a", "first"));
  EXPECT(!shell.accepts("page-a", "page-a", "foreign"));
  EXPECT(!shell.accepts("page-b", "page-a", "first"));
  shell.reset();
  EXPECT(!shell.accepts("page-a", "page-a", "first"));
  EXPECT(shell.registerPage("page-a", "page-a", "reload"));
  EXPECT(!shell.accepts("page-a", "page-a", "first"));
  EXPECT(shell.accepts("page-a", "page-a", "reload"));
}

int main() {
  testShellPolicy();
  testPluginAbi();
  testChannelV2();
  testRecordReplay();
  testPluginCatalog();
  testHostConfig();
  testProviderFailures();
  testStatusReport();
  testWebSocket();
  testArgs();
  testFaviconPixels();
  testResolveAppPath();
  std::printf("%s (%d failures)\n", g_failures ? "FAILED" : "all host tests passed", g_failures);
  return g_failures ? 1 : 0;
}
