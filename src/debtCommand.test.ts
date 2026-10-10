import {describe,expect,it} from 'vitest';
import {financeReminders,financialLedger,judgeFinancePatterns} from './debtCommand';
import {parseData} from './storage';
import {EMPTY_DATA} from './types';
import type {FinanceData,Debt,Transaction} from './types';
const today='2026-10-11';
const debt=(extra:Partial<Debt>={}):Debt=>({
  id:'bank-1',name:'Khoản vay A',kind:'bank',lender:'NH A',
  original:10000000,balance:10000000,apr:12,minimum:2000000,dueDay:15,interestDueDay:13,interestExpected:300000,
  createdAt:'2026-06-01',note:'',...extra
});
const expense=(amount:number,day:string,category='Ăn uống',meta:Partial<Transaction>={}):Transaction=>({
  id:category+'-'+day,type:'expense',amount,category,date:day,note:'',...meta
});
describe('debt command and scheduled obligations',()=>{
  it('shows debt, interest and rollover separately with clear planned/paid accounting',()=>{
    const data:FinanceData={...structuredClone(EMPTY_DATA),debts:[debt()],rollovers:[{id:'card',debtId:'bank-1',kind:'card',dueDate:'2026-10-12',amount:4000000,fee:50000,funding:'own',status:'planned',completedAt:'',note:''}]};
    const results=financeReminders(data,today);
    expect(results.map(r=>r.kind)).toContain('debt');
    expect(results.map(r=>r.kind)).toContain('interest');
    expect(results.find(r=>r.kind==='rollover')?.severity).toBe('urgent');
    expect(results.find(r=>r.id.startsWith('interest:'))?.amount).toBe(300000);
    expect(financialLedger(data).find(e=>e.kind==='rollover')?.direction).toBe('planned');
  });
  it('hides settled minimum and interest in the current month, predicts next month',()=>{
    const data:FinanceData={...structuredClone(EMPTY_DATA),debts:[debt()],payments:[{id:'p',debtId:'bank-1',date:'2026-10-05',principal:1700000,interest:300000,fee:0,note:''}]};
    data.debts[0].balance-=1700000;
    const r=financeReminders(data,today);
    expect(r.filter(x=>!x.id.startsWith('reconcile:')&&(x.kind==='debt'||x.kind==='interest'))).toHaveLength(0); // next due >30d
  });
  it('allocates a late payment to the specified debt period, not cash-flow month',()=>{
    const d:FinanceData={...structuredClone(EMPTY_DATA),debts:[debt()],payments:[{id:'late',debtId:'bank-1',date:'2026-10-11',period:'2026-09',principal:1700000,interest:300000,fee:0,note:''}]};
    d.debts[0].balance-=1700000;
    expect(financeReminders(d,today).find(r=>r.kind==='debt')?.amount).toBe(2000000);
    expect(parseData(d).payments[0].period).toBe('2026-09');
    expect(()=>parseData({...d,payments:[{...d.payments[0],period:'2026-13'}]})).toThrow();
  });
  it('shows partial due remaining and overdue interest',()=>{
    const data:FinanceData={...structuredClone(EMPTY_DATA),debts:[debt()],payments:[{id:'partial',debtId:'bank-1',date:'2026-10-07',principal:300000,interest:0,fee:0,note:''}]};
    data.debts[0].balance-=300000;
    const r=financeReminders(data,'2026-10-16');
    expect(r.find(x=>x.kind==='debt')?.amount).toBe(1700000);
    expect(r.find(x=>x.kind==='debt')?.severity).toBe('overdue');
    expect(r.find(x=>x.kind==='interest')?.severity).toBe('overdue');
  });
  it('clamps February due day and skips dates preceding debt creation',()=>{
    const data:FinanceData={...structuredClone(EMPTY_DATA),debts:[debt({interestDueDay:undefined,interestExpected:undefined,dueDay:31,createdAt:'2026-02-01'})]};
    expect(financeReminders(data,'2026-02-26').find(x=>x.kind==='debt')?.date).toBe('2026-02-28');
  });
  it('never reports a cancelled rollover and highlights category threshold',()=>{
    const data:FinanceData={...structuredClone(EMPTY_DATA),rollovers:[{id:'x',debtId:'bank-1',kind:'loan',dueDate:'2026-10-05',amount:1000000,fee:0,funding:'own',status:'cancelled',completedAt:'',note:''}],
      budgets:[{category:'Ăn uống',limit:1000000}],transactions:[expense(850000,'2026-10-10')]};
    const r=financeReminders(data,today);
    expect(r.some(x=>x.kind==='rollover')).toBe(false);
    expect(r.find(x=>x.kind==='budget')?.severity).toBe('upcoming');
  });
  it('does not double count rollover and debt creation as cash movements in ledger',()=>{
    const data:FinanceData={...structuredClone(EMPTY_DATA),debts:[debt()],transactions:[expense(200000,'2026-10-09')],
      payments:[{id:'p',debtId:'bank-1',date:'2026-10-10',principal:100000,interest:50000,fee:10000,note:'paid'}]};
    const entries=financialLedger(data);
    expect(entries.filter(e=>e.direction==='out').reduce((s,e)=>s+e.amount,0)).toBe(360000);
    expect(entries.find(e=>e.kind==='debt')?.direction).toBe('record');
  });
  it('only judges decision patterns with sufficient evidence, not people',()=>{
    const d:FinanceData={...structuredClone(EMPTY_DATA),debts:[debt({minimum:7000000})],preferences:{monthlyIncome:10000000,essentials:2000000,reserve:500000,strategy:'avalanche'},
      transactions:[expense(2000000,'2026-10-08','Mua sắm',{trigger:'impulse',need:'flexible'}),expense(2000000,'2026-10-09','Ăn uống',{trigger:'promotion',need:'flexible'})]};
    const judgments=judgeFinancePatterns(d,today);
    expect(judgments.map(v=>v.headline)).toContain('Áp lực trả nợ đang cao');
    expect(judgments.map(v=>v.headline)).toContain('Xu hướng mua theo cảm xúc/khuyến mãi');
    expect(judgments.every(x=>x.evidence&&x.action)).toBe(true);
    expect(judgeFinancePatterns(structuredClone(EMPTY_DATA),today)[0].level).toBe('insufficient');
  });
  it('accepts old debt records and rejects invalid separately configured interest dates',()=>{
    const older={...structuredClone(EMPTY_DATA),debts:[debt({interestExpected:undefined,interestDueDay:undefined})]};
    expect(parseData(older).debts[0].interestExpected).toBeUndefined();
    expect(()=>parseData({...older,debts:[{...older.debts[0],interestDueDay:32}]})).toThrow();
    expect(()=>parseData({...older,debts:[{...older.debts[0],interestExpected:-1}]})).toThrow();
  });
});
