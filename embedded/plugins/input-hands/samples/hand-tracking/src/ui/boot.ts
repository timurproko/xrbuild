/** Reveal once, after saved source/UI state and fonts settle; never wait for a camera/service. */
export async function revealWorkspace(signal?:AbortSignal):Promise<void>{
  await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1500))]);
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  if(signal?.aborted)return;
  const boot=window as unknown as {handTrackingBootTimer?:number;handTrackingBootFailure?:()=>void};
  clearTimeout(boot.handTrackingBootTimer);
  if(boot.handTrackingBootFailure)removeEventListener('error',boot.handTrackingBootFailure);
  document.getElementById('boot-error')!.hidden=true;
  document.body.classList.remove('workspace-pending');
  document.body.removeAttribute('data-xrb-scrollbar');
}
export function failWorkspace(error:unknown):void{
  const message=document.getElementById('boot-error');if(!message)return;
  message.textContent=`Hand tracking could not start: ${error instanceof Error?error.message:String(error)}. Reload to retry.`;
  message.hidden=false;
}
