export type EntryType = 'income' | 'expense';
export type DebtKind = 'bank' | 'card' | 'personal' | 'installment' | 'other';
export type Strategy = 'avalanche' | 'snowball';
export interface Debt { id: string; name: string; lender: string; kind: DebtKind; original: number; balance: number; apr: number; minimum: number; dueDay: number; createdAt: string; note: string; }
export interface Transaction { id: string; type: EntryType; amount: number; category: string; date: string; note: string; }
export interface Payment { id: string; debtId: string; date: string; principal: number; interest: number; fee: number; note: string; }
export interface Budget { category: string; limit: number; }
export interface Preferences { monthlyIncome: number; essentials: number; reserve: number; strategy: Strategy; }
export interface Rollover { id:string; debtId:string; kind:'card'|'loan'; dueDate:string; amount:number; fee:number; funding:'own'|'bank_transfer'|'refinance'|'other'; status:'planned'|'completed'|'cancelled'; completedAt:string; note:string; }
export interface FinanceData { version: 1; debts: Debt[]; transactions: Transaction[]; payments: Payment[]; budgets: Budget[]; preferences: Preferences; rollovers?:Rollover[]; }
export const EXPENSE_CATEGORIES = ['Ăn uống','Nhà ở','Đi lại','Mua sắm','Sức khỏe','Gia đình','Học tập','Giải trí','Hóa đơn','Khác'];
export const INCOME_CATEGORIES = ['Lương','Kinh doanh','Dự án','Đầu tư','Thưởng','Khác'];
export const EMPTY_DATA: FinanceData = { version: 1, debts: [], transactions: [], payments: [], budgets: [], preferences: {monthlyIncome: 0, essentials: 0, reserve: 0, strategy: 'avalanche'} };
export const DEBT_KINDS: Record<DebtKind,string> = {bank:'Vay ngân hàng',card:'Thẻ tín dụng',personal:'Vay cá nhân',installment:'Trả góp',other:'Khoản khác'};
