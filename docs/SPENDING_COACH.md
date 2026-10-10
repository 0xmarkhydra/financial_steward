# Cố vấn hành vi chi tiêu — Web PWA

## Đã triển khai
- Khi ghi **khoản chi**, người dùng có thể phân loại `thiết yếu/linh hoạt` và động lực `đã lên kế hoạch / bốc đồng / khuyến mãi / cảm xúc / giao tiếp xã hội`. Hai trường tùy chọn để tương thích giao dịch cũ.
- Trang **Thói quen chi tiêu** trong sidebar và thanh điều hướng điện thoại, liên kết nhanh từ trang Tổng quan.
- Phân tích tiền chi thiết yếu, tiền chi linh hoạt và khoản chưa gắn nhãn (tạm tính vào linh hoạt để không đề xuất quá nhiều), cùng lượng chi do mua bốc đồng/cảm xúc/khuyến mãi.
- Hạn mức ước tính hàng tháng = `max(0, thu nhập khai báo - dự phòng - trả nợ tối thiểu - chi thiết yếu dự kiến)`.
- Tiền chi linh hoạt còn lại = hạn mức trừ chi linh hoạt, khoản chưa phân loại, và phần chi thiết yếu vượt dự kiến. Chia số còn lại cho ngày còn lại **kể cả hôm nay** để có giá trị tham khảo/ngày.
- Theo dõi nhịp chi trong tháng và cảnh báo khi tốc độ chi có thể vượt mức; cảnh báo thiếu thu nhập dự kiến cho các khoản ưu tiên.
- Gợi ý hạn mức theo tỉ lệ danh mục từ tối đa **ba tháng hoàn tất**; nếu chưa có lịch sử dùng số liệu tháng đang chạy và báo rõ ít dữ liệu.
- Nút **Dùng hạn mức** chỉ ghi hạn mức nhóm khi người dùng xác nhận, không tự chuyển khoản hoặc vay.
- Trợ lý trong app có thêm thông điệp về chi tiêu/ngân sách; MCP bổ sung công cụ **read-only** `analyze_spending_behavior`, chỉ xuất báo cáo tổng hợp, không xuất ghi chú hay từng giao dịch.
- Backend Go và frontend đều xác thực giá trị nhãn; dữ liệu version 1 cũ tương thích.

## Giới hạn và việc cần tiếp tục
- Dữ liệu do người dùng ghi bằng tay, chưa có đồng bộ ngân hàng, hóa đơn OCR, thông báo đẩy khi đóng app hoặc mô hình LLM để hiểu ngôn ngữ tự nhiên.
- Không diễn giải hạn mức ước tính như số dư có thể rút hay tư vấn đầu tư. Nếu thu nhập chưa khai báo, hệ thống **không** đề xuất mức chi.
- Dữ liệu tháng đang chạy không được ngoại suy làm lịch sử nhiều tháng; khi chỉ có một hoặc hai tháng lịch sử có cảnh báo độ tin cậy.
- Một số danh mục có cả khoản thiết yếu và linh hoạt nên gợi ý theo loại giao dịch, không suy đoán loại chỉ từ tên danh mục.
- MCP cho ChatGPT vẫn đang chờ OAuth/PKCE và transport tương thích; không yêu cầu người dùng dán Bearer token.
- Kiểm tra staging bằng `npm run smoke:staging`. Tài khoản và giao dịch kiểm thử được xóa sau khi chạy.
