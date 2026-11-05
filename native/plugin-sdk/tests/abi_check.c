/* Compiled as C (not C++): proves xrb_plugin.h is a plain C header and pins the layouts that cross
 * the plugin boundary. host-tests calls xrb_abi_check_c() and compares with the C++ view. */
#include "xrb_plugin.h"

_Static_assert(sizeof(XrbHand) == 456, "XrbHand layout");
_Static_assert(offsetof(XrbHand, keypoints) == 12, "XrbHand keypoints offset");
_Static_assert(offsetof(XrbHand, pinch_positions) == 12 + XRB_NUM_KEYPOINTS * 16, "XrbHand pinch offset");

size_t xrb_abi_check_c(int which) {
  switch (which) {
    case 0: return sizeof(XrbHand);
    case 1: return sizeof(XrbHandFrame);
    case 2: return sizeof(XrbImage);
    case 3: return sizeof(XrbDisplayInfo);
    case 4: return sizeof(XrbEyes);
    case 5: return sizeof(XrbHost);
    case 6: return sizeof(XrbInputApi);
    case 7: return sizeof(XrbDisplayApi);
    case 8: return sizeof(XrbPlatformApi);
    case 9: return sizeof(XrbPluginInfo);
    default: return 0;
  }
}
