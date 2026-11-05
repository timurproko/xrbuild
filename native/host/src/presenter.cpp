#include "presenter.h"

#include <d3dcompiler.h>
#include <dxgi1_6.h>
#include <wincodec.h>
#include <windowsx.h>

#include <stdexcept>
#include <string>
#include <vector>

#include "log.h"

using Microsoft::WRL::ComPtr;

static void check(HRESULT hr, const char* what) {
  if (FAILED(hr)) {
    char b[160];
    sprintf_s(b, "%s failed (0x%08lX)", what, (unsigned long)hr);
    throw std::runtime_error(b);
  }
}

static const char* kBlitHlsl = R"(
Texture2D tex0 : register(t0);
SamplerState smp0 : register(s0);
struct VSOut { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };
VSOut VSBlit(uint id : SV_VertexID) {
  float2 p = float2((id << 1) & 2, id & 2);
  VSOut o; o.pos = float4(p * float2(2, -2) + float2(-1, 1), 0, 1); o.uv = p; return o;
}
float4 PSBlit(VSOut i) : SV_Target { return float4(tex0.Sample(smp0, i.uv).rgb, 1); }
)";

bool highPerformanceAdapter(LUID* luid) {
  ComPtr<IDXGIFactory6> f6;
  ComPtr<IDXGIAdapter1> adapter;
  if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&f6))) ||
      FAILED(f6->EnumAdapterByGpuPreference(0, DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE, IID_PPV_ARGS(&adapter))))
    return false;
  DXGI_ADAPTER_DESC1 d{};
  adapter->GetDesc1(&d);
  *luid = d.AdapterLuid;
  return true;
}


LRESULT CALLBACK Presenter::wndProc(HWND h, UINT m, WPARAM w, LPARAM l) {
  auto* self = reinterpret_cast<Presenter*>(GetWindowLongPtrW(h, GWLP_USERDATA));
  switch (m) {
    case WM_SIZE:
      if (self) self->clientW_ = LOWORD(l), self->clientH_ = HIWORD(l);
      return 0;
    case WM_SETCURSOR:
      if (self && self->hideCursor && LOWORD(l) == HTCLIENT) {
        SetCursor(nullptr);
        return TRUE;
      }
      break;
    case WM_KEYDOWN:
      [[fallthrough]];
    case WM_KEYUP:
    case WM_CHAR:
    case WM_SYSKEYDOWN:
    case WM_SYSKEYUP:
    case WM_SYSCHAR:
      if (self && self->onKey) self->onKey(m, w, l);
      return 0;
    case WM_CLOSE:
      if (self && self->onQuit) self->onQuit();
      return 0;
    case WM_MOUSEMOVE:
    case WM_LBUTTONDOWN:
    case WM_LBUTTONUP:
      if (self && self->onMouse) self->onMouse(GET_X_LPARAM(l), GET_Y_LPARAM(l), m == WM_LBUTTONDOWN, m == WM_LBUTTONUP);
      return 0;
  }
  return DefWindowProcW(h, m, w, l);
}

Presenter::~Presenter() {
  if (hwnd_) ShowWindow(hwnd_, SW_HIDE);
  if (previousForeground_ && IsWindow(previousForeground_)) {
    // Return the keyboard and z-order to the window that launched the presentation. Without this,
    // Windows may activate an unrelated window when the topmost host disappears.
    const DWORD currentThread = GetCurrentThreadId();
    const DWORD previousThread = GetWindowThreadProcessId(previousForeground_, nullptr);
    const bool attached = previousThread && previousThread != currentThread &&
                          AttachThreadInput(currentThread, previousThread, TRUE);
    BringWindowToTop(previousForeground_);
    SetForegroundWindow(previousForeground_);
    if (attached) AttachThreadInput(currentThread, previousThread, FALSE);
  }
  if (hwnd_) DestroyWindow(hwnd_);
}

static RECT windowedRectOn(const RECT& monitor, int desiredW = 1520, int desiredH = 856) {
  const int w = (std::max)(1, (std::min)(desiredW, int(monitor.right - monitor.left) - 80));
  const int h = (std::max)(1, (std::min)(desiredH, int(monitor.bottom - monitor.top) - 80));
  // Browser --window-size addresses the decorated window. Keep the native host's outer
  // rectangle on that same contract so Desktop and WebXR windows are pixel-identical.
  const int x = monitor.left + (monitor.right - monitor.left - w) / 2;
  const int y = monitor.top + (monitor.bottom - monitor.top - h) / 2;
  return {x, y, x + w, y + h};
}

