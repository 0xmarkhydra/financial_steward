import type { FinanceData, Debt, Transaction, Payment, Budget, Preferences, Rollover } from './types';
import { EMPTY_DATA, DEBT_KINDS } from './types';
export const STORAGE_KEY = 'financial-steward-v1';
const obj=(x:unknown): x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const str=(x:unknown,max=300): x is string=>typeof x==='string'&&x.length<=max;
const num=(x:unknown): x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1e15;
const id=(x:unknown)=>str(x,100)&&Boolean(x);
const date=(x:unknown): x is string=>{if(!str(x,10)||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const [y,m,d]=x.split('-').map(Number);const parsed=new Date(Date.UTC(y,m-1,d));return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d;};
function validDebt(d:unknown): d is Debt {
  return obj(d)&&id(d.id)&&str(d.name,140)&&str(d.lender,140)&&typeof d.kind==='string'&&d.kind in DEBT_KINDS&&num(d.original)&&num(d.balance)&&d.balance<=d.original&&num(d.apr)&&d.apr<=1000&&num(d.minimum)&&typeof d.dueDay==='number'&&Number.isInteger(d.dueDay)&&d.dueDay>=1&&d.dueDay<=31&&date(d.createdAt)&&str(d.note,2000);
}
function validTransaction(t:unknown):t is Transaction {
  return obj(t)&&id(t.id)&&(t.type==='income'||t.type==='expense')&&num(t.amount)&&t.amount>0&&str(t.category,100)&&date(t.date)&&str(t.note,2000);
}
function validPayment(p:unknown):p is Payment {
  return obj(p)&&id(p.id)&&id(p.debtId)&&date(p.date)&&num(p.principal)&&num(p.interest)&&num(p.fee)&&p.principal+p.interest+p.fee>0&&str(p.note,2000);
}
function validBudget(b:unknown):b is Budget {return obj(b)&&str(b.category,100)&&num(b.limit);}
function validPreferences(p:unknown):p is Preferences {return obj(p)&&num(p.monthlyIncome)&&num(p.essentials)&&num(p.reserve)&&(p.strategy==='avalanche'||p.strategy==='snowball');}
function validRollover(v:unknown):v is Rollover{return obj(v)&&id(v.id)&&id(v.debtId)&&(v.kind==='card'||v.kind==='loan')&&date(v.dueDate)&&num(v.amount)&&v.amount>0&&num(v.fee)&&['own','bank_transfer','refinance','other'].includes(String(v.funding))&&['planned','completed','cancelled'].includes(String(v.status))&&(v.completedAt===''||date(v.completedAt))&&str(v.note,2000);}
export function parseData(input:unknown):FinanceData {
  if(!obj(input)||input.version!==1||!Array.isArray(input.debts)||!Array.isArray(input.transactions)||!Array.isArray(input.payments)||!Array.isArray(input.budgets)||!validPreferences(input.preferences)) throw new Error('Tệp không đúng định dạng Financial Steward.');
  if(input.debts.length>10000||input.transactions.length>100000||input.payments.length>100000||input.budgets.length>1000)throw new Error('Tệp dữ liệu vượt giới hạn.');
  if(!input.debts.every(validDebt)||!input.transactions.every(validTransaction)||!input.payments.every(validPayment)||!input.budgets.every(validBudget))throw new Error('Tệp có dữ liệu không hợp lệ.');
  const debts=input.debts as Debt[];const transactions=input.transactions as Transaction[];const payments=input.payments as Payment[];const budgets=input.budgets as Budget[];
  const uniques=(ids:string[])=>new Set(ids).size===ids.length;
  if(!uniques(debts.map(d=>d.id))||!uniques(transactions.map(t=>t.id))||!uniques(payments.map(p=>p.id))||!uniques(budgets.map(b=>b.category)))throw new Error('Tệp có bản ghi trùng lặp.');
  if(payments.some(p=>!debts.some(d=>d.id===p.debtId)))throw new Error('Có thanh toán không thuộc khoản nợ nào.');
  const rollovers=input.rollovers===undefined?[]:input.rollovers;
  if(!Array.isArray(rollovers)||rollovers.length>10000||!rollovers.every(validRollover)||!uniques(rollovers.map(v=>v.id))||rollovers.some(v=>!debts.some(d=>d.id===v.debtId)))throw new Error('Dữ liệu đáo hạn không hợp lệ.');
  return {version:1,debts,transactions,payments,budgets,preferences:input.preferences as Preferences,rollovers};
}
export function loadData():FinanceData {
  try {const raw=localStorage.getItem(STORAGE_KEY);return raw?parseData(JSON.parse(raw)):structuredClone(EMPTY_DATA);}
  catch {return structuredClone(EMPTY_DATA);}
}
export function saveData(data:FinanceData):void {localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}
export function exportData(data:FinanceData):void {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='financial-steward-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
