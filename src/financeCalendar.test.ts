import {describe,expect,it} from 'vitest';
import {calendarDays,calendarTodaysEvents,calendarTotals,financeCalendarEvents} from './financeCalendar';
import {EMPTY_DATA} from './types';
import type {CashPlan,Debt,FinanceData,PhuongGroup} from './types';
import {parseData} from './storage';
const loan:Debt={id:'loan',name:'Vay A',lender:'Ngân hàng',kind:'bank',original:12000000,balance:11500000,apr:12,
 minimum:2000000,dueDay:15,interestDueDay:12,interestExpected:400000,createdAt:'2026-01-01',note:''};
const plan=(direction:'in'|'out',date='2026-10-17'):CashPlan=>({
 id:'p:'+direction,title:direction==='in'?'Khách thanh toán':'Tiền nhà',direction,amount:direction==='in'?3000000:2500000,
 dueDate:date,status:'planned',note:'Dự kiến'
});
const group:PhuongGroup={id:'phuong',name:'Dây phường ngày',organizer:'',role:'member',
 contribution:200000,cycle:'daily',rounds:30,startDate:'2026-10-12',payoutRound:6,payoutExpected:4200000,
 status:'active',note:''};
const base=():FinanceData=>structuredClone(EMPTY_DATA);
describe('finance calendar — cash obligations & daily spending',()=>{
 it('lays out days Monday-first and handles February in leap years',()=>{
  const feb=calendarDays('2028-02');
  expect(feb.filter(Boolean)).toHaveLength(29);
  expect(feb[1]).toBe('2028-02-01'); // 2028-02-01 is Tuesday
  expect(calendarDays('2026-02').filter(Boolean)).toHaveLength(28);
  expect(calendarDays('2026-13')).toHaveLength(0);
 });
 it('shows card/loan minimum and interest without double counting forecast',()=>{
  const d=base();d.debts=[loan];
  d.payments=[{id:'paid',debtId:'loan',date:'2026-10-05',period:'2026-10',principal:500000,interest:0,fee:0,note:''}];
  const events=financeCalendarEvents(d,'2026-10');
  const min=events.find(x=>x.source==='debt'),interest=events.find(x=>x.source==='interest');
  expect(min?.date).toBe('2026-10-15');
  expect(min?.amount).toBe(1500000);
  expect(interest?.amount).toBe(400000);
  expect(interest?.addToExpected).toBe(false);
  expect(calendarTotals(events).plannedOut).toBe(1500000);
 });
 it('does not duplicate past period repayments to current month obligations',()=>{
  const d=base();d.debts=[loan];
  d.payments=[{id:'late',debtId:'loan',date:'2026-10-12',period:'2026-09',principal:500000,interest:500000,fee:0,note:''}];
  const e=financeCalendarEvents(d,'2026-10');
  expect(e.find(x=>x.source==='debt')?.amount).toBe(2000000);
  expect(e.find(x=>x.source==='payment')?.amount).toBe(1000000);
 });
 it('handles a debt due day of 31 in February',()=>{
  const d=base();d.debts=[{...loan,dueDay:31,interestDueDay:undefined,interestExpected:undefined}];
  expect(financeCalendarEvents(d,'2027-02').find(x=>x.source==='debt')?.date).toBe('2027-02-28');
 });
 it('keeps rollover as non-cash milestone and ignores cancelled rollover',()=>{
  const d=base();d.debts=[loan];
  d.rollovers=[{id:'r',debtId:'loan',kind:'card',dueDate:'2026-10-17',amount:7000000,fee:120000,funding:'own',status:'planned',completedAt:'',note:''},
   {id:'cancel',debtId:'loan',kind:'loan',dueDate:'2026-10-20',amount:9000000,fee:0,funding:'own',status:'cancelled',completedAt:'',note:''}];
  const all=financeCalendarEvents(d,'2026-10');
  expect(all.filter(x=>x.source==='rollover')).toHaveLength(1);
  expect(all.find(x=>x.kind==='rollover')?.addToExpected).toBe(false);
  expect(calendarTotals(all).plannedOut).toBe(2000000);
 });
 it('projects daily phuong contributions and expected payout until recorded',()=>{
  const d=base();d.phuongGroups=[group];
  d.phuongEntries=[{id:'first',groupId:'phuong',kind:'contribution',date:'2026-10-12',round:1,amount:200000,note:''},
   {id:'paidPartial',groupId:'phuong',kind:'contribution',date:'2026-10-13',round:2,amount:70000,note:''}];
  const events=financeCalendarEvents(d,'2026-10');
  const planned=events.filter(x=>x.source==='phuong'&&x.kind==='planned-out');
  expect(planned).toHaveLength(19); // 20 October rounds, first fully paid
  expect(planned.find(e=>e.date==='2026-10-13')?.amount).toBe(130000);
  expect(events.find(x=>x.kind==='planned-in'&&x.source==='phuong')?.date).toBe('2026-10-17');
  expect(calendarTotals(events).plannedOut).toBe(19*200000-70000);
  expect(calendarTotals(events).plannedIn).toBe(4200000);
 });
 it('sums only recorded cash on selected day; separates living, debt and phuong',()=>{
  const d=base();d.transactions=[{id:'food',type:'expense',category:'Ăn uống',amount:150000,date:'2026-10-12',note:''},
   {id:'wage',type:'income',category:'Lương',amount:5000000,date:'2026-10-12',note:''}];
  d.phuongGroups=[group];
  d.phuongEntries=[{id:'paid',groupId:'phuong',round:1,date:'2026-10-12',kind:'contribution',amount:200000,note:''}];
  d.debts=[loan];d.payments=[{id:'p',debtId:'loan',date:'2026-10-12',period:'2026-10',principal:100000,interest:50000,fee:5000,note:''}];
  const today=calendarTodaysEvents(d,'2026-10-12'),totals=calendarTotals(today);
  expect(totals.actualOut).toBe(505000);
  expect(totals.actualIn).toBe(5000000);
  expect(totals.livingExpense).toBe(150000);
  expect(totals.debtPayments).toBe(155000);
  expect(totals.phuongExpense).toBe(200000);
  expect(totals.plannedOut).toBe(0);
 });
 it('shows planned receivables, excludes them when completed and avoids double counting',()=>{
  const d=base();d.cashPlans=[plan('in'),plan('out')];
  expect(calendarTotals(financeCalendarEvents(d,'2026-10')).plannedIn).toBe(3000000);
  expect(calendarTotals(financeCalendarEvents(d,'2026-10')).plannedOut).toBe(2500000);
  d.cashPlans[0]={...d.cashPlans[0],status:'completed',completedAt:'2026-10-17',linkedTransactionId:'recorded'};
  d.transactions=[{id:'recorded',type:'income',category:'Khác',amount:3000000,date:'2026-10-17',note:'Theo lịch'}];
  const totals=calendarTotals(financeCalendarEvents(d,'2026-10'));
  expect(totals.plannedIn).toBe(0);
  expect(totals.actualIn).toBe(3000000);
  expect(financeCalendarEvents(d,'2026-10').some(x=>x.kind==='completed')).toBe(true);
  expect(parseData(d).cashPlans?.[0].linkedTransactionId).toBe('recorded');
 });
 it('can schedule a receivable through chat without prematurely recording income',async()=>{
  const {agentTurn,commitProposal}=await import('./agentConversation');
  const d=base();
  const first=agentTurn('Ngày 20/10 cần thu 3 triệu tiền hàng',null,d,'2026-10-12');
  expect(first.draft?.kind).toBe('cash_plan');
  expect(first.proposal).toBeUndefined();
  expect(first.text).toContain('xác nhận');
  const second=agentTurn('xác nhận',first.draft,d,'2026-10-12');
  expect(second.proposal?.kind).toBe('cash_plan');
  const next=commitProposal(d,second.proposal!);
  expect(next.cashPlans?.[0].amount).toBe(3000000);
  expect(next.cashPlans?.[0].dueDate).toBe('2026-10-20');
  expect(next.cashPlans?.[0].direction).toBe('in');
  expect(next.transactions).toHaveLength(0);
  expect(parseData(next).cashPlans).toHaveLength(1);
 });
 it('recognizes tomorrow planned expense and asks for missing title over multiple turns',async()=>{
  const {agentTurn}=await import('./agentConversation');
  const d=base();
  const first=agentTurn('Mai cần chi 500k',null,d,'2026-10-12');
  expect(first.draft?.kind).toBe('cash_plan');
  expect(first.text).toContain('tên lịch');
  const next=agentTurn('Tiền điện',first.draft,d,'2026-10-12');
  expect(next.text).toContain('xác nhận');
  const yes=agentTurn('xác nhận',next.draft,d,'2026-10-12');
  expect(yes.proposal?.kind).toBe('cash_plan');
  if(yes.proposal?.kind==='cash_plan')expect(yes.proposal.plan.dueDate).toBe('2026-10-13');
 });
 it('answers a daily calendar question without proposing a fake transaction',async()=>{
  const {agentTurn}=await import('./agentConversation');
  const d=base();d.cashPlans=[plan('out','2026-10-12')];
  const r=agentTurn('Lịch thu chi hôm nay có khoản nào?',null,d,'2026-10-12');
  expect(r.proposal).toBeUndefined();
  expect(r.draft).toBeNull();
  expect(r.text).toContain('2.500.000');
 });
 it('preserves old backups and rejects malformed expected cashflow amounts/dates',()=>{
  const d=base();delete d.cashPlans;
  expect(parseData(d).cashPlans).toEqual([]);
  const bad=base();bad.cashPlans=[{...plan('out'),amount:-10}];
  expect(()=>parseData(bad)).toThrow();
  bad.cashPlans=[{...plan('in'),dueDate:'2026-02-30'}];
  expect(()=>parseData(bad)).toThrow();
  bad.cashPlans=[{...plan('in'),id:'same'},{...plan('out'),id:'same'}];
  expect(()=>parseData(bad)).toThrow();
 });
});
