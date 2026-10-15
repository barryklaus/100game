/** Sample every input, but paint only the newest visual once per browser frame. */
export class LatestFrame<T> {
  private frame=0;
  private pending?:T;
  constructor(private paint:(value:T)=>void){}
  schedule(value:T):void{
    this.pending=value;
    if(!this.frame)this.frame=requestAnimationFrame(()=>this.flush());
  }
  flush():void{
    cancelAnimationFrame(this.frame);this.frame=0;
    const value=this.pending;this.pending=undefined;
    if(value!==undefined)this.paint(value);
  }
  cancel():void{cancelAnimationFrame(this.frame);this.frame=0;this.pending=undefined;}
}
