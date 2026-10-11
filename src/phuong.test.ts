import {describe,expect,it} from 'vitest';
import {EMPTY_DATA} from './types';
import type {FinanceData,PhuongGroup} from './types';
import {phuongDate,phuongDues,phuongTotals} from './phuong';
import {agentTurn,commitProposal,parseAgentAmount} from './agentConversation';
import {parseData} from './storage';
const today='2026-10-12';
const group:PhuongGroup={id:'g1',name:'Dây phường ngày',organizer:'',role:'member',contribution:200000,cycle:'daily',startDate:'2026-10-15',rounds:30,payoutRound:12,status:'active',note:''};
const state=(groups:PhuongGroup[]=[group]):FinanceData=>({...structuredClone(EMPTY_DATA),phuongGroups:groups,phuongEntries:[],agentChat:[]});
describe('phường ngày and conversational entry',()=>{
 it('calculates daily rounds across months and leap days',()=>{
  expect(phuongDate(group,1)).toBe('2026-10-15');
  expect(phuongDate(group,12)).toBe('2026-10-26');
  expect(phuongDate(group,30)).toBe('2026-11-13');
  expect(phuongDate({...group,startDate:'2028-02-28'},3)).toBe('2028-03-01');
 });
 it('supports weekly and monthly as well as daily',()=>{
  expect(phuongDate({...group,cycle:'weekly'},2)).toBe('2026-10-22');
  expect(phuongDate({...group,cycle:'monthly',startDate:'2026-01-31'},2)).toBe('2026-02-28');
 });
 it('tracks contribution, payouts and remaining obligation without treating payout as profit',()=>{
  const d=state();
  d.phuongEntries=[{id:'e1',groupId:'g1',round:1,date:'2026-10-15',kind:'contribution',amount:200000,note:''},{id:'e2',groupId:'g1',round:12,date:'2026-10-26',kind:'payout',amount:5000000,note:''}];
  const t=phuongTotals(d,group);
  expect(t.contributed).toBe(200000);
  expect(t.received).toBe(5000000);
  expect(t.remainingNominal).toBe(5800000);
  expect(phuongDues(d,'2026-10-15').find(x=>x.round===1&&x.kind==='contribution')).toBeUndefined();
  expect(phuongDues(d,'2026-10-15').find(x=>x.round===12&&x.kind==='payout')).toBeUndefined();
 });
 it('collects a phường ngày in one natural sentence, requests explicit confirmation',()=>{
  const input='Tôi chơi phường ngày, góp 200.000đ/ngày, 30 kỳ, bắt đầu ngày 15/10/2026, lĩnh kỳ 12';
  const d=state([]);
  const first=agentTurn(input,null,d,today);
  expect(first.draft?.kind).toBe('phuong');
  expect(first.text).toContain('xác nhận');
  const saved=agentTurn('xác nhận',first.draft!,d,today);
  expect(saved.proposal?.kind).toBe('phuong');
  const next=commitProposal(d,saved.proposal!);
  expect(next.phuongGroups?.[0].cycle).toBe('daily');
  expect(next.phuongGroups?.[0].rounds).toBe(30);
  expect(next.phuongGroups?.[0].payoutRound).toBe(12);
  expect(next.phuongGroups?.[0].contribution).toBe(200000);
  expect(parseData(next).phuongGroups?.[0].cycle).toBe('daily');
 });
 it('asks missing pieces over multiple conversational turns',()=>{
  const d=state([]);
  let result=agentTurn('Tôi chơi phường ngày',null,d,today);
  expect(result.text).toContain('bao nhiêu');
  result=agentTurn('200k/ngày',result.draft,d,today);
  expect(result.text).toContain('bao nhiêu kỳ');
  result=agentTurn('30 kỳ',result.draft,d,today);
  expect(result.text).toContain('bắt đầu');
  result=agentTurn('15/10/2026',result.draft,d,today);
  expect(result.text).toContain('xác nhận');
  expect(agentTurn('hủy',result.draft,d,today).proposal).toBeUndefined();
 });
 it('records an actual daily contribution as separate cash event',()=>{
  const d=state();
  const first=agentTurn('Đã góp phường 200k kỳ 1 hôm nay',null,d,'2026-10-15');
  expect(first.draft?.kind).toBe('phuong_entry');
  expect(first.text).toContain('xác nhận');
  const confirmed=agentTurn('xác nhận',first.draft,d,'2026-10-15');
  const next=commitProposal(d,confirmed.proposal!);
  expect(next.phuongEntries?.[0].kind).toBe('contribution');
  expect(next.phuongEntries?.[0].date).toBe('2026-10-15');
  expect(parseData(next).phuongEntries?.[0].round).toBe(1);
 });
 it('parses amounts safely and does not persist until user says confirm',()=>{
  expect(parseAgentAmount('200.000đ/ngày')).toBe(200000);
  expect(parseAgentAmount('2 triệu mỗi tháng')).toBe(2000000);
  expect(parseAgentAmount('120k ăn sáng')).toBe(120000);
  const d=state([]);
  const r=agentTurn('Hôm nay tiêu 120k ăn sáng',null,d,today);
  expect(r.proposal).toBeUndefined();
  const yes=agentTurn('xác nhận',r.draft!,d,today);
  expect(commitProposal(d,yes.proposal!).transactions[0].amount).toBe(120000);
 });
 it('rejects invalid cycles and contributions while accepting old data',()=>{
  const legacy=structuredClone(EMPTY_DATA);
  expect(parseData(legacy).phuongGroups).toEqual([]);
  expect(()=>parseData(state([{...group,cycle:'hourly' as 'daily'}]))).toThrow();
  expect(()=>parseData(state([{...group,contribution:-1}]))).toThrow();
 });
});
