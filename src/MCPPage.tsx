import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clipboard, Code2, ExternalLink, Link2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { request } from './api';

type Tool = { name: string; description: string; inputSchema: unknown };
type MCPResult = { result?: {tools?: Tool[]}; error?: {message?: string} };
type OAuthStatus={configured:boolean;endpoint:string;oauthIssuer:string;authorizedConnections:number};

const TOOLS = [
  {
    name: 'get_financial_summary',
    title: 'Tổng quan tài chính',
    detail: 'Dư nợ, thu nhập, chi tiêu, số tiền đã trả nợ và dòng tiền ròng trong tháng.',
    example: 'Tổng hợp tình hình tài chính tháng này cho tôi.',
  },
  {
    name: 'list_upcoming_payments',
    title: 'Lịch nợ và đáo hạn',
    detail: 'Các lịch trả nợ, đáo thẻ và đáo hạn trong 30 ngày tiếp theo (ngày dự kiến).',
    example: '30 ngày tới có những khoản nợ nào cần chuẩn bị?',
  },
  {
    name: 'suggest_spending_budget',
    title: 'Gợi ý ngân sách',
    detail: 'Ước lượng khoản có thể chi tiêu từ thu nhập, sinh hoạt thiết yếu, dự phòng và trả nợ tối thiểu.',
    example: 'Tôi được phép chi tiêu thêm bao nhiêu trong tháng?',
  },
  {
    name: 'analyze_spending_behavior',
    title: 'Phân tích hành vi chi tiêu',
    detail: 'Phân tích chi thiết yếu, chi linh hoạt, khoản mua bốc đồng và gợi ý mức chi tháng/ngày dựa trên dữ liệu đã gắn nhãn.',
    example: 'Tôi đang có thói quen chi tiêu nào cần điều chỉnh?',
  },
];
const HELP = 'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt';

