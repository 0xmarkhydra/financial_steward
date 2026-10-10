import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, ArrowRight, CircleAlert, CreditCard, Eye, EyeOff, Lock, Mail, ShieldCheck, Wallet } from 'lucide-react';
const App = lazy(() => import('./App'));
import type { FinanceData } from './types';
import { exportData } from './storage';
import { clearToken, deleteAccount, getState, getToken, login, logout, me, register, saveState, setToken } from './api';
import type { Account } from './api';

type Session={account:Account; data:FinanceData; revision:number};
type Status='saved'|'saving'|'conflict'|'error';
export default function SessionRoot(){
 const [session,setSession]=useState<Session|null>(null);
 const [loading,setLoading]=useState(true);
 const [formMode,setFormMode]=useState<'login'|'register'>('login');
 const [busy,setBusy]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const [message,setMessage]=useState('');
 const [status,setStatus]=useState<Status>('saved');
 const [unsaved,setUnsaved]=useState<FinanceData|null>(null);
 const revision=useRef(0);
 const pending=useRef<FinanceData|null>(null);
 const flushing=useRef(false);
 const blocked=useRef(false);
 const current=useRef<FinanceData|null>(null);
 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const token=await getToken();
    if(!token)return;
    const [info,state]=await Promise.all([me(),getState()]);
    if(!active)return;
    revision.current=state.revision;
    current.current=state.data;
    setSession({account:info.user,data:state.data,revision:state.revision});
   }catch(err){
    if(active){setMessage(err instanceof Error&&err.message.includes('VITE_API_URL')?err.message:'Không thể khôi phục phiên đăng nhập. Hãy đăng nhập lại.');await clearToken().catch(()=>{});}
   }finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[]);
 const persist=useCallback((data:FinanceData)=>{
  if(blocked.current)return;
  current.current=data;
  pending.current=data;
  setUnsaved(data);
  setStatus('saving');
  if(flushing.current)return;
  flushing.current=true;
  void (async()=>{
   try{
    while(pending.current&&!blocked.current){
     const snapshot=pending.current;
     pending.current=null;
     try{
      const result=await saveState(snapshot,revision.current);
      revision.current=result.revision;
      if(!pending.current){setUnsaved(null);setStatus('saved');}
     }catch(err){
      blocked.current=true;
      pending.current=null;
      setStatus(err instanceof Error&&'status' in err&&(err as {status?:number}).status===409?'conflict':'error');
      setMessage(err instanceof Error?err.message:'Không thể lưu dữ liệu.');
     }
    }
   }finally{flushing.current=false;}
  })();
 },[]);
 const openSession=async (auth:{token:string;user:Account})=>{
  await setToken(auth.token);
  const state=await getState();
  pending.current=null;blocked.current=false;revision.current=state.revision;setStatus('saved');setUnsaved(null);current.current=state.data;
  setSession({account:auth.user,data:state.data,revision:state.revision});
 };
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setMessage('');
  const fd=new FormData(e.currentTarget);const email=String(fd.get('email')||'');const password=String(fd.get('password')||'');
  try{
   const result=formMode==='register'?await register(email,password):await login(email,password);
   await openSession(result);
  }catch(err){setMessage(err instanceof Error?err.message:'Không thể đăng nhập.');}
  finally{setBusy(false);}
 }
 async function endSession(deletePassword?:string){
  if(unsaved||status==='saving'){if(!window.confirm('Vẫn có dữ liệu chưa đồng bộ. Bạn muốn tiếp tục? Hãy xuất sao lưu trước nếu cần.'))return;}
  try{if(deletePassword!==undefined)await deleteAccount(deletePassword);else await logout();}
  catch(err){setMessage(err instanceof Error?err.message:'Không thể thực hiện thao tác.');if(deletePassword!==undefined)throw err;}
  await clearToken();
  setSession(null);setUnsaved(null);blocked.current=false;revision.current=0;pending.current=null;setStatus('saved');
 }
 async function reload(){
  try{setLoading(true);const state=await getState();revision.current=state.revision;current.current=state.data;pending.current=null;blocked.current=false;setUnsaved(null);setStatus('saved');if(session)setSession({...session,data:state.data});}
  catch(err){setMessage(err instanceof Error?err.message:'Không thể tải lại dữ liệu.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{
  if(status!=='saving'&&!unsaved)return;
  const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);
 },[status,unsaved]);
 if(loading)return <div className="auth-screen"><div className="auth-loading"><div className="brand-mark"><Activity size={25}/></div><h2>Financial Steward</h2><p>Đang kết nối dữ liệu tài chính...</p></div></div>;
 if(!session)return <div className="auth-screen"><div className="auth-layout"><section className="auth-info"><div className="auth-brand"><div className="brand-mark"><Activity size={27}/></div><strong>financial<span>steward</span></strong></div><div><div className="auth-eyebrow">QUẢN GIA TÀI CHÍNH THÔNG MINH</div><h1>Kiểm soát hôm nay.<br/><span>An tâm ngày mai.</span></h1><p>Quản lý mọi khoản nợ, theo dõi chi tiêu và xây dựng kế hoạch trả nợ rõ ràng trên mọi thiết bị.</p><div className="auth-points"><div><CreditCard size={21}/> Theo dõi nợ & lịch thanh toán</div><div><Wallet size={21}/> Quản lý thu chi và ngân sách</div><div><ShieldCheck size={21}/> Dữ liệu riêng tư theo tài khoản</div></div></div><small>Financial Steward · Web, iOS & Android</small></section><section className="auth-form-panel"><div className="auth-form-inner"><div className="auth-form-head"><div className="eyebrow">CHÀO MỪNG BẠN</div><h2>{formMode==='register'?'Tạo tài khoản mới':'Đăng nhập tài khoản'}</h2><p>{formMode==='register'?'Bắt đầu hành trình làm chủ tài chính của bạn.':'Tiếp tục quản lý dòng tiền và các khoản nợ.'}</p></div><form onSubmit={submit} className="auth-form"><label><span>Địa chỉ email</span><div className="auth-input"><Mail size={19}/><input name="email" type="email" placeholder="email@domain.com" autoComplete="email" required maxLength={254}/></div></label><label><span>Mật khẩu</span><div className="auth-input"><Lock size={19}/><input name="password" type={showPassword?'text':'password'} placeholder={formMode==='register'?'Ít nhất 12 ký tự':'Nhập mật khẩu'} autoComplete={formMode==='register'?'new-password':'current-password'} required minLength={formMode==='register'?12:1}/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label="Ẩn hoặc hiện mật khẩu">{showPassword?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></label>{message&&<div className="auth-error"><CircleAlert size={17}/>{message}</div>}<button className="btn primary auth-submit" disabled={busy}>{busy?'Đang xử lý...':formMode==='register'?'Tạo tài khoản':'Đăng nhập'}<ArrowRight size={18}/></button></form><div className="auth-switch">{formMode==='register'?'Đã có tài khoản?':'Chưa có tài khoản?'} <button onClick={()=>{setFormMode(v=>v==='register'?'login':'register');setMessage('')}}>{formMode==='register'?'Đăng nhập':'Đăng ký miễn phí'}</button></div><p className="auth-footnote">Dữ liệu lưu trên máy chủ được bảo vệ bởi tài khoản. Tránh nhập thông tin thẻ, mật khẩu ngân hàng hay mã OTP vào ghi chú.</p></div></section></div></div>;
 return <><Suspense fallback={<div className="auth-screen"><div className="auth-loading"><div className="brand-mark"><Activity size={25}/></div><h2>Quản gia tài chính</h2><p>Đang mở bảng điều khiển...</p></div></div>}><App key={session.account.id+'-'+session.revision} initialData={session.data} persist={persist} accountEmail={session.account.email} onLogout={()=>endSession()} onDeleteAccount={async(password)=>endSession(password)}/></Suspense>
 {status!=='saved'&&<div className={'sync-banner '+(status==='saving'?'sync-saving':'sync-error')} role="status"><CircleAlert size={18}/><span>{status==='saving'?'Đang đồng bộ dữ liệu...':status==='conflict'?'Dữ liệu đã thay đổi trên một thiết bị khác. Lưu bản sao trước khi tải lại.':'Lỗi đồng bộ: '+message}</span>{status!=='saving'&&<><button onClick={()=>exportData(current.current||unsaved||session.data)}>Xuất dữ liệu</button><button onClick={()=>void reload()}>Tải lại</button></>}</div>}
 </>;
}
