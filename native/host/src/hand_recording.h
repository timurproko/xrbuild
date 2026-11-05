#pragma once
// .hands files: a recording of the host channel's HANDS (and STATUS) messages,
// for offline tests and later replay into a browser.
//
//   8 bytes  magic "WBHANDS1"
//   repeated: u32 length (little endian), then one complete channel message
//             (16-byte header + payload) of that length
#include <cstdint>
#include <cstdio>
#include <mutex>
#include <string>
#include <vector>

class HandRecorder {
 public:
  ~HandRecorder() { close(); }
  bool open(const std::wstring& path);
  void write(const uint8_t* message, size_t size);  // thread-safe
  void close();
  bool isOpen() const { return f_ != nullptr; }

 private:
  FILE* f_ = nullptr;
  std::mutex m_;
};

// Reads every message of a .hands file. Returns false on a bad file.
bool readHandRecording(const std::wstring& path, std::vector<std::vector<uint8_t>>* messages);
