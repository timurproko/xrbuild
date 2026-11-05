#pragma once
#include <string>

// Document-scoped shell capability. Navigation invalidates even same-URL reloads.
struct PageShell {
  std::string document, nonce;
  void reset() { document.clear(); nonce.clear(); }
  bool registerPage(const std::string& current, const std::string& url, const std::string& id) {
    if (current != url || id.empty() || id.size() > 128) return false;
    document = url; nonce = id;
    return true;
  }
  bool accepts(const std::string& current, const std::string& url, const std::string& id) const {
    return !nonce.empty() && current == document && url == document && id == nonce;
  }
  bool mayClose(bool fullscreen, const std::string& current, const std::string& url, const std::string& id) const {
    return fullscreen && accepts(current, url, id);
  }
};