void Presenter::createWindow(const RECT& rect, bool fullscreen, const wchar_t* title, bool windowedOnMonitor,
                             int windowW, int windowH) {
  previousForeground_ = GetForegroundWindow();
  WNDCLASSW wc{};
  wc.lpfnWndProc = wndProc;
  wc.hInstance = GetModuleHandleW(nullptr);
  wc.lpszClassName = L"XRBuildHost";
  wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  RegisterClassW(&wc);
  int w = rect.right - rect.left, h = rect.bottom - rect.top;
  if (fullscreen) {
    // A selected fullscreen display is a presentation surface: keep it above the panel,
    // taskbar, notifications, and other ordinary windows until the host exits.
    hwnd_ = CreateWindowExW(WS_EX_TOPMOST, wc.lpszClassName, title, WS_POPUP | WS_VISIBLE, rect.left, rect.top, w, h,
                            nullptr, nullptr, wc.hInstance, nullptr);
  } else {
    RECT r{0, 0, w, h};
    AdjustWindowRect(&r, WS_OVERLAPPEDWINDOW, FALSE);
    if (windowedOnMonitor) windowedRect_ = windowedRectOn(rect, windowW > 0 ? windowW : 1520, windowH > 0 ? windowH : 856);
    hwnd_ = CreateWindowExW(0, wc.lpszClassName, title, WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                            windowedOnMonitor ? windowedRect_.left : CW_USEDEFAULT,
                            windowedOnMonitor ? windowedRect_.top : CW_USEDEFAULT,
                            windowedOnMonitor ? windowedRect_.right - windowedRect_.left : r.right - r.left,
                            windowedOnMonitor ? windowedRect_.bottom - windowedRect_.top : r.bottom - r.top,
                            nullptr, nullptr, wc.hInstance, nullptr);
  }
  if (!hwnd_) throw std::runtime_error("CreateWindow failed");
  SetWindowLongPtrW(hwnd_, GWLP_USERDATA, (LONG_PTR)this);
  if (!fullscreen) GetWindowRect(hwnd_, &windowedRect_);
  RECT client{};
  GetClientRect(hwnd_, &client);
  clientW_ = client.right - client.left;
  clientH_ = client.bottom - client.top;
  if (hidden) {
    ShowWindow(hwnd_, SW_HIDE);
    return;
  }
  ShowWindow(hwnd_, SW_SHOW);
  UpdateWindow(hwnd_);

  // Windows can reject SetForegroundWindow when the panel was launched from a browser and is no
  // longer the foreground process. Temporarily join the foreground thread's input queue so the new
  // presentation window is activated immediately and Esc works without a preparatory mouse click.
  const HWND foreground = previousForeground_ && IsWindow(previousForeground_) ? previousForeground_ : GetForegroundWindow();
  const DWORD currentThread = GetCurrentThreadId();
  const DWORD foregroundThread = foreground ? GetWindowThreadProcessId(foreground, nullptr) : 0;
  const bool attached = foregroundThread && foregroundThread != currentThread &&
                        AttachThreadInput(currentThread, foregroundThread, TRUE);
  if (fullscreen) SetWindowPos(hwnd_, HWND_TOPMOST, rect.left, rect.top, w, h, SWP_SHOWWINDOW);
  BringWindowToTop(hwnd_);
  SetForegroundWindow(hwnd_);
  SetActiveWindow(hwnd_);
  SetFocus(hwnd_);  // keys (F2 stats, Esc) go to the app, not the browser or console
  if (attached) AttachThreadInput(currentThread, foregroundThread, FALSE);
}

