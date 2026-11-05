#pragma once
// Chromium Embedded Framework in windowless (off-screen) mode with the GPU on:
// the page is composited into a D3D11 shared texture handed to the Presenter.
// Single-threaded message loop (CefDoMessageLoopWork per frame), so every
// callback runs on the render thread. Lessons kept from the UX-Research host:
//   * sub-processes are this same exe: CefExecuteProcess first thing in main
//   * release every CefRefPtr before CefShutdown, or it fails fast (0xC0000409)
//   * windowsx.h macros must not reach the CEF headers
#include <functional>
#include <string>
#include <utility>
#include <vector>

#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_client.h"
#include "include/cef_command_line.h"
#include "include/cef_image.h"
#include "include/cef_render_process_handler.h"
#include "include/cef_v8.h"
#include "presenter.h"
#include "shell_policy.h"
#include "include/cef_process_message.h"

// Renderer side: puts a read-only window.__XRB_HOST__ in every main frame before
// any page script runs. Built from the dictionary the browser process passes as
// CreateBrowser's extra_info (keys documented in host_info.h).
class HostRenderer : public CefRenderProcessHandler {
 public:
  void OnBrowserCreated(CefRefPtr<CefBrowser>, CefRefPtr<CefDictionaryValue> extra) override {
    if (extra) info_ = extra->Copy(false);
  }
  void OnContextCreated(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, CefRefPtr<CefV8Context> context) override;
  IMPLEMENT_REFCOUNTING(HostRenderer);

 private:
  CefRefPtr<CefDictionaryValue> info_;
};

class HostApp : public CefApp, public CefBrowserProcessHandler {
 public:
  explicit HostApp(bool gpu) : gpu_(gpu), renderer_(new HostRenderer) {}
  CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override { return this; }
  CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override { return renderer_; }
  void OnBeforeCommandLineProcessing(const CefString&, CefRefPtr<CefCommandLine> cl) override {
    if (gpu_) {
      // Render on the discrete GPU (hybrid laptops otherwise pick the iGPU, measured: ~40 fps).
      LUID luid{};
      if (highPerformanceAdapter(&luid))
        cl->AppendSwitchWithValue("use-adapter-luid", std::to_string(luid.HighPart) + "," + std::to_string(luid.LowPart));
      cl->AppendSwitch("force_high_performance_gpu");
      cl->AppendSwitch("enable-gpu-rasterization");
      cl->AppendSwitchWithValue("use-angle", "d3d11");
    } else {
      cl->AppendSwitch("disable-gpu");
      cl->AppendSwitch("disable-gpu-compositing");
    }
    cl->AppendSwitchWithValue("autoplay-policy", "no-user-gesture-required");  // kiosk: videos start on their own
    // The app origin (https://app.local) counts as "public" to Chromium, so its WebSocket to
    // the host channel on 127.0.0.1 would need a Local Network Access permission that an
    // embedded browser can never grant: the connection is opened and dropped silently.
    cl->AppendSwitchWithValue("disable-features",
                              "LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets,"
                              "PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,"
                              "BlockInsecurePrivateNetworkRequests");
    cl->AppendSwitch("disable-pinch");
    // A station agent may run elevated, so the app inherits an admin token. Chromium then tries
    // to "de-elevate" by relaunching itself through Explorer - which the kiosk station has
    // killed - and CefInitialize fails (the agent saw a crash loop with exit code 1).
    cl->AppendSwitch("do-not-de-elevate");
  }
  IMPLEMENT_REFCOUNTING(HostApp);

 private:
  bool gpu_;
  CefRefPtr<HostRenderer> renderer_;
};

class HostImageDownload : public CefDownloadImageCallback {
 public:
  explicit HostImageDownload(std::function<void(CefRefPtr<CefImage>)> done) : done_(std::move(done)) {}
  void OnDownloadImageFinished(const CefString&, int, CefRefPtr<CefImage> image) override {
    if (image && !image->IsEmpty()) done_(image);
  }
  IMPLEMENT_REFCOUNTING(HostImageDownload);

 private:
  std::function<void(CefRefPtr<CefImage>)> done_;
};

