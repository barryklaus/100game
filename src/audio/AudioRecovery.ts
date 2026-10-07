/** Mobile browsers can interrupt audio, or report running with a frozen clock. */
export class AudioRecovery {
  private hidden=false;
  private disposed=false;
  private pending=false;
  private stalled=false;
  private checkClock=true;
  private generation=0;
  private timer?:ReturnType<typeof setTimeout>;
  constructor(private context:AudioContext,private changed:()=>void,private replace:(gesture:boolean)=>void){
    context.addEventListener?.('statechange',this.stateChanged);
  }
  private stateChanged=():void=>{
    if(this.disposed)return;
    if(this.context.state==='running')this.stalled=false;
    this.changed();
    if(this.context.state!=='running'){
      this.checkClock=true;
      if(!this.pending&&!this.hidden)this.recover();
    }
  };
  setBackgrounded(hidden:boolean):void{
    this.hidden=hidden;
    this.checkClock=true;
    if(hidden){this.generation++;this.pending=false;clearTimeout(this.timer);}
    else this.recover();
  }
  recover(gesture=false):void{
    if(this.disposed||this.hidden)return;
    if(this.context.state==='closed'||(this.stalled&&gesture)){this.replace(gesture);return;}
    if(this.pending&&!gesture)return;
    if(this.context.state==='running'&&!this.checkClock){this.changed();return;}
    const generation=++this.generation,clock=this.context.currentTime;
    this.pending=true;this.stalled=false;clearTimeout(this.timer);
    // Some Safari resume promises never settle. Never let one block a later tap.
    this.timer=setTimeout(()=>{
      if(this.disposed||this.hidden||generation!==this.generation)return;
      this.pending=false;
      this.stalled=this.context.state!=='running'||this.context.currentTime<=clock;
      if(this.stalled)this.replace(false);
      else{this.checkClock=false;this.changed();}
    },750);
    if(this.context.state==='running'){this.changed();return;}
    try{
      void Promise.resolve(this.context.resume()).then(()=>{
        if(!this.disposed&&!this.hidden&&generation===this.generation)this.changed();
      },()=>{if(generation===this.generation)this.stalled=true;});
    }catch{this.stalled=true;}
  }
  dispose():void{
    this.disposed=true;this.generation++;clearTimeout(this.timer);
    this.context.removeEventListener?.('statechange',this.stateChanged);
  }
}
