# Quản gia trò chuyện & Phường ngày — staging

## Phạm vi đã triển khai

- Tham gia dây **phường ngày**, phường tuần, phường tháng (họ/hụi/phường) với mức góp mỗi kỳ, ngày bắt đầu, tổng kỳ, kỳ lĩnh dự kiến và tình trạng dây. Phường ngày là **ngày lịch liên tiếp**, bao gồm thứ Bảy/Chủ Nhật theo mặc định; thỏa thuận nghỉ ngày/đấu thầu chưa hỗ trợ.
- Ghi các kỳ góp/lĩnh và phí **thực tế** thành nguồn giao dịch riêng `phuongEntries`. Tiền lĩnh phường là **dòng tiền vào**, không phải thu nhập/lợi nhuận. Góp và phí là dòng tiền ra; nghĩa vụ phải góp tiếp tục tồn tại sau khi lĩnh.
- Lịch góp còn thiếu, lịch lĩnh dự kiến và ngày quá hạn cần đối soát xuất hiện ở mục Phường và Trung tâm quản trị nợ. Chỉ nhắc **khi mở ứng dụng**; chưa có push ngoài ứng dụng.
- Ngân sách chi linh hoạt giữ lại phần góp phường dự kiến theo tháng trước khi đề xuất số tiền có thể chi. Báo cáo thực chi không cộng trùng giữa thu chi thông thường, trả nợ và góp/lĩnh phường. API/MCP cũng phân biệt thu nhập với tiền lĩnh phường.
- Chat có thể mở ở trang Trợ lý hoặc nút nổi từ các màn khác trên Web PWA. Các tin nhắn được lưu theo tài khoản, giữ tối đa 120 tin nhắn trong dữ liệu đồng bộ.
- Chat có quy trình nhập **phường, góp phường, thu/chi và khoản vay cơ bản**: phân tích câu nói tự nhiên theo quy tắc, hỏi tiếp thông tin còn thiếu, hiện bản nháp và chỉ thực hiện thay đổi sau câu **xác nhận**. Nhắn `hủy` để bỏ.
- Thay đổi dây phường và khoản góp/lĩnh được ghi vào nhật ký server-side PostgreSQL; văn bản chat không được ghi lặp lại vào nhật ký audit (nhưng bản thân chat vẫn nằm trong dữ liệu tài khoản).

## Ranh giới an toàn và các bước kế tiếp

**Bản hội thoại hiện sử dụng engine phân tích theo quy tắc**, không phải LLM kết nối OpenAI/Claude. Cần bổ sung endpoint mô hình có kiểm soát, quyền truy cập dữ liệu, rà soát prompt injection, xác nhận tool writes, streaming, giọng nói và khả năng hiểu lời nói đa dạng trước khi gọi là AI agent hoàn chỉnh. Chưa kết nối ngân hàng hoặc nhà cung cấp thông báo push.

Chưa hỗ trợ đầy đủ **phường đấu thầu, bỏ thăm, chiết khấu/hụi sống-hụi chết, thay đổi số tiền góp sau khi lĩnh, trả thay thành viên, ngừng thứ Bảy/Chủ Nhật, ngày lễ, chậm góp và phí phạt động**. Người dùng cần đối chiếu thỏa thuận thực tế; hiện mô hình dùng **mức góp cố định** mỗi kỳ và ghi phí riêng.

Không lưu CCCD, OTP, mật khẩu, số thẻ hoặc thông tin danh tính nhạy cảm vào chat. Staging chỉ dành cho dữ liệu giả lập. Chưa đạt chuẩn dữ liệu tài chính production trước khi có email verify/MFA, backup/PITR, push notifications và đánh giá bảo mật.

## Kiểm thử và triển khai

`npm run test`, `npm run build`, `cd backend && go test ./... && go vet ./...`, `npm run smoke:staging`.
