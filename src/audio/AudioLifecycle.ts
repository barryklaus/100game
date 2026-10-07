import type {AudioManager} from './AudioManager';

/** Recover outside the game controls too: lobbies, waiting turns, and overlays. */
export function bindAudioLifecycle(audio:AudioManager,doc:Document=document,page:Window=window):()=>void{
  const cleanups:(()=>void)[]=[];
  const listen=(target:EventTarget,type:string,handler:EventListener)=>{
    target.addEventListener(type,handler,{capture:true,passive:true});
    cleanups.push(()=>target.removeEventListener(type,handler,true));
  };
  const foreground=()=>audio.setBackgrounded(doc.hidden);
  listen(doc,'visibilitychange',foreground);
  listen(page,'pagehide',()=>audio.setBackgrounded(true));
  for(const type of ['pageshow','focus'])listen(page,type,foreground);
  listen(doc,'resume',foreground);
  // Safari may require touch-end/click rather than pointer-down activation.
  const interaction:EventListener=event=>{
    if(!event.isTrusted)return;
    audio.unlock(true);void audio.loadCardClips();
  };
  for(const type of ['pointerdown','pointerup','touchend','click','keydown'])listen(doc,type,interaction);
  foreground();
  return()=>{for(const cleanup of cleanups)cleanup();};
}
