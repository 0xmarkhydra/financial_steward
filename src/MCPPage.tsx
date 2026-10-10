import { useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clipboard, Code2, ExternalLink, Link2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { request } from './api';

type Tool = { name: string; description: string; inputSchema: unknown };
type MCPResult = { result?: {tools?: Tool[]}; error?: {message?: string} };

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
  const endpoint = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, '') + '/mcp';
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
        <strong>Chưa sẵn sàng kết nối trực tiếp ChatGPT</strong>
        <p>Backend đã có 4 công cụ MCP đọc dữ liệu và kiểm tra tài khoản qua token phiên. Tuy nhiên máy chủ chưa triển khai OAuth 2.1 với PKCE và đầy đủ giao thức Streamable HTTP cho ChatGPT. Hiện chưa thể nhấn “Kết nối ChatGPT” để sử dụng.</p>
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
      <div className="mcp-panel-heading"><div><div className="eyebrow">HƯỚNG DẪN</div><h2>Cách kết nối khi OAuth hoàn thiện</h2></div><BookOpen size={22}/></div>
      <ol className="mcp-steps">
        <li><strong>Đăng nhập Quản gia</strong><p>Ứng dụng sẽ cần màn hình cấp quyền cho ChatGPT, cho phép bạn chọn quyền truy cập chỉ đọc và có thể thu hồi.</p></li>
        <li><strong>Mở ChatGPT trên trình duyệt web</strong><p>Trong tài khoản hoặc workspace được hỗ trợ, vào Settings → Apps, bật Developer mode nếu có quyền. Vị trí tùy chọn có thể khác nhau theo gói.</p></li>
        <li><strong>Tạo ứng dụng MCP tùy chỉnh</strong><p>Chọn Create, nhập địa chỉ MCP, chọn OAuth, rồi quét danh sách công cụ (Scan Tools). Bạn cần xác nhận cấp quyền bằng Quản gia.</p></li>
        <li><strong>Kiểm tra và sử dụng</strong><p>Chọn ứng dụng Quản gia trong cuộc trò chuyện và hỏi về thu chi, lịch trả nợ hoặc ngân sách. Chỉ sử dụng sau khi kết nối đã vượt qua kiểm thử bảo mật.</p></li>
      </ol>
      <a className="mcp-doc-link" href={HELP} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Xem tài liệu kết nối ứng dụng MCP của OpenAI</a>
    </section>

    <section className="panel mcp-panel">
      <div className="mcp-panel-heading"><div><div className="eyebrow">DÀNH CHO LẬP TRÌNH VIÊN</div><h2>Endpoint thử nghiệm</h2></div><Code2 size={22}/></div>
      <p className="mcp-endpoint-note">Địa chỉ dưới đây là API hiện tại dành cho kiểm tra kỹ thuật bằng tài khoản thử, <strong>chưa phải endpoint có thể kết nối ChatGPT trực tiếp</strong>.</p>
      <div className="mcp-endpoint"><Link2 size={17}/><code>{endpoint}</code><button type="button" onClick={() => void copyEndpoint()} aria-label="Sao chép địa chỉ MCP"><Clipboard size={17}/> {copied ? 'Đã sao chép' : 'Sao chép'}</button></div>
      <p className="mcp-endpoint-note">Cơ chế hiện tại chỉ đọc dữ liệu: không có công cụ tự chuyển tiền, thanh toán, sửa hay xóa dữ liệu. Các số liệu dựa vào thông tin người dùng nhập, không phải số dư ngân hàng đã được xác minh.</p>
    </section>
  </>;
}
