#include "host_channel.h"

#include <ws2tcpip.h>
#include <windows.h>
#include <bcrypt.h>

#include <algorithm>
#include <cstring>

#include "log.h"

namespace channel {

double hostTimeMs() {
  static LARGE_INTEGER freq = [] {
    LARGE_INTEGER f;
    QueryPerformanceFrequency(&f);
    return f;
  }();
  LARGE_INTEGER now;
  QueryPerformanceCounter(&now);
  return double(now.QuadPart) * 1000.0 / double(freq.QuadPart);
}

std::vector<uint8_t> encodeHands(const XrbHandFrame& frame) {
  const uint32_t count = frame.count > 255 ? 255 : frame.count;
  std::vector<uint8_t> out(16 + count * sizeof(XrbHand));
  const float hz = frame.tracking_hz;
  memcpy(&out[0], &frame.capture_time_ms, 8);
  memcpy(&out[8], &hz, 4);
  out[12] = (uint8_t)count;
  out[13] = (uint8_t)(frame.capabilities & 0xFF);
  if (count && frame.hands) memcpy(&out[16], frame.hands, count * sizeof(XrbHand));
  return out;
}

std::vector<uint8_t> encodeStatus(int state, float trackingHz, const std::string& text) {
  const uint16_t len = (uint16_t)(std::min)(text.size(), (size_t)0xFFFF);
  std::vector<uint8_t> p(10 + len);
  p[0] = (uint8_t)state;
  memcpy(&p[4], &trackingHz, 4);
  memcpy(&p[8], &len, 2);
  memcpy(&p[10], text.data(), len);
  return p;
}

bool encodeImage(const XrbImage& image, std::vector<uint8_t>* payload, MessageType* type) {
  if (image.stream >= (uint32_t)kDebugStreams || image.width <= 0 || image.height <= 0 || !image.pixels) return false;
  if (image.format != XRB_IMAGE_Y8 && image.format != XRB_IMAGE_RGB8) return false;
  const int bpp = image.format == XRB_IMAGE_RGB8 ? 3 : 1;
  const uint32_t boxes = image.box_count > 255 ? 255 : image.box_count;
  const size_t labelLen = image.label ? (std::min)(strlen(image.label), (size_t)255) : 0;
  const size_t row = (size_t)image.width * bpp;
  payload->assign(12 + labelLen + boxes * 20 + row * image.height, 0);
  uint8_t* p = payload->data();
  p[0] = (uint8_t)image.stream;
  p[1] = (uint8_t)image.format;
  p[2] = (uint8_t)boxes;
  p[3] = (uint8_t)labelLen;
  const uint16_t dims[4] = {(uint16_t)image.width, (uint16_t)image.height,
                            (uint16_t)(image.full_width > 0 ? image.full_width : image.width),
                            (uint16_t)(image.full_height > 0 ? image.full_height : image.height)};
  memcpy(p + 4, dims, sizeof(dims));
  size_t o = 12;
  if (labelLen) memcpy(p + o, image.label, labelLen);
  o += labelLen;
  for (uint32_t i = 0; i < boxes; i++, o += 20) memcpy(p + o, &image.boxes[i], 20);
  const size_t stride = image.stride > 0 ? (size_t)image.stride : row;
  for (int y = 0; y < image.height; y++) memcpy(p + o + y * row, image.pixels + y * stride, row);
  *type = (MessageType)(kDebugImage + image.stream);
  return true;
}

static std::string base64(const uint8_t* d, size_t n) {
  static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string o;
  for (size_t i = 0; i < n; i += 3) {
    uint32_t v = d[i] << 16 | (i + 1 < n ? d[i + 1] << 8 : 0) | (i + 2 < n ? d[i + 2] : 0);
    o += t[v >> 18 & 63];
    o += t[v >> 12 & 63];
    o += i + 1 < n ? t[v >> 6 & 63] : '=';
    o += i + 2 < n ? t[v & 63] : '=';
  }
  return o;
}

std::string acceptKey(const std::string& key) {
  std::string in = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  uint8_t digest[20]{};
  BCRYPT_ALG_HANDLE alg = nullptr;
  BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA1_ALGORITHM, nullptr, 0);
  BCryptHash(alg, nullptr, 0, (PUCHAR)in.data(), (ULONG)in.size(), digest, sizeof(digest));
  BCryptCloseAlgorithmProvider(alg, 0);
  return base64(digest, sizeof(digest));
}

std::vector<uint8_t> encodeBinaryFrame(const uint8_t* data, size_t size) {
  std::vector<uint8_t> f;
  f.reserve(size + 10);
  f.push_back(0x82);  // FIN + binary
  if (size < 126) {
    f.push_back((uint8_t)size);
  } else if (size <= 0xFFFF) {
    f.push_back(126);
    f.push_back((uint8_t)(size >> 8));
    f.push_back((uint8_t)size);
  } else {
    f.push_back(127);
    for (int i = 7; i >= 0; i--) f.push_back((uint8_t)((uint64_t)size >> (i * 8)));
  }
  f.insert(f.end(), data, data + size);
  return f;
}

