export interface RebuildJob {
  id:number;
  state:'running'|'done'|'failed';
  error?:string|null;
  lines?:string[];
}
export interface RebuildPresentation {
  state:'running'|'done'|'failed';
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
}
export const REBUILD_AUTOCLOSE_KEY:string;
export function rebuildPresentation(job:RebuildJob|null,error?:string):RebuildPresentation;
export function rebuildProgressDialog(options?:{document?:Document;storage?:Storage;onViewJob?:(job:RebuildJob)=>void}):RebuildProgressController;
export function rebuildHostInPlace(origin?:string,options?:{onJob?:(job:RebuildJob)=>void;onViewJob?:(job:RebuildJob)=>void;onComplete?:(job:RebuildJob)=>void}):Promise<RebuildJob|null>;
