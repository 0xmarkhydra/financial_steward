import type { FinanceData, Debt } from './types';
import { addMonths, daysUntil, localISO, monthKey, monthStats, money, total } from './finance';
import { analyzeSpending } from './spendingCoach';
import {phuongDues} from './phuong';

export type ReminderKind = 'debt' | 'interest' | 'rollover' | 'budget' | 'phuong';
export type Severity = 'overdue' | 'urgent' | 'upcoming' | 'info';
export interface FinanceReminder {
  id:string;
  kind:ReminderKind;
  severity:Severity;
  title:string;
  date?:string;
  days?:number;
  amount?:number;
  detail:string;
  target:'debts'|'rollovers'|'budgets'|'coach'|'phuong';
}
export interface LedgerEvent {
  id:string;
  date:string;
  kind:'income'|'expense'|'payment'|'rollover'|'debt'|'phuong';
  title:string;
  amount:number;
  direction:'in'|'out'|'planned'|'record';
  detail:string;
  note:string;
  sourceId:string;
  review?:string;
}
export interface FinancialJudgement {
  level:'risk'|'caution'|'good'|'insufficient';
  headline:string;
  evidence:string;
  action:string;
}

const monthDue=(month:string,day:number)=>{
  const [year,m]=month.split('-').map(Number);
  const last=new Date(Date.UTC(year,m,0)).getUTCDate();
  return month+'-'+String(Math.min(Math.max(day,1),last)).padStart(2,'0');
};
function scoreDue(delta:number):Severity {
  return delta<0?'overdue':delta<=3?'urgent':delta<=14?'upcoming':'info';
}
function debtPaymentRecords(data:FinanceData,debtId:string,month:string){
  return data.payments.filter(p=>p.debtId===debtId&&(p.period||monthKey(p.date))===month);
}
function repaymentReminder(data:FinanceData,d:Debt,asOf:string,kind:'debt'|'interest'):FinanceReminder|null {
  const day=kind==='debt'?d.dueDay:d.interestDueDay;
  const required=kind==='debt'?Math.min(d.balance,d.minimum):(d.interestExpected||0);
  if(!day || required<=0 || d.balance<=0)return null;
  const thisMonth=monthKey(asOf);
  let date=monthDue(thisMonth,day);
  let paid=debtPaymentRecords(data,d.id,thisMonth).reduce((sum,p)=>sum+(kind==='debt'?p.principal+p.interest+p.fee:p.interest),0);
  let remaining=Math.max(0,required-paid);
  // If the loan began after this month's date, or the month's obligation is recorded as met,
  // the next item is a forecast for the following month.
  if(date<d.createdAt || remaining<=0){
    date=monthDue(addMonths(thisMonth,1),day);
    remaining=required;
  }
  const delta=daysUntil(date,asOf);
  if(delta>30)return null;
  const what=kind==='debt'?'Trả nợ / sao kê':'Đóng lãi';
  return {
    id:kind+':'+d.id+':'+date,kind,severity:scoreDue(delta),
    title:what+': '+d.name,date,days:delta,amount:remaining,target:'debts',
    detail:kind==='interest'
      ? 'Lãi dự kiến do bạn khai báo; đối chiếu lãi thực tế và ghi tiền lãi trong mục Trả nợ.'
      : 'Mức tối thiểu còn lại theo giao dịch tháng này. Đối chiếu sao kê; tiền lãi có thể nằm trong khoản thanh toán tối thiểu.'
  };
}

