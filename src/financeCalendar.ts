import type {FinanceData} from './types';
import {localISO,monthKey,total} from './finance';
import {phuongDate} from './phuong';

export type CalendarCategory='planned-out'|'planned-in'|'actual-out'|'actual-in'|'rollover'|'completed';
export type CalendarSource='debt'|'interest'|'rollover'|'phuong'|'cash-plan'|'transaction'|'payment'|'phuong-entry';
export interface CalendarEvent{
 id:string;
 date:string;
 title:string;
 amount:number;
 kind:CalendarCategory;
 source:CalendarSource;
 detail:string;
 target:'debts'|'rollovers'|'phuong'|'transactions'|'calendar';
 addToExpected:boolean;
}
const monthDue=(month:string,day:number)=>{
 const [year,m]=month.split('-').map(Number);
 const last=new Date(Date.UTC(year,m,0)).getUTCDate();
 return month+'-'+String(Math.min(Math.max(day,1),last)).padStart(2,'0');
};
const paymentForPeriod=(data:FinanceData,debtId:string,month:string)=>{
 return data.payments.filter(p=>p.debtId===debtId&&(p.period||monthKey(p.date))===month);
};
/**
 * Build a read-only calendar projection. Forecasts never become bank cashflow
 * until a matching actual transaction/payment/phuong entry is recorded.
 * The interest may be part of the contractual minimum, hence is displayed
 * separately but excluded from the summed forecast when a minimum exists.
 * Rollover amount is NOT assumed to be outgoing cash.
 */
