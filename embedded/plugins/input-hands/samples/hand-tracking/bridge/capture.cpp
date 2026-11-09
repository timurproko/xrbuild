// One explicitly selected device; stdout is framed binary IPC, never an image file.
#include "sensor-headers.hpp"
#include <nlohmann/json.hpp>
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "markers.hpp"
#include <regex>
using json = nlohmann::json;
using Clock = std::chrono::steady_clock;
constexpr uint32_t kPixels = 1280 * 720;
struct CaptureShape {int width=640,height=480,fps=30;std::string key="640x480@30";};
CaptureShape capture_shape(const std::string& key){std::smatch m;if(key.size()>24||!std::regex_match(key,m,std::regex("([1-9][0-9]{1,3})x([1-9][0-9]{1,3})@([1-9][0-9]?)")))throw std::runtime_error("Invalid capture profile");CaptureShape s{std::stoi(m[1]),std::stoi(m[2]),std::stoi(m[3]),key};if(s.width<160||s.width>1280||s.height<120||s.height>720||s.fps>90)throw std::runtime_error("Capture profile exceeds bounded support");return s;}
constexpr uint32_t kJsonLimit = 64 * 1024;
double now_ms() { return std::chrono::duration<double,std::milli>(Clock::now().time_since_epoch()).count(); }
void put32(uint8_t* p,uint32_t v) { for(int i=0;i<4;++i)p[i]=static_cast<uint8_t>(v>>(8*i)); }
void write_bytes(const void* p,size_t size) { if(size && std::fwrite(p,1,size,stdout)!=size)throw std::runtime_error("Bridge output pipe closed"); }
void emit(json meta,const std::vector<uint8_t>& rgb={},const std::vector<uint8_t>& depth={},const std::vector<uint8_t>& aligned={}) {
  meta["nativeSendMs"]=now_ms(); const std::string text=meta.dump();
  if(text.size()>kJsonLimit || rgb.size()>kPixels*3 || depth.size()>kPixels*2 || aligned.size()>kPixels*2)throw std::runtime_error("Native packet size limit");
  std::array<uint8_t,24> header{}; std::memcpy(header.data(),"XRB3",4);header[4]=1;
  put32(header.data()+8,static_cast<uint32_t>(text.size()));put32(header.data()+12,static_cast<uint32_t>(rgb.size()));
  put32(header.data()+16,static_cast<uint32_t>(depth.size()));put32(header.data()+20,static_cast<uint32_t>(aligned.size()));
  write_bytes(header.data(),header.size());write_bytes(text.data(),text.size());
  write_bytes(rgb.data(),rgb.size());write_bytes(depth.data(),depth.size());write_bytes(aligned.data(),aligned.size());
  if(std::fflush(stdout)!=0)throw std::runtime_error("Bridge output flush failed");
}
json intrinsics(const rs2_intrinsics& v) {
  return {{"width",v.width},{"height",v.height},{"fx",v.fx},{"fy",v.fy},{"cx",v.ppx},{"cy",v.ppy},
    {"distortion",rs2_distortion_to_string(v.model)},{"coefficients",std::vector<float>(v.coeffs,v.coeffs+5)}};
}
json profile(const rs2::stream_profile& p) {
  const auto v=p.as<rs2::video_stream_profile>();
  return {{"stream",rs2_stream_to_string(p.stream_type())},{"encoding",rs2_format_to_string(p.format())},
    {"width",v.width()},{"height",v.height()},{"fps",p.fps()}};
}
json geometry_semantics() {return {{"version",1},{"alignedPixelFrame","color-optical"},{"alignedValue","original-depth-optical-z"}};}
// SDK reference vectors only: synthetic calibration/points, no camera opened or images saved.
json geometry_vectors() {
  rs2_intrinsics in{};in.width=640;in.height=480;in.fx=605;in.fy=604;in.ppx=316;in.ppy=253;in.model=RS2_DISTORTION_INVERSE_BROWN_CONRADY;
  json out={{"sdkVersion",RS2_API_VERSION_STR},{"intrinsics",intrinsics(in)},{"cases",json::array()}};
  for(float angle:std::array<float,2>{0.f,0.13f}) {
    rs2_extrinsics ex{};const float c=std::cos(angle),s=std::sin(angle);const float r[9]={c,0,-s,0,1,0,s,0,c};std::copy(r,r+9,ex.rotation);
    ex.translation[0]=0.015f;ex.translation[1]=0.001f;ex.translation[2]=0.006f;
    rs2_extrinsics inverse{};for(int a=0;a<3;++a)for(int b=0;b<3;++b)inverse.rotation[a*3+b]=ex.rotation[b*3+a];
    for(int row=0;row<3;++row)for(int col=0;col<3;++col)inverse.translation[row]-=inverse.rotation[col*3+row]*ex.translation[col];
    json item={{"rotationColumnMajor",std::vector<float>(ex.rotation,ex.rotation+9)},{"translationMeters",std::vector<float>(ex.translation,ex.translation+3)},{"vectors",json::array()}};
    for(float z:std::array<float,4>{0.25f,0.5f,1.5f,3.f})for(const auto& pixel:std::array<std::array<float,2>,5>{{{0,0},{91.25f,77.5f},{316,253},{638.7f,478.6f},{639,0}}}) {
      float color[3],depth[3],roundtrip[3],projected[2];rs2_deproject_pixel_to_point(color,&in,pixel.data(),z);
      rs2_transform_point_to_point(depth,&inverse,color);rs2_transform_point_to_point(roundtrip,&ex,depth);rs2_project_point_to_pixel(projected,&in,roundtrip);
      for(int i=0;i<3;++i)if(std::abs(roundtrip[i]-color[i])>2e-6f)throw std::runtime_error("SDK geometry round trip failed");
      if(std::hypot(projected[0]-pixel[0],projected[1]-pixel[1])>0.001f)throw std::runtime_error("SDK projection round trip failed");
      item["vectors"].push_back({{"pixel",pixel},{"depthCameraZ",depth[2]},{"colorPoint",std::vector<float>(color,color+3)},{"projected",std::vector<float>(projected,projected+2)}});
    }
    out["cases"].push_back(item);
  }
  return out;
}
std::string info(const rs2::device& d,rs2_camera_info key) { return d.supports(key)?d.get_info(key):"unavailable"; }
json enumerate() {
  rs2::context ctx;json devices=json::array();
  for(const auto& d:ctx.query_devices()) {
    json profiles=json::array();bool rgb=false,depth=false;
    for(const auto& sensor:d.query_sensors())for(const auto& p:sensor.get_stream_profiles()) {
      if((p.stream_type()!=RS2_STREAM_COLOR || p.format()!=RS2_FORMAT_RGB8) && (p.stream_type()!=RS2_STREAM_DEPTH || p.format()!=RS2_FORMAT_Z16))continue;
      if(!p.is<rs2::video_stream_profile>())continue;
      const auto v=profile(p);profiles.push_back(v);
      if(v["width"]==640 && v["height"]==480 && v["fps"]==30) {if(p.stream_type()==RS2_STREAM_COLOR)rgb=true;else depth=true;}
    }
    devices.push_back({{"serial",info(d,RS2_CAMERA_INFO_SERIAL_NUMBER)},{"name",info(d,RS2_CAMERA_INFO_NAME)},
      {"firmware",info(d,RS2_CAMERA_INFO_FIRMWARE_VERSION)},{"usb",info(d,RS2_CAMERA_INFO_USB_TYPE_DESCRIPTOR)},
      {"profiles",profiles},{"supportsBaseline",rgb&&depth}});
  }
  std::sort(devices.begin(),devices.end(),[](const auto& a,const auto& b){return a["serial"]<b["serial"];});
  return {{"sdkVersion",RS2_API_VERSION_STR},{"devices",devices}};
}
std::vector<uint8_t> packed(const rs2::video_frame& frame,int bytes) {
  const int width=frame.get_width(),height=frame.get_height();if(width<160||width>1280||height<120||height>720||frame.get_bytes_per_pixel()!=bytes || frame.get_stride_in_bytes()<width*bytes || frame.get_data_size()<frame.get_stride_in_bytes()*height)throw std::runtime_error("Unexpected native frame layout");
  std::vector<uint8_t> out(static_cast<size_t>(width)*height*bytes);const auto* src=static_cast<const uint8_t*>(frame.get_data());
  for(int y=0;y<height;++y)std::memcpy(out.data()+static_cast<size_t>(y)*width*bytes,src+static_cast<size_t>(y)*frame.get_stride_in_bytes(),width*bytes);
  return out;
}
json metadata(const rs2::frame& frame,rs2_frame_metadata_value key) {
  try {if(frame.supports_frame_metadata(key))return frame.get_frame_metadata(key);}catch(const rs2::error&){}
  return nullptr; // Explicitly unavailable; never derive hardware time from arrival time.
}
json stamp(const rs2::frame& frame) { return {{"number",frame.get_frame_number()},{"timestampMs",frame.get_timestamp()},
  {"domain",rs2_timestamp_domain_to_string(frame.get_frame_timestamp_domain())},
  {"sensorTimestampUs",metadata(frame,RS2_FRAME_METADATA_SENSOR_TIMESTAMP)},
  {"readoutTimestampUs",metadata(frame,RS2_FRAME_METADATA_FRAME_TIMESTAMP)},
  {"actualExposureUs",metadata(frame,RS2_FRAME_METADATA_ACTUAL_EXPOSURE)}}; }
