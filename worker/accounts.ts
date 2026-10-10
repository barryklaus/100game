import { ACCOUNT_STAT_KEYS, cleanStatDelta, emptyAccountStats, type AccountStats, type AccountUser } from '../src/account/model';
import { accountPoints } from '../src/game/points';
import { digest, equalSecret, normalizeRecovery, passwordHash, randomToken, recoveryCode, verifyPassword } from './accountCrypto';

const COOKIE='__Host-100next-session';
const SESSION_MS=30*24*60*60*1000;
type UserRow={id:string;username:string;password:string;recovery:string;online:string;practice:string};
interface AccountEnv { ADMIN_BOOTSTRAP_USERNAME?:string; ADMIN_BOOTSTRAP_PASSWORD_HASH?:string }
class AccountError extends Error { constructor(message:string,readonly status=400){super(message);} }
function json(body:unknown,status=200,cookie?:string):Response {
  const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(cookie)headers['Set-Cookie']=cookie;
  return Response.json(body,{status,headers});
}
export function sessionCookie(token:string,maxAge=SESSION_MS/1000):string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function cookieToken(request:Request):string {
  const token=(request.headers.get('Cookie')??'').split(';').map(value=>value.trim()).find(value=>value.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';
  return /^[a-f0-9]{64}$/.test(token)?token:'';
}
function username(input:unknown):string {
  const name=typeof input==='string'?input.trim():'';
  if(!/^[a-zA-Z0-9_]{3,15}$/.test(name)&&!(name.length<=254&&/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(name)))throw new AccountError('Use a name with 3–15 letters, numbers or underscores, or an email address.');
  return name;
}
function password(input:unknown,newPassword:boolean):string {
  if(typeof input!=='string'||input.length>(128)||input.length<(newPassword?12:1))throw new AccountError(newPassword?'Use a password with 12–128 characters.':'Enter your name and password.');
  return input;
}

/** Private account database, accessed only through the 100next namespace binding. */
export class AccountStore {
  private sql:SqlStorage;
  constructor(private ctx:DurableObjectState,private env:AccountEnv={}) {
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, recovery TEXT NOT NULL, online TEXT NOT NULL, practice TEXT NOT NULL, created INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS events (event_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(event_id,user_id,kind))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS character_points (avatar INTEGER PRIMARY KEY, points INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS character_outcomes (avatar INTEGER PRIMARY KEY, freedoms INTEGER NOT NULL, deaths INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS account_points (user_id TEXT PRIMARY KEY, points INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS administrators (user_id TEXT PRIMARY KEY)');
    if(!this.sql.exec<{name:string}>('PRAGMA table_info(users)').toArray().some(column=>column.name==='country'))this.sql.exec("ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT ''");
  }
  private one<T extends Record<string,SqlStorageValue>>(query:string,...args:SqlStorageValue[]):T|undefined {
    return this.sql.exec<T>(query,...args).toArray()[0];
  }
  private limit(key:string,max:number,windowMs=10*60*1000):void {
    const now=Date.now();
    const row=this.one<{count:number;expires:number}>('SELECT count,expires FROM limits WHERE key=?',key);
    if(row&&row.expires>now&&row.count>=max)throw new AccountError('Too many attempts. Please try again later.',429);
    this.sql.exec('INSERT INTO limits(key,count,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires=excluded.expires',key,row&&row.expires>now?row.count+1:1,row&&row.expires>now?row.expires:now+windowMs);
  }
  private async current(request:Request):Promise<UserRow|undefined> {
    const token=cookieToken(request);if(!token)return;
    return this.one<UserRow>('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.token=? AND sessions.expires>?',await digest(token),Date.now());
  }
  private publicUser(user:UserRow):AccountUser {
    const points=this.one<{points:number}>('SELECT points FROM account_points WHERE user_id=?',user.id)?.points;
    return {id:user.id,username:user.username,lifetimePoints:points??accountPoints(JSON.parse(user.online))+accountPoints(JSON.parse(user.practice)),...(this.isAdmin(user.id)?{admin:true}:{})};
  }
  private isAdmin(id:string):boolean { return !!this.one('SELECT user_id FROM administrators WHERE user_id=?',id); }
  private bootstrapName(name:string):boolean { return !!this.env.ADMIN_BOOTSTRAP_USERNAME&&name.toLowerCase()===this.env.ADMIN_BOOTSTRAP_USERNAME.toLowerCase()&&!this.one('SELECT user_id FROM administrators LIMIT 1'); }
  private registrationCountry(request:Request):string { const country=request.headers.get('X-100next-Country')??'';return /^[A-Z]{2}$/.test(country)&&!['XX','T1','ZZ'].includes(country)?country:''; }
  private async bootstrap(name:string,pass:string,request:Request):Promise<UserRow|undefined> {
    if(!this.bootstrapName(name)||!this.env.ADMIN_BOOTSTRAP_PASSWORD_HASH||!await verifyPassword(pass,this.env.ADMIN_BOOTSTRAP_PASSWORD_HASH))return;
    const id=crypto.randomUUID(),recovery=await digest(normalizeRecovery(recoveryCode()));
    this.ctx.storage.transactionSync(()=>{
      this.sql.exec('INSERT INTO users(id,username,password,recovery,online,practice,created) VALUES(?,?,?,?,?,?,?)',id,name,this.env.ADMIN_BOOTSTRAP_PASSWORD_HASH!,recovery,JSON.stringify(emptyAccountStats()),JSON.stringify(emptyAccountStats()),Date.now());
      this.sql.exec('INSERT INTO administrators(user_id) VALUES(?)',id);
      this.sql.exec('UPDATE users SET country=? WHERE id=?',this.registrationCountry(request),id);
    });
    // The owner can create a recovery code after sign-in; no bootstrap code is exposed.
    return this.one<UserRow>('SELECT * FROM users WHERE id=?',id);
  }
  private async requireAdmin(request:Request):Promise<UserRow> {
    const user=await this.current(request);if(!user)throw new AccountError('Sign in to your administrator account.',401);
    if(!this.isAdmin(user.id))throw new AccountError('Administrator access required.',403);return user;
  }
  private async adminUsers(request:Request):Promise<Response> {
    await this.requireAdmin(request);
    const url=new URL(request.url),search=(url.searchParams.get('search')??'').trim().slice(0,254),page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1))|0;
    const filter='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
    const total=this.one<{count:number}>("SELECT COUNT(*) AS count FROM users WHERE username LIKE ? ESCAPE '\\'",filter)!.count;
    const rows=this.sql.exec<{id:string;username:string;country:string;created:number;online:string;practice:string;points:number|null}>("SELECT users.id,username,country,created,online,practice,account_points.points FROM users LEFT JOIN account_points ON account_points.user_id=users.id WHERE username LIKE ? ESCAPE '\\' ORDER BY created DESC,users.id LIMIT 50 OFFSET ?",filter,(page-1)*50).toArray();
    const users=rows.map(row=>{const online=JSON.parse(row.online) as AccountStats,practice=JSON.parse(row.practice) as AccountStats;return {id:row.id,username:row.username,country:row.country,created:row.created,overallPoints:row.points??accountPoints(online)+accountPoints(practice),online,practice,admin:this.isAdmin(row.id)};});
    const totals=this.one<{users:number;freedoms:number;deaths:number;rounds:number}>("SELECT COUNT(*) AS users,COALESCE(SUM(json_extract(online,'$.freedoms')+json_extract(practice,'$.freedoms')),0) AS freedoms,COALESCE(SUM(json_extract(online,'$.deaths')+json_extract(practice,'$.deaths')),0) AS deaths,COALESCE(SUM(json_extract(online,'$.rounds')+json_extract(practice,'$.rounds')),0) AS rounds FROM users");
    return json({users,total,page,pageSize:50,totals});
  }
  private view(user?:UserRow) {
    return {user:user?this.publicUser(user):null,online:user?JSON.parse(user.online) as AccountStats:emptyAccountStats(),practice:user?JSON.parse(user.practice) as AccountStats:emptyAccountStats()};
  }
  private async newSession(user:UserRow,recovery?:string):Promise<Response> {
    const token=randomToken();
    this.sql.exec('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await digest(token),user.id,Date.now()+SESSION_MS);
    // Keep a bounded number of devices signed in for one account.
    this.sql.exec('DELETE FROM sessions WHERE user_id=? AND token NOT IN (SELECT token FROM sessions WHERE user_id=? ORDER BY expires DESC LIMIT 10)',user.id,user.id);
    return json({...this.view(user),...(recovery?{recoveryCode:recovery}:{})},200,sessionCookie(token));
  }
  private record(user:UserRow,eventId:string,kind:'online'|'practice',input:unknown):void {
    if(!/^[a-zA-Z0-9:_-]{8,150}$/.test(eventId))throw new AccountError('Invalid round reference.');
    if(this.one('SELECT event_id FROM events WHERE event_id=? AND user_id=? AND kind=?',eventId,user.id,kind))return;
    const delta=cleanStatDelta(input,kind==='practice');
    if(kind==='practice'&&(delta.rounds!==1||delta.survives+delta.busts!==1||delta.cards>1000||delta.exacts>1000))throw new AccountError('Invalid practice result.');
    const stats=JSON.parse(user[kind]) as AccountStats;
    const balance=delta.freedoms||delta.deaths?0:Math.max(-1e9,Math.min(1e9,(this.publicUser(user).lifetimePoints??0)+accountPoints(delta)));
    for(const key of ACCOUNT_STAT_KEYS)stats[key]=Math.min(1e9,(stats[key]??0)+delta[key]);
    this.ctx.storage.transactionSync(()=>{
      this.sql.exec(`UPDATE users SET ${kind}=? WHERE id=?`,JSON.stringify(stats),user.id);
      this.sql.exec('INSERT INTO account_points(user_id,points) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET points=excluded.points',user.id,balance);
      this.sql.exec('INSERT INTO events(event_id,user_id,kind) VALUES(?,?,?)',eventId,user.id,kind);
    });
  }
  async fetch(request:Request):Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async()=>{
      try{return await this.handle(request);}
      catch(error){return json({error:error instanceof AccountError?error.message:'Account service could not complete that request. Please retry.'},error instanceof AccountError?error.status:500);}
    });
  }
  private async handle(request:Request):Promise<Response> {
    const path=new URL(request.url).pathname;
    const internal=path.startsWith('/internal/');
    if(path==='/api/admin/users'&&request.method==='GET')return this.adminUsers(request);
    if(path==='/internal/session'&&request.method==='GET'){const user=await this.current(request);return json({user:user?this.publicUser(user):null});}
    if(path==='/api/account/me'&&request.method==='GET')return json(this.view(await this.current(request)));
    if(request.method!=='POST')return json({error:'Endpoint not found.'},404);
    if(!internal){
      const origin=request.headers.get('Origin');
      if(origin!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new AccountError('Open the account form from the game.',403);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new AccountError('JSON required.',415);
    }
    if(!['/api/account/register','/api/account/login','/api/account/logout','/api/account/recover','/api/account/practice','/api/account/security','/api/admin/user-login','/internal/record','/internal/points','/internal/cpu-record'].includes(path))return json({error:'Endpoint not found.'},404);
    const length=Number(request.headers.get('Content-Length')??0);if(length>4096)throw new AccountError('Request is too large.',413);
    const raw=await request.text();if(raw.length>4096)throw new AccountError('Request is too large.',413);
    let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{throw new AccountError('Invalid request.');}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new AccountError('Invalid request.');
    if(path==='/api/admin/user-login') {
      const admin=await this.requireAdmin(request);this.limit('admin-security:'+admin.id,10);
      if(!await verifyPassword(password(body.currentPassword,false),admin.password))throw new AccountError('Your administrator password is incorrect.',401);
      const target=typeof body.userId==='string'?this.one<UserRow>('SELECT * FROM users WHERE id=?',body.userId):undefined;
      if(!target)throw new AccountError('User not found.',404);
      if(target.id===admin.id)throw new AccountError('Use My login to change your own account.',400);
      const nextName=body.username?username(body.username):target.username;
      const taken=this.one<{id:string}>('SELECT id FROM users WHERE username=?',nextName);if(taken&&taken.id!==target.id)throw new AccountError('That name is already taken.',409);
      const hash=body.newPassword?await passwordHash(password(body.newPassword,true)):target.password;
      if(!body.username&&!body.newPassword)throw new AccountError('Enter a new name or password.',400);
      this.ctx.storage.transactionSync(()=>{this.sql.exec('UPDATE users SET username=?,password=? WHERE id=?',nextName,hash,target.id);this.sql.exec('DELETE FROM sessions WHERE user_id=?',target.id);});
      return json({ok:true,username:nextName});
    }
    if(path==='/api/account/security') {
      const user=await this.current(request);if(!user)throw new AccountError('Sign in to change your login.',401);
      this.limit('security:'+user.id,10);
      if(!await verifyPassword(password(body.currentPassword,false),user.password))throw new AccountError('Current password is incorrect.',401);
      const nextName=body.username?username(body.username):user.username;
      const taken=this.one<{id:string}>('SELECT id FROM users WHERE username=?',nextName);if(taken&&taken.id!==user.id)throw new AccountError('That name is already taken.',409);
      if(this.bootstrapName(nextName)&&nextName.toLowerCase()!==user.username.toLowerCase())throw new AccountError('That name is unavailable.',409);
      const hash=body.newPassword?await passwordHash(password(body.newPassword,true)):user.password;
      const code=body.rotateRecovery===true?recoveryCode():undefined;
      const recovery=code?await digest(normalizeRecovery(code)):user.recovery;
      this.ctx.storage.transactionSync(()=>{this.sql.exec('UPDATE users SET username=?,password=?,recovery=? WHERE id=?',nextName,hash,recovery,user.id);this.sql.exec('DELETE FROM sessions WHERE user_id=?',user.id);});
      return this.newSession(this.one<UserRow>('SELECT * FROM users WHERE id=?',user.id)!,code);
    }
    if(path==='/internal/points') {
      const ids=Array.isArray(body.accounts)?body.accounts.filter(id=>typeof id==='string').slice(0,8) as string[]:[];
      const avatars=Array.isArray(body.cpus)?body.cpus.filter(avatar=>Number.isInteger(avatar)&&avatar>=0&&avatar<16).slice(0,8) as number[]:[];
      return json({accounts:Object.fromEntries(ids.map(id=>{const user=this.one<UserRow>('SELECT * FROM users WHERE id=?',id);return [id,user?this.publicUser(user).lifetimePoints:0];})),cpus:Object.fromEntries(avatars.map(avatar=>[avatar,this.one<{points:number}>('SELECT points FROM character_points WHERE avatar=?',avatar)?.points??0])),outcomes:{
        accounts:Object.fromEntries(ids.map(id=>{const user=this.one<UserRow>('SELECT * FROM users WHERE id=?',id);const online=user?JSON.parse(user.online):{},practice=user?JSON.parse(user.practice):{};return [id,{freedoms:(online.freedoms??0)+(practice.freedoms??0),deaths:(online.deaths??0)+(practice.deaths??0)}];})),
        cpus:Object.fromEntries(avatars.map(avatar=>[avatar,this.one<{freedoms:number;deaths:number}>('SELECT freedoms,deaths FROM character_outcomes WHERE avatar=?',avatar)??{freedoms:0,deaths:0}]))
      }});
    }
    if(path==='/internal/cpu-record') {
      const avatar=Number(body.avatar),delta=Number(body.delta),eventId=String(body.eventId??''),key=`cpu:${avatar}`;
      if(!Number.isInteger(avatar)||avatar<0||avatar>=16||!Number.isSafeInteger(delta)||Math.abs(delta)>10000||!/^[a-zA-Z0-9:_-]{8,150}$/.test(eventId))throw new AccountError('Invalid character result.');
      if(!this.one('SELECT event_id FROM events WHERE event_id=? AND user_id=? AND kind=?',eventId,key,'cpu')) {
        this.ctx.storage.transactionSync(()=>{
          if(body.reset===true)this.sql.exec('INSERT INTO character_points(avatar,points) VALUES(?,0) ON CONFLICT(avatar) DO UPDATE SET points=0',avatar);
          else this.sql.exec('INSERT INTO character_points(avatar,points) VALUES(?,?) ON CONFLICT(avatar) DO UPDATE SET points=MAX(-1000000000,MIN(1000000000,points+excluded.points))',avatar,delta);
          const count=(value:unknown)=>Number.isSafeInteger(value)?Math.max(0,Math.min(8,Number(value))):0;
          this.sql.exec('INSERT INTO character_outcomes(avatar,freedoms,deaths) VALUES(?,?,?) ON CONFLICT(avatar) DO UPDATE SET freedoms=MIN(1000000000,freedoms+excluded.freedoms),deaths=MIN(1000000000,deaths+excluded.deaths)',avatar,count(body.freedoms),count(body.deaths));
          this.sql.exec('INSERT INTO events(event_id,user_id,kind) VALUES(?,?,?)',eventId,key,'cpu');
        });
      }
      return json({ok:true});
    }
    this.sql.exec('DELETE FROM sessions WHERE expires<?',Date.now());this.sql.exec('DELETE FROM limits WHERE expires<?',Date.now());
    if(path==='/internal/record'){
      const user=typeof body.userId==='string'?this.one<UserRow>('SELECT * FROM users WHERE id=?',body.userId):undefined;
      if(!user)throw new AccountError('Account not found.',404);
      this.record(user,String(body.eventId??''),'online',body.delta);return json({ok:true});
    }
    if(path==='/api/account/logout'){
      const token=cookieToken(request);if(token)this.sql.exec('DELETE FROM sessions WHERE token=?',await digest(token));
      return json({ok:true},200,sessionCookie('',0));
    }
    if(path==='/api/account/practice'){
      const user=await this.current(request);if(!user)throw new AccountError('Sign in to save practice statistics.',401);
      this.limit('practice:'+user.id,60);this.record(user,String(body.eventId??''),'practice',body.delta);
      return json(this.view(this.one<UserRow>('SELECT * FROM users WHERE id=?',user.id)));
    }
    const ip=request.headers.get('CF-Connecting-IP')??'unknown';
    this.limit('auth-ip:'+ip,30);
    const name=username(body.username);
    this.limit('auth-name:'+name.toLowerCase(),10);
    if(path==='/api/account/register'){
      if(this.bootstrapName(name))throw new AccountError('That name is unavailable.',409);
      this.limit('register:'+ip,5,60*60*1000);
      const pass=password(body.password,true);
      if(this.one('SELECT id FROM users WHERE username=?',name))throw new AccountError('That name is taken. Try another.',409);
      const code=recoveryCode(),id=crypto.randomUUID();
      const hash=await passwordHash(pass);
      this.sql.exec('INSERT INTO users(id,username,password,recovery,online,practice,created) VALUES(?,?,?,?,?,?,?)',id,name,hash,await digest(normalizeRecovery(code)),JSON.stringify(emptyAccountStats()),JSON.stringify(emptyAccountStats()),Date.now());
      this.sql.exec('UPDATE users SET country=? WHERE id=?',this.registrationCountry(request),id);
      return this.newSession(this.one<UserRow>('SELECT * FROM users WHERE id=?',id)!,code);
    }
    const user=this.one<UserRow>('SELECT * FROM users WHERE username=?',name)??(path==='/api/account/login'?await this.bootstrap(name,password(body.password,false),request):undefined);
    if(path==='/api/account/recover'){
      const pass=password(body.password,true),code=typeof body.recoveryCode==='string'?normalizeRecovery(body.recoveryCode):'';
      if(!user||!equalSecret(await digest(code),user.recovery))throw new AccountError('Name or recovery code is incorrect.',401);
      const nextCode=recoveryCode(),hash=await passwordHash(pass),recovery=await digest(normalizeRecovery(nextCode));
      this.ctx.storage.transactionSync(()=>{
        this.sql.exec('UPDATE users SET password=?,recovery=? WHERE id=?',hash,recovery,user.id);
        this.sql.exec('DELETE FROM sessions WHERE user_id=?',user.id);
      });
      return this.newSession(this.one<UserRow>('SELECT * FROM users WHERE id=?',user.id)!,nextCode);
    }
    const pass=password(body.password,false);
    // A missing name still performs the expensive derivation to avoid a fast timing oracle.
    const valid=user?await verifyPassword(pass,user.password):(await passwordHash(pass),false);
    if(!valid||!user)throw new AccountError('Name or password is incorrect.',401);
    return this.newSession(user);
  }
}

export async function accountForRequest(request:Request,accounts?:DurableObjectNamespace):Promise<AccountUser|null> {
  if(!accounts)return null;
  const response=await accounts.getByName('accounts-v1').fetch(new Request('https://accounts.internal/internal/session',{headers:{Cookie:request.headers.get('Cookie')??''}}));
  if(!response.ok)throw new Error('Account verification unavailable.');
  return (await response.json() as {user:AccountUser|null}).user;
}