export function financeCalendarEvents(data:FinanceData,month:string):CalendarEvent[]{
 const events:CalendarEvent[]=[];
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return events;
 const push=(e:CalendarEvent)=>events.push(e);
 for(const debt of data.debts){
  if(debt.balance<=0)continue;
  const min=Math.min(debt.minimum,debt.balance);
  const payments=paymentForPeriod(data,debt.id,month);
  const minPaid=total(payments.map(p=>p.principal+p.interest+p.fee));
  const interestPaid=total(payments.map(p=>p.interest));
  const due=monthDue(month,debt.dueDay);
  if(min>minPaid&&due>=debt.createdAt)push({id:'debt:'+debt.id+':'+month,date:due,title:'Trả nợ: '+debt.name,amount:min-minPaid,
   kind:'planned-out',source:'debt',target:'debts',addToExpected:true,detail:'Còn thiếu so với mức tối thiểu kỳ '+month+'. Cần đối chiếu sao kê.'});
  if(debt.interestDueDay&&debt.interestExpected && debt.interestExpected>interestPaid){
   const date=monthDue(month,debt.interestDueDay);
   if(date>=debt.createdAt)push({id:'interest:'+debt.id+':'+month,date,title:'Đóng lãi: '+debt.name,
    amount:debt.interestExpected-interestPaid,kind:'planned-out',source:'interest',target:'debts',
    addToExpected:min===0||minPaid>=min,
    detail:min>0?'Lãi có thể đã nằm trong mức trả tối thiểu. Chỉ cộng vào tổng dự kiến nếu mức tối thiểu kỳ này đã được ghi đủ; kiểm tra sao kê để tránh cộng trùng.':'Lãi dự kiến khai báo; cần đối chiếu bên cho vay.'});
  }
 }
 for(const rollover of data.rollovers||[]){
  if(monthKey(rollover.dueDate)!==month||rollover.status!=='planned')continue;
  const debt=data.debts.find(d=>d.id===rollover.debtId);
  push({id:'rollover:'+rollover.id,date:rollover.dueDate,title:'Đáo hạn: '+(debt?.name||'Khoản nợ'),
   amount:rollover.amount,kind:'rollover',source:'rollover',target:'rollovers',addToExpected:false,
   detail:'Mốc cần xử lý đáo hạn, không được cộng như tiền chi thực tế hay dòng tiền ra dự kiến. Phí dự kiến cần theo dõi riêng.'});
 }
 const entriesByRound=new Map<string,{contributed:number;paidOut:boolean}>();
 for(const e of data.phuongEntries||[]){
  const key=e.groupId+':'+e.round;
  const item=entriesByRound.get(key)||{contributed:0,paidOut:false};
  if(e.kind==='contribution')item.contributed+=e.amount;
  if(e.kind==='payout')item.paidOut=true;
  entriesByRound.set(key,item);
 }
 for(const group of data.phuongGroups||[]){
  if(group.status!=='active')continue;
  for(let round=1;round<=group.rounds;round++){
   const date=phuongDate(group,round),ym=monthKey(date);
   if(ym>month)break;
   if(ym!==month)continue;
   const paid=entriesByRound.get(group.id+':'+round);
   const remaining=Math.max(0,group.contribution-(paid?.contributed||0));
   if(remaining>0)push({id:'phuong:due:'+group.id+':'+round,date,title:'Góp phường: '+group.name+' · Kỳ '+round,
    amount:remaining,kind:'planned-out',source:'phuong',target:'phuong',addToExpected:true,
    detail:'Góp chưa đủ theo bản ghi kỳ này. Lịch tính theo '+(group.cycle==='daily'?'ngày liên tiếp':group.cycle==='weekly'?'tuần':'tháng')+'.'});
   if(group.payoutRound===round&&!paid?.paidOut)push({id:'phuong:receive:'+group.id+':'+round,date,
    title:'Dự kiến lĩnh: '+group.name+' · Kỳ '+round,amount:group.payoutExpected||0,
    kind:'planned-in',source:'phuong',target:'phuong',addToExpected:group.payoutExpected!==undefined&&group.payoutExpected>0,
    detail:group.payoutExpected?'Tiền dự kiến lĩnh phường, không phải lợi nhuận; cần đối chiếu thực nhận.':'Chưa khai báo số tiền lĩnh, không cộng vào tổng tiền dự kiến thu.'});
  }
 }
 for(const plan of data.cashPlans||[]){
  if(monthKey(plan.dueDate)!==month || plan.status==='cancelled')continue;
  push({id:'plan:'+plan.id,date:plan.dueDate,title:plan.title,amount:plan.amount,
   kind:plan.status==='completed'?'completed':plan.direction==='in'?'planned-in':'planned-out',
   source:'cash-plan',target:'calendar',addToExpected:plan.status==='planned',
   detail:plan.status==='completed'?(plan.linkedTransactionId&&!data.transactions.some(t=>t.id===plan.linkedTransactionId)?'Giao dịch liên kết đã bị xóa, cần đối soát lại.':'Đã đánh dấu hoàn thành. Kiểm tra dòng tiền thực tế liên kết.'):plan.note||'Khoản dự kiến, chưa phải giao dịch thực.'});
 }
 for(const t of data.transactions){
  if(monthKey(t.date)!==month)continue;
  push({id:'actual:transaction:'+t.id,date:t.date,title:t.category,amount:t.amount,kind:t.type==='income'?'actual-in':'actual-out',
   source:'transaction',target:'transactions',addToExpected:false,detail:t.note||'Giao dịch thu/chi đã ghi.'});
 }
 for(const p of data.payments){
  if(monthKey(p.date)!==month)continue;
  const debt=data.debts.find(d=>d.id===p.debtId);
  push({id:'actual:payment:'+p.id,date:p.date,title:'Đã trả nợ: '+(debt?.name||'Khoản nợ'),
   amount:p.principal+p.interest+p.fee,kind:'actual-out',source:'payment',target:'debts',addToExpected:false,
   detail:'Gốc '+p.principal.toLocaleString('vi-VN')+' · Lãi '+p.interest.toLocaleString('vi-VN')+
          ' · Phí '+p.fee.toLocaleString('vi-VN')+'. Kỳ '+(p.period||monthKey(p.date))});
 }
 for(const e of data.phuongEntries||[]){
  if(monthKey(e.date)!==month)continue;
  const group=(data.phuongGroups||[]).find(g=>g.id===e.groupId);
  push({id:'actual:phuong:'+e.id,date:e.date,title:(e.kind==='payout'?'Đã lĩnh':e.kind==='fee'?'Phí phường':'Đã góp')+': '+(group?.name||'Dây phường'),
   amount:e.amount,kind:e.kind==='payout'?'actual-in':'actual-out',source:'phuong-entry',target:'phuong',
   addToExpected:false,detail:'Giao dịch thực tế đã ghi, không được cộng lại từ lịch dự kiến.'});
 }
 const priority:Record<CalendarCategory,number>={'planned-out':0,'planned-in':1,'rollover':2,'actual-out':3,'actual-in':4,'completed':5};
 return events.sort((a,b)=>a.date.localeCompare(b.date)||priority[a.kind]-priority[b.kind]||a.id.localeCompare(b.id));
}
export interface DayCashSummary{
 plannedOut:number;plannedIn:number;actualOut:number;actualIn:number;
 livingExpense:number;debtPayments:number;phuongExpense:number;phuongIncome:number;otherIncome:number;
}
export function calendarTotals(events:CalendarEvent[]):DayCashSummary{
 const result:DayCashSummary={plannedOut:0,plannedIn:0,actualOut:0,actualIn:0,livingExpense:0,debtPayments:0,phuongExpense:0,phuongIncome:0,otherIncome:0};
 for(const e of events){
  if(e.kind==='planned-out'&&e.addToExpected)result.plannedOut+=e.amount;
  if(e.kind==='planned-in'&&e.addToExpected)result.plannedIn+=e.amount;
  if(e.kind==='actual-out')result.actualOut+=e.amount;
  if(e.kind==='actual-in')result.actualIn+=e.amount;
  if(e.source==='transaction'&&e.kind==='actual-out')result.livingExpense+=e.amount;
  if(e.source==='transaction'&&e.kind==='actual-in')result.otherIncome+=e.amount;
  if(e.source==='payment')result.debtPayments+=e.amount;
  if(e.source==='phuong-entry'&&e.kind==='actual-out')result.phuongExpense+=e.amount;
  if(e.source==='phuong-entry'&&e.kind==='actual-in')result.phuongIncome+=e.amount;
 }
 return result;
}
export function calendarDays(month:string){
 const [year,m]=month.split('-').map(Number);
 if(!Number.isInteger(year)||!Number.isInteger(m)||m<1||m>12)return [];
 const length=new Date(Date.UTC(year,m,0)).getUTCDate();
 const before=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
 return [...Array<null>(before).fill(null),...Array.from({length},(_,i)=>month+'-'+String(i+1).padStart(2,'0'))] as (string|null)[];
}
export function calendarTodaysEvents(data:FinanceData,asOf=localISO()){
 return financeCalendarEvents(data,monthKey(asOf)).filter(e=>e.date===asOf);
}