export function financeReminders(data:FinanceData,asOf=localISO()):FinanceReminder[]{
  const out:FinanceReminder[]=[];
  for(const d of data.debts){
    const debt=repaymentReminder(data,d,asOf,'debt');
    const interest=repaymentReminder(data,d,asOf,'interest');
    if(debt)out.push(debt);
    if(interest)out.push(interest);
  }
  const currentMonth=monthKey(asOf);
  const prevMonth=addMonths(currentMonth,-1);
  for(const d of data.debts){
    if(d.balance<=0)continue;
    for(const kind of ['debt','interest'] as const){
      const dueDay=kind==='debt'?d.dueDay:d.interestDueDay;
      const amount=kind==='debt'?d.minimum:d.interestExpected;
      if(!dueDay || !amount)continue;
      const previousDate=monthDue(prevMonth,dueDay);
      if(previousDate<d.createdAt)continue;
      const recorded=debtPaymentRecords(data,d.id,prevMonth).reduce((s,p)=>s+(kind==='debt'?p.principal+p.interest+p.fee:p.interest),0);
      if(recorded>=amount)continue;
      out.push({id:'reconcile:'+kind+':'+d.id+':'+prevMonth,kind,severity:'urgent',
        title:'Đối soát kỳ trước: '+d.name+(kind==='interest'?' (lãi)':''),date:previousDate,days:daysUntil(previousDate,asOf),target:'debts',
        detail:'Chưa có đủ bản ghi thanh toán áp dụng kỳ '+prevMonth+'. Không khẳng định đã quá hạn ngân hàng; hãy đối chiếu sao kê và khai báo đúng kỳ đã trả.'});
    }
  }
  for(const r of data.rollovers||[]){
    if(r.status!=='planned')continue;
    const delta=daysUntil(r.dueDate,asOf);
    if(delta>30)continue;
    const d=data.debts.find(v=>v.id===r.debtId);
    out.push({
      id:'rollover:'+r.id,kind:'rollover',severity:scoreDue(delta),
      title:(r.kind==='card'?'Đáo thẻ: ':'Đáo hạn nợ: ')+(d?.name||'Khoản nợ'),
      date:r.dueDate,days:delta,amount:r.amount,target:'rollovers',
      detail:'Khoản dự kiến cần xử lý; phí dự kiến '+money(r.fee)+'. Đây KHÔNG phải khoản đã chi hoặc đã trả gốc.'
    });
  }
  const month=monthKey(asOf);
  for(const b of data.budgets){
    const expense=total(data.transactions.filter(t=>t.type==='expense'&&t.category===b.category&&monthKey(t.date)===month&&t.date<=asOf).map(t=>t.amount));
    if(expense<=0 || (b.limit>0&&expense/b.limit<.8))continue;
    const pct=b.limit>0?Math.round(expense/b.limit*100):100;
    out.push({
      id:'budget:'+b.category+':'+month,kind:'budget',
      severity:expense>b.limit?'urgent':'upcoming',
      title:(expense>b.limit?'Đã vượt':'Sắp chạm')+' ngân sách: '+b.category,
      amount:expense,target:'budgets',detail:'Đã dùng '+money(expense)+' / '+money(b.limit)+' ('+pct+'%). Cần cân đối chi tiêu còn lại trong tháng.'
    });
  }
  const coach=analyzeSpending(data,asOf);
  if(coach.configured && coach.totalExpenseRecords>0){
    const used=coach.currentFlexibleOrUnclassified+Math.max(0,coach.currentEssential-coach.essentialsPlan);
    if((coach.flexibleCap>0&&used>=coach.flexibleCap*.8)||(coach.flexibleCap===0&&used>0)){
      const over=used>coach.flexibleCap;
      out.push({id:'flexible:'+month,kind:'budget',severity:over?'urgent':'upcoming',
        title:over?'Vượt hạn mức chi linh hoạt':'Chi linh hoạt đã dùng hơn 80%',amount:used,target:'coach',
        detail:'Đã dùng '+money(used)+' / '+money(coach.flexibleCap)+' theo thu nhập và nghĩa vụ khai báo. Chọn Thói quen chi tiêu để điều chỉnh hành vi.'});
    }
  }
  for(const item of phuongDues(data,asOf)){
    const group=(data.phuongGroups||[]).find(g=>g.id===item.groupId);
    if(!group)continue;
    out.push({id:'phuong:'+item.id,kind:'phuong',severity:scoreDue(item.days),date:item.date,days:item.days,
      title:(item.kind==='contribution'?'Đóng phường: ':'Lĩnh phường dự kiến: ')+group.name+' kỳ '+item.round,
      amount:item.amount,target:'phuong',
      detail:item.kind==='contribution'?'Khoản góp chưa đủ bản ghi thanh toán. Phải đối chiếu thực tế trước khi kết luận quá hạn.':'Tiền lĩnh dự kiến, không phải lãi hay số dư đã nhận.'});
  }
  const rank:Record<Severity,number>={overdue:0,urgent:1,upcoming:2,info:3};
  return out.sort((a,b)=>rank[a.severity]-rank[b.severity]||(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title));
}

function reviewExpense(t:FinanceData['transactions'][number],income:number):string {
  if(t.need==='essential' && t.trigger==='planned')return 'Chi thiết yếu đã lên kế hoạch; nên kiểm tra mức chi so với ngân sách đã đặt.';
  if(t.need!=='essential' && (t.trigger==='impulse'||t.trigger==='emotion'))return 'Chi chưa theo kế hoạch hoặc do cảm xúc (theo nhãn đã nhập); cân nhắc đợi 24 giờ trước lần mua tương tự.';
  if(t.need!=='essential' && t.trigger==='promotion')return 'Quyết định mua do khuyến mãi (theo nhãn đã nhập); chỉ coi là tiết kiệm khi đây là món thực sự cần.';
  if(t.need==='flexible' && income>0 && t.amount/income>.15)return 'Một khoản chi linh hoạt tương đối lớn so với thu nhập tháng khai báo; nên đặt mục tiêu tiết kiệm và xem lại ưu tiên.';
  if(!t.need || !t.trigger)return 'Chưa đủ thông tin về mục đích/lý do để nhận xét quyết định; hãy gắn nhãn cho khoản chi.';
  if(t.trigger==='planned')return 'Khoản chi đã lên kế hoạch (theo nhãn người dùng); đối chiếu số liệu cuối tháng để đánh giá hiệu quả.';
  return 'Đã ghi nhận mục đích chi; đối chiếu với ngân sách và nhu cầu thực tế để đánh giá.';
}

