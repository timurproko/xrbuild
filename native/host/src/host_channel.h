#pragma once
// Loopback WebSocket server that streams binary messages to the page
// (eye poses, hands, status) and receives the page's heartbeats.
//
// Freshness over completeness: for every message type each client keeps only
// the newest unsent message, so a stalled page never receives a backlog.
// Clients must connect to ws://127.0.0.1:<port>/?token=<token>.
#include <winsock2.h>

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "xrb_plugin.h"

namespace channel {

// Wire format (little endian), common 16-byte header:
//   u8 type, u8 version, u16 reserved, u32 seq, f64 hostTimeMs (QueryPerformanceCounter clock)
// Version 2 (plugins): capabilities in the hands header, neutral input states, labelled debug images.
enum MessageType : uint8_t {
  kEyes = 1,      // f32 left[3], f32 right[3], u8 stale, u8 pad[3]
  kHands = 2,     // see encodeHands
  kStatus = 3,    // see encodeStatus
  kView = 4,      // u8 stereo (1: page is side by side, 2 x width), u8 switchable (a session runs), u16 eyeW, u16 eyeH
  kPlatform = 5,  // v2: utf8 JSON {"name": "<platform provider or empty>", "params": {...}}: the station's
                  // configure parameters, sent at start and after every configure
  kProjection = 6, // u8 orthographic: managed app camera projection, retained for later page connections
  // Debug images (--camera-view=on): the input provider's streams, one type per stream so each keeps
  // its newest frame: type = kDebugImage + stream (see encodeImage).
  kDebugImage = 10,  // 10..17: streams 0..7
  kPageFrame = 100,  // page -> host: f64 pageTimeMs, f32 fps
  kSetView = 101,    // page -> host: u8 stereo  asks for 3D (1) or 2D (0); the host answers with kView
  kSetCameras = 102, // control panel -> host: u8 enabled; stream input debug images without restarting
  kSetProjection = 103, // control panel -> host: u8 orthographic; the host answers with kProjection
};
constexpr uint8_t kVersion = 2;
constexpr int kDebugStreams = 8;

double hostTimeMs();  // QPC in milliseconds; identical in every process on this machine

struct Header {
  uint8_t type, version;
  uint16_t reserved;
  uint32_t seq;
  double hostTimeMs;
};
static_assert(sizeof(Header) == 16, "wire header must stay 16 bytes");

class Server {
 public:
  // Called on a reader thread for every binary message from a page.
  std::function<void(const uint8_t* data, size_t size)> onMessage;

  ~Server();
  // Binds 127.0.0.1 on a free port and starts accepting. Returns false on failure.
  bool start();
  void stop();
  std::string url() const;  // ws://127.0.0.1:<port>/?token=<token>
  int clientCount() const { return (int)clientCount_.load(); }

  // Queues `payload` (header excluded) as the newest message of `type` for all clients.
  // Returns the complete message (header + payload) as sent, e.g. for recording.
  std::vector<uint8_t> publish(MessageType type, const void* payload, size_t size);

 private:
  struct Client;
  void acceptLoop();
  void serve(std::shared_ptr<Client> c);
  SOCKET listen_ = INVALID_SOCKET;
  int port_ = 0;
  std::string token_;
  std::thread acceptThread_;
  std::atomic<bool> running_{false};
  std::atomic<int> clientCount_{0};
  std::mutex clientsMutex_;
  std::vector<std::shared_ptr<Client>> clients_;
  std::map<uint8_t, std::vector<uint8_t>> lastFrames_;  // newest frame per type, for pages that connect later
  std::atomic<uint32_t> seq_{0};
};

// Payloads (header excluded) for provider data.
// kHands: f64 captureTimeMs, f32 trackingHz, u8 count, u8 capabilities (XRB_CAP_*), u8 pad[2],
// then count x 456-byte XrbHand.
std::vector<uint8_t> encodeHands(const XrbHandFrame& frame);
// kStatus: u8 state (XRB_INPUT_*: starting, running, needs-setup, device-missing, failed), u8 pad[3],
// f32 trackingHz, u16 textLen, utf8 text.
std::vector<uint8_t> encodeStatus(int state, float trackingHz, const std::string& text);
// kDebugImage + stream: u8 stream, u8 format (XRB_IMAGE_*), u8 boxes, u8 labelLen, u16 width, height (sent size),
// u16 fullWidth, fullHeight (the boxes' pixel space), labelLen bytes of utf8 label,
// boxes x {f32 x, y, w, h, score}, then tightly packed pixels (Y8: 1 byte, RGB8: 3 bytes each).
// Returns false for a stream the channel has no message type for (>= kDebugStreams).
bool encodeImage(const XrbImage& image, std::vector<uint8_t>* payload, MessageType* type);

// RFC 6455 helpers, exposed for tests.
std::string acceptKey(const std::string& secWebSocketKey);
std::vector<uint8_t> encodeBinaryFrame(const uint8_t* data, size_t size);

}  // namespace channel
