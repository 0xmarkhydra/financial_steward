import {useMemo,useState} from 'react';
import type {FormEvent} from 'react';
import {ArrowDownLeft,ArrowLeft,ArrowRight,ArrowUpRight,Bell,CalendarDays,CheckCircle2,ChevronLeft,ChevronRight,Clock3,CreditCard,MessageCircle,Plus,ReceiptText,Wallet,X} from 'lucide-react';
import type {CashPlan,FinanceData} from './types';
import {addMonths,dateLabel,localISO,money,monthKey,shortMoney} from './finance';
import {calendarDays,calendarTotals,financeCalendarEvents} from './financeCalendar';
import type {CalendarEvent,CalendarCategory} from './financeCalendar';

type Filter='all'|'upcoming'|'expected-in'|'actual';
type Target='debts'|'rollovers'|'phuong'|'transactions'|'calendar';
type Props={
 data:FinanceData;asOf:string;
 onAddPlan:(plan:CashPlan)=>void;
 onSettlePlan:(plan:CashPlan)=>void;
 onCancelPlan:(plan:CashPlan)=>void;
 onNavigate:(page:Target)=>void;
 onRecord:(date:string)=>void;
 onChat:()=>void;
};
const weekdays=['T2','T3','T4','T5','T6','T7','CN'];
const labels:Record<CalendarCategory,string>={
 'planned-out':'Cần chi','planned-in':'Dự kiến thu','actual-out':'Đã chi','actual-in':'Đã thu','rollover':'Mốc đáo hạn','completed':'Đã xử lý'
};
const eventTone:Record<CalendarCategory,string>={
 'planned-out':'warn','planned-in':'positive','actual-out':'expense','actual-in':'income','rollover':'attention','completed':'settled'
};
export default function FinanceCalendarPage({data,asOf,onAddPlan,onSettlePlan,onCancelPlan,onNavigate,onRecord,onChat}:Props){
 const [month,setMonth]=useState(monthKey(asOf));
 const [selectedDate,setSelectedDate]=useState(asOf);
 const [filter,setFilter]=useState<Filter>('all');
 const [formOpen,setFormOpen]=useState(false);
 const [planDirection,setPlanDirection]=useState<'in'|'out'>('out');
 const [formDate,setFormDate]=useState(asOf);
 const entries=useMemo(()=>financeCalendarEvents(data,month),[data,month]);
 const summary=useMemo(()=>calendarTotals(entries),[entries]);
 const selected=useMemo(()=>entries.filter(e=>e.date===selectedDate),[entries,selectedDate]);
 const daily=useMemo(()=>calendarTotals(selected),[selected]);
 const byDate=useMemo(()=>{
   const dates=new Map<string,CalendarEvent[]>();
   for(const e of entries){const v=dates.get(e.date)||[];v.push(e);dates.set(e.date,v);}
   return dates;
 },[entries]);
 const dayCells=useMemo(()=>calendarDays(month),[month]);
 const selectedEvents=selected.filter(e=>filter==='all'||(filter==='upcoming'&&(e.kind==='planned-out'||e.kind==='rollover'))||(filter==='expected-in'&&e.kind==='planned-in')||(filter==='actual'&&(e.kind==='actual-out'||e.kind==='actual-in'||e.kind==='completed')));
 const monthTitle=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
 function navigateMonth(offset:number){
   const next=addMonths(month,offset);
   setMonth(next);
   setSelectedDate(next+'-01');
 }
 function goToday(){setMonth(monthKey(asOf));setSelectedDate(asOf);}
 function selectDate(date:string){setSelectedDate(date);setFormDate(date);}
 function openForm(){setFormDate(selectedDate);setFormOpen(true);}
 function addPlan(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const title=String(fd.get('title')||'').trim(),dueDate=String(fd.get('dueDate')||''),note=String(fd.get('note')||'').trim();
  const amount=Number(fd.get('amount'));
  if(!title||title.length>140||note.length>2000||!Number.isSafeInteger(amount)||amount<=0||amount>1e15||!/\d{4}-\d{2}-\d{2}/.test(dueDate))return;
  const item:CashPlan={id:crypto.randomUUID(),title,amount,dueDate,direction:planDirection,status:'planned',note};
  onAddPlan(item);
  setMonth(monthKey(dueDate));setSelectedDate(dueDate);setFormOpen(false);
 }
 const renderEvent=(e:CalendarEvent)=>{
  const plan=e.source==='cash-plan'?(data.cashPlans||[]).find(p=>'plan:'+p.id===e.id):undefined;
  return <article className={'calendar-event '+eventTone[e.kind]} key={e.id}>
    <div className="calendar-event-type">{e.kind==='planned-in'||e.kind==='actual-in'?<ArrowDownLeft size={16}/>:e.kind==='rollover'?<CreditCard size={16}/>:e.kind==='completed'?<CheckCircle2 size={16}/>:<ArrowUpRight size={16}/>} <span>{labels[e.kind]}</span></div>
    <div className="calendar-event-body">
      <strong>{e.title}</strong>
      <p>{e.detail}</p>
      {plan&&plan.status==='planned'&&<div className="calendar-event-actions">
        <button type="button" onClick={()=>onSettlePlan(plan)} className="calendar-small-cta"><CheckCircle2 size={14}/> Ghi đã {plan.direction==='in'?'thu':'chi'} hôm nay</button>
        <button type="button" onClick={()=>onCancelPlan(plan)} className="calendar-small-plain">Hủy lịch</button>
      </div>}
      {e.target!=='calendar'&&<button className="calendar-source-link" type="button" onClick={()=>onNavigate(e.target)}>Xem mục liên quan <ArrowRight size={13}/></button>}
    </div>
    <div className="calendar-event-amount">{e.amount>0?money(e.amount):'Chưa rõ số tiền'}{e.kind==='rollover'&&<small>Không tính dòng tiền</small>}</div>
  </article>;
 };
 return <>
  <div className="page-heading calendar-page-title">
   <div><div className="eyebrow">LỊCH TÀI CHÍNH · THU CHI & NGHĨA VỤ</div><h1>Mọi khoản tiền, đúng ngày cần nhớ</h1><p>Chọn một ngày để xem tiền cần thu, cần chi và những giao dịch thực tế đã ghi. Lịch đáo thẻ không được coi là tiền đã chi.</p></div>
   <div className="calendar-header-actions"><button className="btn outline" type="button" onClick={onChat}><MessageCircle size={16}/> Nói với Quản gia</button><button className="btn primary" type="button" onClick={openForm}><Plus size={16}/> Hẹn thu / chi</button></div>
  </div>
  <div className="calendar-summary">
    <div className="panel calendar-summary-card expense"><div className="calendar-summary-label"><Clock3 size={18}/> Tổng dự kiến cần chi</div><strong>{money(summary.plannedOut)}</strong><small>Trả nợ tối thiểu còn thiếu, góp phường, lịch chi chủ động; không cộng trùng lãi hoặc đáo thẻ</small></div>
    <div className="panel calendar-summary-card income"><div className="calendar-summary-label"><ArrowDownLeft size={18}/> Dự kiến cần thu</div><strong>{money(summary.plannedIn)}</strong><small>Khoản phải thu và tiền lĩnh phường có khai báo giá trị</small></div>
    <div className="panel calendar-summary-card actual"><div className="calendar-summary-label"><ReceiptText size={18}/> Đã thu / chi trong tháng</div><strong>{money(summary.actualIn)} <span>/</span> {money(summary.actualOut)}</strong><small>Đã thu / đã chi: từ giao dịch thực tế, nợ và phường</small></div>
  </div>
  <div className="calendar-workspace">
    <section className="panel calendar-main">
      <div className="calendar-topline"><div><span className="eyebrow">XEM THEO THÁNG</span><h2>{monthTitle}</h2></div><div className="calendar-month-controls"><button type="button" onClick={()=>navigateMonth(-1)} aria-label="Tháng trước"><ChevronLeft size={19}/></button><button className="calendar-today" type="button" onClick={goToday}>Hôm nay</button><button type="button" onClick={()=>navigateMonth(1)} aria-label="Tháng sau"><ChevronRight size={19}/></button></div></div>
      <div className="calendar-weekdays">{weekdays.map(d=><span key={d}>{d}</span>)}</div>
      <div className="calendar-days">{dayCells.map((date,i)=>{
       if(!date)return <div className="calendar-day empty" key={'blank:'+i}/>;
       const dailyEvents=byDate.get(date)||[],totals=calendarTotals(dailyEvents);
       const isToday=date===asOf,isSelected=date===selectedDate;
       return <button type="button" key={date} aria-label={date+' — Cần chi '+money(totals.plannedOut)+', cần thu '+money(totals.plannedIn)+', đã chi '+money(totals.actualOut)} aria-pressed={isSelected}
         className={'calendar-day'+(isToday?' today':'')+(isSelected?' selected':'')} onClick={()=>selectDate(date)}>
         <span className="calendar-day-number">{Number(date.slice(8))}{isToday&&<i/>}</span>
         <div className="calendar-day-notes">
          {totals.plannedOut>0&&<small className="expected-out"><span>Chi</span>{shortMoney(totals.plannedOut)}</small>}
          {totals.plannedIn>0&&<small className="expected-in"><span>Thu</span>{shortMoney(totals.plannedIn)}</small>}
          {totals.actualOut>0&&<small className="realized-out"><span>Đã chi</span>{shortMoney(totals.actualOut)}</small>}
          {totals.actualIn>0&&<small className="realized-in"><span>Đã thu</span>{shortMoney(totals.actualIn)}</small>}
          {dailyEvents.some(e=>e.kind==='rollover')&&<small className="rollover-icon"><Bell size={12}/> Đáo hạn</small>}
         </div>
       </button>;
      })}</div>
      <div className="calendar-legend"><span><i className="out"/> Cần chi</span><span><i className="in"/> Dự kiến thu</span><span><i className="actual"/> Đã giao dịch</span><span><i className="milestone"/> Mốc đáo hạn</span></div>
    </section>
    <section className="panel calendar-agenda">
     <div className="calendar-agenda-top"><div><span className="eyebrow">SỔ TÀI CHÍNH TRONG NGÀY</span><h2>{dateLabel(selectedDate)}</h2></div><button type="button" aria-label="Ghi thu chi" className="calendar-add-round" onClick={()=>onRecord(selectedDate)}><Plus size={20}/></button></div>
     <div className="calendar-day-totals">
       <div><span>Cần chi</span><strong className="out">{money(daily.plannedOut)}</strong></div>
       <div><span>Dự kiến thu</span><strong className="in">{money(daily.plannedIn)}</strong></div>
       <div><span>Thực chi</span><strong>{money(daily.actualOut)}</strong></div>
       <div><span>Thực thu</span><strong>{money(daily.actualIn)}</strong></div>
     </div>
     <div className="calendar-daily-breakdown"><div><span>Chi tiêu sinh hoạt</span><strong>{money(daily.livingExpense)}</strong></div><div><span>Đã trả nợ (gốc/lãi/phí)</span><strong>{money(daily.debtPayments)}</strong></div><div><span>Đã góp phường / phí</span><strong>{money(daily.phuongExpense)}</strong></div>{daily.phuongIncome>0&&<div><span>Tiền đã lĩnh phường</span><strong>{money(daily.phuongIncome)}</strong></div>}</div>
     <div className="calendar-filters">{([{key:'all',label:'Tất cả'},{key:'upcoming',label:'Cần chi'},{key:'expected-in',label:'Dự kiến thu'},{key:'actual',label:'Đã ghi'}] as const).map(f=><button type="button" key={f.key} onClick={()=>setFilter(f.key)} className={filter===f.key?'active':''}>{f.label}</button>)}</div>
     {selectedEvents.length?<div className="calendar-event-list">{selectedEvents.map(renderEvent)}</div>:<div className="calendar-agenda-empty"><CalendarDays size={28}/><strong>Không có khoản nào thuộc bộ lọc này</strong><p>Bạn có thể thêm lịch dự kiến thu/chi hoặc kể cho Quản gia khoản phát sinh.</p><button type="button" className="btn outline" onClick={openForm}><Plus size={15}/> Thêm khoản hẹn</button></div>}
    </section>
  </div>
  {formOpen&&<div className="calendar-form-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setFormOpen(false)}}><section className="calendar-form-dialog" role="dialog" aria-modal="true" aria-label="Thêm lịch thu chi dự kiến">
    <div className="calendar-form-top"><div><span className="eyebrow">LÊN LỊCH DÒNG TIỀN</span><h2>Hẹn một khoản cần thu / chi</h2></div><button type="button" aria-label="Đóng" onClick={()=>setFormOpen(false)}><X size={19}/></button></div>
    <form onSubmit={addPlan} className="calendar-form">
     <div className="calendar-direction"><button type="button" className={planDirection==='out'?'active out':''} onClick={()=>setPlanDirection('out')}><ArrowUpRight size={17}/> Cần chi</button><button type="button" className={planDirection==='in'?'active in':''} onClick={()=>setPlanDirection('in')}><ArrowDownLeft size={17}/> Cần thu</button></div>
     <label><span>Tên khoản tiền</span><input name="title" required maxLength={140} placeholder={planDirection==='in'?'Ví dụ: Khách trả tiền đơn hàng':'Ví dụ: Tiền nhà tháng này'}/></label>
     <div className="calendar-form-two"><label><span>Số tiền (VNĐ)</span><input name="amount" type="number" required min={1} max="1000000000000000" step={1} placeholder="2500000"/></label><label><span>Ngày dự kiến</span><input name="dueDate" type="date" required value={formDate} onChange={e=>setFormDate(e.target.value)}/></label></div>
     <label><span>Ghi chú (không bắt buộc)</span><textarea name="note" maxLength={2000} rows={2} placeholder="Thông tin để đối chiếu, không lưu số thẻ/OTP"/></label>
     <p className="calendar-form-hint">Khoản này chỉ là <strong>lịch dự kiến</strong>, chưa tự tính vào tiền đã thu/chi. Nếu đã phát sinh, hãy chọn ghi thực thu/chi để lập giao dịch có xác nhận.</p>
     <div className="calendar-form-buttons"><button className="btn outline" type="button" onClick={()=>setFormOpen(false)}>Bỏ qua</button><button className="btn primary" type="submit"><CheckCircle2 size={16}/> Lưu lịch</button></div>
    </form>
   </section></div>}
 </>;
}