// This is a unified view over source records, not an immutable compliance/audit log.
export function financialLedger(data:FinanceData):LedgerEvent[]{
  const debtNames=new Map(data.debts.map(d=>[d.id,d.name]));
  const records:LedgerEvent[]=[];
  for(const t of data.transactions)records.push({
    id:'txn:'+t.id,date:t.date,kind:t.type,title:(t.type==='income'?'Thu: ':'Chi: ')+t.category,
    amount:t.amount,direction:t.type==='income'?'in':'out',
    detail:t.type==='expense'?(t.need==='essential'?'Thiết yếu':t.need==='flexible'?'Linh hoạt':'Chưa phân loại'):'Tiền vào',
    note:t.note,sourceId:t.id,
    ...(t.type==='expense'?{review:reviewExpense(t,data.preferences.monthlyIncome)}:{})
  });
  for(const e of data.phuongEntries||[]){
    const group=(data.phuongGroups||[]).find(g=>g.id===e.groupId);
    records.push({id:'phuong:'+e.id,date:e.date,kind:'phuong',sourceId:e.id,
      title:(e.kind==='payout'?'Lĩnh phường: ':e.kind==='fee'?'Phí phường: ':'Góp phường: ')+(group?.name||'Dây phường')+' · kỳ '+e.round,
      amount:e.amount,direction:e.kind==='payout'?'in':'out',
      detail:e.kind==='payout'?'Tiền đã lĩnh, không phải lợi nhuận':e.kind==='fee'?'Phí thực trả':'Tiền đã góp thực tế',note:e.note});
  }
  for(const p of data.payments)records.push({
    id:'pay:'+p.id,date:p.date,kind:'payment',title:'Trả nợ: '+(debtNames.get(p.debtId)||'Khoản nợ'),
    amount:p.principal+p.interest+p.fee,direction:'out',sourceId:p.id,
    detail:'Gốc '+money(p.principal)+' · Lãi '+money(p.interest)+' · Phí '+money(p.fee),
    note:p.note,
    ...(p.principal===0&&p.interest+p.fee>0?{review:'Lãi/phí đã chi nhưng gốc chưa giảm. Cần kiểm tra kế hoạch trả gốc.'}:{})
  });
  for(const d of data.debts)records.push({
    id:'debt:'+d.id,date:d.createdAt,kind:'debt',title:'Ghi nhận nợ: '+d.name,
    amount:d.original,direction:'record',detail:'Dư nợ gốc ban đầu được khai báo; không tự coi là tiền thu thực nhận',
    note:d.note,sourceId:d.id
  });
  for(const r of data.rollovers||[])records.push({
    id:'roll:'+r.id,date:r.completedAt||r.dueDate,kind:'rollover',
    title:(r.status==='completed'?'Đã đánh dấu xử lý':'Kế hoạch đáo hạn')+': '+(debtNames.get(r.debtId)||'Khoản nợ'),
    amount:r.amount,direction:'planned',detail:'Trạng thái: '+(r.status==='planned'?'chờ':r.status==='completed'?'đã xử lý':'đã hủy')+'. Dự kiến phí '+money(r.fee)+'. Không tính là dòng tiền thực.',
    note:r.note,sourceId:r.id,
    ...(r.fee>0?{review:'Phí đáo hạn dự kiến '+money(r.fee)+'; cần đánh giá tổng chi phí và đối chiếu điều khoản trước khi thực hiện.'}:{})
  });
  return records.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}

