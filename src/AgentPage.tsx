import { useMemo, useState } from 'react';
import { Bot, ShieldCheck, AlertTriangle, TrendingDown } from 'lucide-react';
import type { FinanceData } from './types';
import { daysUntil, debtOrder, forecast, localISO, money, monthStats, thisMonth } from './finance';
type Finding={level:'high'|'medium'|'info';title:string;detail:string};
export function analyzeFinance(data:FinanceData):Finding[]{
 const today=localISO(), month=thisMonth(), stats=monthStats(data,month);
 const active=data.debts.filter(d=>d.balance>0);
 const minimum=active.reduce((s,d)=>s+Math.min(d.minimum,d.balance),0);
 const budget=Math.max(0,data.preferences.monthlyIncome-data.preferences.essentials-data.preferences.reserve);
 const findings:Finding[]=[];
 const free=data.preferences.monthlyIncome-data.preferences.essentials-data.preferences.reserve-minimum;
 if(data.preferences.monthlyIncome>0){findings.push({level:free<0?'high':'info',title:'Ngân sách chi tiêu linh hoạt',detail:free<0?'Ngân sách dự kiến thiếu '+money(-free)+' sau khi giữ tiền sinh hoạt, dự phòng và trả nợ tối thiểu. Không nên tăng chi tiêu tùy ý.':'Có thể phân bổ tối đa '+money(free)+' trong tháng cho các khoản không thiết yếu, trước khi trừ các khoản phát sinh khác. Đây không phải số dư tài khoản thực tế.'});}
 const recurring=data.debts.filter(d=>d.balance>0&&d.minimum>0);
 for(const d of recurring){const [y,m]=today.split('-').map(Number);const maxDay=new Date(y,m,0).getDate();const date=y+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(d.dueDay,maxDay)).padStart(2,'0');const days=daysUntil(date,today);if(days>=0&&days<=3)findings.push({level:'medium',title:'Sắp đến ngày trả: '+d.name,detail:'Ngày dự kiến '+date+' · mức tối thiểu khai báo '+money(d.minimum)+'. Cần đối chiếu sao kê và khoản đã thanh toán trước khi chuyển tiền.'});}
 if(!data.transactions.length)findings.push({level:'medium',title:'Chưa có lịch sử thu chi',detail:'Chưa thể dự báo dòng tiền thực tế. Hãy ghi lại thu nhập và chi tiêu để Agent đưa ra hạn mức chính xác hơn.'});
 if(!active.length){findings.push({level:'info',title:'Chưa có khoản nợ',detail:'Bạn có thể theo dõi chi tiêu và ngân sách; thêm khoản nợ nếu có để được cảnh báo ngày trả.'});return findings;}
 if(minimum>budget)findings.push({level:'high',title:'Thiếu ngân sách trả nợ tối thiểu',detail:'Thiếu '+money(minimum-budget)+' mỗi tháng so với mức trả tối thiểu đã khai báo. Hãy xem lại ngân sách hoặc liên hệ tổ chức cho vay để trao đổi phương án hợp lệ.'});
 const due=(data.rollovers||[]).filter(r=>r.status==='planned'&&daysUntil(r.dueDate,today)<=7);
 for(const r of due){const d=data.debts.find(x=>x.id===r.debtId);findings.push({level:daysUntil(r.dueDate,today)<0?'high':'medium',title:'Đáo hạn: '+(d?.name||'Khoản vay'),detail:(daysUntil(r.dueDate,today)<0?'Đã quá hạn':'Sắp đến hạn')+' '+r.dueDate+' · '+money(r.amount)+' · phí dự kiến '+money(r.fee)+'. Cần xác minh nguồn tiền và điều khoản ngân hàng.'});}
 const repeats=new Map<string,number>();
 for(const r of data.rollovers||[]){if(r.status!=='cancelled')repeats.set(r.debtId,(repeats.get(r.debtId)||0)+1);}
 for(const [id,count]of repeats){if(count>=3)findings.push({level:'medium',title:'Đảo nợ nhiều lần',detail:(data.debts.find(d=>d.id===id)?.name||'Khoản vay')+' đã có '+count+' lần lên lịch đáo hạn. Cần xem xét tổng phí và khả năng giảm nợ gốc thực tế.'});}
 if(stats.remaining<0)findings.push({level:'high',title:'Dòng tiền tháng này âm',detail:'Thu nhập trừ sinh hoạt và trả nợ đang âm '+money(-stats.remaining)+'. Tránh dùng khoản vay mới để che thiếu hụt mà không có kế hoạch trả rõ ràng.'});
 const priority=debtOrder(active,data.preferences.strategy)[0];
 if(priority)findings.push({level:'info',title:'Ưu tiên theo chiến lược đã chọn',detail:priority.name+' ('+priority.apr+'%/năm, dư nợ '+money(priority.balance)+') đứng đầu danh sách theo '+(data.preferences.strategy==='avalanche'?'lãi suất cao':'dư nợ nhỏ')+'. Đây là gợi ý, không thay thế điều khoản thực tế.'});
 const projection=forecast(data.debts,data.preferences.monthlyIncome,data.preferences.essentials,data.preferences.reserve,data.preferences.strategy);
 if(projection.months!==null&&projection.shortfall===0)findings.push({level:'info',title:'Mô phỏng trả hết nợ',detail:'Theo giả định lãi suất cố định và ngân sách khai báo, ước tính '+projection.months+' tháng. Kết quả không phải cam kết từ ngân hàng.'});
 return findings;
}
export default function AgentPage({data}:{data:FinanceData}){
 const findings=useMemo(()=>analyzeFinance(data),[data]);
 const [question,setQuestion]=useState('');
 const [answer,setAnswer]=useState('');
 function ask(){const q=question.toLocaleLowerCase('vi');const selected=q.includes('đáo')||q.includes('thẻ')?findings.filter(f=>f.title.toLowerCase().includes('đáo')||f.title.includes('Đảo')):q.includes('trả')||q.includes('nợ')?findings.filter(f=>f.title.includes('nợ')||f.title.includes('trả')):findings;setAnswer((selected.length?selected:findings).map(f=>f.title+': '+f.detail).join('\n\n'));}
 return <><div className="page-heading"><div><div className="eyebrow">AI FINANCIAL AGENT · BẢN PHÂN TÍCH NỘI BỘ</div><h1>Trợ lý quản gia tài chính</h1><p>Phân tích dữ liệu tài chính bạn đã nhập, phát hiện rủi ro và đề xuất bước tiếp theo.</p></div></div>
 <section className="panel" style={{marginBottom:20}}><div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}><Bot size={26}/><div><h2>Những việc cần chú ý</h2><small>Được tính từ dữ liệu hiện tại, không gửi dữ liệu tới mô hình AI bên ngoài</small></div></div><div style={{display:'grid',gap:12}}>{findings.map((f,i)=><div key={i} style={{padding:16,border:'1px solid #e7edf2',borderRadius:12,display:'flex',alignItems:'flex-start',gap:12}}>{f.level==='high'?<AlertTriangle color="#d24d57" size={21}/>:f.level==='medium'?<TrendingDown color="#c88730" size={21}/>:<ShieldCheck color="#1a9c83" size={21}/>}<div><strong>{f.title}</strong><p style={{marginTop:5,color:'#64748b',lineHeight:1.7}}>{f.detail}</p></div></div>)}</div></section>
 <section className="panel"><h2 style={{marginBottom:12}}>Hỏi trợ lý về dữ liệu của bạn</h2><p style={{color:'#64748b',marginBottom:16}}>Ví dụ: “Khoản nào nên trả trước?”, “Lịch đáo hạn có rủi ro gì?”, “Dòng tiền tháng này thế nào?”</p><form onSubmit={e=>{e.preventDefault();ask()}} style={{display:'flex',gap:10,flexWrap:'wrap'}}><input style={{flex:'1 1 260px',padding:12,border:'1px solid #d8e2e9',borderRadius:10}} value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500} placeholder="Nhập câu hỏi về tài chính..." required/><button className="btn primary">Phân tích</button></form>{answer&&<div style={{whiteSpace:'pre-line',marginTop:18,padding:16,background:'#f6f9fb',borderRadius:12,lineHeight:1.8}}>{answer}</div>}</section><p className="projection-disclaimer">Phiên bản này là agent phân tích dựa trên quy tắc, chưa kết nối LLM hoặc tự gọi công cụ. Không tự tạo khoản vay, thanh toán hay sửa dữ liệu. Không nhập mật khẩu, OTP hoặc thông tin thẻ.</p></>;
}