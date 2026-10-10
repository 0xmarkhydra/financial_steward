import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, PiggyBank, Plus, Sparkles, TrendingUp } from 'lucide-react';
import type { FinanceData } from './types';
import { money } from './finance';
import { analyzeSpending } from './spendingCoach';

export default function SpendingCoachPage({data,onRecord,onSettings,onApplyBudget}:{data:FinanceData;onRecord:()=>void;onSettings:()=>void;onApplyBudget:(category:string,limit:number)=>void}) {
  const advice=useMemo(()=>analyzeSpending(data),[data]);
  const ratio=advice.flexibleCap>0?Math.min(100,Math.round(advice.currentFlexibleOrUnclassified/advice.flexibleCap*100)):0;
  function apply(category:string,amount:number) {
    if(!advice.configured||amount<=0)return;
    if(!window.confirm('Áp dụng '+money(amount)+'/tháng cho danh mục '+category+'? Hạn mức cũ (nếu có) sẽ được thay thế.'))return;
    onApplyBudget(category,amount);
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">CHI TIÊU THÔNG MINH · SỔ TAY HÀNH VI</div><h1>Quản gia hiểu cách bạn chi tiêu</h1><p>Ghi chép cả <strong>lý do chi tiền</strong> để phát hiện thói quen và lựa chọn mức chi phù hợp, không chỉ thống kê giao dịch.</p></div><button className="btn primary" type="button" onClick={onRecord}><Plus size={17}/> Ghi khoản chi</button></div>
    <section className="spending-metrics">
      <div className="panel spending-metric"><span>Hạn mức linh hoạt đề xuất / tháng</span><strong>{advice.configured?money(advice.flexibleCap):'Chưa đủ dữ liệu'}</strong><small>Sau thu nhập, quỹ dự phòng, sinh hoạt thiết yếu và nợ tối thiểu</small></div>
      <div className="panel spending-metric"><span>Chi linh hoạt còn lại</span><strong>{advice.configured?money(advice.freeFlexible):'—'}</strong><small>Đã trừ chi linh hoạt, khoản chưa phân loại và phần chi thiết yếu vượt kế hoạch</small></div>
      <div className="panel spending-metric"><span>Mức chi tham khảo mỗi ngày</span><strong>{advice.configured?money(advice.dailyFlexible):'—'}</strong><small>Chia số tiền còn lại cho {advice.daysLeft} ngày kể cả hôm nay; không phải số dư ngân hàng</small></div>
    </section>
    <section className="panel spending-main">
      <div className="spending-heading"><div><div className="eyebrow">HÀNH VI TRONG THÁNG</div><h2>Bức tranh chi tiêu của bạn</h2></div><ClipboardList size={22}/></div>
      <div className="spending-progress-caption"><span>Đã chi linh hoạt hoặc chưa phân loại</span><strong>{money(advice.currentFlexibleOrUnclassified)} {advice.configured?' / '+money(advice.flexibleCap):''}</strong></div>
      {advice.configured&&<div className="spending-progress" aria-label={'Đã dùng '+ratio+' phần trăm hạn mức linh hoạt'}><div style={{width:ratio+'%',background:ratio>85?'#e9985b':'#19ac92'}}/></div>}
      <div className="spending-detail-grid">
        <div><small>Chi thiết yếu đã ghi</small><strong>{money(advice.currentEssential)}</strong></div>
        <div><small>Khoản chi do cảm xúc, bốc đồng, khuyến mãi</small><strong>{money(advice.impulseTotal)}</strong></div>
        <div><small>Nhật ký đã gắn đủ nhãn</small><strong>{advice.behavioralRecords} / {advice.totalExpenseRecords} khoản</strong></div>
        <div><small>Tháng lịch sử có giao dịch</small><strong>{advice.previousMonths} / 3 tháng hoàn tất</strong></div>
      </div>
      {!advice.configured&&<button type="button" className="btn outline" onClick={onSettings}><PiggyBank size={16}/> Thiết lập thu nhập và ngân sách <ArrowRight size={15}/></button>}
    </section>
    <section className="panel spending-main">
      <div className="spending-heading"><div><div className="eyebrow">CỐ VẤN CHI TIÊU</div><h2>Gợi ý cần chú ý</h2></div><Sparkles size={22}/></div>
      <div className="spending-findings">{advice.alerts.length?advice.alerts.map((alert,i)=><div className={'spending-finding '+alert.level} key={i}>
        {alert.level==='high'?<AlertTriangle size={19}/>:alert.level==='medium'?<CalendarClock size={19}/>:<CheckCircle2 size={19}/>}
        <div><strong>{alert.title}</strong><p>{alert.detail}</p></div>
      </div>):<div className="spending-finding info"><CheckCircle2 size={20}/><div><strong>Chưa phát hiện cảnh báo theo dữ liệu đã ghi</strong><p>Tiếp tục cập nhật các khoản chi để Quản gia phân tích sát thực tế hơn.</p></div></div>}</div>
    </section>
    <section className="panel spending-main">
      <div className="spending-heading"><div><div className="eyebrow">GỢI Ý HẠN MỨC THEO DANH MỤC</div><h2>Phân bổ ngân sách phù hợp</h2></div><TrendingUp size={22}/></div>
      <p className="spending-explain">Tỷ lệ phân bổ dựa trên các tháng đã hoàn tất (tối đa 3 tháng). Khi chưa đủ dữ liệu, chỉ tham khảo chi tiêu tháng hiện tại. Tổng hạn mức đề xuất không vượt khoản chi linh hoạt khả dụng theo kế hoạch.</p>
      {advice.configured&&advice.categoryGuidance.length? <div className="spending-categories">{advice.categoryGuidance.map(c=><div key={c.category} className="spending-category">
        <div><strong>{c.category}</strong><small>Lịch sử bình quân: {money(c.historicalAverage)} · Tháng này: {money(c.actualThisMonth)}</small>{c.userLimit!==undefined&&<small>Đang đặt: {money(c.userLimit)}</small>}</div>
        <div className="spending-category-actions"><strong>{money(c.suggestedLimit)}/tháng</strong><button type="button" disabled={c.suggestedLimit<=0||c.userLimit===c.suggestedLimit} onClick={()=>apply(c.category,c.suggestedLimit)}>{c.userLimit===c.suggestedLimit?'Đã áp dụng':'Dùng hạn mức'}</button></div>
      </div>)}</div>:<div className="spending-empty"><PiggyBank size={25}/><strong>Chưa đủ cơ sở để phân bổ</strong><p>Hãy khai báo thu nhập, dự phòng, sinh hoạt thiết yếu và ghi vài khoản chi. Quản gia sẽ gợi ý tỷ lệ theo nhóm.</p></div>}
    </section>
    <p className="projection-disclaimer">Đây là tư vấn lập ngân sách từ giao dịch được nhập thủ công, không phải tư vấn đầu tư chuyên môn hay xác nhận khả năng thanh toán thực tế. Không liên kết hoặc đọc lịch sử ngân hàng nếu bạn chưa cấp quyền. Hệ thống không tự thực hiện thanh toán.</p>
  </>;
}