void Presenter::createDevice(int pageW, int pageH) {
  pageW_ = pageW;
  pageH_ = pageH;
  D3D_FEATURE_LEVEL fl{};
  // Same GPU as Chromium (see highPerformanceAdapter), so its shared textures never cross adapters.
  ComPtr<IDXGIAdapter> chosen;
  LUID luid{};
  ComPtr<IDXGIFactory4> f4;
  if (highPerformanceAdapter(&luid) && SUCCEEDED(CreateDXGIFactory1(IID_PPV_ARGS(&f4)))) f4->EnumAdapterByLuid(luid, IID_PPV_ARGS(&chosen));
  check(D3D11CreateDevice(chosen.Get(), chosen ? D3D_DRIVER_TYPE_UNKNOWN : D3D_DRIVER_TYPE_HARDWARE, nullptr, 0, nullptr, 0,
                          D3D11_SDK_VERSION, &dev_, &fl, &ctx_),
        "D3D11CreateDevice");
  check(dev_.As(&dev1_), "ID3D11Device1");
  ComPtr<IDXGIDevice> dxgiDev;
  dev_.As(&dxgiDev);
  ComPtr<IDXGIAdapter> adapter;
  dxgiDev->GetAdapter(&adapter);
  DXGI_ADAPTER_DESC ad{};
  adapter->GetDesc(&ad);
  LOGI("[host] GPU %s", narrow(ad.Description).c_str());
  ComPtr<IDXGIFactory2> factory;
  check(adapter->GetParent(IID_PPV_ARGS(&factory)), "DXGI factory");

  DXGI_SWAP_CHAIN_DESC1 sd{};
  sd.Width = backW_ = clientW_;
  sd.Height = backH_ = clientH_;
  sd.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
  sd.SampleDesc = {1, 0};
  sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
  sd.BufferCount = 3;  // 2 buffers turned single late frames into 33 ms stalls on a 3D display
  sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
  sd.Scaling = DXGI_SCALING_STRETCH;
  check(factory->CreateSwapChainForHwnd(dev_.Get(), hwnd_, &sd, nullptr, nullptr, &swap_), "swapchain");
  factory->MakeWindowAssociation(hwnd_, DXGI_MWA_NO_ALT_ENTER);
  // Latency: let the GPU queue at most one frame ahead of the display.
  if (ComPtr<IDXGIDevice1> d1; SUCCEEDED(dev_.As(&d1))) d1->SetMaximumFrameLatency(1);
  ComPtr<ID3D11Texture2D> back;
  check(swap_->GetBuffer(0, IID_PPV_ARGS(&back)), "back buffer");
  check(dev_->CreateRenderTargetView(back.Get(), nullptr, &backRtv_), "back buffer RTV");

  auto compile = [&](const char* entry, const char* target) {
    ComPtr<ID3DBlob> blob, err;
    if (FAILED(D3DCompile(kBlitHlsl, strlen(kBlitHlsl), "blit", nullptr, nullptr, entry, target, D3DCOMPILE_OPTIMIZATION_LEVEL3, 0,
                          &blob, &err)))
      throw std::runtime_error(std::string("shader ") + entry + ": " + (err ? (const char*)err->GetBufferPointer() : "?"));
    return blob;
  };
  auto vsb = compile("VSBlit", "vs_5_0"), psb = compile("PSBlit", "ps_5_0");
  check(dev_->CreateVertexShader(vsb->GetBufferPointer(), vsb->GetBufferSize(), nullptr, &vs_), "VS");
  check(dev_->CreatePixelShader(psb->GetBufferPointer(), psb->GetBufferSize(), nullptr, &ps_), "PS");
  D3D11_SAMPLER_DESC smp{};
  smp.Filter = D3D11_FILTER_MIN_MAG_MIP_LINEAR;  // halves each eye horizontally: 2W x H -> W x H
  smp.AddressU = smp.AddressV = smp.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
  smp.MaxLOD = D3D11_FLOAT32_MAX;
  check(dev_->CreateSamplerState(&smp, &sampler_), "sampler");
  D3D11_RASTERIZER_DESC rd{};
  rd.FillMode = D3D11_FILL_SOLID;
  rd.CullMode = D3D11_CULL_NONE;
  check(dev_->CreateRasterizerState(&rd, &raster_), "rasterizer");
}

void Presenter::setPageSize(int pageW, int pageH) {
  if (pageW == pageW_ && pageH == pageH_) return;
  pageW_ = pageW;
  pageH_ = pageH;
  page_.Reset();
  pageSrv_.Reset();
  texW_ = texH_ = 0;
  LOGI("[host] page size now %dx%d, waiting for the first frame", pageW, pageH);
}