struct Server::Client {
  SOCKET sock = INVALID_SOCKET;
  std::mutex m;
  std::condition_variable cv;
  std::map<uint8_t, std::vector<uint8_t>> pending;  // newest frame per message type
  bool closed = false;
  std::thread writer, reader;
};

static std::string randomToken() {
  uint8_t b[16];
  BCryptGenRandom(nullptr, b, sizeof(b), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
  std::string s;
  char hex[3];
  for (uint8_t x : b) sprintf_s(hex, "%02x", x), s += hex;
  return s;
}

Server::~Server() { stop(); }

bool Server::start() {
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return false;
  listen_ = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (listen_ == INVALID_SOCKET) return false;
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);  // never reachable from the network
  addr.sin_port = 0;                               // the OS picks a free port
  if (bind(listen_, (sockaddr*)&addr, sizeof(addr)) != 0 || ::listen(listen_, 4) != 0) return false;
  int len = sizeof(addr);
  getsockname(listen_, (sockaddr*)&addr, &len);
  port_ = ntohs(addr.sin_port);
  token_ = randomToken();
  running_ = true;
  acceptThread_ = std::thread([this] { acceptLoop(); });
  LOGI("[channel] listening on 127.0.0.1:%d", port_);
  return true;
}

std::string Server::url() const { return "ws://127.0.0.1:" + std::to_string(port_) + "/?token=" + token_; }

void Server::stop() {
  if (!running_.exchange(false)) return;
  closesocket(listen_);
  if (acceptThread_.joinable()) acceptThread_.join();
  std::vector<std::shared_ptr<Client>> cs;
  {
    std::lock_guard<std::mutex> g(clientsMutex_);
    cs.swap(clients_);
  }
  for (auto& c : cs) {
    {
      std::lock_guard<std::mutex> g(c->m);
      c->closed = true;
    }
    c->cv.notify_all();
    shutdown(c->sock, SD_BOTH);
    closesocket(c->sock);
    if (c->writer.joinable()) c->writer.join();
    if (c->reader.joinable()) c->reader.join();
  }
  WSACleanup();
}

void Server::acceptLoop() {
  while (running_) {
    SOCKET s = accept(listen_, nullptr, nullptr);
    if (s == INVALID_SOCKET) continue;  // stop() closes the socket and running_ ends the loop
    auto c = std::make_shared<Client>();
    c->sock = s;
    c->reader = std::thread([this, c] { serve(c); });
    std::vector<std::shared_ptr<Client>> gone;
    {
      std::lock_guard<std::mutex> g(clientsMutex_);
      for (auto it = clients_.begin(); it != clients_.end();) {
        bool closed;
        {
          std::lock_guard<std::mutex> cg((*it)->m);
          closed = (*it)->closed;
        }
        if (closed) gone.push_back(*it), it = clients_.erase(it);
        else ++it;
      }
      clients_.push_back(c);
    }
    for (auto& old : gone) {  // a reloaded page leaves its old connection behind
      old->cv.notify_all();
      closesocket(old->sock);
      if (old->writer.joinable()) old->writer.join();
      if (old->reader.joinable()) old->reader.join();
    }
  }
}

static bool recvAll(SOCKET s, uint8_t* buf, size_t n) {
  while (n > 0) {
    int r = recv(s, (char*)buf, (int)n, 0);
    if (r <= 0) return false;
    buf += r;
    n -= (size_t)r;
  }
  return true;
}