export default function MCPPage() {
  const [available, setAvailable] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [oauthStatus,setOAuthStatus]=useState<OAuthStatus|null>(null);
  const [oauthError,setOAuthError]=useState('');
  const [revoking,setRevoking]=useState(false);
  const [oauthMessage,setOAuthMessage]=useState('');
  useEffect(()=>{let active=true;void request<OAuthStatus>('/api/v1/mcp/status').then(v=>{if(active)setOAuthStatus(v)}).catch(e=>{if(active)setOAuthError(e instanceof Error?e.message:'Lỗi đọc trạng thái OAuth')});return()=>{active=false}},[]);
  const endpoint = oauthStatus?.endpoint || (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, '') + '/mcp';
  async function revokeAccess(){
    if(revoking||!window.confirm('Thu hồi TẤT CẢ quyền MCP đã cấp cho các ứng dụng ngoài, bao gồm ChatGPT? Các phiên này sẽ không đọc được dữ liệu nữa.'))return;
    setRevoking(true);setOAuthMessage('');
    try{await request<{revoked:boolean}>('/api/v1/mcp/revoke','POST');
      setOAuthMessage('Đã thu hồi tất cả các phiên OAuth của tài khoản.');setOAuthStatus(old=>old?{...old,authorizedConnections:0}:old);
    }catch(e){setOAuthMessage(e instanceof Error?e.message:'Không thể thu hồi quyền.')}finally{setRevoking(false)}
  }
  async function testTools() {
    if (loading) return;
    setLoading(true);
    setError('');
    setAvailable(null);
    try {
      const data = await request<MCPResult>('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      if (data.error || !Array.isArray(data.result?.tools)) {
        throw new Error(data.error?.message || 'MCP không trả về danh sách công cụ hợp lệ.');
      }
      setAvailable(data.result.tools.map(t => t.name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể kiểm tra MCP.');
    } finally {
      setLoading(false);
    }
  }
  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
    } catch {
      setError('Không thể sao chép. Vui lòng chọn và sao chép địa chỉ thủ công.');
    }
  }

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">TÍCH HỢP TRỢ LÝ · MODEL CONTEXT PROTOCOL</div>
        <h1>Kết nối ChatGPT qua MCP</h1>
        <p>Giúp trợ lý AI đọc số liệu tài chính bạn cho phép từ Quản gia, không cần nhập lại từng khoản.</p>
      </div>
    </div>

    <section className="panel mcp-status" aria-label="Trạng thái tích hợp MCP">
      <div className="mcp-status-icon"><LockKeyhole size={22}/></div>
      <div>
        <strong>{oauthStatus?.configured?'OAuth MCP đã được cấu hình — thử kết nối ChatGPT':'Chưa xác nhận máy chủ OAuth đã sẵn sàng'}</strong>
        <p>{oauthStatus?.configured?'Máy chủ công bố OAuth metadata, đăng nhập + cấp quyền đọc riêng và hỗ trợ PKCE/refresh token. Bạn vẫn cần thử đăng nhập và quét công cụ trên ChatGPT; kiểm tra cấu hình DNS của tên miền và đúng URL MCP.':'Cần thiết lập MCP_PUBLIC_ORIGIN trên Go API và xác nhận DNS hoạt động. Không nhập Client ID / Client Secret tự chế vào ChatGPT khi OAuth discovery chưa hoạt động.'}</p>
        {oauthStatus&&<p><strong>Phiên kết nối còn hiệu lực: {oauthStatus.authorizedConnections}</strong></p>}
        {oauthStatus?.authorizedConnections ? <button type="button" className="btn outline" disabled={revoking} onClick={()=>void revokeAccess()}><LockKeyhole size={15}/>{revoking?'Đang thu hồi...':'Ngắt tất cả kết nối MCP'}</button>:null}
        {oauthMessage&&<small role="status">{oauthMessage}</small>}
        {oauthError&&<small role="alert">{oauthError}</small>}
        <small>Không sao chép access token, mật khẩu ngân hàng, số thẻ hay OTP sang ChatGPT hoặc cấu hình của bên thứ ba.</small>
      </div>
    </section>

    <section className="panel mcp-panel">
      <div className="mcp-panel-heading">
        <div><div className="eyebrow">CÔNG CỤ ĐÃ TRIỂN KHAI</div><h2>4 chức năng MCP hiện có</h2></div>
        <button className="btn outline" type="button" disabled={loading} onClick={() => void testTools()}><RefreshCw size={16}/>{loading ? 'Đang kiểm tra...' : 'Kiểm tra MCP'}</button>
      </div>
      <div className="mcp-tool-grid">
        {TOOLS.map(tool => <div className="mcp-tool" key={tool.name}>
          <div className="mcp-tool-title">
            <ShieldCheck size={18}/>
            <strong>{tool.title}</strong>
            {available?.includes(tool.name) && <span className="mcp-tool-ready"><CheckCircle2 size={14}/> API OK</span>}
          </div>
          <code>{tool.name}</code>
          <p>{tool.detail}</p>
          <small>Ví dụ: “{tool.example}”</small>
        </div>)}
      </div>
      {available && <p className="mcp-check-good" role="status"><CheckCircle2 size={16}/> MCP trên máy chủ đã trả về {available.length} công cụ. Đây chỉ là kiểm tra API nội bộ, chưa xác nhận ChatGPT kết nối thành công.</p>}
      {error && <p className="mcp-check-error" role="alert"><AlertTriangle size={16}/>{error}</p>}
    </section>

    <section className="panel mcp-panel">
      <div className="mcp-panel-heading"><div><div className="eyebrow">HƯỚNG DẪN</div><h2>Kiểm tra và kết nối OAuth với ChatGPT</h2></div><BookOpen size={22}/></div>
      <ol className="mcp-steps">
        <li><strong>Đăng nhập Quản gia</strong><p>Dùng tài khoản của chính bạn khi trang Quản gia mở màn hình cấp quyền. Chỉ cấp quyền đọc tài chính và có thể thu hồi ngay tại trang này.</p></li>
        <li><strong>Mở ChatGPT trên trình duyệt web</strong><p>Trong tài khoản hoặc workspace được hỗ trợ, vào Settings → Apps, bật Developer mode nếu có quyền. Vị trí tùy chọn có thể khác nhau theo gói.</p></li>
        <li><strong>Tạo ứng dụng MCP tùy chỉnh</strong><p>Chọn Create, nhập đúng URL MCP bên dưới, chọn OAuth → Scan Tools. ChatGPT phải đọc được metadata trên chính tên miền này. Nếu báo không tự phát hiện OAuth, hãy kiểm tra DNS/CNAME và trạng thái máy chủ trước, không tự đoán Client ID.</p></li>
        <li><strong>Kiểm tra và sử dụng</strong><p>Chọn ứng dụng Quản gia trong cuộc trò chuyện và hỏi về thu chi, lịch trả nợ hoặc ngân sách. Chỉ sử dụng sau khi kết nối đã vượt qua kiểm thử bảo mật.</p></li>
      </ol>
      <a className="mcp-doc-link" href={HELP} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Xem tài liệu kết nối ứng dụng MCP của OpenAI</a>
    </section>

    <section className="panel mcp-panel">
      <div className="mcp-panel-heading"><div><div className="eyebrow">DÀNH CHO LẬP TRÌNH VIÊN</div><h2>Endpoint thử nghiệm</h2></div><Code2 size={22}/></div>
      <p className="mcp-endpoint-note">Địa chỉ OAuth MCP hiện tại. <strong>Chỉ kết nối khi đã xác nhận DNS, HTTPS và trạng thái OAuth công bố được metadata.</strong> Đừng nhập dữ liệu tài chính thật lên staging.</p>
      <div className="mcp-endpoint"><Link2 size={17}/><code>{endpoint}</code><button type="button" onClick={() => void copyEndpoint()} aria-label="Sao chép địa chỉ MCP"><Clipboard size={17}/> {copied ? 'Đã sao chép' : 'Sao chép'}</button></div>
      <p className="mcp-endpoint-note">Cơ chế hiện tại chỉ đọc dữ liệu: không có công cụ tự chuyển tiền, thanh toán, sửa hay xóa dữ liệu. Các số liệu dựa vào thông tin người dùng nhập, không phải số dư ngân hàng đã được xác minh.</p>
    </section>
  </>;
}
