import type {Debt, FinanceData, PhuongCycle, PhuongEntry, PhuongGroup, Transaction} from './types';
import {localISO,money,total} from './finance';
import {financeReminders} from './debtCommand';
import {analyzeSpending} from './spendingCoach';
import {phuongAssessment,phuongDues} from './phuong';

export type Draft =
 |{kind:'phuong';cycle?:PhuongCycle;contribution?:number;rounds?:number;startDate?:string;payoutRound?:number;payoutExpected?:number;name?:string;organizer?:string;payoutUnknown?:boolean}
 |{kind:'phuong_entry';entryKind:'contribution'|'payout'|'fee';groupId?:string;amount?:number;round?:number;date?:string}
 |{kind:'transaction';type:'income'|'expense';amount?:number;category?:string;date?:string;note?:string}
 |{kind:'debt';name?:string;balance?:number;minimum?:number;dueDay?:number;apr?:number;debtKind?:Debt['kind']};

export type ProposedRecord={kind:'phuong';group:PhuongGroup}|{kind:'phuong_entry';entry:PhuongEntry}|{kind:'transaction';transaction:Transaction}|{kind:'debt';debt:Debt};
export type AgentReply={text:string;draft:Draft|null;proposal?:ProposedRecord};

const normalize=(s:string)=>s.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
function moneyTokens(text:string):number[]{
 const results:number[]=[];
 const regex=/(\d[\d.,]*)(?:\s*)(triệu|trieu|tr|nghìn|ngàn|nghin|ngan|k|đồng|dong|vnd|đ)(?=\s|$|[/,.!?])/gi;
 for(const match of text.matchAll(regex)){
  const raw=match[1];
  const numeric=/^\d{1,3}([.,]\d{3})+$/.test(raw)?Number(raw.replace(/[.,]/g,'')):Number(raw.replace(',','.'));
  const unit=normalize(match[2]);
  const multiplier=['trieu','tr'].includes(unit)?1_000_000:['nghin','ngan','k'].includes(unit)?1000:1;
  const amount=numeric*multiplier;
  if(Number.isSafeInteger(amount)&&amount>0&&amount<=9e15)results.push(amount);
 }
 return results;
}
const capture=(re:RegExp,text:string)=>text.match(re)?.[1];
const dateFromText=(text:string,today:string)=>{
 const m=text.match(/(?<!\d)(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{4}))?(?!\d)/);
 if(!m)return undefined;
 const year=Number(m[3]||today.slice(0,4)),month=Number(m[2]),day=Number(m[1]);
 const test=new Date(Date.UTC(year,month-1,day));
 if(test.getUTCFullYear()!==year||test.getUTCMonth()!==month-1||test.getUTCDate()!==day)return undefined;
 return [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
};
export function parseAgentAmount(input:string){return moneyTokens(input)[0];}
export function startAgentDraft(text:string,data:FinanceData,today=localISO()):Draft|null{
 const n=normalize(text);
 const phuong=/\b(phuong|hui|choi ho|day ho|day hui)\b/i.test(n);
 const entry=/\b(da gop|vua gop|dong phuong|gop ky|nhan phuong|linh phuong|da linh)\b/.test(n);
 if(phuong && entry)return {kind:'phuong_entry',entryKind:/linh|nhan phuong/.test(n)?'payout':'contribution'};
 if(phuong)return {kind:'phuong'};
 if(/\b(toi no|vay ngan hang|vay ban|the tin dung|khoan vay)\b/.test(n) && !/\b(tra no|da tra|dong lai)\b/.test(n))return {kind:'debt'};
 if(/\b(chi|tieu|mua|an sang|an trua|an toi|tra tien|thanh toan|thu nhap|nhan luong|nhan tien)\b/.test(n))return {kind:'transaction',type:/\b(thu nhap|nhan luong|nhan tien)\b/.test(n)?'income':'expense'};
 return null;
}
function augmentDraft(draft:Draft,text:string,data:FinanceData,today:string):Draft{
 const n=normalize(text);
 const amounts=moneyTokens(text);
 const amount=amounts[0];
 const date=dateFromText(text,today);
 if(draft.kind==='phuong'){
  const freq:PhuongCycle|undefined=/\b(phuong ngay|hui ngay|hang ngay|moi ngay|ngay\/ngay|\/ngay)\b/.test(n)?'daily':/\b(phuong tuan|hang tuan|moi tuan|\/tuan)\b/.test(n)?'weekly':/\b(phuong thang|hang thang|moi thang|\/thang)\b/.test(n)?'monthly':undefined;
  const rounds=capture(/(\d{1,3})\s*(?:ky|chân|chan|ngay gop|lan gop)\b/,n);
  const payout=capture(/(?:linh|hot|boc|nhan)\s*(?:vao|o)?\s*(?:ky|lan|dot)\s*(\d{1,3})\b/,n);
  const possibleName=capture(/(?:ten day|day ten|ten phuong)\s*[:\-]?\s*([^,.]+)/,text);
  const organizer=capture(/(?:chu phuong|chu hui|chu ho)\s*[:\-]?\s*([^,.]+)/,text);
  const mentionsPayout=/\b(linh|hot|boc|duoc linh)\b/.test(n);
  const payoutAmount=amounts.length>1&&mentionsPayout?amounts[amounts.length-1]:mentionsPayout&&draft.contribution?amount:undefined;
  const contribution=amounts.length>1?amount:mentionsPayout&&draft.contribution?undefined:amount;
  return {...draft,...(freq?{cycle:freq}:{}),...(contribution?{contribution}:{}),...(payoutAmount?{payoutExpected:payoutAmount}:{}),...(date?{startDate:date}:{}),...(rounds?{rounds:Number(rounds)}:{}),...(payout?{payoutRound:Number(payout),payoutUnknown:false}:{}),...(/chua biet (?:ky |luc )?(?:linh|hot)/.test(n)?{payoutUnknown:true}:{}),...(possibleName?{name:possibleName.trim().slice(0,140)}:{}),...(organizer?{organizer:organizer.trim().slice(0,140)}:{})};
 }
 if(draft.kind==='phuong_entry'){
  const round=capture(/(?:ky|lan|dot)\s*(\d{1,3})/,n);
  const mentioned=(data.phuongGroups||[]).find(g=>n.includes(normalize(g.name)));
  const groupId=mentioned?.id||(data.phuongGroups||[]).length===1?mentioned?.id||(data.phuongGroups||[])[0]?.id:draft.groupId;
  return {...draft,...(groupId?{groupId}:{}),...(amount?{amount}:{}),...(round?{round:Number(round)}:{}),...(date?{date}:{}),...(/hom nay/.test(n)?{date:today}:{})};
 }
 if(draft.kind==='transaction'){
  const categories=['Ăn uống','Nhà ở','Đi lại','Mua sắm','Sức khỏe','Gia đình','Học tập','Giải trí','Hóa đơn'];
  const guessed=/\b(an|cafe|com|bun|pho|nha hang)\b/.test(n)?'Ăn uống':/\b(xe|xang|taxi|grab|di lai)\b/.test(n)?'Đi lại':/\b(shop|quan ao|mua sam)\b/.test(n)?'Mua sắm':/\b(tien nha|tien phong|thue nha)\b/.test(n)?'Nhà ở':/\b(luong|thu nhap)\b/.test(n)?'Lương':undefined;
  const category=categories.find(c=>n.includes(normalize(c)))||guessed||draft.category;
  const income=/\b(nhan luong|thu nhap|nhan tien)\b/.test(n);
  return {...draft,...(amount?{amount}:{}),...(category?{category}:{}),...(date?{date}:{}),...(/hom nay/.test(n)?{date:today}:{}),...(income?{type:'income' as const}:{})};
 }
 const name=capture(/(?:vay|no|the tin dung)\s+([^\d,.]+)/,text)?.trim().slice(0,140);
 const minimum=capture(/(?:tra toi thieu|moi thang tra|hang thang tra)\s*(\d[\d.,]*\s*(?:trieu|triệu|tr|k|nghin|nghìn|dong|đồng|đ|vnd))/i,text);
 const dueDay=capture(/(?:han ngay|tra ngay|ngay tra)\s*(\d{1,2})/,n);
 const apr=capture(/(?:lai suat)\s*(\d+(?:[,.]\d+)?)\s*%/,n);
 return {...draft,...(name?{name}:{}),...(amount?{balance:amount}:{}),...(minimum?{minimum:moneyTokens(minimum)[0]}:{}),...(dueDay?{dueDay:Number(dueDay)}:{}),...(apr?{apr:Number(apr.replace(',','.'))}:{}),...(/the tin dung/.test(n)?{debtKind:'card' as const}:{})};
}
function missing(d:Draft,data:FinanceData):string|null{
 if(d.kind==='phuong'){
  if(!d.cycle)return 'Bạn góp **hằng ngày, hằng tuần hay hằng tháng**?';
  if(!d.contribution)return 'Mỗi kỳ bạn góp bao nhiêu tiền? Ví dụ **200.000đ/kỳ**.';
  if(!d.rounds || d.rounds>520)return 'Dây này có tổng bao nhiêu kỳ? Ví dụ **30 kỳ**.';
  if(!d.startDate)return 'Dây bắt đầu ngày nào? Ví dụ **15/10/2026**.';
  if(d.payoutRound!==undefined&&d.payoutRound>d.rounds)return 'Kỳ lĩnh phải nằm trong tổng số kỳ. Bạn lĩnh kỳ bao nhiêu?';
  return null;
 }
 if(d.kind==='phuong_entry'){
  const groups=data.phuongGroups||[];
  if(!groups.length)return 'Bạn chưa ghi dây phường nào. Hãy kể về dây phường trước nhé.';
  if(!d.groupId)return 'Bạn đang nói về **dây phường nào**?';
  if(!d.round)return 'Khoản này thuộc **kỳ số mấy**?';
  if(!d.amount && d.entryKind!=='contribution')return 'Bạn đã lĩnh/đóng phí **bao nhiêu tiền**?';
  if(!d.date)return 'Ngày thực tế bạn đóng hoặc lĩnh tiền là ngày nào? Bạn có thể nói **hôm nay**.';
  return null;
 }
 if(d.kind==='transaction'){
  if(!d.amount)return 'Bạn đã '+(d.type==='income'?'nhận':'chi')+' bao nhiêu? Ví dụ **120.000đ**.';
  if(!d.date)return 'Giao dịch xảy ra ngày nào? Bạn có thể nói **hôm nay**.';
  return null;
 }
 if(!d.balance)return 'Dư nợ gốc hiện tại là bao nhiêu?';
 if(!d.dueDay)return 'Khoản này thường đến hạn trả ngày mấy hằng tháng?';
 if(d.dueDay>31)return 'Ngày đến hạn phải từ 1 đến 31. Bạn kiểm tra lại nhé.';
 return null;
}
function proposal(d:Draft,data:FinanceData,today:string):ProposedRecord{
 if(d.kind==='phuong'){
  return {kind:'phuong',group:{
   id:crypto.randomUUID(),name:d.name||'Dây phường '+(d.cycle==='daily'?'ngày':d.cycle==='weekly'?'tuần':'tháng'),
   organizer:d.organizer||'',role:'member',contribution:d.contribution!,cycle:d.cycle!,startDate:d.startDate!,
   rounds:d.rounds!,...(d.payoutRound?{payoutRound:d.payoutRound}:{}),...(d.payoutExpected?{payoutExpected:d.payoutExpected}:{}),
   status:'active',note:'Ghi nhận từ hội thoại, cần đối chiếu thỏa thuận thực tế.'
  }};
 }
 if(d.kind==='phuong_entry'){
  const g=(data.phuongGroups||[]).find(x=>x.id===d.groupId)!;
  return {kind:'phuong_entry',entry:{id:crypto.randomUUID(),groupId:g.id,round:d.round!,date:d.date!,kind:d.entryKind,amount:d.amount||g.contribution,note:'Đã ghi theo hội thoại, xác nhận giao dịch thực tế.'}};
 }
 if(d.kind==='transaction'){
  return {kind:'transaction',transaction:{id:crypto.randomUUID(),type:d.type,amount:d.amount!,date:d.date!,category:d.category||(d.type==='income'?'Khác':'Khác'),note:'Ghi bằng hội thoại',...(d.type==='expense'?{need:'flexible' as const}:{})}};
 }
 return {kind:'debt',debt:{id:crypto.randomUUID(),name:d.name||'Khoản vay được khai báo',lender:'',kind:d.debtKind||'other',original:d.balance!,balance:d.balance!,apr:d.apr||0,minimum:d.minimum||0,dueDay:d.dueDay!,createdAt:today,note:'Ghi bằng hội thoại; kiểm tra lãi suất và mức tối thiểu nếu chưa khai báo.'}};
}
function describe(p:ProposedRecord,data:FinanceData){
 if(p.kind==='phuong'){
  const g=p.group;return '📋 **Dây phường chuẩn bị lưu**\n'+
   'Tên: '+g.name+'\nGóp: '+money(g.contribution)+' / '+(g.cycle==='daily'?'ngày':g.cycle==='weekly'?'tuần':'tháng')+
   '\nSố kỳ: '+g.rounds+' · Bắt đầu: '+g.startDate+
   '\nKỳ lĩnh: '+(g.payoutRound||'chưa khai báo')+(g.payoutExpected?' · Dự kiến lĩnh '+money(g.payoutExpected):'')+
   '\nTổng nghĩa vụ danh nghĩa: '+money(g.contribution*g.rounds)+
   '\n\n*Đây là lịch dự kiến, chưa phải tiền đã nộp hay đã lĩnh.*';
 }
 if(p.kind==='phuong_entry'){
  const e=p.entry,g=(data.phuongGroups||[]).find(x=>x.id===e.groupId);
  return '📋 **Ghi nhận '+(e.kind==='contribution'?'góp':e.kind==='payout'?'lĩnh':'phí')+' phường**\nDây: '+(g?.name||'')+' · Kỳ '+e.round+'\nNgày '+e.date+' · Số tiền '+money(e.amount)+'\n*Khi lưu sẽ ghi nhận dòng tiền thực tế; không tạo giao dịch thu chi trùng.*';
 }
 if(p.kind==='transaction'){const t=p.transaction;return '📋 **'+(t.type==='income'?'Thu nhập':'Chi tiêu')+'**\n'+money(t.amount)+' · '+t.category+'\nNgày '+t.date+'\n*Khi lưu sẽ xuất hiện trong thu chi và nhật ký tài chính.*';}
 const d=p.debt;return '📋 **Khoản nợ dự kiến**\n'+d.name+' · Dư nợ '+money(d.balance)+'\nTrả tối thiểu '+money(d.minimum)+'/tháng, đến hạn ngày '+d.dueDay+'\nLãi suất '+d.apr+'%/năm (0% nếu chưa khai báo, cần bổ sung).';
}
export function agentTurn(input:string,current:Draft|null,data:FinanceData,today=localISO()):AgentReply{
 const n=normalize(input.trim());
 if(/^(huy|bo qua|thoi|cancel)$/.test(n))return {text:'Mình đã hủy bản nháp. Không có khoản tiền nào được ghi. Bạn muốn bổ sung thông tin gì tiếp?',draft:null};
 if(/^(xac nhan|dong y|luu|ok luu|luu lai)$/.test(n)){
  if(!current)return {text:'Hiện chưa có bản nháp nào đang chờ xác nhận. Bạn cứ kể thông tin tài chính, mình sẽ tạo bản nháp cho bạn xem trước.',draft:null};
  const need=missing(current,data);
  if(need)return {text:need,draft:current};
  const p=proposal(current,data,today);
  return {text:'Mình đã nhận xác nhận. Mình sẽ lưu bản ghi này vào Quản gia và cập nhật lịch theo dõi.',draft:null,proposal:p};
 }
 const started=startAgentDraft(input,data,today);
 // New explicit intent can start a different record; follow-up with only supplemental info retains draft.
 const next=started&&(!current||started.kind!==current.kind)?started:current||started;
 if(next){
  const draft=augmentDraft(next,input,data,today);
  const need=missing(draft,data);
  if(need)return {text:need+'\n\nBạn cứ trả lời tự nhiên, không cần mở biểu mẫu.',draft};
  const p=proposal(draft,data,today);
  return {text:describe(p,data)+'\n\n✅ Nếu đúng, nhắn **“xác nhận”**. Muốn bỏ, nhắn **“hủy”**. Mình chưa ghi gì vào sổ.',draft};
 }
 if(/\b(phuong|hui|choi ho)\b/.test(n)){
  const summary=phuongAssessment(data,today);
  const due=phuongDues(data,today).filter(x=>x.days>=0).slice(0,4);
  return {draft:null,text:'🪙 Bạn đang tham gia '+summary.activeGroups+' dây phường; số nghĩa vụ góp còn lại (danh nghĩa) '+money(summary.totalOutstanding)+'.\n'+(due.length?'Các kỳ tới: '+due.map(x=>'kỳ '+x.round+' ngày '+x.date+' '+money(x.amount)).join('; '):'Chưa có kỳ gần đến hạn.')+'\nBạn muốn ghi thêm dây mới, góp kỳ nào hay hỏi về lịch lĩnh?'};
 }
 if(/\b(han|dao the|den ngay|dong lai|lich no|sap phai)\b/.test(n)){
  const list=financeReminders(data,today).slice(0,5);
  return {draft:null,text:list.length?'🔔 Mình đang theo dõi '+list.length+' mục cần ưu tiên:\n'+list.map(x=>'• '+x.title+(x.date?' — '+x.date:'')+(x.amount?' — '+money(x.amount):'')).join('\n'):'Chưa có nghĩa vụ nợ được khai báo trong 30 ngày. Bạn có thể kể thêm khoản vay, ngày trả lãi hoặc dây phường.'};
 }
 if(/\b(chi bao nhieu|chi tieu|ngan sach|duoc chi|con bao nhieu)\b/.test(n)){
  const s=analyzeSpending(data,today);
  return {draft:null,text:s.configured?'💡 Theo thu nhập và nghĩa vụ đã khai báo, bạn còn khoảng '+money(s.freeFlexible)+' chi linh hoạt trong tháng. Mức chia đều cho '+s.daysLeft+' ngày là '+money(s.dailyFlexible)+'/ngày. Đây là ước tính, không phải số dư tài khoản.':'Bạn chưa khai báo thu nhập tháng. Hãy nhắn như “thu nhập tháng của tôi…” để mình biết cần bổ sung gì, hoặc vào Cài đặt thiết lập thu nhập.'};
 }
 return {draft:null,text:'Mình đang lắng nghe. Bạn có thể nói tự nhiên, chẳng hạn:\n• “Tôi chơi phường ngày 200k, 30 kỳ từ 15/10, lĩnh kỳ 12.”\n• “Hôm nay chi 120k ăn sáng.”\n• “Tôi còn khoản vay 15 triệu, trả ngày 20.”\n• “Tuần này có khoản nào sắp đến hạn?”\n\nMình hỏi tiếp nếu thiếu thông tin và chỉ ghi khi bạn xác nhận. Hiện khả năng hiểu tự nhiên dựa trên quy tắc, chưa kết nối mô hình AI bên ngoài.'};
}
export function commitProposal(data:FinanceData,p:ProposedRecord):FinanceData{
 switch(p.kind){
  case 'phuong':return {...data,phuongGroups:[...(data.phuongGroups||[]),p.group]};
  case 'phuong_entry':return {...data,phuongEntries:[...(data.phuongEntries||[]),p.entry]};
  case 'transaction':return {...data,transactions:[...data.transactions,p.transaction]};
  case 'debt':return {...data,debts:[...data.debts,p.debt]};
 }
}
