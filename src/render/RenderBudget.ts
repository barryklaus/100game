/** Pace visual updates without retaining an almost-full frame after an early tick. */
export class FramePacer {
  private last:number|null=null;
  private accumulated=0;
  constructor(private interval=1000/60){}
  reset(stamp:number):void{this.last=stamp;this.accumulated=0;}
  step(stamp:number):boolean{
    this.accumulated+=this.last===null?this.interval:Math.max(0,Math.min(50,stamp-this.last));
    this.last=stamp;
    if(this.accumulated<this.interval-1)return false;
    this.accumulated=Math.max(0,this.accumulated-this.interval);
    return true;
  }
}

/** Keep the painted table on screen until its contents or effects actually change. */
export class RenderInvalidation {
  private dirty=true;
  request():void{this.dirty=true;}
  consume(moving:boolean,shadowUpdate=false):boolean{
    if(!this.dirty&&!moving&&!shadowUpdate)return false;
    this.dirty=false;return true;
  }
}
