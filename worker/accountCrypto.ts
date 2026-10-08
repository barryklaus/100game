import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

// OWASP's 32 MiB scrypt profile fits the Durable Object memory budget.
const options = { N:32768, r:8, p:3, dkLen:32, maxmem:64*1024*1024 };
export const randomToken = (bytes=32): string => bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
export async function digest(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
}
export function equalSecret(a: string,b: string): boolean {
  if (a.length !== b.length) return false;
  let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;
}
export async function passwordHash(password: string,salt=randomToken(16)): Promise<string> {
  const key=await scryptAsync(password,hexToBytes(salt),options);
  const hash=`scrypt:32768:8:3:${salt}:${bytesToHex(key)}`;key.fill(0);return hash;
}
export async function verifyPassword(password: string,stored: string): Promise<boolean> {
  const parts=stored.split(':');
  if(parts.length!==6||parts.slice(0,4).join(':')!=='scrypt:32768:8:3')return false;
  return equalSecret(await passwordHash(password,parts[4]),stored);
}
export function recoveryCode(): string { return randomToken(16).toUpperCase().match(/.{1,4}/g)!.join('-'); }
export const normalizeRecovery = (value: string): string => value.replace(/[\s-]/g,'').toUpperCase();
