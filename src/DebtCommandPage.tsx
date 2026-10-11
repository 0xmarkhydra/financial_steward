import {useEffect,useMemo,useState} from 'react';
import {getJournal} from './api';
import type {JournalEntry} from './api';
import {AlertTriangle,BellRing,BookOpenCheck,CalendarClock,CheckCircle2,ChevronRight,ClipboardList,CreditCard,History,Lightbulb,ShieldAlert,Wallet} from 'lucide-react';
import type {FinanceData} from './types';
import {dateLabel,money} from './finance';
import {financeReminders,financialLedger,judgeFinancePatterns} from './debtCommand';
import type {FinanceReminder,LedgerEvent} from './debtCommand';

export default function DebtCommandPage({data,asOf,onNavigate}:{data:FinanceData;asOf:string;onNavigate:(page:'debts'|'rollovers'|'budgets'|'transactions'|'coach'|'phuong')=>void}){
  const reminders=useMemo(()=>financeReminders(data,asOf),[data,asOf]);
  const ledger=useMemo(()=>financialLedger(data),[data]);
  const reviews=useMemo(()=>judgeFinancePatterns(data,asOf),[data,asOf]);
  const [logFilter,setLogFilter]=useState<'all'|'income'|'expense'|'payment'|'rollover'|'phuong'>('all');
  const [showAll,setShowAll]=useState(false);
  const [journal,setJournal]=useState<JournalEntry[]|null>(null);
  const [journalError,setJournalError]=useState('');
  const [journalLoading,setJournalLoading]=useState(false);
  useEffect(()=>{
    let active=true;
    setJournalLoading(true);
    void getJournal().then(r=>{if(active){setJournal(r.events);setJournalError('');}})
      .catch(e=>{if(active)setJournalError(e instanceof Error?e.message:'Không thể tải lịch sử thay đổi.');})
      .finally(()=>{if(active)setJournalLoading(false);});
    return()=>{active=false;};
  },[]);
  function refreshJournal(){setJournalLoading(true);void getJournal().then(r=>{setJournal(r.events);setJournalError('');}).catch(e=>setJournalError(e instanceof Error?e.message:'Lỗi đọc nhật ký')).finally(()=>setJournalLoading(false));}
  const shown=ledger.filter(x=>logFilter==='all'||x.kind===logFilter).slice(0,showAll?250:20);
  const overdue=reminders.filter(x=>x.severity==='overdue').length;
  const urgent=reminders.filter(x=>x.severity==='urgent').length;
  const warning=reminders.filter(x=>x.kind==='budget').length;
  const severity=(r:FinanceReminder)=>r.severity==='overdue'?'Quá hạn':r.severity==='urgent'?'Cần xử lý sớm':r.severity==='upcoming'?'Sắp đến hạn':'Theo dõi';
  const amountLabel=(l:LedgerEvent)=>l.direction==='out'?'- '+money(l.amount):l.direction==='in'?'+ '+money(l.amount):money(l.amount);
  return <>
    <div className="page-heading"><div><div className="eyebrow">TRUNG TÂM QUẢN TRỊ NỢ & KỶ LUẬT TÀI CHÍNH</div><h1>Quản gia nhắc việc và đối soát</h1><p>Rà soát nghĩa vụ sắp đến hạn, sổ giao dịch và những quyết định tài chính cần điều chỉnh.</p></div></div>
    <div className="command-summary">
      <div className="panel"><span>Quá hạn cần xem lại</span><strong>{overdue}</strong><small>Gồm nghĩa vụ đã ghi nhưng chưa đủ thanh toán</small></div>
      <div className="panel"><span>Đến hạn trong 3 ngày</span><strong>{urgent}</strong><small>Trả nợ, đóng lãi, đáo thẻ và cảnh báo ngân sách</small></div>
      <div className="panel"><span>Ngân sách cần lưu ý</span><strong>{warning}</strong><small>Từ 80% hạn mức theo từng danh mục</small></div>
    </div>
    <section className="panel command-section">
      <div className="command-header"><div><span className="eyebrow">LỊCH NGHĨA VỤ</span><h2><BellRing size={20}/> Những việc cần nhớ</h2></div><span className="command-meta">Đang mở ứng dụng · không phải push khi ứng dụng đã đóng</span></div>
      {reminders.length?<div className="command-reminders">{reminders.map(r=><div className={'command-reminder '+r.severity} key={r.id}>
          <div className="command-reminder-icon">{r.kind==='rollover'?<CreditCard size={19}/>:r.kind==='budget'?<Wallet size={19}/>:<CalendarClock size={19}/>}</div>
          <div className="command-reminder-content"><div className="command-reminder-title"><strong>{r.title}</strong><span>{severity(r)}</span></div>
            <small>{r.date?'Ngày '+dateLabel(r.date)+(r.days===0?' · Hôm nay':r.days!==undefined?(r.days<0?' · Trễ '+Math.abs(r.days)+' ngày':' · Còn '+r.days+' ngày'):''):''}</small>
            <p>{r.detail}</p></div>
          <div className="command-reminder-action">{r.amount!==undefined&&<strong>{money(r.amount)}</strong>}<button onClick={()=>onNavigate(r.target)}>Xem chi tiết <ChevronRight size={15}/></button></div>
        </div>)}</div>:<div className="command-empty"><CheckCircle2 size={25}/><strong>Chưa thấy nghĩa vụ cần nhắc trong 30 ngày</strong><p>Hãy khai báo ngày trả nợ, lịch đáo thẻ, lãi dự kiến và ngân sách. Các khoản quá hạn vẫn được hiển thị cho đến khi ghi nhận xử lý.</p></div>}
      <p className="command-disclaimer">Lãi dự kiến và mức tối thiểu là hai thông tin có thể trùng nhau. Không cộng các thông báo làm tổng nợ. Cần đối chiếu sao kê ngân hàng trước khi thanh toán.</p>
    </section>
    <section className="panel command-section">
      <div className="command-header"><div><span className="eyebrow">NHẬT KÝ TÀI CHÍNH</span><h2><History size={20}/> Sổ cái giao dịch và lịch xử lý</h2></div><button className="btn outline" onClick={()=>onNavigate('transactions')}>Ghi thu / chi</button></div>
      <div className="command-filters">{([{key:'all',label:'Tất cả'},{key:'income',label:'Tiền vào'},{key:'expense',label:'Tiền ra'},{key:'payment',label:'Trả gốc/lãi'},{key:'rollover',label:'Đáo hạn'},{key:'phuong',label:'Góp / lĩnh phường'}] as const).map(item=><button key={item.key} className={logFilter===item.key?'active':''} type="button" onClick={()=>{setLogFilter(item.key);setShowAll(false)}}>{item.label}</button>)}</div>
      {shown.length?<div className="command-ledger">{shown.map(row=><div className="command-ledger-row" key={row.id}>
        <div className={'command-ledger-icon '+row.direction}>{row.direction==='record'?<BookOpenCheck size={18}/>:row.direction==='planned'?<CalendarClock size={18}/>:<ClipboardList size={18}/>}</div>
        <div className="command-ledger-details"><strong>{row.title}</strong><small>{dateLabel(row.date)} · {row.detail}</small>{row.note&&<p>{row.note}</p>}{row.review&&<p className="command-row-review"><Lightbulb size={14}/>{row.review}</p>}</div>
        <strong className={'command-ledger-amount '+row.direction}>{amountLabel(row)}</strong>
      </div>)}</div>:<div className="command-empty"><ClipboardList size={24}/><p>Chưa có giao dịch tương ứng. Các giao dịch sẽ xuất hiện tại đây khi bạn ghi chép.</p></div>}
      {ledger.length>20&&!showAll&&<button className="command-more" onClick={()=>setShowAll(true)}>Xem thêm lịch sử</button>}
      <p className="command-disclaimer">Bản ghi đáo hạn và ghi nhận nợ không được cộng vào thu/chi thực tế. Đây là sổ đối soát từ dữ liệu hiện tại; lịch sử thêm, sửa, xóa được lưu riêng trên máy chủ và hiển thị bên dưới.</p>
    </section>
    <section className="panel command-section">
      <div className="command-header"><div><span className="eyebrow">NHẬT KÝ ĐIỀU CHỈNH LƯU TRÊN MÁY CHỦ</span><h2><BookOpenCheck size={20}/> Ai đã thay đổi giao dịch nào?</h2></div><button type="button" className="btn outline" disabled={journalLoading} onClick={refreshJournal}>Tải lại nhật ký</button></div>
      <p className="command-disclaimer">Lưu các thao tác thêm, sửa, xóa đã đồng bộ thành công, có thời điểm và phiên bản dữ liệu. Lịch sử được lưu riêng trong PostgreSQL; ứng dụng không có API sửa hoặc xóa từng bản ghi nhật ký.</p>
      {journalError&&<p className="command-journal-error" role="alert">{journalError}</p>}
      {!journalError&&journal===null&&<p className="command-disclaimer">Đang tải lịch sử đối soát...</p>}
      {journal&&!journal.length&&<div className="command-empty"><BookOpenCheck size={23}/><p>Chưa có thay đổi được ghi nhận trong nhật ký máy chủ từ khi tính năng được triển khai.</p></div>}
      {journal&&journal.length>0&&<div className="command-journal">{journal.map(event=><div className="command-journal-item" key={event.id}>
        <div><strong>{event.action==='created'?'Đã thêm':event.action==='updated'?'Đã sửa':event.action==='deleted'?'Đã xóa':'Đã nhập hàng loạt'} · {event.title}</strong><small>{new Date(event.createdAt).toLocaleString('vi-VN')} · Lần cập nhật #{event.revision}</small></div>
        {event.amount>0&&<span>{money(event.amount)}</span>}
      </div>)}</div>}
      <p className="command-disclaimer">Hiển thị tối đa 100 sự kiện gần đây; sự kiện trước thời điểm triển khai không được hồi tố. Đây là lịch sử ứng dụng, chưa phải nhật ký pháp lý chống chỉnh sửa ở cấp cơ sở dữ liệu.</p>
    </section>
    <section className="panel command-section">
      <div className="command-header"><div><span className="eyebrow">ĐÁNH GIÁ QUYẾT ĐỊNH DỰA TRÊN BẰNG CHỨNG</span><h2><Lightbulb size={21}/> Quản gia nhận xét cách sử dụng tiền</h2></div><ShieldAlert size={21}/></div>
      <div className="command-reviews">{reviews.map((item,i)=><article key={i} className={'command-review '+item.level}>
          <div className="command-review-top">{item.level==='risk'?<AlertTriangle size={19}/>:item.level==='good'?<CheckCircle2 size={19}/>:<Lightbulb size={19}/>}<h3>{item.headline}</h3></div>
          <p><strong>Quan sát:</strong> {item.evidence}</p>
          <p><strong>Đề xuất:</strong> {item.action}</p>
        </article>)}</div>
      <p className="command-disclaimer">Quản gia đánh giá mẫu hành vi giao dịch, không đánh giá con người. Kết luận dựa trên bản ghi thủ công và quy tắc minh bạch, không phải mô hình AI hiểu ngữ cảnh đầy đủ hay lời khuyên đầu tư.</p>
    </section>
  </>;
}
