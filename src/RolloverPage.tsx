import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarClock, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import type { FinanceData, Rollover } from './types';
import { money, localISO } from './finance';
export default function RolloverPage({data,onChange}:{data:FinanceData;onChange:(next:FinanceData)=>void}){
 const [open,setOpen]=useState(false);
 const records=[...(data.rollovers||[])].sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
 const active=data.debts.filter(d=>d.balance>0);
 const today=localISO();
 const pending=records.filter(r=>r.status==='planned');
 const totalFee=records.filter(r=>r.status==='completed').reduce((a,r)=>a+r.fee,0);
 function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const fd=new FormData(e.currentTarget);
  const debtId=String(fd.get('debtId')||'');
  const debt=data.debts.find(d=>d.id===debtId);
  const amount=Number(fd.get('amount')),fee=Number(fd.get('fee'));
  if(!debt||!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(fee)||fee<0||amount>9e15||fee>9e15)return;
  const entry:Rollover={id:crypto.randomUUID(),debtId,kind:debt.kind==='card'?'card':'loan',dueDate:String(fd.get('dueDate')),amount,fee,funding:String(fd.get('funding')) as Rollover['funding'],status:'planned',completedAt:'',note:String(fd.get('note')||'').slice(0,2000)};
  onChange({...data,rollovers:[...(data.rollovers||[]),entry]});setOpen(false);
 }
 function update(id:string,status:Rollover['status']){onChange({...data,rollovers:(data.rollovers||[]).map(r=>r.id===id?{...r,status,completedAt:status==='completed'?today:''}:r)});}
 function remove(id:string){if(window.confirm('Xóa lịch sử đáo hạn này?'))onChange({...data,rollovers:(data.rollovers||[]).filter(r=>r.id!==id)});}
 return <><div className="page-heading"><div><div className="eyebrow">QUẢN LÝ NGHĨA VỤ ĐẾN HẠN</div><h1>Đáo hạn thẻ & khoản vay</h1><p>Quản lý ngày đến hạn, nguồn tiền, chi phí và lịch sử xử lý. Đáo hạn không mặc nhiên làm giảm dư nợ.</p></div><button className="btn primary" onClick={()=>setOpen(v=>!v)}><Plus size={16}/> Thêm lịch đáo hạn</button></div>
 <div className="stats-grid triple"><div className="stat-card"><div className="stat-line">Số lịch cần xử lý</div><strong>{pending.length}</strong></div><div className="stat-card"><div className="stat-line">Tổng số tiền dự kiến</div><strong>{money(pending.reduce((s,r)=>s+r.amount,0))}</strong></div><div className="stat-card"><div className="stat-line">Phí đã ghi nhận</div><strong>{money(totalFee)}</strong></div></div>
 {open&&<section className="panel" style={{marginBottom:20}}><h2 style={{marginBottom:18}}>Lập lịch đáo hạn</h2><form onSubmit={submit}><div className="form-two"><label className="field">Khoản nợ / thẻ<select name="debtId" required>{active.map(d=><option key={d.id} value={d.id}>{d.name} · {money(d.balance)}</option>)}</select></label><label className="field">Ngày đến hạn<input type="date" name="dueDate" defaultValue={today} required/></label><label className="field">Số tiền cần xử lý (VNĐ)<input type="number" name="amount" min="1" step="1" required/></label><label className="field">Phí dự kiến (VNĐ)<input type="number" name="fee" min="0" step="1" defaultValue="0" required/></label><label className="field">Nguồn tiền<select name="funding"><option value="own">Tiền tự có</option><option value="bank_transfer">Chuyển dư nợ ngân hàng</option><option value="refinance">Khoản vay tái cấp vốn hợp lệ</option><option value="other">Nguồn khác</option></select></label><label className="field">Ghi chú<input name="note" maxLength={2000} placeholder="Thông tin cần nhớ"/></label></div><div className="modal-actions"><button className="btn outline" type="button" onClick={()=>setOpen(false)}>Hủy</button><button className="btn primary" disabled={!active.length}>Lưu lịch đáo hạn</button></div>{!active.length&&<p className="muted-note">Hãy thêm khoản nợ hoặc thẻ tín dụng trước.</p>}</form></section>}
 <section className="panel"><h2 style={{marginBottom:18}}>Danh sách đáo hạn</h2>{!records.length?<div className="empty-state"><CalendarClock size={35}/><strong>Chưa có lịch đáo hạn</strong><p>Thêm lịch để theo dõi ngày đến hạn và các khoản phí.</p></div>:<div className="rows">{records.map(r=>{const debt=data.debts.find(d=>d.id===r.debtId);return <div className="data-row" key={r.id} style={{flexWrap:'wrap'}}><div className="transaction-icon"><CalendarClock size={20}/></div><div className="row-name"><strong>{debt?.name||'Khoản nợ'} · {r.kind==='card'?'Thẻ tín dụng':'Khoản vay'}</strong><span>Hạn {r.dueDate} · {r.funding==='own'?'Tiền tự có':r.funding==='bank_transfer'?'Chuyển dư nợ':r.funding==='refinance'?'Tái cấp vốn':'Nguồn khác'}</span><small>{r.status==='completed'?'Đã xử lý':r.status==='cancelled'?'Đã hủy':r.dueDate<today?'Đã quá hạn':'Đang chờ xử lý'} · Phí {money(r.fee)}</small></div><strong className="amount">{money(r.amount)}</strong>{r.status==='planned'&&<button className="btn pay-btn" onClick={()=>update(r.id,'completed')}><CheckCircle2 size={15}/> Đã xử lý</button>}{r.status==='planned'&&<button className="btn outline" onClick={()=>update(r.id,'cancelled')}>Hủy lịch</button>}<button className="icon-btn danger-hover" aria-label="Xóa lịch" onClick={()=>remove(r.id)}><Trash2 size={16}/></button></div>})}</div>}</section>
 <p className="projection-disclaimer">Việc đánh dấu “Đã xử lý” chỉ ghi nhận lịch sử đáo hạn và phí; không tự thay đổi dư nợ hay tạo giao dịch tiền. Hãy ghi nhận thanh toán gốc/lãi/phí trong mục Khoản nợ và khoản vay mới riêng để tránh tính sai.</p></>;
}