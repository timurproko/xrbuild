// Clean integration with the public AprilRobotics AprilTag 3 library (BSD-2-Clause).
// No implementation/assets from the operator's calibration executable are used.
#pragma once
extern "C" {
#include <apriltag.h>
#include <tag36h11.h>
#include <common/image_u8.h>
}
#include <nlohmann/json.hpp>
#include <cmath>
#include <string>
#include <stdexcept>
#include <sstream>
#include <cstring>
#include <cstdint>
#include <vector>
class MarkerDetector {
  apriltag_family_t* family_=nullptr;apriltag_detector_t* detector_=nullptr;
public:
  explicit MarkerDetector(bool enabled=true){if(enabled){family_=tag36h11_create();detector_=apriltag_detector_create();detector_->nthreads=1;detector_->quad_decimate=1;detector_->refine_edges=true;detector_->decode_sharpening=.5;apriltag_detector_add_family_bits(detector_,family_,1);}}
  ~MarkerDetector(){if(detector_)apriltag_detector_destroy(detector_);if(family_)tag36h11_destroy(family_);}
  MarkerDetector(const MarkerDetector&)=delete;MarkerDetector& operator=(const MarkerDetector&)=delete;
  nlohmann::json detect(image_u8_t* image,uint64_t frame){
    nlohmann::json tags=nlohmann::json::array();zarray_t* detections=apriltag_detector_detect(detector_,image);
    for(int i=0;i<zarray_size(detections)&&tags.size()<16;i++){apriltag_detection_t* d=nullptr;zarray_get(detections,i,&d);if(d->id<0||d->id>=587||d->hamming>1||!std::isfinite(d->decision_margin)||d->decision_margin<0)continue;
      nlohmann::json corners=nlohmann::json::array();bool valid=true;for(int j=0;j<4;j++){const auto x=d->p[j][0],y=d->p[j][1];if(!std::isfinite(x)||!std::isfinite(y)||x<0||x>=image->width||y<0||y>=image->height)valid=false;corners.push_back({{"x",x},{"y",y}});}if(valid)tags.push_back({{"id",d->id},{"hamming",d->hamming},{"margin",d->decision_margin},{"corners",corners}});
    }
    apriltag_detections_destroy(detections);return {{"version",1},{"family","tag36h11"},{"detector","apriltag-3.4.5"},{"colorFrame",frame},{"detections",tags}};
  }
  nlohmann::json rgb(const uint8_t* data,int stride,uint64_t frame,int width=640,int height=480){
    image_u8_t* image=image_u8_create(width,height);for(int y=0;y<height;y++)for(int x=0;x<width;x++){const auto p=data+y*stride+x*3;image->buf[y*image->stride+x]=static_cast<uint8_t>((77*p[0]+150*p[1]+29*p[2])>>8);}auto result=detect(image,frame);bool strong=false;for(const auto& d:result["detections"])if(d["hamming"]==0&&d["margin"].get<double>()>=40)strong=true;
    // Bounded detector-only fallback. These are still original-camera pixels,
    // not higher sensor resolution or carried-forward detections.
    if(!strong&&width<=1280&&height<=720){auto* up=image_u8_create(width*2,height*2);for(int y=0;y<height*2;y++)for(int x=0;x<width*2;x++)up->buf[y*up->stride+x]=image->buf[(y/2)*image->stride+x/2];auto extra=detect(up,frame);image_u8_destroy(up);
      for(auto d:extra["detections"]){for(auto& p:d["corners"]){p["x"]=p["x"].get<double>()/2;p["y"]=p["y"].get<double>()/2;}bool matched=false;for(auto& old:result["detections"]){double error=0;for(int i=0;i<4;i++)error+=std::pow(old["corners"][i]["x"].get<double>()-d["corners"][i]["x"].get<double>(),2)+std::pow(old["corners"][i]["y"].get<double>()-d["corners"][i]["y"].get<double>(),2);if(old["id"]==d["id"]&&std::sqrt(error/4)<5){if(d["hamming"].get<int>()<old["hamming"].get<int>()||(d["hamming"]==old["hamming"]&&d["margin"].get<double>()>old["margin"].get<double>()))old=d;matched=true;break;}}if(!matched&&result["detections"].size()<16)result["detections"].push_back(d);}
    }image_u8_destroy(image);return result;
  }
  static std::string svg(int id){if(id<0||id>=587)throw std::runtime_error("Marker ID must be 0..586");auto* f=tag36h11_create();auto* image=apriltag_to_image(f,id);std::ostringstream out;out<<"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "<<image->width<<' '<<image->height<<"\" width=\"160mm\" height=\"160mm\" shape-rendering=\"crispEdges\"><title>AprilTag tag36h11 ID "<<id<<" - measure actual printed BLACK square side</title><metadata>AprilRobotics/apriltag 3.4.5, BSD-2-Clause. Print without scaling; physically measure black-square edge and measurement uncertainty.</metadata><rect width=\"100%\" height=\"100%\" fill=\"white\"/>";for(int y=0;y<image->height;y++)for(int x=0;x<image->width;x++)if(image->buf[y*image->stride+x]<128)out<<"<rect x=\""<<x<<"\" y=\""<<y<<"\" width=\"1\" height=\"1\" fill=\"black\"/>";out<<"</svg>\n";image_u8_destroy(image);tag36h11_destroy(f);return out.str();}
  static bool self_test(){
    auto* f=tag36h11_create();MarkerDetector detector;bool valid=true;
    // Exercise real RGB→gray→public detector for three IDs and every quarter-turn.
    // Canonical corner index must follow the printed payload, not image top-left.
    for(const int id:{0,1,586}){auto* tag=apriltag_to_image(f,id);nlohmann::json base;
      for(int r=0;r<4;r++){std::vector<uint8_t> rgb(640*480*3,255);
        for(int y=0;y<tag->height*20;y++)for(int x=0;x<tag->width*20;x++){const int a=x/20,b=y/20,sx=r==0?a:r==1?b:r==2?tag->width-1-a:tag->height-1-b,sy=r==0?b:r==1?tag->width-1-a:r==2?tag->height-1-b:a;const auto value=tag->buf[sy*tag->stride+sx];const auto p=((100+y)*640+180+x)*3;rgb[p]=rgb[p+1]=rgb[p+2]=value;}
        const auto result=detector.rgb(rgb.data(),640*3,1),d=result["detections"];if(d.size()!=1||d[0]["id"]!=id||d[0]["hamming"]!=0){valid=false;continue;}if(r==0)base=d[0]["corners"];else if(!base.is_null())for(int i=0;i<4;i++){double x=base[i]["x"].get<double>()-280,y=base[i]["y"].get<double>()-200;for(int k=0;k<r;k++){const double a=x;x=-y;y=a;}if(std::hypot(d[0]["corners"][i]["x"].get<double>()-(280+x),d[0]["corners"][i]["y"].get<double>()-(200+y))>2)valid=false;}
      }image_u8_destroy(tag);
    }
    // Small, low-contrast screen-like fixtures; returned corners stay in native pixels.
    for(const int scale:{3,4,5}){auto* tag=apriltag_to_image(f,0);std::vector<uint8_t> rgb(640*480*3,180);for(int y=0;y<tag->height*scale;y++)for(int x=0;x<tag->width*scale;x++){const auto value=tag->buf[(y/scale)*tag->stride+x/scale]<128?110:160;const auto p=((200+y)*640+300+x)*3;rgb[p]=rgb[p+1]=rgb[p+2]=static_cast<uint8_t>(value);}const auto d=detector.rgb(rgb.data(),640*3,2)["detections"];if(d.size()!=1||d[0]["id"]!=0)valid=false;else for(const auto& p:d[0]["corners"])if(p["x"].get<double>()<300||p["x"].get<double>()>300+tag->width*scale||p["y"].get<double>()<200||p["y"].get<double>()>200+tag->height*scale)valid=false;image_u8_destroy(tag);}
    tag36h11_destroy(f);return valid;
  }
};
