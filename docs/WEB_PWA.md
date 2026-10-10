# Financial Steward — Web PWA (ưu tiên bản trình duyệt)

## Tính năng
- Web React có thể cài lên màn hình chính Android (Chrome/Edge) và iOS (Safari, chia sẻ > Thêm vào Màn hình chính).
- Manifest, biểu tượng 192/512 PNG, maskable icon, Apple touch icon, màu theme và giao diện standalone.
- Service Worker hoạt động trên HTTPS (và localhost), chỉ cache tài nguyên tĩnh công khai và trang thông báo ngoại tuyến.
- **Không cache HTML có trạng thái tài khoản, API, MCP, access token, phản hồi dữ liệu tài chính.**
- Khi không có Internet: mở mới hiển thị trang ngoại tuyến; nếu đang dùng app sẽ có cảnh báo không tiếp tục nhập giao dịch do API không đồng bộ được.
- Cập nhật có kiểm soát: hiển thị yêu cầu tải lại khi có phiên bản mới; không tự tải lại giữa chừng.

## Phát triển và chạy
```bash
npm ci
node scripts/generate-pwa-icons.mjs
npm run test
npm run build
npm run preview
```

Môi trường dev `npm run dev` không đăng ký Service Worker, để tránh cache ứng dụng khi lập trình. Bản build dùng `npm run preview`, hoặc deploy `Dockerfile.web` trên HTTPS.

### Backend
Đăng nhập và thay đổi dữ liệu yêu cầu Go API + PostgreSQL. Để test end-to-end đầy đủ cần chạy backend và khai báo `VITE_API_URL` hợp lệ (đối với domain web khác domain API) hoặc reverse proxy /api cùng origin.

## Kiểm thử nghiệm thu trước production
- Chrome Android: Install app, launcher icon, mở ở chế độ standalone.
- Safari iPhone: Share > Add to Home Screen, mở standalone, safe-area, form không tự zoom.
- Chrome desktop: có nút Install khi đủ tiêu chí trình duyệt.
- DevTools > Application: manifest và icon hợp lệ, worker kích hoạt.
- Tắt mạng sau lần mở đầu, refresh: hiện trang offline, không lộ dữ liệu cá nhân.
- DevTools > Application > Cache Storage: chỉ static assets và offline.html; không có /api hoặc /mcp.
- Nhập thu chi / sửa nợ online, kiểm tra backend lưu và reload còn dữ liệu.
- Deploy bản mới và kiểm tra lời nhắc cập nhật, không gián đoạn giao dịch chưa đồng bộ.
- Kiểm tra trên iPhone/Android thật, backup, policy bảo vệ dữ liệu và cấu hình HTTPS.

## Lưu ý
- PWA **chưa hỗ trợ nhập liệu offline**. Tuyệt đối không hiểu cache app shell là đã lưu được dữ liệu tài chính offline.
- Chưa có push notification, thông báo nợ khi đóng app, bảo mật tài khoản nâng cao, hoặc chứng nhận production-ready.
- Mã nguồn cấu hình phát hành mobile native vẫn giữ nguyên, nhưng không nằm trong ưu tiên giai đoạn này.
