export interface MarkerFlowInput {
  capturing:boolean;markerCapture:boolean;busy:boolean;connected:boolean;camerasReady:boolean;issue:{field:string;message:string}|null;fixed:boolean;
  survey:{fit:number;check:number;a:{ready:boolean;reason:string;spanMs:number};b:{ready:boolean;reason:string;spanMs:number}};
  result:{spatialQualified:boolean;reasons:readonly string[]}|null;
}
export function markerFlow(s:MarkerFlowInput):{title:string;label:string;help:string;action:string;field?:string}{
  if(s.busy)return {title:'Preparing cameras / calibration…',label:'Please wait…',help:'Starting/stopping owned resources. No extra click is needed.',action:'busy'};
  if(!s.camerasReady)return {title:'Choose your cameras once',label:'Choose cameras in Capture',help:'Select different A/B serials and available profiles on the left. These choices survive reload.',action:'cameras'};
  if(!s.capturing&&!s.connected)return {title:'Connect the local cameras',label:'Connect / retry',help:'Connect only lists devices; it does not start capture.',action:'connect'};
  if(!s.capturing||!s.markerCapture)return {title:'Start marker observation',label:s.capturing?'Restart both for calibration':'Start calibration cameras',help:'Starts both selected RGB-D profiles with marker detection, without hand-model workers.',action:'start'};
  if(s.issue)return {title:'Complete this measurement',label:'Enter the missing measurement',help:s.issue.message,field:s.issue.field,action:'field'};
  if(!s.fixed)return {title:'Keep the cameras fixed',label:'Confirm stationary target / fixed cameras',help:'Check the confirmation below. Move only the board BETWEEN placements.',field:'mv-marker-fixed',action:'field'};
  if(s.result)return {title:s.result.spatialQualified?'Spatial checks passed':'Provisional spatial result',label:'Export calibration setup',help:s.result.spatialQualified?'Spatial setup is saved in this tab. Export to keep it; current-run timing and physical fusion acceptance are separate.':s.result.reasons.join('; '),action:'export'};
  if(s.survey.fit>=2&&s.survey.check>=1)return {title:'Three placements collected',label:'Calculate + apply spatial setup',help:'Eight fit corners; four independent validation corners. Review the residuals before hand tracking.',action:'fit'};
  const fit=s.survey.fit<2,title=fit?`Placement ${s.survey.fit+1} of 3 · fit`:'Placement 3 of 3 · independent validation';
  if(!s.survey.a.ready||!s.survey.b.ready)return {title,label:'Check target / hold still',help:`A: ${s.survey.a.reason}. B: ${s.survey.b.reason}. Once both see a supported stationary marker, allow about 1–2 seconds. Waiting cannot fix missing/invalid depth or target visibility.`,action:'wait'};
  return {title,label:fit?`Capture placement ${s.survey.fit+1}`:'Capture validation placement',help:'Both ready. Capture now, then move/tilt only the board to a DIFFERENT position and hold still again.',action:fit?'capture-fit':'capture-check'};
}
