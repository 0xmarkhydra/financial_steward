# ChatGPT OAuth MCP — Quản gia tài chính (staging)

## Nguyên nhân lỗi ở màn hình ChatGPT

Thông báo **“Không thể tự động xác định cài đặt OAuth”** xảy ra khi ChatGPT không thể khám phá được OAuth Protected Resource Metadata (RFC 9728) và Authorization Server Metadata (RFC 8414). Trước nhánh này, `POST /mcp` chỉ yêu cầu một bearer token của ứng dụng, không có OAuth.

Ngoài ra, Railway có thể hiển thị tên miền `api-quan-gia.codelocal.cloud` với cảnh báo DNS `DNS_RECORD_STATUS_REQUIRES_UPDATE` dù chứng chỉ TLS hợp lệ. Cần kiểm tra Cloudflare DNS: CNAME host `api-quan-gia` trỏ tới `9g6da5hd.up.railway.app` (giá trị do Railway hiển thị 12/10/2026; luôn đối chiếu lại ở Railway trước khi sửa).

## Cơ chế backend đã code

- `GET /.well-known/oauth-protected-resource` và `GET /.well-known/oauth-protected-resource/mcp`: RFC 9728, liên kết issuer và MCP resource.
- `GET /.well-known/oauth-authorization-server`: RFC 8414 authorization, token, dynamic-client-registration, supported scopes và code challenge S256.
- `POST /oauth/register`: Dynamic Client Registration, public clients không có secret, **chỉ cho phép URI callback HTTPS của chatgpt.com trong danh sách**. Không bật OAuth Client ID Metadata Documents (CIMD) để ChatGPT có thể dùng DCR.
- `GET/POST /oauth/authorize`: trang đăng nhập và đồng ý chỉ đọc. Không dùng session token ứng dụng trong redirect/callback. Mã ủy quyền được hash, tồn tại 5 phút và sử dụng một lần.
- `POST /oauth/token`: authorization_code + PKCE S256 và refresh_token rotation; access token 15 phút, refresh token 30 ngày khi được cấp `offline_access`. DB chỉ lưu hash token; người dùng có thể thu hồi.
- `GET /api/v1/mcp/status`: endpoint và trạng thái cấp quyền cho tài khoản đăng nhập. `POST /api/v1/mcp/revoke`: thu hồi mọi OAuth grant của tài khoản.
- `POST /mcp`: nhận OAuth access token giới hạn `finance:read` và audience `MCP_PUBLIC_ORIGIN/mcp`; bốn công cụ MCP đều là **read-only**. Session bearer cũ còn được hỗ trợ cho client ứng dụng nội bộ để tương thích ngược; không gửi token này cho ChatGPT.

Các grant được phân tách theo tài khoản trong PostgreSQL `003_mcp_oauth.sql`; authorization codes, access/refresh tokens là ngẫu nhiên và được hash trước khi lưu. OAuth không mở chức năng thanh toán, thay đổi giao dịch hay đọc mật khẩu. Không thay đổi dữ liệu tài chính cũ.

## Cấu hình bắt buộc

Trên service Go API trong Railway phải cấu hình:

`MCP_PUBLIC_ORIGIN=https://api-quan-gia.codelocal.cloud`

**Chỉ sử dụng tên miền này sau khi DNS hoạt động thực tế**, chứng chỉ HTTPS hợp lệ và toàn bộ metadata trả về thành công. Để chạy thử trên tên miền Railway có thể dùng `MCP_PUBLIC_ORIGIN=https://api-staging-706c3.up.railway.app` và tạo plugin bằng URL `https://api-staging-706c3.up.railway.app/mcp`. Resource, issuer và URL trong ChatGPT phải cùng một origin; không điền tên miền tùy chỉnh khi môi trường đang công bố origin Railway khác.

`MCP_PUBLIC_ORIGIN` không chứa `/mcp`, dấu `/` cuối, port hay query; phải có HTTPS. Nếu không khai báo, discovery trả HTTP 503 và OAuth không được bật.

## Kiểm tra trước khi kết nối

1. `GET https://<origin>/.well-known/oauth-protected-resource/mcp` trả JSON `resource=https://<origin>/mcp` và `authorization_servers=[https://<origin>]`.
2. `GET https://<origin>/.well-known/oauth-authorization-server` trả issuer, endpoint `/oauth/authorize`, `/oauth/token`, `/oauth/register`, `code_challenge_methods_supported=["S256"]`.
3. `POST https://<origin>/mcp` không bearer phải trả 401 với `WWW-Authenticate` chứa `resource_metadata`.
4. ChatGPT → Cài đặt → Plugin/Apps → Tạo → URL server `https://<origin>/mcp`, chọn OAuth, đăng ký/khám phá, đăng nhập và đồng ý, Scan Tools.
5. Dùng tài khoản thử và 4 tool đọc để kiểm chứng; xác nhận chỉ thấy tài khoản được cấp quyền. Kiểm tra rotation và thu hồi token.

## Những việc còn phải kiểm chứng

- Cần test **OAuth authorization code + PKCE + refresh token đầu-cuối với ChatGPT thật**. Unit test có kiểm tra metadata, challenge, PKCE, scope, redirect nhưng **không chứng minh OAuth trên ChatGPT kết nối thành công**.
- Hạn chế DCR public clients và bảo vệ đăng ký khỏi lạm dụng trước production; giới hạn/quét dữ liệu trong token và pending tables.
- Hệ thống staging không phù hợp lưu tài chính thật; yêu cầu backup/PITR, phân quyền, đánh giá bảo mật và chính sách xử lý dữ liệu trước production.
- Sau khi DNS được cập nhật, phải thử lại URL domain người dùng muốn dùng và triển khai lại issuer nếu đã đổi sang domain mới.

Tham khảo: https://developers.openai.com/plugins/build/auth và https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.
