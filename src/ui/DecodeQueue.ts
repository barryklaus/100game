/** Native image decoding allocates outside the JS heap. Bound simultaneous work. */
export class DecodeQueue {
  private active = 0;
  private waiting: Array<{start:()=>void;priority:number;key?:string}> = [];
  constructor(private readonly limit = 2) {}
  promote(key:string,priority:number):void{
    const queued=this.waiting.find(item=>item.key===key);
    if(queued)queued.priority=Math.max(queued.priority,priority);
    this.waiting.sort((a,b)=>b.priority-a.priority);
  }
  async run<T>(task: () => Promise<T>,priority=0,key?:string): Promise<T> {
    await new Promise<void>(resolve => {
      if (this.active < this.limit) { this.active++; resolve(); }
      else {this.waiting.push({start:resolve,priority,key});this.waiting.sort((a,b)=>b.priority-a.priority);}
    });
    try { return await task(); }
    finally {
      const next = this.waiting.shift();
      if (next) next.start(); else this.active--;
    }
  }
}
