import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Bot,CornerDownLeft,MessageCircle,Send,ShieldCheck,Sparkles,X} from 'lucide-react';
import type {AgentMessage} from './types';

export default function ChatAgent({history,onSend,compact=false,onClose}:{
 history:AgentMessage[];onSend:(text:string)=>void;compact?:boolean;onClose?:()=>void
}){
 const [input,setInput]=useState('');
 const scrollRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});},[history.length,compact]);
 function submit(e:FormEvent){e.preventDefault();const message=input.trim();if(!message)return;onSend(message);setInput('');}
 return <section className={'agent-chat '+(compact?'agent-chat-compact':'agent-chat-full')} aria-label="Trò chuyện với Quản gia">
  <div className="agent-chat-header"><div className="agent-chat-avatar"><Bot size={22}/></div><div><strong>Quản gia trò chuyện</strong><small><span className="agent-online-indicator"/> Ghi chép, phân tích và hỏi bổ sung</small></div>{onClose&&<button className="agent-chat-close" type="button" onClick={onClose} aria-label="Đóng cửa sổ chat"><X size={20}/></button>}</div>
  <div className="agent-chat-messages" ref={scrollRef} role="log" aria-label="Lịch sử hội thoại" aria-live="polite">
  {!history.length&&<div className="agent-chat-welcome"><div className="agent-chat-symbol"><Sparkles size={29}/></div><h3>Chào bạn, kể mình nghe nhé 👋</h3><p>Không cần tìm biểu mẫu. Bạn cứ nói về khoản nợ, dây phường ngày, tiền vừa chi hay điều đang lo. Mình sẽ hỏi tiếp và chỉ ghi sổ khi bạn xác nhận.</p><div className="agent-chat-examples"><span>“Chơi phường ngày 200k, 30 kỳ từ 15/10, lĩnh kỳ 12”</span><span>“Hôm nay tiêu 120k ăn sáng”</span><span>“Ngày nào tôi phải trả nợ?”</span></div></div>}
  {history.map(m=><div key={m.id} className={'agent-chat-bubble-wrap '+m.role}><div className={'agent-chat-bubble '+m.role}>{m.content}</div>{m.role==='assistant'&&<span className="agent-chat-bubble-label">Quản gia · Phân tích theo quy tắc</span>}</div>)}
  </div>
  <form className="agent-chat-composer" onSubmit={submit}><div className="agent-chat-inputbox"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit(e as unknown as FormEvent);}}} maxLength={1200} rows={compact?2:3} placeholder="Kể Quản gia nghe… 200k phường ngày, vừa đóng lãi…" aria-label="Nhập tin nhắn cho Quản gia"/><button type="submit" disabled={!input.trim()} aria-label="Gửi tin nhắn"><Send size={18}/></button></div><div className="agent-chat-foot"><ShieldCheck size={13}/> Chỉ lưu khoản tiền sau khi bạn nhắn “xác nhận” <CornerDownLeft size={12}/></div></form>
 </section>;
}