// Nonblocking control polling avoids a blocked stdin thread on failed camera startup.
bool controls(std::string& pending) {
  HANDLE input=GetStdHandle(STD_INPUT_HANDLE);DWORD available=0;
  if(!PeekNamedPipe(input,nullptr,0,nullptr,&available,nullptr))return false;
  while(available) {
    char data[512];DWORD read=0;
    if(!ReadFile(input,data,std::min<DWORD>(available,sizeof(data)),&read,nullptr) || !read)return false;
    for(DWORD i=0;i<read;++i) {
      if(data[i]!='\n') { if(pending.size()>=1024)throw std::runtime_error("Native control size limit");pending+=data[i];continue; }
      const auto command=json::parse(pending,nullptr,false);pending.clear();const double received=now_ms();
      if(!command.is_object() || !command.contains("type") || !command["type"].is_string())throw std::runtime_error("Malformed native control");
      if(command["type"]=="stop")return false;
      if(command["type"]!="ping" || !command.contains("id") || !command["id"].is_number_unsigned())throw std::runtime_error("Unsupported native control");
      emit({{"type","pong"},{"id",command["id"]},{"nativeReceiveMs",received}});
    }
    if(!PeekNamedPipe(input,nullptr,0,nullptr,&available,nullptr))return false;
  }
  return true;
}
int capture(const std::string& serial,bool marker_enabled=false,const CaptureShape& shape={}) {
  if(serial.empty() || serial.size()>64 || !std::all_of(serial.begin(),serial.end(),[](unsigned char c){return std::isalnum(c)||c=='-'||c=='_';}))throw std::runtime_error("An explicit native serial is required");
  if(GetFileType(GetStdHandle(STD_INPUT_HANDLE))!=FILE_TYPE_PIPE)throw std::runtime_error("Use the bridge service (piped control input required)");
  rs2::pipeline pipe;rs2::config config;config.enable_device(serial);
  config.enable_stream(RS2_STREAM_COLOR,shape.width,shape.height,RS2_FORMAT_RGB8,shape.fps);config.enable_stream(RS2_STREAM_DEPTH,shape.width,shape.height,RS2_FORMAT_Z16,shape.fps);
  const auto active=pipe.start(config);bool running=true;
  try {
    const auto colorProfile=active.get_stream(RS2_STREAM_COLOR).as<rs2::video_stream_profile>();
    const auto depthProfile=active.get_stream(RS2_STREAM_DEPTH).as<rs2::video_stream_profile>();for(const auto& p:{colorProfile,depthProfile})if(p.width()!=shape.width||p.height()!=shape.height||p.fps()!=shape.fps)throw std::runtime_error("SDK selected a different profile; no fallback allowed");const auto ex=depthProfile.get_extrinsics_to(colorProfile);
    const auto device=active.get_device();if(info(device,RS2_CAMERA_INFO_SERIAL_NUMBER)!=serial)throw std::runtime_error("Selected serial mismatch");
    const float scale=device.first<rs2::depth_sensor>().get_depth_scale();if(!std::isfinite(scale)||scale<=0)throw std::runtime_error("Depth scale unavailable");
    rs2::align align(RS2_STREAM_COLOR);bool hello=false,havePrevious=false;uint64_t sequence=0,lastColor=0,lastDepth=0,colorGaps=0,depthGaps=0,colorRepeats=0,depthRepeats=0;
    MarkerDetector markers(marker_enabled);std::string pending;double lastFrame=now_ms(),lastMarker=-1000;
    while(controls(pending)) {
      rs2::frameset frames;if(!pipe.try_wait_for_frames(&frames,100)) {if(now_ms()-lastFrame>3000)throw std::runtime_error("RGB-D stream stalled or USB disconnected");continue;}
      const double received=now_ms();const auto color=frames.get_color_frame();const auto depth=frames.get_depth_frame();
      if(!color||!depth)continue;
      const auto alignedFrames=align.process(frames).as<rs2::frameset>();const auto aligned=alignedFrames.get_depth_frame();
      if(!aligned)throw std::runtime_error("Depth alignment produced no frame");const double alignedMs=now_ms();lastFrame=received;
      if(!hello) {
        emit({{"type","hello"},{"sdkVersion",RS2_API_VERSION_STR},{"serial",serial},{"name",info(device,RS2_CAMERA_INFO_NAME)},
          {"firmware",info(device,RS2_CAMERA_INFO_FIRMWARE_VERSION)},{"usb",info(device,RS2_CAMERA_INFO_USB_TYPE_DESCRIPTOR)},
          {"depthScaleMeters",scale},{"color",profile(colorProfile)},{"depth",profile(depthProfile)},
          {"colorIntrinsics",intrinsics(colorProfile.get_intrinsics())},{"depthIntrinsics",intrinsics(depthProfile.get_intrinsics())},
          {"alignedDepthIntrinsics",intrinsics(aligned.get_profile().as<rs2::video_stream_profile>().get_intrinsics())},
          {"depthToColor",{{"rotationColumnMajor",std::vector<float>(ex.rotation,ex.rotation+9)},{"translationMeters",std::vector<float>(ex.translation,ex.translation+3)}}},
          {"alignment","SDK alignment of depth to color; original Z16 retained separately"},{"pairing","SDK frameset; exposure synchronization not guaranteed"},
          {"nativeClock","std::chrono::steady_clock milliseconds; epoch unspecified"},{"geometry",geometry_semantics()}});hello=true;
      }
      const auto cn=color.get_frame_number(),dn=depth.get_frame_number();
      if(havePrevious) {if(cn==lastColor)++colorRepeats;else if(cn>lastColor+1)colorGaps+=cn-lastColor-1;if(dn==lastDepth)++depthRepeats;else if(dn>lastDepth+1)depthGaps+=dn-lastDepth-1;}
      lastColor=cn;lastDepth=dn;havePrevious=true;
      json frame={{"type","frame"},{"sequence",++sequence},{"nativeReceiveMs",received},{"nativeAlignedMs",alignedMs},
        {"color",stamp(color)},{"depth",stamp(depth)},{"alignedDepth",stamp(aligned)},
        {"colorGaps",colorGaps},{"depthGaps",depthGaps},{"colorRepeats",colorRepeats},{"depthRepeats",depthRepeats}};
      if(shape.key!="640x480@30")frame["profile"]=shape.key;
      if(marker_enabled&&received-lastMarker>=200){frame["marker"]=markers.rgb(static_cast<const uint8_t*>(color.get_data()),color.get_stride_in_bytes(),cn,shape.width,shape.height);lastMarker=received;}
      emit(frame,packed(color,3),packed(depth,2),packed(aligned,2));
    }
    pipe.stop();running=false;emit({{"type","stopped"}});return 0;
  } catch(...) {if(running){try{pipe.stop();}catch(...){}}throw;}
}
int main(int argc,char** argv) {
  _setmode(_fileno(stdout),_O_BINARY);
  try {
    if(rs2_get_api_version(nullptr)!=RS2_API_VERSION)throw std::runtime_error("Camera SDK header/runtime version mismatch");
    if(argc==2 && std::string(argv[1])=="--list") {std::cout<<enumerate().dump()<<std::endl;return 0;}
    if(argc==2 && std::string(argv[1])=="--geometry-vectors") {std::cout<<geometry_vectors().dump()<<std::endl;return 0;}
    if(argc==2 && std::string(argv[1])=="--self-test") {std::array<uint8_t,4> b{};put32(b.data(),0xfedcba98);if(b!=std::array<uint8_t,4>{0x98,0xba,0xdc,0xfe})return 1;std::cout<<"native framing self-test passed\n";return 0;}
    if(argc==2 && std::string(argv[1])=="--marker-self-test") {if(!MarkerDetector::self_test())return 1;std::cout<<"marker self-test passed\n";return 0;}
    if(argc==2 && std::string(argv[1]).rfind("--marker-svg=",0)==0){const auto id=std::string(argv[1]).substr(13);if(id.empty()||id.size()>3||!std::all_of(id.begin(),id.end(),[](unsigned char c){return std::isdigit(c);}))throw std::runtime_error("Invalid marker ID");std::cout<<MarkerDetector::svg(std::stoi(id));return 0;}
    if(argc>=2&&argc<=4 && std::string(argv[1]).rfind("--serial=",0)==0){bool marker=false,hasProfile=false;CaptureShape shape;for(int i=2;i<argc;i++){const std::string option=argv[i];if(option=="--marker=tag36h11"&&!marker)marker=true;else if(option.rfind("--profile=",0)==0&&!hasProfile){shape=capture_shape(option.substr(10));hasProfile=true;}else throw std::runtime_error("Unsupported/duplicate native option");}return capture(std::string(argv[1]).substr(9),marker,shape);}
    throw std::runtime_error("Expected --list, --self-test, --geometry-vectors or --serial=<explicit serial>");
  } catch(const std::exception& error) {try{emit({{"type","error"},{"message",error.what()}});}catch(...){}return 1;}
}
