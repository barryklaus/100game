type Session = {type:string};

/** iOS ambient Web Audio follows the ringer switch; media playback does not. */
export class PlaybackAudioSession {
  private session?:Session;
  private previousType?:string;

  setActive(active:boolean):void{
    // Experimental/absent APIs and restricted setters must never break sound.
    try{
      if(!active){
        if(this.session?.type==='playback'&&this.previousType!==undefined)this.session.type=this.previousType;
        this.session=undefined;this.previousType=undefined;
        return;
      }
      const session=typeof navigator==='undefined'?undefined:(navigator as Navigator & {audioSession?:Session}).audioSession;
      if(!session||session.type==='playback')return;
      const previous=session.type;
      session.type='playback';
      if(!this.session){this.session=session;this.previousType=previous;}
    }catch{/* Normal Web Audio remains available on browsers without session routing. */}
  }
}
