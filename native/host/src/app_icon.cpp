#include "app_icon.h"

#include <wincodec.h>
#include <wrl/client.h>

#include <vector>

#include "log.h"

using Microsoft::WRL::ComPtr;

namespace {
HICON iconFromSource(IWICImagingFactory* wic, IWICBitmapSource* source, int size) {
  ComPtr<IWICBitmapScaler> scaler;
  ComPtr<IWICFormatConverter> bgra;
  if (FAILED(wic->CreateBitmapScaler(&scaler)) ||
      FAILED(scaler->Initialize(source, size, size, WICBitmapInterpolationModeHighQualityCubic)) ||
      FAILED(wic->CreateFormatConverter(&bgra)) ||
      FAILED(bgra->Initialize(scaler.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0,
                              WICBitmapPaletteTypeCustom)))
    return nullptr;

  std::vector<BYTE> px((size_t)size * size * 4);
  if (FAILED(bgra->CopyPixels(nullptr, size * 4, (UINT)px.size(), px.data()))) return nullptr;

  BITMAPV5HEADER bh{};
  bh.bV5Size = sizeof(bh);
  bh.bV5Width = size;
  bh.bV5Height = -size;
  bh.bV5Planes = 1;
  bh.bV5BitCount = 32;
  bh.bV5Compression = BI_BITFIELDS;
  bh.bV5RedMask = 0x00FF0000;
  bh.bV5GreenMask = 0x0000FF00;
  bh.bV5BlueMask = 0x000000FF;
  bh.bV5AlphaMask = 0xFF000000;
  void* bits = nullptr;
  HDC dc = GetDC(nullptr);
  HBITMAP color = CreateDIBSection(dc, (BITMAPINFO*)&bh, DIB_RGB_COLORS, &bits, nullptr, 0);
  ReleaseDC(nullptr, dc);
  HBITMAP mask = CreateBitmap(size, size, 1, 1, nullptr);
  HICON icon = nullptr;
  if (color && mask) {
    memcpy(bits, px.data(), px.size());
    ICONINFO ii{TRUE, 0, 0, mask, color};
    icon = CreateIconIndirect(&ii);
  }
  if (color) DeleteObject(color);
  if (mask) DeleteObject(mask);
  return icon;
}
}  // namespace

HICON loadIconFile(const std::wstring& path, int size) {
  if (path.empty() || GetFileAttributesW(path.c_str()) == INVALID_FILE_ATTRIBUTES) return nullptr;
  const HRESULT co = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  HICON icon = nullptr;
  {
    ComPtr<IWICImagingFactory> wic;
    ComPtr<IWICBitmapDecoder> decoder;
    ComPtr<IWICBitmapFrameDecode> frame;
    if (SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&wic))) &&
        SUCCEEDED(wic->CreateDecoderFromFilename(path.c_str(), nullptr, GENERIC_READ, WICDecodeMetadataCacheOnDemand,
                                                 &decoder)) &&
        SUCCEEDED(decoder->GetFrame(0, &frame)))
      icon = iconFromSource(wic.Get(), frame.Get(), size);
  }
  if (SUCCEEDED(co)) CoUninitialize();
  return icon;
}

HICON loadIconPixels(const void* bgra, int width, int height, int size) {
  if (!bgra || width <= 0 || height <= 0 || size <= 0) return nullptr;
  const HRESULT co = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  HICON icon = nullptr;
  {
    ComPtr<IWICImagingFactory> wic;
    ComPtr<IWICBitmap> bitmap;
    if (SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&wic))) &&
        SUCCEEDED(wic->CreateBitmapFromMemory((UINT)width, (UINT)height, GUID_WICPixelFormat32bppPBGRA,
                                              (UINT)width * 4, (UINT)width * height * 4,
                                              (BYTE*)bgra, &bitmap)))
      icon = iconFromSource(wic.Get(), bitmap.Get(), size);
  }
  if (SUCCEEDED(co)) CoUninitialize();
  return icon;
}

std::string applyWindowIcon(HWND hwnd, const std::wstring& path) {
  const int bigSize = GetSystemMetrics(SM_CXICON), smallSize = GetSystemMetrics(SM_CXSMICON);
  HICON hBig = loadIconFile(path, bigSize), hSmall = loadIconFile(path, smallSize);
  std::string source = narrow(path);
  if (!hBig || !hSmall) {
    if (hBig) DestroyIcon(hBig);
    if (hSmall) DestroyIcon(hSmall);
    HINSTANCE inst = GetModuleHandleW(nullptr);
    hBig = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(1), IMAGE_ICON, bigSize, bigSize, 0);
    hSmall = (HICON)LoadImageW(inst, MAKEINTRESOURCEW(1), IMAGE_ICON, smallSize, smallSize, 0);
    source = "built-in";
  }
  // Initial icons live as long as the window. Later page favicons replace them dynamically.
  SendMessageW(hwnd, WM_SETICON, ICON_BIG, (LPARAM)hBig);
  SendMessageW(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)hSmall);
  return source;
}

bool applyWindowIconPixels(HWND hwnd, const void* bgra, int width, int height, HICON& ownedBig, HICON& ownedSmall) {
  HICON hBig = loadIconPixels(bgra, width, height, GetSystemMetrics(SM_CXICON));
  HICON hSmall = loadIconPixels(bgra, width, height, GetSystemMetrics(SM_CXSMICON));
  if (!hBig || !hSmall) {
    if (hBig) DestroyIcon(hBig);
    if (hSmall) DestroyIcon(hSmall);
    return false;
  }
  SendMessageW(hwnd, WM_SETICON, ICON_BIG, (LPARAM)hBig);
  SendMessageW(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)hSmall);
  if (ownedBig) DestroyIcon(ownedBig);
  if (ownedSmall) DestroyIcon(ownedSmall);
  ownedBig = hBig;
  ownedSmall = hSmall;
  return true;
}
