#pragma once
// The app's window/taskbar icon. Same source as the package thumbnail: a package ships its icon PNG
// as app-icon.png next to the exe; without one the exe's built-in icon (resource 1) is used.
#include <windows.h>

#include <string>

// Icon of `size` x `size` pixels from a PNG (or any WIC-readable image) file; nullptr on failure.
HICON loadIconFile(const std::wstring& path, int size);

// Icon of `size` x `size` pixels from premultiplied BGRA source pixels.
HICON loadIconPixels(const void* bgra, int width, int height, int size);

// Sets the big and small window icons: from `path` if it loads, else the built-in icon.
// Returns the source used, for the log.
std::string applyWindowIcon(HWND hwnd, const std::wstring& path);

// Replaces the window icons from a page favicon and destroys the previous dynamically owned pair.
bool applyWindowIconPixels(HWND hwnd, const void* bgra, int width, int height, HICON& ownedBig, HICON& ownedSmall);
