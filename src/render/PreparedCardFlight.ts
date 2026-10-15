/** Prepare only the visible hand before release. Superseded work stays bounded. */
export class PreparedCardFlight<T> {
  private entries=new Map<string,{pending:Promise<T>;claimed:boolean}>();
  constructor(private create:(key:string)=>Promise<T>,private dispose:(value:T)=>void,private capacity=1){}
  warm(key:string):void{
    if(this.entries.has(key))return;
    while(this.entries.size>=this.capacity)this.drop(this.entries.keys().next().value!);
    const entry={pending:this.create(key),claimed:false};
    this.entries.set(key,entry);
    void entry.pending.then(value=>{
      if(this.entries.get(key)!==entry&&!entry.claimed)this.dispose(value);
    },()=>{if(this.entries.get(key)===entry)this.entries.delete(key);});
  }
  take(key:string):Promise<T>{
    const entry=this.entries.get(key);
    if(!entry)return this.create(key);
    this.entries.delete(key);entry.claimed=true;return entry.pending;
  }
  private drop(key:string):void{
    const entry=this.entries.get(key);this.entries.delete(key);
    if(!entry||entry.claimed)return;
    entry.claimed=true;
    void entry.pending.then(value=>this.dispose(value),()=>undefined);
  }
  clear():void{for(const key of this.entries.keys())this.drop(key);}
}
