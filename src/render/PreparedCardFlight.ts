/** Prepare one held card before release. Superseded/canceled work stays bounded. */
export class PreparedCardFlight<T> {
  private entry?:{key:string;pending:Promise<T>;claimed:boolean};
  constructor(private create:(key:string)=>Promise<T>,private dispose:(value:T)=>void){}
  warm(key:string):void{
    if(this.entry?.key===key)return;
    this.clear();
    const entry={key,pending:this.create(key),claimed:false};
    this.entry=entry;
    void entry.pending.then(value=>{
      if(this.entry!==entry&&!entry.claimed)this.dispose(value);
    },()=>{if(this.entry===entry)this.entry=undefined;});
  }
  take(key:string):Promise<T>{
    const entry=this.entry;
    if(entry?.key!==key){this.clear();return this.create(key);}
    this.entry=undefined;entry.claimed=true;return entry.pending;
  }
  clear():void{
    const entry=this.entry;
    this.entry=undefined;
    if(entry)void entry.pending.then(value=>this.dispose(value),()=>undefined);
    // The completion handler also handles pending replacement. Mark this
    // entry claimed so a late decode cannot dispose the same geometry twice.
    if(entry)entry.claimed=true;
  }
}
