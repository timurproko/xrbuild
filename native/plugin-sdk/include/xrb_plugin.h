/* XR Build plugin ABI: the whole contract between the core host and its plugins.
 *
 * A plugin is a DLL in <host>\plugins\<name>\ named xrb_*.dll. It exports
 *   xrb_plugin_query               always: ABI version, role, name
 *   xrb_input_create               role XRB_ROLE_INPUT    (hands)
 *   xrb_display_create             role XRB_ROLE_DISPLAY  (3D output, eye poses)
 *   xrb_platform_create            role XRB_ROLE_PLATFORM (station runtime)
 *
 * Rules (the host and a plugin may use different CRTs and compilers):
 *   - plain C, __cdecl, POD structs only; no C++ object, std::string or allocation crosses the boundary
 *   - pointers passed in a call are borrowed: valid only during that call; the side that allocates frees
 *   - every struct and function table starts with `size` (its sizeof as the writer knows it). A newer minor
 *     version only appends fields, so a reader checks `size` before touching a field added later
 *   - strings are UTF-8 and NUL terminated
 *   - host callbacks are thread-safe and may be called from any plugin thread
 *
 * Coordinates: the panel frame, metres. Origin at the panel centre, +X right, +Y up along the panel
 * surface, +Z toward the viewer. Times: the host clock (now_ms), QueryPerformanceCounter milliseconds,
 * identical in every process on the machine.
 */
#ifndef XRB_PLUGIN_H
#define XRB_PLUGIN_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define XRB_ABI_MAJOR 1
#define XRB_ABI_MINOR 0

#define XRB_CALL __cdecl
#ifdef XRB_PLUGIN_BUILD
#define XRB_EXPORT __declspec(dllexport)
#else
#define XRB_EXPORT
#endif

#if defined(__cplusplus)
#define XRB_STATIC_ASSERT(cond, msg) static_assert(cond, msg)
#elif defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
#define XRB_STATIC_ASSERT(cond, msg) _Static_assert(cond, msg)
#else /* C89/C99 (MSVC's default C mode): a negative array size fails the build */
#define XRB_STATIC_ASSERT(cond, msg) typedef char xrb_static_assert_##__LINE__[(cond) ? 1 : -1]
#endif

/* ---- identity ------------------------------------------------------------------------------------ */

#define XRB_ROLE_INPUT 1
#define XRB_ROLE_DISPLAY 2
#define XRB_ROLE_PLATFORM 3

typedef struct XrbPluginInfo {
  uint32_t size;          /* set by the host: sizeof(XrbPluginInfo) it knows; the plugin fills fields up to it */
  uint16_t abi_major;     /* XRB_ABI_MAJOR the plugin was built with */
  uint16_t abi_minor;
  int32_t role;           /* XRB_ROLE_* */
  char name[32];          /* selection name, e.g. "tracker": --input=tracker */
  char version[32];       /* the plugin's own version, free form */
  char description[128];
} XrbPluginInfo;

/* Fills `info`. Returns 0. Must not start threads, open devices or load other DLLs. */
typedef int32_t(XRB_CALL* XrbPluginQueryFn)(XrbPluginInfo* info);

/* ---- hands (input) ------------------------------------------------------------------------------- */

#define XRB_NUM_KEYPOINTS 21 /* common hand landmark order: 0 wrist, thumb 1-4, index 5-8, middle 9-12, ring 13-16, pinky 17-20 */

/* What a provider fills in beyond keypoints. The SDK derives what is missing from the keypoints. */
#define XRB_CAP_PINCH 0x01u /* XrbHand.pinch and pinch_positions */
#define XRB_CAP_GRAB 0x02u  /* XRB_HAND_GRABBING and grab_position */
#define XRB_CAP_PALM 0x04u  /* XrbHand.palm */

#define XRB_HAND_GRABBING 0x01u /* XrbHand.flags */

