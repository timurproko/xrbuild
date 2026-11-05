#include "app_scheme.h"

#include <windows.h>

#include "include/cef_parser.h"
#include "include/cef_stream.h"
#include "include/wrapper/cef_stream_resource_handler.h"
#include "log.h"

bool resolveAppPath(const std::wstring& root, const std::string& urlPath, std::wstring* file) {
  // Path only: drop query and fragment, then percent-decode.
  std::string p = urlPath.substr(0, urlPath.find_first_of("?#"));
  p = CefURIDecode(p, true, static_cast<cef_uri_unescape_rule_t>(UU_SPACES | UU_URL_SPECIAL_CHARS_EXCEPT_PATH_SEPARATORS))
          .ToString();
  if (p.empty() || p.back() == '/') p += "index.html";
  std::wstring rel;
  size_t start = 0;
  while (start <= p.size()) {
    size_t end = p.find('/', start);
    if (end == std::string::npos) end = p.size();
    std::string seg = p.substr(start, end - start);
    start = end + 1;
    if (seg.empty() || seg == ".") continue;
    if (seg == ".." || seg.find_first_of("\\:") != std::string::npos || seg.find('\0') != std::string::npos) return false;
    rel += L"\\" + widen(seg);
  }
  if (rel.empty()) return false;
  *file = root + rel;
  return true;
}

namespace {

std::string mimeFor(const std::wstring& file) {
  size_t dot = file.find_last_of(L'.');
  std::string ext = dot == std::wstring::npos ? "" : narrow(file.substr(dot + 1));
  for (char& c : ext) c = (char)tolower(c);
  // CEF's table misses or varies on these; module scripts need a JS MIME type.
  if (ext == "js" || ext == "mjs") return "text/javascript";
  if (ext == "wasm") return "application/wasm";
  if (ext == "json") return "application/json";
  if (ext == "glb") return "model/gltf-binary";
  if (ext == "gltf") return "model/gltf+json";
  std::string m = CefGetMimeType(ext).ToString();
  return m.empty() ? "application/octet-stream" : m;
}

class AppSchemeFactory : public CefSchemeHandlerFactory {
 public:
  explicit AppSchemeFactory(std::wstring root) : root_(std::move(root)) {}
  CefRefPtr<CefResourceHandler> Create(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame>, const CefString&,
                                       CefRefPtr<CefRequest> request) override {
    CefURLParts parts;
    CefParseURL(request->GetURL(), parts);
    std::string path = CefString(&parts.path).ToString();
    std::wstring file;
    CefResponse::HeaderMap headers;
    headers.insert({"Access-Control-Allow-Origin", "*"});
    headers.insert({"Cache-Control", "no-cache"});
    CefRefPtr<CefStreamReader> stream;
    if (resolveAppPath(root_, path, &file) && GetFileAttributesW(file.c_str()) != INVALID_FILE_ATTRIBUTES)
      stream = CefStreamReader::CreateForFile(file);
    if (!stream) {
      LOGI("[app] 404 %s", path.c_str());
      static const char kNotFound[] = "not found";
      return new CefStreamResourceHandler(404, "Not Found", "text/plain", headers,
                                          CefStreamReader::CreateForData((void*)kNotFound, sizeof(kNotFound) - 1));
    }
    return new CefStreamResourceHandler(200, "OK", mimeFor(file), headers, stream);
  }
  IMPLEMENT_REFCOUNTING(AppSchemeFactory);

 private:
  std::wstring root_;
};

}  // namespace

void registerAppScheme(const std::wstring& root) {
  CefRegisterSchemeHandlerFactory("https", "app.local", new AppSchemeFactory(root));
  LOGI("[app] serving %s at %s/", narrow(root).c_str(), kAppOrigin);
}
