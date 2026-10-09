import {describe,it,expect} from 'vitest';
import { debtOrder,forecast,monthStats,dueDate,daysUntil } from './finance';
import {parseData} from './storage';
import type {Debt,FinanceData} from './types';
import {EMPTY_DATA} from './types';
const debt=(id:string,balance:number,apr:number,minimum=200000):Debt=>({id,name:id,lender:'',kind:'bank',original:balance,balance,apr,minimum,dueDay:31,createdAt:'2026-01-01',note:''});
describe('financial accounting',()=>{
 it('separates debt repayments from living expenses',()=>{
 const data:FinanceData={...structuredClone(EMPTY_DATA),transactions:[{id:'t',type:'income',amount:10000000,category:'Lương',date:'2026-10-02',note:''},{id:'e',type:'expense',amount:2500000,category:'Ăn uống',date:'2026-10-03',note:''}],payments:[{id:'p',debtId:'d',date:'2026-10-04',principal:1800000,interest:200000,fee:0,note:''}]};
 expect(monthStats(data,'2026-10')).toMatchObject({income:10000000,expense:2500000,debtPaid:2000000,remaining:5500000,principalPaid:1800000,interestPaid:200000});
 });
 it('orders high APR or small balance first',()=>{
 const debts=[debt('a',5000000,10),debt('b',1000000,5)];
 expect(debtOrder(debts,'avalanche').map(x=>x.id)).toEqual(['a','b']);
 expect(debtOrder(debts,'snowball').map(x=>x.id)).toEqual(['b','a']);
 });
 it('forecasts interest-free payoff',()=>{
 expect(forecast([debt('a',1200000,0,0)],600000,0,0,'avalanche').months).toBe(2);
 });
 it('reports a minimum payment shortfall',()=>{expect(forecast([debt('a',1200000,0,1000000)],400000,0,0,'avalanche').shortfall).toBe(600000)});
 it('handles month-end due date correctly',()=>{expect(dueDate(debt('a',10000,0),'2026-02-20')).toBe('2026-02-28');expect(daysUntil('2026-03-01','2026-02-28')).toBe(1)});
 it('rejects malformed backup and invalid debt references',()=>{
 expect(()=>parseData({version:2})).toThrow();
 expect(()=>parseData({...structuredClone(EMPTY_DATA),payments:[{id:'p',debtId:'missing',date:'2026-10-04',principal:1,interest:0,fee:0,note:''}]})).toThrow();
 });
});
