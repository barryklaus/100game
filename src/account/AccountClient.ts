import { emptyAccountStats, type AccountSnapshot, type AccountStats } from './model';
interface PracticeEntry { owner:string; eventId:string; delta:AccountStats }
const QUEUE='100next.account.practice.v1';
export class AccountClient {
  snapshot:AccountSnapshot={user:null,online:emptyAccountStats(),practice:emptyAccountStats()};
  busy=false;error='';recoveryCode='';mode:'login'|'register'|'recover'='login';
  private epoch=0;private refreshing=false;
  constructor(private changed:()=>void){}
  private async request(path:string,body?:unknown):Promise<AccountSnapshot&{recoveryCode?:string}> {
    const response=await fetch('/api/account/'+path,{credentials:'same-origin',cache:'no-store',method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const data=await response.json() as AccountSnapshot&{error?:string;recoveryCode?:string};
    if(!response.ok)throw new Error(data.error||'Unable to connect to your account.');return data;
  }
  async refresh():Promise<void> {
    if(this.busy||this.refreshing)return;this.refreshing=true;const epoch=this.epoch;
    try{const result=await this.request('me');if(epoch!==this.epoch)return;this.snapshot=result;await this.flush();this.changed();}catch{/* Guest play remains available when the service is offline. */}finally{this.refreshing=false;}
  }
  async submit(body:Record<string,string>):Promise<void> {
    if(this.busy)return;this.epoch++;this.busy=true;this.error='';this.changed();
    try{const result=await this.request(this.mode,body);this.snapshot=result;this.recoveryCode=result.recoveryCode??'';await this.flush();}
    catch(error){this.error=error instanceof Error?error.message:'Please try again.';}
    finally{this.busy=false;this.changed();}
  }
  async logout():Promise<void> {
    if(this.busy)return;this.epoch++;this.busy=true;this.error='';this.changed();
    try{await this.request('logout',{});this.snapshot={user:null,online:emptyAccountStats(),practice:emptyAccountStats()};this.recoveryCode='';}
    catch{this.error='Could not sign out. Please retry.';}
    finally{this.busy=false;this.changed();}
  }
  private queue():PracticeEntry[]{try{return JSON.parse(localStorage.getItem(QUEUE)??'[]') as PracticeEntry[];}catch{return [];}}
  async practice(owner:string,eventId:string,delta:AccountStats):Promise<void>{
    const queue=this.queue();if(!queue.some(item=>item.eventId===eventId))queue.push({owner,eventId,delta});
    localStorage.setItem(QUEUE,JSON.stringify(queue));await this.flush();this.changed();
  }
  private async flush():Promise<void>{
    const owner=this.snapshot.user?.id;if(!owner)return;
    for(const item of this.queue().filter(item=>item.owner===owner)){
      try{const result=await this.request('practice',{eventId:item.eventId,delta:item.delta});if(this.snapshot.user?.id!==owner)return;this.snapshot=result;const remaining=this.queue().filter(entry=>entry.eventId!==item.eventId);localStorage.setItem(QUEUE,JSON.stringify(remaining));}
      catch{break;}
    }
  }
}
