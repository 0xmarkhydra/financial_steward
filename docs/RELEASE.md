# Checklist phát hành Financial Steward (iOS / Android / Web)

## 1. Trước khi cấp quyền truy cập người dùng thật

- [ ] Migrate/backup PostgreSQL; giám sát, logs không chứa email/password/token/tài chính.
- [ ] API HTTPS, cấu hình đúng `APP_ENV=production`, `DATABASE_URL`, `CORS_ORIGINS`.
- [ ] Rate limit đủ mạnh và phân tán khi chạy nhiều instance (Redis hoặc API gateway).
- [ ] Xác thực email, quên mật khẩu, reset password an toàn, session revocation, kiểm thử chống brute force.
- [ ] Thử riêng tư giữa 2 tài khoản: API không trả dữ liệu tài khoản khác.
- [ ] Kiểm tra nhập dữ liệu, đối chiếu gốc-lãi-phí, xung đột đồng bộ và khôi phục backup.
- [ ] Thiết kế quy trình xóa tài khoản và xóa dữ liệu lưu trong backup theo chính sách lưu trữ.
- [ ] Công bố privacy policy có thể truy cập công khai. Bản nháp ở `docs/PRIVACY_POLICY_TEMPLATE.md` không được công bố khi chưa điền thông tin thật.
- [ ] Quy trình khắc phục sự cố, kiểm toán và ứng phó rò rỉ dữ liệu.
- [ ] Đánh giá pháp lý về bảo vệ dữ liệu cá nhân tại Việt Nam trước khi tiếp nhận dữ liệu thật.

## 2. Build iOS

- [ ] macOS, Xcode 26.0+ (máy hiện có Xcode 26.3), Apple Developer Program hợp lệ.
- [ ] Điền bundle ID thật và bảo đảm đã đăng ký.
- [ ] `npm install`, `npm run build`, `npx cap add ios`, `npm run mobile:sync`.
- [ ] Kiểm tra `VITE_API_URL` HTTPS thật nằm trong bundle, cấu hình ATS không cho HTTP.
- [ ] Trong Xcode, thiết lập team, signing, iOS deployment target, app icon, launch image.
- [ ] Test trên iPhone thật: đăng nhập, thao tác thu chi, mất mạng, đăng xuất, xóa tài khoản, cập nhật phiên bản.
- [ ] App Store Connect: screenshots, chính sách quyền riêng tư, thông tin nhà phát triển, hỗ trợ người dùng, khai báo dữ liệu thu thập, TestFlight review.

## 3. Build Android

- [ ] Android Studio 2025.2.1+ và Android SDK 36; dùng JDK 21 do Android Studio cung cấp (máy hiện đang có Java 17 ngoài terminal).
- [ ] `npm install`, `npm run build`, `npx cap add android`, `npm run mobile:sync`.
- [ ] Cấu hình namespace/package ID không trùng, icon adaptive 512 px, splash.
- [ ] Release keystore an toàn; Android App Bundle AAB ký phát hành.
- [ ] Test máy thật: WebView, Internet HTTPS, bàn phím, safe area, nút back, lifecycle.
- [ ] Play Console: Data safety, quyền riêng tư, content rating, tài khoản dùng thử cho reviewer nếu cần, thử nghiệm và điều kiện phát hành theo loại tài khoản.

## 4. Cần tạo thêm để vượt qua store review

- [ ] Chính sách quyền riêng tư công khai và liên kết truy cập bên trong ứng dụng.
- [ ] Điều khoản sử dụng, liên hệ hỗ trợ, hiển thị thông báo về kế hoạch trả nợ chỉ mang tính mô phỏng.
- [ ] Email xác minh, reset password, thử lỗi auth và giới hạn thử đăng nhập.
- [ ] App icon PNG / adaptive icon đủ kích thước theo Apple/Google.
- [ ] Test crash/performance trên mobile, accessibility và nội dung ở vùng tai thỏ/safe area.
- [ ] CI release kiểm tra build, test, ký app và store metadata.
- [ ] Xác nhận app đủ tính năng, không phải trang web tối giản được đóng gói nguyên trạng; reviewer có thể yêu cầu cải thiện.