/* One hand, exactly as it goes on the host channel (HANDS message). */
#pragma pack(push, 1)
typedef struct XrbHand {
  int32_t id;                               /* stable while the hand is tracked */
  int8_t handedness;                        /* 0 left, 1 right, -1 unknown */
  uint8_t flags;                            /* XRB_HAND_* */
  uint8_t pinch[4];                         /* index, middle, ring, pinky: 1 = pinching */
  uint16_t reserved;
  float keypoints[XRB_NUM_KEYPOINTS * 4];   /* x, y, z, confidence (0..1) */
  float pinch_positions[4 * 3];
  float grab_position[3];
  float palm[4 * 3];                        /* wrist, palm normal, palm right, palm forward */
} XrbHand;
#pragma pack(pop)
XRB_STATIC_ASSERT(sizeof(XrbHand) == 456, "XrbHand is the HANDS wire layout");

typedef struct XrbHandFrame {
  uint32_t size;
  uint32_t capabilities;   /* XRB_CAP_* valid for every hand of this frame */
  double capture_time_ms;  /* host clock when the newest sensor data of this result arrived */
  float tracking_hz;       /* results per second, averaged over the last second */
  uint32_t count;
  const XrbHand* hands;
} XrbHandFrame;

/* Provider status (same numbers as the channel's STATUS message). */
#define XRB_INPUT_STARTING 0
#define XRB_INPUT_RUNNING 1
#define XRB_INPUT_NEEDS_SETUP 2    /* e.g. calibration missing */
#define XRB_INPUT_DEVICE_MISSING 3
#define XRB_INPUT_FAILED 4

/* Debug image (e.g. a camera frame with detection boxes), shown by tools such as the control panel. */
#define XRB_IMAGE_Y8 1
#define XRB_IMAGE_RGB8 2

typedef struct XrbBox {
  float x, y, w, h, score; /* in full-size pixels */
} XrbBox;

typedef struct XrbImage {
  uint32_t size;
  uint32_t stream;          /* provider's stream number, 0..7; each keeps only its newest image */
  const char* label;        /* e.g. "Camera 1 IR" */
  int32_t format;           /* XRB_IMAGE_* */
  int32_t width, height;    /* pixels sent */
  int32_t full_width;       /* size the boxes refer to */
  int32_t full_height;
  int32_t stride;           /* bytes per row of `pixels` */
  const uint8_t* pixels;
  uint32_t box_count;
  const XrbBox* boxes;
} XrbImage;

/* ---- display ------------------------------------------------------------------------------------- */

#define XRB_LAYOUT_SBS 1  /* page is 2 x eye width, left eye in the left half */
#define XRB_LAYOUT_MONO 2

#define XRB_PRESENT_WINDOW 1  /* the host presents full-screen on the display's monitor; its runtime takes it from there */

typedef struct XrbDisplayInfo {
  uint32_t size;
  float width_m, height_m;  /* visible panel area */
  float tilt_rad;           /* panel tilt from vertical, informational */
  int32_t eye_width;        /* per-eye page resolution; 0 = the window's client size */
  int32_t eye_height;
  int32_t has_monitor;      /* monitor_* is valid */
  int32_t monitor_left, monitor_top, monitor_right, monitor_bottom; /* virtual-screen pixels */
  int32_t fullscreen;       /* borderless full-screen on the monitor, otherwise a window */
  int32_t layout;           /* XRB_LAYOUT_* when stereo is on */
  int32_t can_stereo;       /* 0: mono only */
  int32_t can_switch;       /* stereo can be switched on and off while running */
  int32_t presentation;     /* XRB_PRESENT_* */
  int32_t mono_left_half;   /* with stereo off the runtime shows the frame's LEFT half stretched to full width:
                               the host draws the mono page into the left half */
} XrbDisplayInfo;

typedef struct XrbEyes {
  uint32_t size;
  float left[3], right[3];
  int32_t stale; /* no current pose: the values are the last valid ones */
} XrbEyes;

/* ---- platform ------------------------------------------------------------------------------------ */

#define XRB_LIFECYCLE_CONFIGURE 1 /* json: {"key":"value",...} station parameters */
#define XRB_LIFECYCLE_PLAY 2
#define XRB_LIFECYCLE_STOP 3
#define XRB_LIFECYCLE_EXIT 4
#define XRB_LIFECYCLE_LOST 5      /* the station connection is gone */