void Presenter::ensurePageTexture(DXGI_FORMAT fmt) {
  if (page_ && fmt == pageFormat_ && texW_ == pageW_ && texH_ == pageH_) return;
  D3D11_TEXTURE2D_DESC td{};
  td.Width = pageW_;
  td.Height = pageH_;
  td.MipLevels = 1;
  td.ArraySize = 1;
  td.Format = fmt;
  td.SampleDesc = {1, 0};
  td.BindFlags = D3D11_BIND_SHADER_RESOURCE;
  page_.Reset();
  pageSrv_.Reset();
  check(dev_->CreateTexture2D(&td, nullptr, &page_), "page texture");
  check(dev_->CreateShaderResourceView(page_.Get(), nullptr, &pageSrv_), "page SRV");
  pageFormat_ = fmt;
  texW_ = pageW_;
  texH_ = pageH_;
  LOGI("[host] page texture %dx%d, DXGI format %d", pageW_, pageH_, (int)fmt);
}

void Presenter::copySharedTexture(HANDLE handle) {
  // CEF pools these textures: reopen on every callback and copy before returning.
  ComPtr<ID3D11Texture2D> src;
  if (!handle || FAILED(dev1_->OpenSharedResource1(handle, IID_PPV_ARGS(&src)))) {
    if (++openFailures_ <= 3) LOGI("[host] cannot open Chromium's shared texture");
    return;
  }
  D3D11_TEXTURE2D_DESC sd{};
  src->GetDesc(&sd);
  // After a page resize Chromium still paints a few frames of the old size: not shown.
  if (!page_ && ((int)sd.Width != pageW_ || (int)sd.Height != pageH_)) return;
  ensurePageTexture(sd.Format);
  if ((int)sd.Width == pageW_ && (int)sd.Height == pageH_) {
    ctx_->CopyResource(page_.Get(), src.Get());
  } else {
    D3D11_BOX box{0, 0, 0, (std::min)(sd.Width, (UINT)pageW_), (std::min)(sd.Height, (UINT)pageH_), 1};
    ctx_->CopySubresourceRegion(page_.Get(), 0, 0, 0, 0, src.Get(), 0, &box);
  }
  ctx_->Flush();
  frames_++;
  sharedFrames_++;
}

void Presenter::copySoftwareFrame(const void* bgra, int w, int h) {
  if (w != pageW_ || h != pageH_) return;  // old size after a resize (or a mismatch): not shown
  ensurePageTexture(DXGI_FORMAT_B8G8R8A8_UNORM);
  ctx_->UpdateSubresource(page_.Get(), 0, nullptr, bgra, (UINT)w * 4, 0);
  frames_++;
  softwareFrames_++;
}

void Presenter::resizeBackBuffer() {
  if (!swap_ || clientW_ <= 0 || clientH_ <= 0 || (backW_ == clientW_ && backH_ == clientH_)) return;
  ctx_->OMSetRenderTargets(0, nullptr, nullptr);
  backRtv_.Reset();
  check(swap_->ResizeBuffers(0, clientW_, clientH_, DXGI_FORMAT_UNKNOWN, 0), "resize swapchain");
  Microsoft::WRL::ComPtr<ID3D11Texture2D> back;
  check(swap_->GetBuffer(0, IID_PPV_ARGS(&back)), "resized back buffer");
  check(dev_->CreateRenderTargetView(back.Get(), nullptr, &backRtv_), "resized back buffer RTV");
  backW_ = clientW_;
  backH_ = clientH_;
}

