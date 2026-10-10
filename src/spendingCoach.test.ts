import { describe, expect, it } from 'vitest';
import { analyzeSpending } from './spendingCoach';
import { parseData } from './storage';
import { EMPTY_DATA } from './types';
import type { FinanceData, Transaction } from './types';
function tx(id:string,amount:number,date:string,need?:Transaction['need'],trigger?:Transaction['trigger'],category='Ăn uống'):Transaction {
 return { id,type:'expense',amount,date,category,note:'',...(need?{need}:{}),...(trigger?{trigger}:{}) };
}
function scenario():FinanceData {
 return {...structuredClone(EMPTY_DATA),preferences:{monthlyIncome:20000000,essentials:7000000,reserve:3000000,strategy:'avalanche'},
  debts:[{id:'loan',name:'Loan',lender:'bank',kind:'bank',original:12000000,balance:12000000,apr:10,minimum:4000000,dueDay:25,createdAt:'2026-01-01',note:''}]};
}
describe('financial spending coach',()=>{
 it('reserves debt, essentials, emergency fund and calculates cautious daily allowance',()=>{
  const d=scenario();
  d.transactions=[tx('food',2000000,'2026-10-03','essential','planned'),tx('shopping',2000000,'2026-10-07','flexible','impulse')];
  const v=analyzeSpending(d,'2026-10-11');
  expect(v.monthlyLivingCap).toBe(13000000);
  expect(v.flexibleCap).toBe(6000000);
  expect(v.currentEssential).toBe(2000000);
  expect(v.currentFlexibleOrUnclassified).toBe(2000000);
  expect(v.freeFlexible).toBe(4000000);
  expect(v.dailyFlexible).toBe(Math.floor(4000000/21));
  expect(v.impulseTotal).toBe(2000000);
  expect(v.alerts.some(a=>a.title.includes('cảm xúc'))).toBe(true);
 });
 it('protects against essential overrun and does not recommend extra borrowing',()=>{
  const d=scenario();
  d.transactions=[tx('over',8500000,'2026-10-02','essential','planned'),tx('other',5000000,'2026-10-10','flexible','social')];
  const v=analyzeSpending(d,'2026-10-11');
  expect(v.freeFlexible).toBe(0);
  expect(v.alerts.some(a=>a.title.includes('vượt mức'))).toBe(true);
 });
 it('never suggests a budget without configured income',()=>{
  const d=structuredClone(EMPTY_DATA);
  d.transactions=[tx('purchase',700000,'2026-10-07')];
  const v=analyzeSpending(d,'2026-10-11');
  expect(v.configured).toBe(false);
  expect(v.dailyFlexible).toBe(0);
  expect(v.alerts.some(a=>a.title.includes('Thiết lập thu nhập'))).toBe(true);
 });
 it('estimates category distribution from completed months only',()=>{
  const d=scenario();
  d.transactions=[tx('a',1000000,'2026-08-03','flexible','planned','Ăn uống'),
  tx('b',3000000,'2026-09-12','flexible','planned','Mua sắm'),
  tx('c',100000,'2026-10-11','flexible','planned','Sức khỏe')];
  const v=analyzeSpending(d,'2026-10-11');
  expect(v.previousMonths).toBe(2);
  expect(v.categoryGuidance.length).toBe(2);
  expect(v.categoryGuidance.find(c=>c.category==='Mua sắm')?.historicalAverage).toBe(1500000);
  expect(v.categoryGuidance.reduce((sum,c)=>sum+c.suggestedLimit,0)).toBeLessThanOrEqual(v.flexibleCap);
 });
 it('preserves historic transactions and rejects malformed behavior metadata',()=>{
  const d=structuredClone(EMPTY_DATA);
  d.transactions=[tx('legacy',100000,'2026-10-02')];
  expect(parseData(d).transactions[0].need).toBeUndefined();
  expect(()=>parseData({...d,transactions:[{...d.transactions[0],need:'unsafe'}]})).toThrow();
  expect(()=>parseData({...d,transactions:[{...d.transactions[0],trigger:'bogus'}]})).toThrow();
  expect(()=>parseData({...d,transactions:[{...d.transactions[0],type:'income',need:'essential'}]})).toThrow();
 });
 it('considers legacy unclassified purchases as reducing safe discretionary room',()=>{
  const d=scenario(); d.transactions=[tx('untagged',1000000,'2026-10-04')];
  const v=analyzeSpending(d,'2026-10-11');
  expect(v.freeFlexible).toBe(5000000);
  expect(v.behavioralRecords).toBe(0);
  expect(v.alerts.some(a=>a.title.includes('Gắn nhãn'))).toBe(true);
 });
});
