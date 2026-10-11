export type EntryType = 'income' | 'expense';
export type DebtKind = 'bank' | 'card' | 'personal' | 'installment' | 'other';
export type Strategy = 'avalanche' | 'snowball';
export interface Debt { id: string; name: string; lender: string; kind: DebtKind; original: number; balance: number; apr: number; minimum: number; dueDay: number; interestDueDay?: number; interestExpected?: number; createdAt: string; note: string; }
export type SpendingNeed = 'essential' | 'flexible';
export type SpendingTrigger = 'planned' | 'impulse' | 'promotion' | 'emotion' | 'social';
export interface Transaction { id: string; type: EntryType; amount: number; category: string; date: string; note: string; need?: SpendingNeed; trigger?: SpendingTrigger; }
export interface Payment { id: string; debtId: string; date: string; period?: string; principal: number; interest: number; fee: number; note: string; }
export interface Budget { category: string; limit: number; }
export interface Preferences { monthlyIncome: number; essentials: number; reserve: number; strategy: Strategy; }
export interface Rollover { id:string; debtId:string; kind:'card'|'loan'; dueDate:string; amount:number; fee:number; funding:'own'|'bank_transfer'|'refinance'|'other'; status:'planned'|'completed'|'cancelled'; completedAt:string; note:string; }
export type PhuongCycle = 'daily' | 'weekly' | 'monthly';
export interface PhuongGroup { id:string; name:string; organizer:string; role:'member'|'organizer'; contribution:number; cycle:PhuongCycle; startDate:string; rounds:number; payoutRound?:number; payoutExpected?:number; status:'active'|'completed'|'paused'; note:string; }
export interface PhuongEntry { id:string; groupId:string; date:string; round:number; kind:'contribution'|'payout'|'fee'; amount:number; note:string; }
export interface AgentMessage {id:string; role:'user'|'assistant';content:string;createdAt:string;}
export interface CashPlan {id:string;title:string;direction:'in'|'out';amount:number;dueDate:string;status:'planned'|'completed'|'cancelled';note:string;completedAt?:string;linkedTransactionId?:string;}
export interface FinanceData { version: 1; debts: Debt[]; transactions: Transaction[]; payments: Payment[]; budgets: Budget[]; preferences: Preferences; rollovers?:Rollover[]; phuongGroups?:PhuongGroup[]; phuongEntries?:PhuongEntry[]; agentChat?:AgentMessage[]; cashPlans?:CashPlan[]; }
export const EXPENSE_CATEGORIES = ['Ăn uống','Nhà ở','Đi lại','Mua sắm','Sức khỏe','Gia đình','Học tập','Giải trí','Hóa đơn','Khác'];
export const INCOME_CATEGORIES = ['Lương','Kinh doanh','Dự án','Đầu tư','Thưởng','Khác'];
export const EMPTY_DATA: FinanceData = { version: 1, debts: [], transactions: [], payments: [], budgets: [], phuongGroups:[], phuongEntries:[], agentChat:[], cashPlans:[], preferences: {monthlyIncome: 0, essentials: 0, reserve: 0, strategy: 'avalanche'} };
export const DEBT_KINDS: Record<DebtKind,string> = {bank:'Vay ngân hàng',card:'Thẻ tín dụng',personal:'Vay cá nhân',installment:'Trả góp',other:'Khoản khác'};
