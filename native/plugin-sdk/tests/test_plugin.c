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

#ifndef TP_ABI_MAJOR
#define TP_ABI_MAJOR XRB_ABI_MAJOR
#endif

typedef struct TestPlugin {
  const XrbHost* host;
  int fail_start;
  int stereo;
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
  return p;
}

static const char* XRB_CALL last_error(void* self) { return ((TestPlugin*)self)->fail_start ? "test failure on request" : ""; }
static void XRB_CALL destroy(void* self) { free(self); }
static void XRB_CALL stop(void* self) { (void)self; }

#if TP_ROLE == XRB_ROLE_INPUT
static int32_t XRB_CALL input_start(void* self) {
  TestPlugin* p = (TestPlugin*)self;
  if (p->fail_start) return 1;
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
  frame.count = 1;
  frame.hands = &hand;
  p->host->set_input_status(p->host->ctx, XRB_INPUT_RUNNING, 60.0f, "test running");
  p->host->publish_hands(p->host->ctx, &frame);
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
