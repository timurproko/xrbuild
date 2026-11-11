cmake_minimum_required(VERSION 3.21)
project(xrb_host LANGUAGES C CXX)

# XR Build host: shows a web app on a 3D display (or a window), with hands, through plugins.
# Third-party binaries come from third_party/ (run `pnpm fetch-deps` first).

set(XRB_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." CACHE PATH "Repository root")
set(XRB_THIRD_PARTY "${XRB_ROOT}/third_party" CACHE PATH "Core native dependency root")
set(THIRD_PARTY "${XRB_THIRD_PARTY}")
set(CEF_ROOT "${THIRD_PARTY}/cef")
if(NOT EXISTS "${CEF_ROOT}/cmake/FindCEF.cmake")
  message(FATAL_ERROR "CEF not found in ${CEF_ROOT} - run `pnpm fetch-deps` at the repo root")
endif()

list(APPEND CMAKE_MODULE_PATH "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)
add_subdirectory(${CEF_LIBCEF_DLL_WRAPPER_PATH} libcef_dll_wrapper)
ADD_LOGICAL_TARGET("libcef_lib" "${CEF_LIB_DEBUG}" "${CEF_LIB_RELEASE}")
# The plugin ABI (one C header): the only thing the core shares with its plugins.
set(XRB_PLUGIN_SDK "${CMAKE_CURRENT_SOURCE_DIR}/../plugin-sdk")

set(HOST_SOURCES
  src/main.cpp
  src/log.cpp
  src/args.cpp
  src/presenter.cpp
  src/app_scheme.cpp
  src/host_channel.cpp
  src/host_info.cpp
  src/app_icon.cpp
  src/status_report.cpp
  src/plugins.cpp
  src/providers.cpp
  src/builtin_providers.cpp
  src/builtin_inputs.cpp
  src/host_config.cpp
  src/hand_recording.cpp
)
add_executable(xrb-host ${HOST_SOURCES} src/host.manifest src/app.rc)
SET_EXECUTABLE_TARGET_PROPERTIES(xrb-host)
target_compile_features(xrb-host PRIVATE cxx_std_20)
target_compile_definitions(xrb-host PRIVATE UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN
  JSON_DIAGNOSTICS=1)  # own nlohmann namespace: see src/json_util.h
target_include_directories(xrb-host PRIVATE src "${XRB_PLUGIN_SDK}/include" "${THIRD_PARTY}/nlohmann")
add_dependencies(xrb-host libcef_dll_wrapper)
target_link_libraries(xrb-host PRIVATE
  libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS}
  d3d11 dxgi d3dcompiler ws2_32 bcrypt windowscodecs ole32 dxgi)
# GUI subsystem (entry still main()): a console exe opens a terminal window for itself and for
# every CEF sub-process (same exe) when a station agent starts it. Logs go to the log file.
set_target_properties(xrb-host PROPERTIES LINK_FLAGS "/SUBSYSTEM:WINDOWS /ENTRY:mainCRTStartup")
# Symbols and a map file in Release too: crash offsets in field logs can be resolved.
target_compile_options(xrb-host PRIVATE /Zi)
target_link_options(xrb-host PRIVATE /DEBUG /OPT:REF /OPT:ICF /MAP)

set(HOST_OUT "$<TARGET_FILE_DIR:xrb-host>")
COPY_FILES(xrb-host "${CEF_BINARY_FILES}" "${CEF_BINARY_DIR}" "${HOST_OUT}")
COPY_FILES(xrb-host "${CEF_RESOURCE_FILES}" "${CEF_RESOURCE_DIR}" "${HOST_OUT}")
add_custom_command(TARGET xrb-host POST_BUILD
  # The host's own default page; the test pages live in tests/<name>/ as projects.
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
          "${CMAKE_CURRENT_SOURCE_DIR}/testpages/sbs.html" "${HOST_OUT}/testpages/sbs.html"
  VERBATIM)

# Unit tests for the host's pure functions (path mapping, coordinate frames).
add_executable(host-tests tests/host_tests.cpp src/app_scheme.cpp src/app_icon.cpp src/log.cpp src/args.cpp src/host_channel.cpp src/status_report.cpp src/plugins.cpp
  src/providers.cpp src/builtin_providers.cpp src/builtin_inputs.cpp src/host_config.cpp src/hand_recording.cpp
  "${XRB_PLUGIN_SDK}/tests/abi_check.c")
# The ABI check is plain C11: it proves xrb_plugin.h compiles as C.
set_source_files_properties("${XRB_PLUGIN_SDK}/tests/abi_check.c" PROPERTIES COMPILE_OPTIONS "/std:c11")
SET_EXECUTABLE_TARGET_PROPERTIES(host-tests)
target_compile_features(host-tests PRIVATE cxx_std_20)
target_compile_definitions(host-tests PRIVATE UNICODE _UNICODE NOMINMAX WIN32_LEAN_AND_MEAN JSON_DIAGNOSTICS=1)
target_include_directories(host-tests PRIVATE src "${XRB_PLUGIN_SDK}/include" "${THIRD_PARTY}/nlohmann")
add_dependencies(host-tests libcef_dll_wrapper)
target_link_libraries(host-tests PRIVATE libcef_lib libcef_dll_wrapper ${CEF_STANDARD_LIBS} ws2_32 bcrypt windowscodecs ole32)
set_target_properties(host-tests PROPERTIES LINK_FLAGS "/SUBSYSTEM:CONSOLE")
add_dependencies(host-tests xrb-host)  # runs from the same folder as libcef.dll

# Test plugins (C, DLL CRT): <out>\test-plugins\<name>\xrb_test_<name>.dll, found by host-tests.
foreach(tp "input;1;tinput;1" "display;2;tdisplay;1" "platform;3;tplatform;1" "oldabi;1;oldabi;99")
  list(GET tp 0 tp_id)
  list(GET tp 1 tp_role)
  list(GET tp 2 tp_name)
  list(GET tp 3 tp_major)
  set(tp_target xrb_test_${tp_id})
  add_library(${tp_target} SHARED "${XRB_PLUGIN_SDK}/tests/test_plugin.c")
  target_include_directories(${tp_target} PRIVATE "${XRB_PLUGIN_SDK}/include")
  target_compile_definitions(${tp_target} PRIVATE TP_ROLE=${tp_role} TP_NAME="${tp_name}" TP_ABI_MAJOR=${tp_major} _CRT_SECURE_NO_WARNINGS)
  set_property(TARGET ${tp_target} PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>DLL")
  set_target_properties(${tp_target} PROPERTIES RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/Release/test-plugins/${tp_id}"
                                                RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_BINARY_DIR}/Debug/test-plugins/${tp_id}")
  add_dependencies(host-tests ${tp_target})
endforeach()
