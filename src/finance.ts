import type { Debt, FinanceData, Strategy } from './types';
export const money = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? Math.round(n) : 0) + ' ₫';
export const shortMoney = (n: number) => Math.abs(n)>=1e9 ? (n/1e9).toLocaleString('vi-VN',{maximumFractionDigits:1})+' tỷ' : Math.abs(n)>=1e6 ? (n/1e6).toLocaleString('vi-VN',{maximumFractionDigits:1})+' tr' : money(n);
export const dateLabel = (date: string) => { const [y,m,d] = date.split('-'); return y && m && d ? [d,m,y].join('/') : date; };
export const monthKey = (date: string) => date.slice(0,7);
export const localISO = (d: Date = new Date()) => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export const thisMonth = () => localISO().slice(0,7);
export const addMonths = (month: string, offset: number) => { const [year,m]=month.split('-').map(Number); const d=new Date(year,m-1+offset,1);return monthKey(localISO(d)); };
export const total = (xs: number[]) => xs.reduce((a,b)=>a+b,0);
export function monthStats(data: FinanceData, month: string) {
  const trans = data.transactions.filter(t=>monthKey(t.date)===month);
  const pay = data.payments.filter(p=>monthKey(p.date)===month);
  const income=total(trans.filter(t=>t.type==='income').map(t=>t.amount));
  const expense=total(trans.filter(t=>t.type==='expense').map(t=>t.amount));
  const debtPaid=total(pay.map(p=>p.principal+p.interest+p.fee));
  return {income,expense,debtPaid,remaining: income-expense-debtPaid,principalPaid:total(pay.map(p=>p.principal)),interestPaid:total(pay.map(p=>p.interest+p.fee))};
}
export function dueDate(debt:Debt,today=localISO()) {
  const [y,m,d]=today.split('-').map(Number);
  const day=Math.min(debt.dueDay,new Date(y,m,0).getDate());
  const current=localISO(new Date(y,m-1,day));
  if(current>=today) return current;
  const next=new Date(y,m,1);
  return localISO(new Date(next.getFullYear(),next.getMonth(),Math.min(debt.dueDay,new Date(next.getFullYear(),next.getMonth()+1,0).getDate())));
}
export function daysUntil(iso:string,today=localISO()) { const d=(s:string)=>{const [y,m,day]=s.split('-').map(Number);return Date.UTC(y,m-1,day)};return Math.round((d(iso)-d(today))/86400000); }
export function debtOrder(debts:Debt[],strategy:Strategy):Debt[] { return [...debts].filter(d=>d.balance>0).sort((a,b)=>strategy==='avalanche' ? (b.apr-a.apr)||(a.balance-b.balance) : (a.balance-b.balance)||(b.apr-a.apr)); }
export interface Forecast { months: number|null; interest: number; paid: number; schedule: {month:number; remaining:number; paid:number; interest:number}[]; shortfall: number; }
export function forecast(debts:Debt[], income:number, essentials:number, reserve:number, strategy:Strategy):Forecast {
  const active=debtOrder(debts,strategy);
  const budget=Math.max(0,income-essentials-reserve);
  const shortfall=Math.max(0,total(active.map(d=>d.minimum))-budget);
  if(!active.length) return {months:0,interest:0,paid:0,schedule:[],shortfall:0};
  if(budget<=0) return {months:null,interest:0,paid:0,schedule:[],shortfall};
  const balances=new Map(active.map(d=>[d.id,d.balance]));
  const schedule:Forecast['schedule']=[];let interest=0,paid=0;
  for(let month=1;month<=600;month++) {
    let remainingBudget=budget;let periodInterest=0;let periodPaid=0;
    for(const d of active){const bal=balances.get(d.id)||0;if(bal<=0)continue;const cost=bal*d.apr/1200;balances.set(d.id,bal+cost);periodInterest+=cost;}
    for(const d of active){const bal=balances.get(d.id)||0;if(bal<=0)continue;const installment=Math.min(bal,d.minimum,remainingBudget);balances.set(d.id,bal-installment);remainingBudget-=installment;periodPaid+=installment;}
    for(const d of active){if(remainingBudget<=0)break;const bal=balances.get(d.id)||0;if(bal<=0)continue;const installment=Math.min(bal,remainingBudget);balances.set(d.id,bal-installment);remainingBudget-=installment;periodPaid+=installment;}
    const remaining=total([...balances.values()]);interest+=periodInterest;paid+=periodPaid;
    schedule.push({month,remaining:Math.round(remaining),paid:Math.round(periodPaid),interest:Math.round(periodInterest)});
    if(remaining<1) return {months:month,interest:Math.round(interest),paid:Math.round(paid),schedule,shortfall};
  }
  return {months:null,interest:Math.round(interest),paid:Math.round(paid),schedule,shortfall};
}
export function spendByCategory(data:FinanceData,month:string) {
  const sums=new Map<string,number>();
  data.transactions.filter(t=>t.type==='expense'&&monthKey(t.date)===month).forEach(t=>sums.set(t.category,(sums.get(t.category)||0)+t.amount));
  return [...sums.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
}
export function lastMonths(data:FinanceData,month:string,count=6) {return Array.from({length:count},(_,i)=>{const m=addMonths(month,i-count+1);return {month:m,label:m.split('-').reverse().join('/'),...monthStats(data,m)};});}