export function judgeFinancePatterns(data:FinanceData,asOf=localISO()):FinancialJudgement[]{
  const month=monthKey(asOf);
  const expenses=data.transactions.filter(t=>t.type==='expense'&&monthKey(t.date)===month&&t.date<=asOf);
  const income=data.transactions.filter(t=>t.type==='income'&&monthKey(t.date)===month&&t.date<=asOf);
  const out:FinancialJudgement[]=[];
  const monthlyIncome=total(income.map(t=>t.amount));
  const monthExpenses=total(expenses.map(t=>t.amount));
  const paid=monthStats(data,month).debtPaid;
  const active=data.debts.filter(d=>d.balance>0);
  const minimum=total(active.map(d=>Math.min(d.minimum,d.balance)));
  const plannedIncome=data.preferences.monthlyIncome;
  if(!expenses.length && !data.payments.length){
    return [{level:'insufficient',headline:'Chưa đủ dữ liệu để đánh giá quyết định',evidence:'Chưa có lịch sử chi tiêu hoặc thanh toán nợ để đối chiếu.',action:'Ghi đều đặn các khoản thu, chi, gốc, lãi và phí để nhận đánh giá có cơ sở.'}];
  }
  if(plannedIncome>0 && minimum/plannedIncome>.5)out.push({
    level:'risk',headline:'Áp lực trả nợ đang cao',
    evidence:'Nghĩa vụ tối thiểu khai báo bằng '+Math.round(minimum/plannedIncome*100)+'% thu nhập dự kiến; chưa tính sinh hoạt.',
    action:'Ưu tiên dự phòng ngày đóng lãi/đáo hạn, hạn chế phát sinh nợ mới và chủ động rà soát phương án trả nợ.'
  });
  if(monthlyIncome>0 && monthExpenses+paid>monthlyIncome)out.push({
    level:'risk',headline:'Dòng tiền ghi nhận đang âm',
    evidence:'Chi sinh hoạt và trả nợ trong tháng vượt tiền thu đã ghi '+money(monthExpenses+paid-monthlyIncome)+'.',
    action:'Đối soát khoản thu còn thiếu; nếu đúng là âm, tạm hoãn các khoản chi có thể cân nhắc.'
  });
  const impulse=expenses.filter(t=>['impulse','promotion','emotion'].includes(t.trigger||''));
  const impulseAmount=total(impulse.map(t=>t.amount));
  if(impulse.length>=2 && monthExpenses>0 && impulseAmount/monthExpenses>=.25)out.push({
    level:'caution',headline:'Xu hướng mua theo cảm xúc/khuyến mãi',
    evidence:impulse.length+' khoản được chính bạn gắn nhãn, chiếm '+Math.round(impulseAmount/monthExpenses*100)+'% tổng chi tháng.',
    action:'Đặt quy tắc chờ 24 giờ với khoản không thiết yếu; so sánh giá và lợi ích trước khi quyết định.'
  });
  const completedRollovers=(data.rollovers||[]).filter(r=>r.status==='completed');
  if(completedRollovers.length>=3)out.push({
    level:'caution',headline:'Phụ thuộc nhiều vào đáo hạn/đảo nợ',
    evidence:'Đã đánh dấu '+completedRollovers.length+' lịch đáo hạn xử lý trong hệ thống.',
    action:'Tính tổng phí thực trả và đặt mục tiêu giảm nợ gốc; chỉ lựa chọn giải pháp hợp pháp, minh bạch.'
  });
  const debtPayment=thisMonthDebtEvidence(data,month);
  if(active.length && paid>0 && debtPayment.principal===0 && debtPayment.interest>0)out.push({
    level:'caution',headline:'Đang trả lãi nhưng chưa giảm gốc trong tháng',
    evidence:'Đã ghi '+money(debtPayment.interest)+' lãi/phí và chưa có khoản trả gốc.',
    action:'Đối chiếu điều khoản và lập kế hoạch giảm gốc khi có khả năng, tránh chỉ kéo dài thời hạn nợ.'
  });
  const coach=analyzeSpending(data,asOf);
  if(coach.configured && (coach.alerts.some(a=>a.level==='high')))out.push({
    level:'risk',headline:'Hạn mức dự kiến chưa an toàn',
    evidence:'Thu nhập, nghĩa vụ nợ, mức dự phòng hoặc giao dịch đã khai báo đang cho thấy rủi ro vượt mức.',
    action:'Xem mục Thói quen chi tiêu, điều chỉnh hạn mức sau khi kiểm tra số liệu thực tế.'
  });
  if(!out.length){
    const labelled=expenses.filter(t=>t.need&&t.trigger).length;
    out.push({level:'good',headline:'Chưa phát hiện mẫu chi tiêu rủi ro rõ rệt',evidence:'Từ '+expenses.length+' khoản chi của tháng, '+labelled+' khoản có nhãn hành vi. Dữ liệu nhập tay có thể chưa đầy đủ.',action:'Tiếp tục đối soát nợ, lãi, chi tiêu và bổ sung nhãn để đánh giá chính xác hơn.'});
  }
  return out;
}
function thisMonthDebtEvidence(data:FinanceData,month:string){
  const list=data.payments.filter(p=>monthKey(p.date)===month);
  return {principal:total(list.map(p=>p.principal)),interest:total(list.map(p=>p.interest+p.fee))};
}
