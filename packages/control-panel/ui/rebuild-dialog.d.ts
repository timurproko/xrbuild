export interface RebuildJob {
  id?:number;
  kind?:string;
  step?:string|null;
  result?:{state?:string;summary?:string;restartRequired?:boolean}|null;
  state:'running'|'done'|'failed';
  error?:string|null;
  lines?:string[];
}
export interface RebuildPresentation {
  state:'running'|'done'|'failed';
  step?:'check'|'fetch'|'lfs'|'pull'|'rebuild';
  title:string;
  message:string;
  output:string;
  running:boolean;
  succeeded:boolean;
  viewJobDisabled:boolean;
}
export interface RebuildProgressController {
  element:HTMLDialogElement;
  setViewJob(callback:((job:RebuildJob)=>void)|undefined):void;
  render(job:RebuildJob|null,error?:string):RebuildPresentation;
  show(job?:RebuildJob|null,error?:string):void;
  close():void;
  dispose():void;
}
export const REBUILD_AUTOCLOSE_KEY:string;
export function rebuildPresentation(job:RebuildJob|null,error?:string):RebuildPresentation;
export function rebuildProgressDialog(options?:{document?:Document;storage?:Storage|null;container?:HTMLElement;idPrefix?:string;onViewJob?:(job:RebuildJob)=>void}):RebuildProgressController;
export interface JobInPlaceOptions {onJob?:(job:RebuildJob)=>void;onViewJob?:(job:RebuildJob)=>void;onComplete?:(job:RebuildJob)=>void}
export const UPDATE_STEPS:readonly Readonly<{id:'check'|'fetch'|'lfs'|'pull'|'rebuild';title:string;message:string}>[];
export function rebuildHostInPlace(origin?:string,options?:JobInPlaceOptions):Promise<RebuildJob|null>;
export function updateInPlace(origin?:string,options?:JobInPlaceOptions):Promise<RebuildJob|null>;
export interface UpdateRepoStatus {role:'core'|'workspace';available:boolean;reason:string|null;branch:string|null;upstream:string|null;ahead:number;behind:number;dirty:number;checkedMs:number|null;unfinished:boolean;sameAsCore?:boolean;readOnly?:boolean}
export function updateTooltip(status:{core?:UpdateRepoStatus|null;workspace?:UpdateRepoStatus|null}|null,now?:number):string;
