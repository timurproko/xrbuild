// Durable diagnostic preferences belong to the selected server workspace, never product source or an inference worker.
const allowed=/^handtracking\.(?:capture-preferences|fusion-calibrations|tab\.(?:controls|inspection))\.v1$/;
class WorkspaceStorage {
  private values=new Map<string,string>();private revision:string|null=null;private pending=Promise.resolve();private problem:Error|null=null;
  async prepare():Promise<void>{if(typeof window==='undefined')return;const response=await fetch('/__handtracking/preferences',{cache:'no-store'});if(response.status===404)return;if(!response.ok)throw new Error('Diagnostic preferences are unavailable; existing data was not replaced');const value=await response.json();if(typeof value.revision!=='string'||!value.values||typeof value.values!=='object')throw new Error('Invalid diagnostic preferences response');this.revision=value.revision;for(const [key,text] of Object.entries(value.values))if(allowed.test(key)&&typeof text==='string')this.values.set(key,text);}
  getItem(key:string):string|null{return this.values.get(key)??null;}
  setItem(key:string,value:string):void{if(!allowed.test(key))return;this.values.set(key,value);this.pending=this.pending.then(async()=>{if(this.problem)throw this.problem;if(!this.revision)throw new Error('Workspace preference service is unavailable');const response=await fetch('/__handtracking/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:this.revision,key,value})});if(!response.ok)throw new Error('Diagnostic preferences could not be saved; reload before retrying');const result=await response.json();this.revision=result.revision;}).catch(error=>{this.problem=error instanceof Error?error:new Error(String(error));if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('handtracking-storage-error',{detail:this.problem.message}));});}
  removeItem(key:string):void{this.values.delete(key);}
  async flush():Promise<void>{await this.pending;if(this.problem)throw this.problem;}
}
export const workspaceStorage=new WorkspaceStorage();
