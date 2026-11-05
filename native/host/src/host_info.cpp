// window.__XRB_HOST__: what the page needs synchronously at start-up.
//
//   {
//     version: 1,
//     stereo: true,                       // false on a mono display (desktop) and in the 2D view
//     display: { widthM, heightM, tiltRad, pixelsW, pixelsH },
//     eye: { width, height },             // per-eye render size in CSS px (page is 2*width wide when stereo)
//     channel: { url },                   // ws://127.0.0.1:<port>/?token=<token>
//     platform: { name, params: {} },     // station runtime ("" standalone); params arrive on the channel (kPlatform)
//     hostNow(): number                   // host clock (QPC) in ms, the clock of every channel timestamp
//   }
//
// Built in the browser process as a CefDictionaryValue (CreateBrowser extra_info)
// and turned into read-only V8 objects in the renderer.
#include "cef_client.h"
#include "host_channel.h"
#include <atomic>

namespace {

class HostNowHandler : public CefV8Handler {
 public:
  bool Execute(const CefString&, CefRefPtr<CefV8Value>, const CefV8ValueList&, CefRefPtr<CefV8Value>& retval,
               CefString&) override {
    retval = CefV8Value::CreateDouble(channel::hostTimeMs());
    return true;
  }
  IMPLEMENT_REFCOUNTING(HostNowHandler);
};

class ShellHandler : public CefV8Handler {
 public:
  ShellHandler(CefRefPtr<CefFrame> frame, std::string url, std::string nonce)
      : frame_(frame), url_(std::move(url)), nonce_(std::move(nonce)) {}
  void send(const std::string& name, const std::string& style = "") {
    auto message = CefProcessMessage::Create(name);
    auto args = message->GetArgumentList();
    args->SetString(0, url_); args->SetString(1, nonce_);
    if (!style.empty()) args->SetString(2, style);
    frame_->SendProcessMessage(PID_BROWSER, message);
  }
  bool Execute(const CefString& name, CefRefPtr<CefV8Value>, const CefV8ValueList& args,
               CefRefPtr<CefV8Value>& retval, CefString&) override {
    if (name == "requestClose") send("xrb-shell-close");
    else if (name == "setCursorStyle" && args.size() == 1 && args[0]->IsString())
      send("xrb-shell-cursor", args[0]->GetStringValue().ToString());
    retval = CefV8Value::CreateUndefined();
    return true;
  }
  IMPLEMENT_REFCOUNTING(ShellHandler);
 private:
  CefRefPtr<CefFrame> frame_;
  std::string url_, nonce_;
};

constexpr auto kFrozen = static_cast<cef_v8_propertyattribute_t>(V8_PROPERTY_ATTRIBUTE_READONLY | V8_PROPERTY_ATTRIBUTE_DONTDELETE);

CefRefPtr<CefV8Value> toV8(CefRefPtr<CefDictionaryValue> dict) {
  CefRefPtr<CefV8Value> obj = CefV8Value::CreateObject(nullptr, nullptr);
  CefDictionaryValue::KeyList keys;
  dict->GetKeys(keys);
  for (const CefString& k : keys) {
    CefRefPtr<CefV8Value> v;
    switch (dict->GetType(k)) {
      case VTYPE_BOOL: v = CefV8Value::CreateBool(dict->GetBool(k)); break;
      case VTYPE_INT: v = CefV8Value::CreateInt(dict->GetInt(k)); break;
      case VTYPE_DOUBLE: v = CefV8Value::CreateDouble(dict->GetDouble(k)); break;
      case VTYPE_STRING: v = CefV8Value::CreateString(dict->GetString(k)); break;
      case VTYPE_DICTIONARY: v = toV8(dict->GetDictionary(k)); break;
      default: continue;
    }
    obj->SetValue(k, v, kFrozen);
  }
  return obj;
}

}  // namespace

void HostRenderer::OnContextCreated(CefRefPtr<CefBrowser>, CefRefPtr<CefFrame> frame, CefRefPtr<CefV8Context> context) {
  if (!info_ || !frame->IsMain()) return;
  CefRefPtr<CefV8Value> host = toV8(info_);
  host->SetValue("hostNow", CefV8Value::CreateFunction("hostNow", new HostNowHandler), kFrozen);
  static std::atomic<unsigned long long> sequence{0};
  CefRefPtr<ShellHandler> shell = new ShellHandler(frame, frame->GetURL().ToString(),
      std::to_string(channel::hostTimeMs()) + "-" + std::to_string(++sequence));
  shell->send("xrb-shell-register");
  host->SetValue("requestClose", CefV8Value::CreateFunction("requestClose", shell), kFrozen);
  host->SetValue("setCursorStyle", CefV8Value::CreateFunction("setCursorStyle", shell), kFrozen);
  context->GetGlobal()->SetValue("__XRB_HOST__", host, kFrozen);
  // Escape belongs to SDK return navigation only. No automatic session-close fallback.
}
