# Lịch tài chính — khoản cần thu/chi và thực chi theo ngày

## Phạm vi

Tab **Lịch tài chính** trong sidebar, thanh điều hướng điện thoại và liên kết nhanh từ màn Tổng quan. Lịch tháng hiển thị theo **ngày lịch tại thiết bị**, bắt đầu từ thứ Hai; khi bấm một ngày, bảng bên phải (hoặc phía dưới trên mobile) hiển thị nghĩa vụ, dự kiến thu và các giao dịch thực tế.

### Dữ liệu xuất hiện trong lịch

- **Cần chi**: trả nợ tối thiểu theo kỳ (trừ các thanh toán đã ghi đúng kỳ), lãi dự kiến có ngày riêng, góp phường ngày/tuần/tháng chưa ghi đủ và lịch phải chi do người dùng đặt.
- **Dự kiến thu**: kỳ lĩnh phường nếu khai báo mức dự kiến; khoản phải thu người dùng tự đặt (tiền hàng, người vay hoàn trả, khách thanh toán...).
- **Mốc tài chính**: ngày đáo thẻ/đáo hạn đang chờ xử lý; số dư đáo hạn chỉ là mốc theo dõi, **không** coi là tiền chi.
- **Đã chi/đã thu**: giao dịch sinh hoạt; tiền trả nợ gốc/lãi/phí theo **ngày thực trả**; tiền góp/lĩnh phường và phí thực tế. Mỗi bản ghi chỉ xuất hiện một lần trong dòng tiền thực tế.

Lịch hiển thị màu phân biệt các nhóm, có bộ lọc **Tất cả / Cần chi / Dự kiến thu / Đã ghi**. Tổng hợp từng ngày gồm chi sinh hoạt, trả nợ, góp phường và dòng tiền thu/chi; dữ liệu dự kiến không làm tăng khoản đã thu/chi.

### Lên lịch và xác nhận

- Tạo khoản `CashPlan`: tên, hướng tiền `in/out`, số tiền, ngày dự kiến, ghi chú tùy chọn.
- Có thể nhập qua nút **Hẹn thu / chi** hoặc hội thoại như *“Ngày 20/10 cần thu 3 triệu tiền hàng”* → bản nháp → **xác nhận**.
- Nếu đánh dấu **Ghi đã thu/chi hôm nay**, ứng dụng hỏi xác nhận và thêm đúng **một** giao dịch thực tế, tạo liên kết `linkedTransactionId` và chuyển kế hoạch sang `completed`.
- Hủy kế hoạch chuyển trạng thái `cancelled`, không làm thay đổi giao dịch đã thực hiện. Nhật ký backend ghi sự kiện thêm/sửa kế hoạch, không ghi note.
- Lưu trong JSONB `financial_states` với trường `cashPlans?` tùy chọn, dữ liệu cũ hợp lệ. Cả TypeScript và Go đều xác thực kế hoạch.

### Quy tắc kế toán và giới hạn

- **Tổng dự kiến cần chi** có tính khoản tối thiểu, nhưng không cộng riêng tiền lãi khi khoản đó có thể nằm trong mức tối thiểu. Mỗi nhắc lãi vẫn hiện riêng và có chú thích; cần đối chiếu hợp đồng và sao kê.
- **Đáo thẻ** không cộng vào tổng chi dự kiến hoặc thực tế. Một kế hoạch đã xác nhận hoàn thành cũng không được cộng vào thực chi nếu không có giao dịch liên kết.
- Tiền lĩnh phường có thể là **dòng tiền vào**, không đồng nghĩa thu nhập/lợi nhuận. Nếu chưa biết số tiền lĩnh, chỉ hiển thị lịch mà không đưa vào số tổng.
- Mức trả nợ tương lai đang ước lượng từ dư nợ và mức tối thiểu hiện nhập, không phải lịch sao kê chính thức. Các khoản nợ theo kỳ được so sánh với bản ghi thanh toán gán cho kỳ, không theo ngày thực chi.
- Lịch phải thu/phải chi mới hiện là **một lần**, chưa hỗ trợ định kỳ/nhắc trước tùy chỉnh; điều này có thể mở rộng khi cần.
- Lịch hiện là **trong app khi mở trang**, chưa có push, lịch server-side hay thông báo lúc app đóng.
- Đây là staging dữ liệu giả. Không nên nhập thông tin ngân hàng hoặc tài chính thật cho tới khi hoàn tất backup/PITR, tài khoản và các quy trình bảo vệ dữ liệu.

## Kiểm thử

- `npm run test && npm run build`
- `cd backend && go test ./... && go vet ./...`
- `npm run smoke:staging`: đăng ký tài khoản giả, tạo hai khoản dự kiến, xác minh audit, xác nhận khoản phải thu tạo một giao dịch thực tế và dọn tài khoản sau kiểm thử.
