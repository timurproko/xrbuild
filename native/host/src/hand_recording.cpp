#include "hand_recording.h"

#include <cstring>

static const char kMagic[8] = {'W', 'B', 'H', 'A', 'N', 'D', 'S', '1'};

bool HandRecorder::open(const std::wstring& path) {
  close();
  if (_wfopen_s(&f_, path.c_str(), L"wb") != 0 || !f_) return false;
  fwrite(kMagic, 1, sizeof(kMagic), f_);
  return true;
}

void HandRecorder::write(const uint8_t* message, size_t size) {
  std::lock_guard<std::mutex> g(m_);
  if (!f_) return;
  uint32_t len = (uint32_t)size;
  fwrite(&len, 4, 1, f_);
  fwrite(message, 1, size, f_);
}

void HandRecorder::close() {
  std::lock_guard<std::mutex> g(m_);
  if (f_) fclose(f_);
  f_ = nullptr;
}

bool readHandRecording(const std::wstring& path, std::vector<std::vector<uint8_t>>* messages) {
  FILE* f = nullptr;
  if (_wfopen_s(&f, path.c_str(), L"rb") != 0 || !f) return false;
  char magic[8];
  bool ok = fread(magic, 1, 8, f) == 8 && memcmp(magic, kMagic, 8) == 0;
  while (ok) {
    uint32_t len = 0;
    if (fread(&len, 4, 1, f) != 1) break;
    if (len > (1u << 20)) {
      ok = false;
      break;
    }
    std::vector<uint8_t> m(len);
    if (fread(m.data(), 1, len, f) != len) {
      ok = false;
      break;
    }
    messages->push_back(std::move(m));
  }
  fclose(f);
  return ok;
}
