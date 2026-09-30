/** A new discard, not a target selection or rerender, starts one inward wave. */
export class CardImpactFlow {
  private key='';
  private age=2;
  private arrived=true;
  setCard(key:string):void {
    if(key===this.key)return;
    this.key=key;this.age=key?0:2;this.arrived=!key;
  }
  update(delta:number,reduced:boolean):{progress:number;strength:number;arrival:boolean} {
    this.age+=delta;
    const progress=Math.min(1,this.age/1.05);
    const arrival=!this.arrived&&progress>=.78;
    if(arrival)this.arrived=true;
    return {progress,strength:reduced?0:progress<1?Math.min(1,(1-progress)*5):0,arrival:arrival&&!reduced};
  }
}
