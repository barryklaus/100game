/** A new discard, not a target selection or rerender, starts one inward wave. */
export class CardImpactFlow {
  private key='';
  private age=2;
  private arrived=true;
  private flight?:{cardId:string;landed:boolean;bound:boolean};
  get inFlight():boolean{return !!this.flight&&!this.flight.landed;}
  get active():boolean{return this.age<1.05;}
  /** The real throw clock owns the inward sweep, including spins and boomerangs. */
  beginFlight(cardId:string):void {
    this.flight={cardId,landed:false,bound:false};this.age=0;
  }
  seekFlight(progress:number):void {
    if(this.inFlight)this.age=Math.max(0,Math.min(1,progress))*1.05*.78;
  }
  landFlight():void {
    if(!this.flight)return;
    this.flight.landed=true;this.age=1.05*.78;
  }
  cancelFlight():void {this.flight=undefined;this.age=2;this.arrived=true;}
  clear():void {this.key='';this.age=2;this.arrived=true;this.flight=undefined;}
  setCard(key:string):void {
    if(key===this.key)return;
    this.key=key;
    if(this.flight&&key.split(':')[1]===this.flight.cardId){
      // The accepted snapshot can arrive before or after landing; never start a second sweep.
      this.flight.bound=true;this.arrived=false;return;
    }
    this.flight=undefined;this.age=key?0:2;this.arrived=!key;
  }
  update(delta:number,reduced:boolean):{progress:number;strength:number;arrival:boolean} {
    if(!this.inFlight)this.age+=delta;
    const progress=Math.min(1,this.age/1.05);
    const arrival=!this.arrived&&progress>=.78&&(!this.flight||(this.flight.landed&&this.flight.bound));
    if(arrival)this.arrived=true;
    return {progress,strength:reduced?0:progress<1?Math.min(1,(1-progress)*5):0,arrival:arrival&&!reduced};
  }
}
