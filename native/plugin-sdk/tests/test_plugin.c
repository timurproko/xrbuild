/* A plugin for host tests, written in C and built with the DLL CRT (/MD) while the host uses the
 * static one (/MT): it proves the ABI needs neither a shared CRT nor C++.
 * Built several times with TP_ROLE / TP_NAME / TP_ABI_MAJOR. Behaviour comes from its config:
 *   "failCreate":true  create returns NULL     "failStart":true  start (open, for a display) fails
 * An input publishes one status and one frame with one hand (id 7) from start(); a platform sends
 * CONFIGURE {"k":"v"} from start(); a display reports 640x360 per eye, side by side, switchable. */
#define XRB_PLUGIN_BUILD
#include "xrb_plugin.h"

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <windows.h>

#ifndef TP_ABI_MAJOR
#define TP_ABI_MAJOR XRB_ABI_MAJOR
#endif

typedef struct TestPlugin {
  const XrbHost* host;
  int fail_start;
  int stereo;
  int empty, malformed, hang_start, hang_stop, hang_destroy, test_hold;
  int invalid_confidence, sporadic, mixed, nan_joint, stall, stall_recover, alternate_blocks;
  volatile LONG running;
  HANDLE thread;
} TestPlugin;

XRB_EXPORT int32_t XRB_CALL xrb_plugin_query(XrbPluginInfo* info) {
  info->abi_major = TP_ABI_MAJOR;
  info->abi_minor = XRB_ABI_MINOR;
  info->role = TP_ROLE;
  strncpy(info->name, TP_NAME, sizeof(info->name) - 1);
  strncpy(info->version, "0.0.1", sizeof(info->version) - 1);
  strncpy(info->description, "host test plugin", sizeof(info->description) - 1);
  return 0;
}

static TestPlugin* make(const XrbHost* host, const char* config) {
  if (config && strstr(config, "\"failCreate\":true")) {
    host->log(host->ctx, XRB_LOG_ERROR, "test plugin: create failed on request");
    return NULL;
  }
  TestPlugin* p = (TestPlugin*)calloc(1, sizeof(TestPlugin));
  p->host = host;
  p->fail_start = config && strstr(config, "\"failStart\":true") != NULL;
  p->empty = config && strstr(config, "\"empty\":true") != NULL;
  p->malformed = config && strstr(config, "\"malformed\":true") != NULL;
  p->hang_start = config && strstr(config, "\"hangStart\":true") != NULL;
  p->hang_stop = config && strstr(config, "\"hangStop\":true") != NULL;
  p->hang_destroy = config && strstr(config, "\"hangDestroy\":true") != NULL;
  p->test_hold = config && strstr(config, "\"testHold\":true") != NULL;
  p->invalid_confidence = config && strstr(config, "\"invalidConfidence\":true") != NULL;
  p->nan_joint = config && strstr(config, "\"nanJoint\":true") != NULL;
  p->sporadic = config && strstr(config, "\"sporadic\":true") != NULL;
  p->mixed = config && strstr(config, "\"mixed\":true") != NULL;
  p->stall = config && strstr(config, "\"stall\":true") != NULL;
  p->stall_recover = config && strstr(config, "\"stallRecover\":true") != NULL;
  p->alternate_blocks = config && strstr(config, "\"alternateBlocks\":true") != NULL;
  return p;
}

static const char* XRB_CALL last_error(void* self) { return ((TestPlugin*)self)->fail_start ? "test failure on request" : ""; }
static void XRB_CALL stop(void* self) {
  TestPlugin* p = (TestPlugin*)self;
  if (p->hang_stop) Sleep(INFINITE);
  InterlockedExchange(&p->running, 0);
  if (p->thread) { WaitForSingleObject(p->thread, INFINITE); CloseHandle(p->thread); p->thread = NULL; }
}
static void XRB_CALL destroy(void* self) { if (((TestPlugin*)self)->hang_destroy) Sleep(INFINITE); stop(self); free(self); }

