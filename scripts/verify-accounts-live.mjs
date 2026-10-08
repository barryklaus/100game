import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const origin=process.argv[2]??'https://100next.pages.dev';
const username='QA_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
let cookie='';
async function request(action,body){
  const response=await fetch(`${origin}/api/account/${action}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,`${action} returned ${response.status}`);
  const next=response.headers.get('Set-Cookie');if(next)cookie=next.split(';')[0];return response.json();
}
assert.equal((await request('me')).user,null);
const registration=await request('register',{username,password});assert.equal(registration.user.username,username);assert.match(registration.recoveryCode,/^([A-F0-9]{4}-){7}[A-F0-9]{4}$/);
assert.equal((await request('me')).user.id,registration.user.id);
const eventId=randomBytes(16).toString('hex');const practice={eventId,delta:{rounds:1,survives:1,cards:2,freedoms:99}};
await request('practice',practice);await request('practice',practice);
await request('logout',{});assert.equal((await request('me')).user,null);
await request('login',{username:username.toLowerCase(),password});
const saved=await request('me');assert.equal(saved.practice.rounds,1);assert.equal(saved.practice.freedoms,0);assert.equal(saved.online.rounds,0);
await request('logout',{});
assert.equal((await fetch(`${origin}/api/account/internal/record`,{method:'POST',headers:{Origin:origin},body:'{}'})).status,404);
console.log('Published account API verified: registration, recovery code, secure sessions, logout/login, case-insensitive names, saved practice, duplicate protection and private online records.');