void Server::serve(std::shared_ptr<Client> c) {
  // ---- HTTP upgrade handshake
  DWORD timeout = 3000;
  setsockopt(c->sock, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
  std::string req;
  char buf[2048];
  while (req.find("\r\n\r\n") == std::string::npos && req.size() < 8192) {
    int r = recv(c->sock, buf, sizeof(buf), 0);
    if (r <= 0) break;
    req.append(buf, r);
  }
  auto header = [&](const char* name) {
    std::string lower = req;
    for (char& ch : lower) ch = (char)tolower(ch);
    std::string key = std::string("\r\n") + name + ":";
    size_t p = lower.find(key);
    if (p == std::string::npos) return std::string();
    size_t start = req.find_first_not_of(' ', p + key.size()), end = req.find("\r\n", start);
    return req.substr(start, end - start);
  };
  std::string wsKey = header("sec-websocket-key");
  bool tokenOk = req.find("token=" + token_) != std::string::npos;
  if (wsKey.empty() || !tokenOk) {
    const char* resp = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n";
    send(c->sock, resp, (int)strlen(resp), 0);
    std::string first = req.substr(0, (std::min)(req.size(), (size_t)300));
    for (char& ch : first) if (ch == 13 || ch == 10) ch = 124;  // CR/LF -> |
    char hex[64] = "";
    for (size_t i = 0; i < req.size() && i < 8; i++) sprintf_s(hex + i * 3, 4, "%02x ", (unsigned char)req[i]);
    LOGI("[channel] rejected a connection (%s): %zu bytes [%s] %s", wsKey.empty() ? "not a WebSocket upgrade" : "bad token", req.size(), hex, first.c_str());
    closesocket(c->sock);
    c->closed = true;
    return;
  }
  std::string resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
                     acceptKey(wsKey) + "\r\n\r\n";
  send(c->sock, resp.data(), (int)resp.size(), 0);
  BOOL noDelay = TRUE;
  setsockopt(c->sock, IPPROTO_TCP, TCP_NODELAY, (const char*)&noDelay, sizeof(noDelay));
  timeout = 0;
  setsockopt(c->sock, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
  {
    // A page that connects late (or reloads) still gets the current state, e.g. the
    // tracking status that was sent once at start-up.
    std::lock_guard<std::mutex> g(clientsMutex_);
    std::lock_guard<std::mutex> cg(c->m);
    for (const auto& [type, frame] : lastFrames_) c->pending[type] = frame;
  }
  clientCount_++;
  LOGI("[channel] page connected (%d client%s)", clientCount_.load(), clientCount_.load() == 1 ? "" : "s");

  // ---- writer: sends the newest pending frame of each type
  c->writer = std::thread([c] {
    for (;;) {
      std::map<uint8_t, std::vector<uint8_t>> out;
      {
        std::unique_lock<std::mutex> g(c->m);
        c->cv.wait(g, [&] { return c->closed || !c->pending.empty(); });
        if (c->closed) return;
        out.swap(c->pending);
      }
      for (auto& [type, frame] : out)
        if (send(c->sock, (const char*)frame.data(), (int)frame.size(), 0) <= 0) {
          std::lock_guard<std::mutex> g(c->m);
          c->closed = true;
          return;
        }
    }
  });

  // ---- reader: client frames are masked; handle binary, ping and close
  for (;;) {
    uint8_t h[2];
    if (!recvAll(c->sock, h, 2)) break;
    uint8_t opcode = h[0] & 0x0F;
    uint64_t len = h[1] & 0x7F;
    if (len == 126) {
      uint8_t e[2];
      if (!recvAll(c->sock, e, 2)) break;
      len = (uint64_t)e[0] << 8 | e[1];
    } else if (len == 127) {
      uint8_t e[8];
      if (!recvAll(c->sock, e, 8)) break;
      len = 0;
      for (uint8_t b : e) len = len << 8 | b;
    }
    if (len > (1 << 20)) break;  // pages only send small control messages
    uint8_t mask[4]{};
    if ((h[1] & 0x80) && !recvAll(c->sock, mask, 4)) break;
    std::vector<uint8_t> payload((size_t)len);
    if (len && !recvAll(c->sock, payload.data(), (size_t)len)) break;
    for (size_t i = 0; i < payload.size(); i++) payload[i] ^= mask[i & 3];
    if (opcode == 0x8) break;  // close
    if (opcode == 0x9) {       // ping -> pong
      std::vector<uint8_t> pong = encodeBinaryFrame(payload.data(), payload.size());
      pong[0] = 0x8A;
      std::lock_guard<std::mutex> g(c->m);
      c->pending[0xFF] = std::move(pong);
      c->cv.notify_one();
    } else if (opcode == 0x2 && onMessage) {
      onMessage(payload.data(), payload.size());
    }
  }
  {
    std::lock_guard<std::mutex> g(c->m);
    c->closed = true;
  }
  c->cv.notify_all();
  clientCount_--;
  LOGI("[channel] page disconnected");
}

std::vector<uint8_t> Server::publish(MessageType type, const void* payload, size_t size) {
  std::vector<uint8_t> msg(sizeof(Header) + size);
  Header h{type, kVersion, 0, ++seq_, hostTimeMs()};
  memcpy(msg.data(), &h, sizeof(h));
  if (size) memcpy(msg.data() + sizeof(h), payload, size);
  std::vector<uint8_t> frame = encodeBinaryFrame(msg.data(), msg.size());
  std::lock_guard<std::mutex> g(clientsMutex_);
  lastFrames_[type] = frame;
  for (auto& c : clients_) {
    std::lock_guard<std::mutex> cg(c->m);
    if (c->closed) continue;
    c->pending[type] = frame;  // replaces any older unsent message of this type
    c->cv.notify_one();
  }
  return msg;
}

}  // namespace channel
