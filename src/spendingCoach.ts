import { addMonths, localISO, monthKey, total } from './finance';
import type { FinanceData, Transaction } from './types';
import { phuongMonthlyCommitment } from './phuong';

export interface CategoryGuidance {
  category: string;
  historicalAverage: number;
  suggestedLimit: number;
  actualThisMonth: number;
  userLimit?: number;
}
export interface SpendingAdvice {
  month: string;
  configured: boolean;
  monthlyIncome: number;
  minimumDebt: number;
  phuongCommitment: number;
  reserve: number;
  essentialsPlan: number;
  monthlyLivingCap: number;
  flexibleCap: number;
  currentEssential: number;
  currentFlexibleOrUnclassified: number;
  freeFlexible: number;
  dailyFlexible: number;
  daysLeft: number;
  impulseTotal: number;
  behavioralRecords: number;
  totalExpenseRecords: number;
  previousMonths: number;
  paceForecast: number;
  categoryGuidance: CategoryGuidance[];
  alerts: { level: 'high' | 'medium' | 'info'; title: string; detail: string }[];
}

const sum=(xs:Transaction[])=>total(xs.map(t=>t.amount));
const rounded=(n:number)=>n<=0?0:Math.floor(n/10000)*10000;
export function analyzeSpending(data:FinanceData, asOf=localISO()):SpendingAdvice {
  const month=monthKey(asOf);
  const day=Number(asOf.slice(8));
  const [year,m]=month.split('-').map(Number);
  const daysInMonth=new Date(Date.UTC(year,m,0)).getUTCDate();
  const daysLeft=daysInMonth-day+1;
  const current=data.transactions.filter(t=>t.type==='expense'&&monthKey(t.date)===month&&t.date<=asOf);
  const essential=current.filter(t=>t.need==='essential');
  // Untagged legacy records conservatively reduce discretionary room until classified.
  const flexible=current.filter(t=>t.need!=='essential');
  const minimumDebt=total(data.debts.filter(d=>d.balance>0).map(d=>Math.min(d.minimum,d.balance)));
  const {monthlyIncome,essentials,reserve}=data.preferences;
  const phuongCommitment=phuongMonthlyCommitment(data,month);
  const configured=monthlyIncome>0;
  const monthlyLivingCap=Math.max(0,monthlyIncome-reserve-minimumDebt-phuongCommitment);
  const flexibleCap=Math.max(0,monthlyLivingCap-essentials);
  // Essential overspend must reduce the remaining flexible allowance as well.
  const excessEssential=Math.max(0,sum(essential)-essentials);
  const freeFlexible=Math.max(0,flexibleCap-sum(flexible)-excessEssential);
  const triggerRecords=current.filter(t=>Boolean(t.need)&&Boolean(t.trigger));
  const impulseTotal=sum(current.filter(t=>t.trigger==='impulse'||t.trigger==='promotion'||t.trigger==='emotion'));
  const historicalMonths=[addMonths(month,-3),addMonths(month,-2),addMonths(month,-1)];
  const historical=data.transactions.filter(t=>t.type==='expense'&&historicalMonths.includes(monthKey(t.date)));
  const completedMonths=new Set(historical.map(t=>monthKey(t.date))).size;
  const baseline=completedMonths?historical:current;
  const count=completedMonths||1;
  const categories=new Map<string,number>();
  for(const t of baseline.filter(t=>t.need!=='essential')){
    categories.set(t.category,(categories.get(t.category)||0)+t.amount);
  }
  const totalHistory=total([...categories.values()]);
  const categoryGuidance=[...categories.entries()]
    .sort((a,b)=>b[1]-a[1])
    .slice(0,6)
    .map(([category,amount])=>{
      const existing=data.budgets.find(b=>b.category===category);
      return {
        category, historicalAverage:Math.round(amount/count),
        suggestedLimit:totalHistory>0?rounded(flexibleCap*amount/totalHistory):0,
        actualThisMonth:sum(flexible.filter(t=>t.category===category)),
        ...(existing?{userLimit:existing.limit}:{})
      };
    });
  const alerts:SpendingAdvice['alerts']=[];
  if(!configured)alerts.push({level:'medium',title:'Thiết lập thu nhập để tính hạn mức',detail:'Điền thu nhập tháng, chi thiết yếu và quỹ dự phòng trong Cài đặt. Quản gia chưa thể đề xuất một mức chi an toàn khi thiếu thu nhập.'});
  if(configured && monthlyIncome<reserve+minimumDebt+phuongCommitment+essentials)alerts.push({level:'high',title:'Thu nhập chưa đủ các khoản ưu tiên',detail:'Dự phòng, sinh hoạt, trả nợ tối thiểu và cam kết góp phường vượt thu nhập dự kiến. Chưa nên tăng khoản chi không bắt buộc.'});
  if(configured && sum(flexible)+excessEssential>flexibleCap)alerts.push({level:'high',title:'Đã vượt mức chi linh hoạt',detail:'Chi vượt hạn mức an toàn theo số liệu khai báo. Rà soát các khoản có thể hoãn trong phần nhật ký chi tiêu.'});
  const paceForecast=Math.round(sum(flexible)*daysInMonth/Math.max(1,day));
  if(configured && flexibleCap>0 && paceForecast>flexibleCap && sum(flexible)<=flexibleCap)alerts.push({level:'medium',title:'Tốc độ chi đang nhanh',detail:'Nếu duy trì mức chi từ đầu tháng, chi linh hoạt có thể vượt hạn mức trước cuối tháng. Đây là ước tính theo nhịp chi hiện tại.'});
  if(impulseTotal>0)alerts.push({level:'medium',title:'Chi theo cảm xúc hoặc khuyến mãi',detail:'Đã ghi nhận các khoản chi do bốc đồng, cảm xúc hoặc khuyến mãi. Thử chờ 24 giờ trước một khoản mua không thiết yếu.'});
  if(!completedMonths)alerts.push({level:'info',title:'Chưa đủ dữ liệu để học thói quen dài hạn',detail:'Ghi chép đều đặn trong 2–3 tháng để đề xuất theo danh mục đáng tin cậy hơn. Mức ước tính hiện dựa trên tháng đang chạy, không phải xu hướng dài hạn.'});
  else if(completedMonths<2)alerts.push({level:'info',title:'Dữ liệu lịch sử còn ít',detail:'Gợi ý danh mục dựa trên một tháng có phát sinh chi, chưa phản ánh đầy đủ biến động.'});
  if(current.length && triggerRecords.length<current.length)alerts.push({level:'info',title:'Gắn nhãn hành vi để tư vấn chính xác',detail:'Một số khoản chưa có mục đích hoặc bối cảnh chi tiêu. Quản gia tạm coi khoản chưa phân loại là chi linh hoạt để tránh gợi ý chi quá tay.'});
  const currentBudgetAlerts=categoryGuidance.filter(c=>c.userLimit!==undefined&&c.actualThisMonth>c.userLimit);
  for(const c of currentBudgetAlerts)alerts.push({level:'medium',title:'Vượt ngân sách: '+c.category,detail:'Khoản chi danh mục này đã vượt hạn mức bạn tự thiết lập. Cân nhắc giảm chi trong phần còn lại của tháng.'});
  return {
    month, configured, monthlyIncome, minimumDebt, phuongCommitment, reserve, essentialsPlan:essentials,
    monthlyLivingCap, flexibleCap, currentEssential:sum(essential),
    currentFlexibleOrUnclassified:sum(flexible), freeFlexible:configured?freeFlexible:0,
    dailyFlexible:configured?Math.floor(freeFlexible/Math.max(1,daysLeft)):0,
    daysLeft, impulseTotal, behavioralRecords:triggerRecords.length,
    totalExpenseRecords:current.length, previousMonths:completedMonths,
    paceForecast, categoryGuidance, alerts
  };
}
