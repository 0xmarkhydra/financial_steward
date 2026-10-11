import type { FinanceData, PhuongGroup } from './types';
import { addMonths, daysUntil, localISO, money, total } from './finance';

export const phuongDate=(g:PhuongGroup,round:number)=>{
 const [y,m,d]=g.startDate.split('-').map(Number);
 if(g.cycle==='daily'||g.cycle==='weekly'){
  const date=new Date(Date.UTC(y,m-1,d+(round-1)*(g.cycle==='daily'?1:7)));
  return date.toISOString().slice(0,10);
 }
 const first=new Date(Date.UTC(y,m-1,1));
 const target=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+round,0));
 return target.toISOString().slice(0,7)+'-'+String(Math.min(d,target.getUTCDate())).padStart(2,'0');
};
export interface PhuongDue {id:string;groupId:string;round:number;kind:'contribution'|'payout';date:string;amount:number;days:number;}
export function phuongDues(data:FinanceData,asOf=localISO()):PhuongDue[]{
 const dues:PhuongDue[]=[];
 for(const g of data.phuongGroups||[]){
  if(g.status!=='active')continue;
  for(let round=1;round<=g.rounds;round++){
   const date=phuongDate(g,round),days=daysUntil(date,asOf);
   if(days>30)break;
   const entries=(data.phuongEntries||[]).filter(e=>e.groupId===g.id&&e.round===round);
   const paid=total(entries.filter(e=>e.kind==='contribution').map(e=>e.amount));
   if(paid<g.contribution && days>=-30)dues.push({id:g.id+':contribution:'+round,groupId:g.id,round,kind:'contribution',date,amount:g.contribution-paid,days});
   if(g.payoutRound===round && !entries.some(e=>e.kind==='payout') && days>=-30)dues.push({id:g.id+':payout:'+round,groupId:g.id,round,kind:'payout',date,amount:g.payoutExpected||0,days});
  }
 }
 return dues.sort((a,b)=>a.date.localeCompare(b.date)||a.round-b.round);
}
export function phuongMonthlyCommitment(data:FinanceData,month:string){
 let amount=0;
 for(const g of data.phuongGroups||[]){
  if(g.status!=='active')continue;
  for(let round=1;round<=g.rounds;round++){
   const date=phuongDate(g,round);
   if(date.slice(0,7)>month)break;
   if(date.slice(0,7)===month)amount+=g.contribution;
  }
 }
 return amount;
}
export function phuongTotals(data:FinanceData,group:PhuongGroup){
 const events=(data.phuongEntries||[]).filter(e=>e.groupId===group.id);
 const contributed=total(events.filter(e=>e.kind==='contribution').map(e=>e.amount));
 const received=total(events.filter(e=>e.kind==='payout').map(e=>e.amount));
 const fees=total(events.filter(e=>e.kind==='fee').map(e=>e.amount));
 const remainingNominal=Math.max(0,group.contribution*group.rounds-contributed);
 return {contributed,received,fees,remainingNominal};
}
export function phuongAssessment(data:FinanceData,asOf=localISO()){
 const due=phuongDues(data,asOf).filter(d=>d.kind==='contribution'&&d.days>=0&&d.days<=7);
 const obligations=total(due.map(d=>d.amount));
 const groups=(data.phuongGroups||[]).filter(g=>g.status==='active');
 const totalOutstanding=total(groups.map(g=>phuongTotals(data,g).remainingNominal));
 const payoutExpected=total(groups.filter(g=>g.payoutRound && !data.phuongEntries?.some(e=>e.groupId===g.id&&e.kind==='payout')).map(g=>g.payoutExpected||0));
 return {obligations,totalOutstanding,payoutExpected,activeGroups:groups.length,warning:groups.some(g=>g.payoutRound===undefined)?'Một số dây chưa có kỳ lĩnh, chưa thể tính đầy đủ dự kiến nhận tiền.':null};
}