/* ---- host callbacks ------------------------------------------------------------------------------ */

#define XRB_LOG_DEBUG 0
#define XRB_LOG_INFO 1
#define XRB_LOG_WARN 2
#define XRB_LOG_ERROR 3

typedef struct XrbHost {
  uint32_t size;
  void* ctx; /* pass back as the first argument of every callback */
  void(XRB_CALL* log)(void* ctx, int32_t level, const char* text);
  double(XRB_CALL* now_ms)(void* ctx);
  /* input */
  void(XRB_CALL* publish_hands)(void* ctx, const XrbHandFrame* frame);
  void(XRB_CALL* set_input_status)(void* ctx, int32_t state, float tracking_hz, const char* text);
  void(XRB_CALL* publish_image)(void* ctx, const XrbImage* image);
  /* platform */
  void(XRB_CALL* lifecycle)(void* ctx, int32_t event, const char* json);
} XrbHost;

/* ---- plugin function tables ----------------------------------------------------------------------
 * Every create function takes the host callbacks and the plugin's configuration as one JSON object
 * (project manifest "plugins.<name>" merged with --plugin.<name>.<key>=value, plus "xrb": {"pluginDir",
 * "dataDir", "exeDir", "debugImages"}). It returns an opaque handle (NULL on failure, after logging why)
 * and sets *api. `host` stays valid until destroy. last_error returns a borrowed string valid until the
 * next call into the plugin. Calls returning int32_t return 0 on success.
 */

typedef struct XrbInputApi {
  uint32_t size;
  const char*(XRB_CALL* last_error)(void* self);
  /* Opens devices and starts delivering through publish_hands / set_input_status (own threads). */
  int32_t(XRB_CALL* start)(void* self);
  /* Stops all threads and releases devices; no callback after it returns. */
  void(XRB_CALL* stop)(void* self);
  void(XRB_CALL* destroy)(void* self);
} XrbInputApi;

typedef struct XrbDisplayApi {
  uint32_t size;
  const char*(XRB_CALL* last_error)(void* self);
  /* Finds the device and its runtime and fills `info`, before the host creates its window. */
  int32_t(XRB_CALL* open)(void* self, XrbDisplayInfo* info);
  /* The window exists on the display's monitor: start output, stereo on or off. A display that learns
     its resolution or geometry only once output runs updates `info` here (the host reads it after). */
  int32_t(XRB_CALL* start)(void* self, int32_t stereo, XrbDisplayInfo* info);
  /* Once per presented frame, from the render thread. */
  void(XRB_CALL* poll_eyes)(void* self, XrbEyes* eyes);
  int32_t(XRB_CALL* set_stereo)(void* self, int32_t on);
  /* Exit, part 1: returns how many black frames the host presents before end(). */
  uint32_t(XRB_CALL* begin_exit)(void* self);
  /* Exit, part 2: returns how long (ms) the host keeps presenting black before closing the window. */
  uint32_t(XRB_CALL* end)(void* self);
  void(XRB_CALL* destroy)(void* self);
} XrbDisplayApi;

typedef struct XrbPlatformApi {
  uint32_t size;
  const char*(XRB_CALL* last_error)(void* self);
  /* Connects to the station. Nonzero: no station answered (the app runs standalone). */
  int32_t(XRB_CALL* start)(void* self);
  void(XRB_CALL* stop)(void* self);
  void(XRB_CALL* destroy)(void* self);
} XrbPlatformApi;

typedef void*(XRB_CALL* XrbInputCreateFn)(const XrbHost* host, const char* config_json, const XrbInputApi** api);
typedef void*(XRB_CALL* XrbDisplayCreateFn)(const XrbHost* host, const char* config_json, const XrbDisplayApi** api);
typedef void*(XRB_CALL* XrbPlatformCreateFn)(const XrbHost* host, const char* config_json, const XrbPlatformApi** api);

#ifdef XRB_PLUGIN_BUILD
XRB_EXPORT int32_t XRB_CALL xrb_plugin_query(XrbPluginInfo* info);
#endif

#ifdef __cplusplus
}
#endif

#endif /* XRB_PLUGIN_H */
