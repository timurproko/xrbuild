#pragma once
// Serves a local folder as https://app.local/ through a CEF scheme handler.
// A real https origin (not file://) gives the page a secure, same-origin
// context: ES module workers, same-origin iframes and relative URLs all work,
// and nothing touches the network.
#include <string>

#include "include/cef_scheme.h"

constexpr const char* kAppOrigin = "https://app.local";

// Maps a request path to a file under root. Returns false for anything that
// would escape root (.., absolute paths, drive letters, NUL). Exposed for tests.
bool resolveAppPath(const std::wstring& root, const std::string& urlPath, std::wstring* file);

// Registers the handler for https://app.local/ (call after CefInitialize).
void registerAppScheme(const std::wstring& root);
