#pragma once
// The host's window and D3D11 output. Chromium's frame (for a stereo display 2 eyes side by side,
// e.g. 7680x2160) is copied into a page texture and drawn into a 3-buffer flip swapchain on the
// display's monitor (half side-by-side, 3840x2160); a 3D display's runtime turns that into its image.
#include <windows.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#include <functional>
#include <string>

class Presenter {
 public:
  ~Presenter();

  // Mouse in window client pixels; the host maps it onto the page.
  std::function<void(int x, int y, bool down, bool up)> onMouse;
  std::function<void()> onQuit;
  // Keyboard messages for the page (WM_KEYDOWN / WM_KEYUP / WM_CHAR and their SYS variants).
  std::function<void(UINT msg, WPARAM w, LPARAM l)> onKey;
  // On a 3D display the system cursor would be woven like the picture and appear in the
  // wrong place for each eye; the page draws its own cursor instead.
  bool hideCursor = false;
  bool hidden = false;  // never shown (offscreen renders such as --render-icon)
  // For displays with XrbDisplayInfo::mono_left_half: with stereo off their runtime shows the
  // LEFT half of the presented frame stretched over the panel, as it would show the left eye. The mono
  // page is therefore drawn into the left half of the window (right half black), stretched back to full width.
  bool leftHalf = false;

  // fullscreen: borderless popup over `rect`; else a normal window centered on that monitor
  // when windowedOnMonitor is set, with the requested client size where it fits.
  void createWindow(const RECT& rect, bool fullscreen, const wchar_t* title, bool windowedOnMonitor = false,
                    int windowW = 0, int windowH = 0);
  void createDevice(int pageW, int pageH);
  // New page size (the view switched between side by side and mono): the old page texture goes,
  // frames of the old size are dropped and black is presented until a frame of the new size arrives.
  void setPageSize(int pageW, int pageH);
  bool hasPage() const { return page_ != nullptr; }  // a frame of the current page size was received
  HWND hwnd() const { return hwnd_; }
  int clientW() const { return clientW_; }
  int clientH() const { return clientH_; }

  // Called inside CEF's paint callbacks (render thread).
  void copySharedTexture(HANDLE handle);
  void copySoftwareFrame(const void* bgra, int w, int h);
  bool hasFrame() const { return frames_ > 0; }

  void present();  // draws the page texture to the back buffer and presents with vsync
  void presentBlack();
  // Saves the current page texture (both eyes side by side) as a PNG. For diagnostics.
  // keepAlpha: write the page's transparency (straight alpha), else an opaque image.
  bool savePagePng(const std::wstring& path, bool keepAlpha = false);
  void pumpMessages();

  long long sharedFrames() const { return sharedFrames_; }
  long long softwareFrames() const { return softwareFrames_; }

 private:
  static LRESULT CALLBACK wndProc(HWND, UINT, WPARAM, LPARAM);
  void ensurePageTexture(DXGI_FORMAT fmt);
  void resizeBackBuffer();
  HWND hwnd_ = nullptr;
  RECT windowedRect_{};
  HWND previousForeground_ = nullptr;
  int clientW_ = 0, clientH_ = 0, backW_ = 0, backH_ = 0, pageW_ = 0, pageH_ = 0, texW_ = 0, texH_ = 0;
  long long frames_ = 0, sharedFrames_ = 0, softwareFrames_ = 0, openFailures_ = 0;
  Microsoft::WRL::ComPtr<ID3D11Device> dev_;
  Microsoft::WRL::ComPtr<ID3D11Device1> dev1_;
  Microsoft::WRL::ComPtr<ID3D11DeviceContext> ctx_;
  Microsoft::WRL::ComPtr<IDXGISwapChain1> swap_;
  Microsoft::WRL::ComPtr<ID3D11RenderTargetView> backRtv_;
  Microsoft::WRL::ComPtr<ID3D11Texture2D> page_, upload_;
  Microsoft::WRL::ComPtr<ID3D11ShaderResourceView> pageSrv_;
  Microsoft::WRL::ComPtr<ID3D11VertexShader> vs_;
  Microsoft::WRL::ComPtr<ID3D11PixelShader> ps_;
  Microsoft::WRL::ComPtr<ID3D11SamplerState> sampler_;
  Microsoft::WRL::ComPtr<ID3D11RasterizerState> raster_;
  DXGI_FORMAT pageFormat_ = DXGI_FORMAT_UNKNOWN;
};

// The discrete ("high performance") GPU on hybrid laptops. Both the host's D3D device and
// Chromium (--use-adapter-luid) must use it: otherwise Chromium renders on the iGPU.
bool highPerformanceAdapter(LUID* luid);
