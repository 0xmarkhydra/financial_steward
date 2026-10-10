# Trung tâm quản trị nợ, nhật ký và cảnh báo — staging

## Những chức năng đã triển khai

- Mục **Trung tâm quản trị nợ** và đường dẫn nhắc việc trên màn Tổng quan; thanh điều hướng di động có phím Nhắc nợ.
- Nghĩa vụ **trả nợ tối thiểu** định kỳ theo ngày trong tháng; hiển thị phần còn thiếu dựa trên thanh toán đã ghi cho kỳ tương ứng. Nếu kỳ trước chưa có đủ bản ghi, ứng dụng nhắc **đối soát** chứ không kết luận ngân hàng đã phạt quá hạn.
- Khai báo **ngày đóng lãi riêng** và **số lãi dự kiến** cho từng khoản nợ; nhắc lãi theo bản ghi lãi đã trả cho đúng kỳ. Lãi có thể đã nằm trong thanh toán tối thiểu: thông báo riêng, **không cộng đôi thành tổng nghĩa vụ**.
- **Đáo thẻ / đáo hạn** từ các lịch được tạo trước; chỉ dừng nhắc sau khi lịch được đánh dấu đã xử lý hoặc hủy. Một lịch đáo hạn **không đồng nghĩa giao dịch chi tiền hoặc giảm dư nợ**.
- Cảnh báo ngân sách danh mục khi chạm 80% và vượt hạn mức; cảnh báo ngưỡng **chi tiêu linh hoạt toàn tháng** từ thu nhập/dự phòng/chi thiết yếu/trả nợ tối thiểu.
- Khi ghi gốc/lãi/phí, người dùng chọn **ngày thực trả** và **kỳ thanh toán (YYYY-MM)**. Nếu thanh toán muộn cho kỳ trước, chọn đúng tháng cũ; tiền ra vẫn tính vào tháng thực chi.
- **Sổ dòng tiền hợp nhất**: thu, chi, trả gốc/lãi/phí, ghi nhận nợ và lịch đáo hạn. Mỗi loại phân biệt tiền thực so với khoản dự kiến, không cộng trùng.
- **Đánh giá quyết định dựa trên bằng chứng**: áp lực trả nợ so với thu nhập khai báo, chi vượt tiền thu, chi theo cảm xúc/khuyến mãi, trả lãi nhưng chưa giảm gốc, lệ thuộc đáo hạn. Mỗi kết luận kèm quan sát định lượng và hành động đề xuất. Giao dịch riêng lẻ cũng có nhận xét nếu đã có đủ thông tin.
- **Nhật ký thay đổi phía máy chủ**: PostgreSQL bảng `financial_journal`, ghi thao tác thêm/sửa/xóa và thời điểm, phiên bản, số tiền (không ghi note/password/token); được ghi atomically cùng bản cập nhật trạng thái tài chính. Endpoint `GET /api/v1/journal` chỉ truy cập tài khoản đang đăng nhập, trả tối đa 100 sự kiện mới nhất, không có API chỉnh sửa/xóa nhật ký.
- Tất cả đều tương thích dữ liệu cũ dạng `version: 1`: các trường ngày đóng lãi, lãi dự kiến và kỳ thanh toán là tùy chọn.

## Giới hạn quan trọng

1. Hiện cảnh báo **trong web/PWA khi người dùng mở ứng dụng**; chưa có hệ thống gửi Web Push/OneSignal hay lịch cron để nhắc lúc ứng dụng đã đóng. Không gọi đây là nhắc nền.
2. Lãi và mức trả tối thiểu **do người dùng khai báo**; không lấy sao kê ngân hàng. Phải đối chiếu với bên cho vay trước khi ra quyết định.
3. Việc đánh dấu hoàn thành đáo thẻ là kế hoạch được xác nhận, không sinh giao dịch thu/chi hoặc chuyển tiền. Ghi gốc/lãi/phí ở phần Trả nợ.
4. Sổ hợp nhất được tạo từ các bản ghi đang có, trong khi nhật ký máy chủ là lịch sử các thay đổi **sau thời điểm triển khai**. Nhật ký được lưu append-only qua API ứng dụng, nhưng chưa được bảo vệ chống quản trị viên DB sửa trực tiếp hoặc cung cấp xuất lịch sử tuân thủ.
5. Nếu người dùng đã trả nhưng chưa ghi nhận trong ứng dụng, nhắc đối soát là một tín hiệu thiếu dữ liệu, **không chứng minh có nợ quá hạn**.
6. Tư vấn chi tiêu/ra quyết định hiện dựa trên quy tắc, không phải AI LLM hay lời khuyên tài chính được cấp phép.
7. Chỉ sử dụng dữ liệu thử ở staging. Cần backup/PITR, bảo vệ tài khoản và quy trình dữ liệu cá nhân trước khi sử dụng dữ liệu thật.

## Kiểm thử

- `npm run test && npm run build`
- `cd backend && go test ./... && go vet ./...`
- `npm run smoke:staging`: các kiểm tra end-to-end sử dụng tài khoản thử và dọn tài khoản sau khi chạy; kiểm tra tính nguyên tử của ghi dữ liệu và nhật ký.
