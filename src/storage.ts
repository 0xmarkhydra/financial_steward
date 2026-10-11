import type { FinanceData, Debt, Transaction, Payment, Budget, Preferences, Rollover, PhuongGroup, PhuongEntry, AgentMessage, CashPlan } from './types';
import { EMPTY_DATA, DEBT_KINDS } from './types';
export const STORAGE_KEY = 'financial-steward-v1';
const obj=(x:unknown): x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const str=(x:unknown,max=300): x is string=>typeof x==='string'&&x.length<=max;
const num=(x:unknown): x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1e15;
const id=(x:unknown)=>str(x,100)&&Boolean(x);
const date=(x:unknown): x is string=>{if(!str(x,10)||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const [y,m,d]=x.split('-').map(Number);const parsed=new Date(Date.UTC(y,m-1,d));return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()===m-1&&parsed.getUTCDate()===d;};
function validDebt(d:unknown): d is Debt {
  return obj(d)&&id(d.id)&&str(d.name,140)&&str(d.lender,140)&&typeof d.kind==='string'&&d.kind in DEBT_KINDS&&num(d.original)&&num(d.balance)&&d.balance<=d.original&&num(d.apr)&&d.apr<=1000&&num(d.minimum)&&(d.interestExpected===undefined||num(d.interestExpected))&&(d.interestDueDay===undefined||(typeof d.interestDueDay==='number'&&Number.isInteger(d.interestDueDay)&&d.interestDueDay>=1&&d.interestDueDay<=31))&&typeof d.dueDay==='number'&&Number.isInteger(d.dueDay)&&d.dueDay>=1&&d.dueDay<=31&&date(d.createdAt)&&str(d.note,2000);
}
function validTransaction(t:unknown):t is Transaction {
  return obj(t)&&id(t.id)&&(t.type==='income'||t.type==='expense')&&num(t.amount)&&t.amount>0&&str(t.category,100)&&date(t.date)&&str(t.note,2000)&&
    (t.need===undefined||(t.type==='expense'&&['essential','flexible'].includes(String(t.need))))&&
    (t.trigger===undefined||(t.type==='expense'&&['planned','impulse','promotion','emotion','social'].includes(String(t.trigger))));
}
function validPayment(p:unknown):p is Payment {
  return obj(p)&&id(p.id)&&id(p.debtId)&&date(p.date)&&(p.period===undefined||(str(p.period,7)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period)))&&num(p.principal)&&num(p.interest)&&num(p.fee)&&p.principal+p.interest+p.fee>0&&str(p.note,2000);
}
function validBudget(b:unknown):b is Budget {return obj(b)&&str(b.category,100)&&num(b.limit);}
function validPreferences(p:unknown):p is Preferences {return obj(p)&&num(p.monthlyIncome)&&num(p.essentials)&&num(p.reserve)&&(p.strategy==='avalanche'||p.strategy==='snowball');}
function validRollover(v:unknown):v is Rollover{return obj(v)&&id(v.id)&&id(v.debtId)&&(v.kind==='card'||v.kind==='loan')&&date(v.dueDate)&&num(v.amount)&&v.amount>0&&num(v.fee)&&['own','bank_transfer','refinance','other'].includes(String(v.funding))&&['planned','completed','cancelled'].includes(String(v.status))&&(v.completedAt===''||date(v.completedAt))&&str(v.note,2000);}
function validPhuongGroup(v:unknown):v is PhuongGroup {
 return obj(v)&&id(v.id)&&str(v.name,140)&&Boolean(v.name)&&str(v.organizer,140)&&['member','organizer'].includes(String(v.role))&&num(v.contribution)&&v.contribution>0&&['daily','weekly','monthly'].includes(String(v.cycle))&&date(v.startDate)&&typeof v.rounds==='number'&&Number.isInteger(v.rounds)&&v.rounds>=1&&v.rounds<=520&&(v.payoutRound===undefined||(typeof v.payoutRound==='number'&&Number.isInteger(v.payoutRound)&&v.payoutRound>=1&&v.payoutRound<=v.rounds))&&(v.payoutExpected===undefined||num(v.payoutExpected))&&['active','paused','completed'].includes(String(v.status))&&str(v.note,2000);
}
function validPhuongEntry(v:unknown):v is PhuongEntry{
 return obj(v)&&id(v.id)&&id(v.groupId)&&date(v.date)&&typeof v.round==='number'&&Number.isInteger(v.round)&&v.round>=1&&v.round<=520&&['contribution','payout','fee'].includes(String(v.kind))&&num(v.amount)&&v.amount>0&&str(v.note,2000);
}
function validAgentMessage(v:unknown):v is AgentMessage{
 return obj(v)&&id(v.id)&&['user','assistant'].includes(String(v.role))&&str(v.content,1200)&&Boolean(v.content)&&date(v.createdAt);
}
function validCashPlan(v:unknown):v is CashPlan {
 return obj(v)&&id(v.id)&&str(v.title,140)&&Boolean(v.title.trim())&&['in','out'].includes(String(v.direction))&&num(v.amount)&&v.amount>0&&date(v.dueDate)&&['planned','completed','cancelled'].includes(String(v.status))&&str(v.note,2000)&&(v.completedAt===undefined||date(v.completedAt))&&(v.linkedTransactionId===undefined||id(v.linkedTransactionId));
}
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
  const phuongGroups=input.phuongGroups===undefined?[]:input.phuongGroups;
  const phuongEntries=input.phuongEntries===undefined?[]:input.phuongEntries;
  const agentChat=input.agentChat===undefined?[]:input.agentChat;
  if(!Array.isArray(phuongGroups)||phuongGroups.length>500||!phuongGroups.every(validPhuongGroup)||!uniques(phuongGroups.map(g=>g.id)))throw new Error('Dữ liệu dây phường không hợp lệ.');
  if(!Array.isArray(phuongEntries)||phuongEntries.length>20000||!phuongEntries.every(validPhuongEntry)||!uniques(phuongEntries.map(e=>e.id))||phuongEntries.some(e=>!phuongGroups.some(g=>g.id===e.groupId&&e.round<=g.rounds)))throw new Error('Dữ liệu góp/lĩnh phường không hợp lệ.');
  if(!Array.isArray(agentChat)||agentChat.length>150||!agentChat.every(validAgentMessage)||!uniques(agentChat.map(m=>m.id)))throw new Error('Lịch sử hội thoại không hợp lệ.');
  const cashPlans=input.cashPlans===undefined?[]:input.cashPlans;
  if(!Array.isArray(cashPlans)||cashPlans.length>10000||!cashPlans.every(validCashPlan)||!uniques(cashPlans.map(v=>v.id)))throw new Error('Lịch dự kiến thu/chi không hợp lệ.');
  return {version:1,debts,transactions,payments,budgets,preferences:input.preferences as Preferences,rollovers,phuongGroups,phuongEntries,agentChat,cashPlans};
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