void Presenter::present() {
  resizeBackBuffer();
  const float clear[4] = {0, 0, 0, 1};
  ctx_->ClearRenderTargetView(backRtv_.Get(), clear);
  if (pageSrv_) {
    ID3D11RenderTargetView* rtv = backRtv_.Get();
    ctx_->OMSetRenderTargets(1, &rtv, nullptr);
    const int w = leftHalf ? (std::max)(1, clientW_ / 2) : (std::max)(1, clientW_);
    D3D11_VIEWPORT vp{0, 0, (float)w, (float)(std::max)(1, clientH_), 0, 1};
    ctx_->RSSetViewports(1, &vp);
    ctx_->IASetInputLayout(nullptr);
    ctx_->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
    ctx_->VSSetShader(vs_.Get(), nullptr, 0);
    ctx_->PSSetShader(ps_.Get(), nullptr, 0);
    ID3D11ShaderResourceView* srv = pageSrv_.Get();
    ctx_->PSSetShaderResources(0, 1, &srv);
    ID3D11SamplerState* s = sampler_.Get();
    ctx_->PSSetSamplers(0, 1, &s);
    ctx_->RSSetState(raster_.Get());
    ctx_->Draw(3, 0);
    ID3D11ShaderResourceView* none = nullptr;
    ctx_->PSSetShaderResources(0, 1, &none);
  }
  swap_->Present(1, 0);
}

bool Presenter::savePagePng(const std::wstring& path, bool keepAlpha) {
  if (!page_) return false;
  D3D11_TEXTURE2D_DESC d{};
  page_->GetDesc(&d);
  if (d.Format != DXGI_FORMAT_B8G8R8A8_UNORM && d.Format != DXGI_FORMAT_R8G8B8A8_UNORM) return false;
  d.BindFlags = 0;
  d.MiscFlags = 0;
  d.Usage = D3D11_USAGE_STAGING;
  d.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
  ComPtr<ID3D11Texture2D> staging;
  if (FAILED(dev_->CreateTexture2D(&d, nullptr, &staging))) return false;
  ctx_->CopyResource(staging.Get(), page_.Get());
  D3D11_MAPPED_SUBRESOURCE map{};
  if (FAILED(ctx_->Map(staging.Get(), 0, D3D11_MAP_READ, 0, &map))) return false;
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool ok = false;
  ComPtr<IWICImagingFactory> wic;
  ComPtr<IWICStream> stream;
  ComPtr<IWICBitmapEncoder> enc;
  ComPtr<IWICBitmapFrameEncode> frame;
  if (SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&wic))) &&
      SUCCEEDED(wic->CreateStream(&stream)) && SUCCEEDED(stream->InitializeFromFilename(path.c_str(), GENERIC_WRITE)) &&
      SUCCEEDED(wic->CreateEncoder(GUID_ContainerFormatPng, nullptr, &enc)) &&
      SUCCEEDED(enc->Initialize(stream.Get(), WICBitmapEncoderNoCache)) && SUCCEEDED(enc->CreateNewFrame(&frame, nullptr)) &&
      SUCCEEDED(frame->Initialize(nullptr)) && SUCCEEDED(frame->SetSize(d.Width, d.Height))) {
    WICPixelFormatGUID fmt = d.Format == DXGI_FORMAT_B8G8R8A8_UNORM ? GUID_WICPixelFormat32bppBGRA : GUID_WICPixelFormat32bppRGBA;
    frame->SetPixelFormat(&fmt);
    // Opaque copy by default: the page's alpha is not part of what the panel shows. With
    // keepAlpha, Chromium's premultiplied pixels become the straight alpha PNG expects.
    std::vector<uint8_t> row((size_t)d.Width * 4);
    ok = true;
    for (UINT y = 0; y < d.Height && ok; y++) {
      memcpy(row.data(), (const uint8_t*)map.pData + (size_t)y * map.RowPitch, row.size());
      for (UINT x = 0; x < d.Width; x++) {
        uint8_t* p = &row[x * 4];
        if (!keepAlpha) {
          p[3] = 255;
        } else if (p[3] > 0 && p[3] < 255) {
          for (int c = 0; c < 3; c++) p[c] = (uint8_t)(std::min)(255, p[c] * 255 / p[3]);
        }
      }
      ok = SUCCEEDED(frame->WritePixels(1, d.Width * 4, (UINT)row.size(), row.data()));
    }
    ok = ok && SUCCEEDED(frame->Commit()) && SUCCEEDED(enc->Commit());
  }
  ctx_->Unmap(staging.Get(), 0);
  return ok;
}

void Presenter::presentBlack() {
  resizeBackBuffer();
  const float black[4] = {0, 0, 0, 1};
  ctx_->ClearRenderTargetView(backRtv_.Get(), black);
  swap_->Present(1, 0);
}

void Presenter::pumpMessages() {
  MSG msg;
  while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
}
