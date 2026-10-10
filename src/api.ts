import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { FinanceData } from './types';
const TOKEN_KEY = 'financial_steward_access_token';
const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export interface Account {id:string;email:string;}
export interface AuthResponse {token:string;user:Account;}
export interface ServerState {data:FinanceData;revision:number;}
export class APIError extends Error {constructor(public readonly status:number,message:string){super(message);this.name='APIError';}}
export const hasNativeRuntime=Capacitor.isNativePlatform();
function ensureBase(){
 if(hasNativeRuntime&&!/^https:\/\//i.test(base))throw new Error('Bản mobile cần VITE_API_URL là địa chỉ API HTTPS hợp lệ.');
 if(import.meta.env.PROD&&base&&new URL(base).protocol!=='https:')throw new Error('API phải sử dụng HTTPS.');
}
export async function getToken():Promise<string|null>{
 if(hasNativeRuntime){const val=await SecureStorage.get(TOKEN_KEY);return typeof val==='string'?val:null;}
 return sessionStorage.getItem(TOKEN_KEY);
}
export async function setToken(token:string):Promise<void>{
 if(hasNativeRuntime)await SecureStorage.set(TOKEN_KEY,token);
 else sessionStorage.setItem(TOKEN_KEY,token);
}
export async function clearToken():Promise<void>{
 if(hasNativeRuntime)await SecureStorage.remove(TOKEN_KEY);
 else sessionStorage.removeItem(TOKEN_KEY);
}
export async function request<T>(path:string,method='GET',body?:unknown,authToken?:string):Promise<T>{
 ensureBase();
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try {
  const token=authToken===undefined?await getToken():authToken;
  const headers:Record<string,string>={'Accept':'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  const resp=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
  const result=await resp.json().catch(()=>({}));
  if(!resp.ok)throw new APIError(resp.status,typeof result.error==='string'?result.error:'Máy chủ trả về lỗi '+resp.status);
  return result as T;
 }catch(err){
  if(err instanceof APIError)throw err;
  if(err instanceof Error&&err.name==='AbortError')throw new Error('Kết nối đến máy chủ quá thời gian.');
  throw err instanceof Error?err:new Error('Không thể kết nối máy chủ.');
 }finally{clearTimeout(timer);}
}
export const register=(email:string,password:string)=>request<AuthResponse>('/api/v1/auth/register','POST',{email,password},'');
export const login=(email:string,password:string)=>request<AuthResponse>('/api/v1/auth/login','POST',{email,password},'');
export const me=()=>request<{user:Account}>('/api/v1/me');
export const getState=()=>request<ServerState>('/api/v1/state');
export const saveState=(data:FinanceData,revision:number)=>request<{revision:number}>('/api/v1/state','PUT',{data,revision});
export interface JournalEntry {id:number;revision:number;eventType:string;action:string;recordId:string;title:string;amount:number;createdAt:string;}
export const getJournal=()=>request<{events:JournalEntry[]}>('/api/v1/journal');
export const logout=()=>request('/api/v1/auth/logout','POST');
export const deleteAccount=(password:string)=>request('/api/v1/account','DELETE',{password});