class HostClient : public CefClient, public CefRenderHandler, public CefLifeSpanHandler, public CefLoadHandler,
                   public CefDisplayHandler {
 public:
  std::function<void(HANDLE)> onSharedTexture;
  std::function<void(const void*, int, int)> onSoftwareFrame;
  std::function<void(const std::string&)> onConsole;
  std::function<void(const std::string&)> onLoadError;
  std::function<void(const std::wstring&)> onTitle;
  std::function<void(CefRefPtr<CefImage>)> onFavicon;
  std::function<void()> onShellClose;
  std::function<void(const std::string&)> onCursorStyle;
  bool fullscreen = false;

  void OnLoadStart(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, TransitionType) override {
    if (frame && frame->IsMain()) { shell_.reset(); if (onCursorStyle) onCursorStyle("ring-dot"); }
  }
  bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser, CefRefPtr<CefFrame> frame,
                               CefProcessId source, CefRefPtr<CefProcessMessage> message) override {
    const std::string name = message->GetName().ToString();
    if (name != "xrb-shell-register" && name != "xrb-shell-close" && name != "xrb-shell-cursor") return false;
    if (source != PID_RENDERER || !browser_ || browser->GetIdentifier() != browser_->GetIdentifier()
        || !frame || !frame->IsMain() || !browser->GetMainFrame()
        || frame->GetIdentifier() != browser->GetMainFrame()->GetIdentifier()) return true;
    const auto values = message->GetArgumentList();
    if (values->GetSize() < 2 || values->GetType(0) != VTYPE_STRING || values->GetType(1) != VTYPE_STRING) return true;
    const std::string url = values->GetString(0).ToString(), nonce = values->GetString(1).ToString();
    const std::string current = browser->GetMainFrame()->GetURL().ToString();
    if (name == "xrb-shell-register") { shell_.registerPage(current, url, nonce); return true; }
    if (!shell_.accepts(current, url, nonce)) return true;
    if (name == "xrb-shell-close") {
      if (shell_.mayClose(fullscreen, current, url, nonce) && onShellClose) onShellClose();
    } else if (values->GetSize() == 3 && values->GetType(2) == VTYPE_STRING) {
      const std::string style = values->GetString(2).ToString();
      if ((style == "system" || style == "ring" || style == "ring-dot") && onCursorStyle) onCursorStyle(style);
    }
    return true;
  }

  HostClient(int w, int h) : w_(w), h_(h) {}
  CefRefPtr<CefRenderHandler> GetRenderHandler() override { return this; }
  CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override { return this; }
  CefRefPtr<CefLoadHandler> GetLoadHandler() override { return this; }
  CefRefPtr<CefDisplayHandler> GetDisplayHandler() override { return this; }

  void GetViewRect(CefRefPtr<CefBrowser>, CefRect& rect) override { rect = CefRect(0, 0, w_, h_); }
  bool GetScreenInfo(CefRefPtr<CefBrowser>, CefScreenInfo& info) override {
    info.device_scale_factor = 1.0f;
    info.depth = 32;
    info.depth_per_component = 8;
    info.rect = CefRect(0, 0, w_, h_);
    info.available_rect = info.rect;
    return true;
  }
  void OnAcceleratedPaint(CefRefPtr<CefBrowser>, PaintElementType type, const RectList&,
                          const CefAcceleratedPaintInfo& info) override {
    if (type == PET_VIEW && onSharedTexture) onSharedTexture(info.shared_texture_handle);
  }
  void OnPaint(CefRefPtr<CefBrowser>, PaintElementType type, const RectList&, const void* buffer, int width,
               int height) override {
    if (type == PET_VIEW && onSoftwareFrame) onSoftwareFrame(buffer, width, height);
  }

  void OnAfterCreated(CefRefPtr<CefBrowser> b) override {
    browser_ = b;
    b->GetHost()->SetFocus(true);  // off-screen browsers only get key events while focused
  }
  void OnBeforeClose(CefRefPtr<CefBrowser>) override {
    browser_ = nullptr;
    closed_ = true;
  }
  void OnLoadError(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, ErrorCode code, const CefString& text,
                   const CefString& url) override {
    if (frame && frame->IsMain() && onLoadError)
      onLoadError("error " + std::to_string((int)code) + " " + text.ToString() + " loading " + url.ToString());
  }
  void OnTitleChange(CefRefPtr<CefBrowser>, const CefString& title) override {
    if (onTitle) onTitle(title.ToWString());
  }
  void OnFaviconURLChange(CefRefPtr<CefBrowser> browser, const std::vector<CefString>& iconUrls) override {
    if (!onFavicon || iconUrls.empty()) return;
    auto done = onFavicon;
    browser->GetHost()->DownloadImage(iconUrls.front(), true, 256, false, new HostImageDownload(std::move(done)));
  }
  bool OnConsoleMessage(CefRefPtr<CefBrowser>, cef_log_severity_t, const CefString& message, const CefString& source,
                        int line) override {
    if (onConsole) onConsole(message.ToString() + "  (" + source.ToString() + ":" + std::to_string(line) + ")");
    return true;
  }

  CefRefPtr<CefBrowser> browser() const { return browser_; }
  bool closed() const { return closed_; }
  /** New page size (side by side <-> mono); Chromium re-lays out and paints at the new size. */
  void resize(int w, int h) {
    w_ = w;
    h_ = h;
    if (browser_) browser_->GetHost()->WasResized();
  }
  void mouse(int x, int y, bool down, bool up) {
    if (!browser_) return;
    CefMouseEvent e;
    e.x = x;
    e.y = y;
    e.modifiers = down ? EVENTFLAG_LEFT_MOUSE_BUTTON : 0;
    if (down || up) browser_->GetHost()->SendMouseClickEvent(e, MBT_LEFT, up, 1);
    else browser_->GetHost()->SendMouseMoveEvent(e, false);
  }
  void close() {
    if (browser_) browser_->GetHost()->CloseBrowser(true);
  }
  /** Forwards a Win32 keyboard message to the page (as cefclient's OSR window does). */
  void key(UINT msg, WPARAM w, LPARAM l) {
    if (!browser_) return;
    CefKeyEvent e;
    e.windows_key_code = (int)w;
    e.native_key_code = (int)l;
    e.is_system_key = msg == WM_SYSCHAR || msg == WM_SYSKEYDOWN || msg == WM_SYSKEYUP;
    e.type = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) ? KEYEVENT_RAWKEYDOWN
           : (msg == WM_KEYUP || msg == WM_SYSKEYUP)     ? KEYEVENT_KEYUP
                                                          : KEYEVENT_CHAR;
    int mods = 0;
    if ((msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) && (l & (1LL << 30))) mods |= EVENTFLAG_IS_REPEAT;
    if (GetKeyState(VK_SHIFT) & 0x8000) mods |= EVENTFLAG_SHIFT_DOWN;
    if (GetKeyState(VK_CONTROL) & 0x8000) mods |= EVENTFLAG_CONTROL_DOWN;
    if (GetKeyState(VK_MENU) & 0x8000) mods |= EVENTFLAG_ALT_DOWN;
    e.modifiers = mods;
    browser_->GetHost()->SendKeyEvent(e);
  }
  IMPLEMENT_REFCOUNTING(HostClient);

 private:
  int w_, h_;
  CefRefPtr<CefBrowser> browser_;
  bool closed_ = false;
  PageShell shell_;
};