#if TP_ROLE == XRB_ROLE_INPUT
/* Explicit test-only continuous SDK gesture fixture, never a product source or automatic fallback. */
static DWORD WINAPI input_hold(void* self) {
  TestPlugin* p = (TestPlugin*)self;
  unsigned tick = 0;
  while (InterlockedCompareExchange(&p->running, 1, 1)) {
    XrbHand hands[2]; XrbHandFrame frame; int h, k;
    memset(hands, 0, sizeof(hands)); memset(&frame, 0, sizeof(frame));
    for (h = 0; h < 2; h++) {
      const float x = h ? .01f * sinf((float)tick * .05f) : 0.f; /* both hands at the viewer's centre object */
      hands[h].id = 7 + h; hands[h].handedness = (int8_t)h; hands[h].flags = XRB_HAND_GRABBING;
      for (k = 0; k < XRB_NUM_KEYPOINTS; k++) { hands[h].keypoints[k * 4] = x; hands[h].keypoints[k * 4 + 1] = 0.f; hands[h].keypoints[k * 4 + 2] = 0.f; hands[h].keypoints[k * 4 + 3] = .9f; }
    }
    frame.size = sizeof(frame); frame.capabilities = XRB_CAP_GRAB; frame.capture_time_ms = p->host->now_ms(p->host->ctx); frame.tracking_hz = 60;
    if (!p->sporadic || (p->alternate_blocks ? tick % 20 < 10 : tick % 3 == 0)) for (h = 0; h < (p->mixed ? 1 : 2); h++) {
      if (p->invalid_confidence) hands[h].keypoints[8 * 4 + 3] = 2.f;
      if (p->nan_joint) hands[h].keypoints[8 * 4] = NAN;
    }
    frame.count = p->malformed ? 256 : p->empty ? 0 : 2; frame.hands = p->empty ? NULL : hands;
    if (!(p->stall && tick >= 90) && !(p->stall_recover && tick >= 90 && tick < 150)) p->host->publish_hands(p->host->ctx, &frame);
    tick++; Sleep(16);
  }
  return 0;
}
static int32_t XRB_CALL input_start(void* self) {
  TestPlugin* p = (TestPlugin*)self;
  if (p->hang_start) Sleep(INFINITE);
  if (p->fail_start) return 1;
  if (p->test_hold || p->malformed || p->invalid_confidence || p->nan_joint) { InterlockedExchange(&p->running, 1); p->thread = CreateThread(NULL, 0, input_hold, p, 0, NULL); return p->thread ? 0 : 1; }
  XrbHand hand;
  XrbHandFrame frame;
  memset(&hand, 0, sizeof(hand));
  hand.id = 7;
  hand.handedness = 1;
  hand.keypoints[0] = 0.1f;
  memset(&frame, 0, sizeof(frame));
  frame.size = sizeof(frame);
  frame.capabilities = XRB_CAP_PINCH;
  frame.capture_time_ms = p->host->now_ms(p->host->ctx);
  frame.tracking_hz = 60.0f;
  frame.count = p->malformed ? 256 : p->empty ? 0 : 1;
  frame.hands = p->empty ? NULL : &hand;
  p->host->set_input_status(p->host->ctx, XRB_INPUT_RUNNING, 60.0f, "test running");
  p->host->publish_hands(p->host->ctx, &frame);
  if (p->malformed) { p->host->publish_hands(p->host->ctx, &frame); p->host->publish_hands(p->host->ctx, &frame); }
  return 0;
}
static const XrbInputApi kInput = {sizeof(XrbInputApi), last_error, input_start, stop, destroy};
XRB_EXPORT void* XRB_CALL xrb_input_create(const XrbHost* host, const char* config, const XrbInputApi** api) {
  *api = &kInput;
  return make(host, config);
}
#endif

#if TP_ROLE == XRB_ROLE_DISPLAY
static int32_t XRB_CALL display_open(void* self, XrbDisplayInfo* info) {
  TestPlugin* p = (TestPlugin*)self;
  if (p->fail_start) return 1;
  info->width_m = 0.6f;
  info->height_m = 0.34f;
  info->eye_width = 640;
  info->eye_height = 360;
  info->layout = XRB_LAYOUT_SBS;
  info->can_stereo = 1;
  info->can_switch = 1;
  info->presentation = XRB_PRESENT_WINDOW;
  return 0;
}
static int32_t XRB_CALL display_start(void* self, int32_t stereo, XrbDisplayInfo* info) {
  (void)info;
  ((TestPlugin*)self)->stereo = stereo;
  return 0;
}
static void XRB_CALL display_poll(void* self, XrbEyes* eyes) {
  (void)self;
  eyes->left[0] = -0.03f;
  eyes->right[0] = 0.03f;
  eyes->left[2] = eyes->right[2] = 0.5f;
  eyes->stale = 0;
}
static int32_t XRB_CALL display_set_stereo(void* self, int32_t on) {
  ((TestPlugin*)self)->stereo = on;
  return 0;
}
static uint32_t XRB_CALL display_begin_exit(void* self) { (void)self; return 3; }
static uint32_t XRB_CALL display_end(void* self) { (void)self; return 0; }
static const XrbDisplayApi kDisplay = {sizeof(XrbDisplayApi), last_error, display_open, display_start, display_poll,
                                       display_set_stereo, display_begin_exit, display_end, destroy};
XRB_EXPORT void* XRB_CALL xrb_display_create(const XrbHost* host, const char* config, const XrbDisplayApi** api) {
  *api = &kDisplay;
  return make(host, config);
}
#endif

#if TP_ROLE == XRB_ROLE_PLATFORM
static int32_t XRB_CALL platform_start(void* self) {
  TestPlugin* p = (TestPlugin*)self;
  if (p->fail_start) return 1;
  p->host->lifecycle(p->host->ctx, XRB_LIFECYCLE_CONFIGURE, "{\"k\":\"v\"}");
  return 0;
}
static const XrbPlatformApi kPlatform = {sizeof(XrbPlatformApi), last_error, platform_start, stop, destroy};
XRB_EXPORT void* XRB_CALL xrb_platform_create(const XrbHost* host, const char* config, const XrbPlatformApi** api) {
  *api = &kPlatform;
  return make(host, config);
}
#endif
