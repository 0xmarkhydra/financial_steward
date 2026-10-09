# Financial Steward · Quản gia tài chính

Ứng dụng quản lý tài chính cá nhân với **một giao diện React dùng chung cho Web, iOS và Android**, **Go REST API**, **PostgreSQL** và **Capacitor 8**.

## Kiến trúc

```text
financial_steward/
├── src/                       React + TypeScript + Vite
│   ├── SessionRoot.tsx         Đăng ký, đăng nhập, trạng thái đồng bộ
│   ├── App.tsx                 Dashboard, nợ, thu chi, ngân sách, trả nợ
│   ├── api.ts                  REST API và token storage
│   ├── finance.ts              Thống kê / lập kế hoạch
│   └── storage.ts              Validate / xuất nhập JSON
├── backend/
│   ├── cmd/server/main.go      API Go
│   ├── cmd/server/migrations/  Embedded PostgreSQL schema
│   └── internal/finance/       Validate dữ liệu & test
├── capacitor.config.ts         iOS/Android cấu hình chung
├── Dockerfile.web              Frontend phục vụ bằng Nginx
├── docker-compose.yml          API + PostgreSQL cho phát triển
└── docs/                       Phát hành và bảo vệ dữ liệu
```

## Tính năng hiện tại

- Đăng ký, đăng nhập bằng email + mật khẩu; token ngẫu nhiên, lưu hash của token trên server, logout, xóa tài khoản có xác minh mật khẩu.
- Mỗi tài khoản chỉ truy cập được dữ liệu của chính mình.
- Khoản nợ: ngân hàng, thẻ tín dụng, trả góp, vay cá nhân; dư nợ, lãi suất, tối thiểu, ngày đến hạn; thêm, chỉnh sửa, xóa, hoàn tác thanh toán.
- Thu/chi: loại, danh mục, ngày, ghi chú, lọc, sửa, xóa.
- Thanh toán gốc, lãi, phí: gốc làm giảm dư nợ; cả ba đi vào dòng tiền trả nợ, không tính trùng vào chi phí sinh hoạt.
- Ngân sách chi tiêu theo danh mục, cảnh báo vượt hạn mức.
- Dòng tiền và lộ trình trả nợ avalanche / snowball.
- Biểu đồ tổng quan và báo cáo 6 tháng.
- JSON backup / restore; tài khoản và dữ liệu đồng bộ bằng API với revision để tránh ghi đè âm thầm.
- Responsive; chạy trên iPhone, Android và web từ một codebase.

## Khởi chạy backend Go

Cần **Go 1.23+** và PostgreSQL 17.

```bash
# Tại thư mục gốc
docker compose up -d postgres
cd backend
go mod download
DATABASE_URL="postgres://financial:local_development_only@localhost:5432/financial_steward?sslmode=disable" PORT=8080 APP_ENV=development CORS_ORIGINS="http://localhost:5173,capacitor://localhost,http://localhost" go run ./cmd/server
```

Hoặc chạy toàn bộ backend và PostgreSQL:

```bash
docker compose up --build
```

**Lưu ý:** Mật khẩu trong docker-compose chỉ dùng để phát triển; cấu hình `POSTGRES_PASSWORD` mạnh trước khi dùng trên server.

## Khởi chạy frontend Web

Node 22+, npm.

```bash
npm install
npm run dev
```

Mở `http://localhost:5173`. Vite proxy `/api` tới `http://localhost:8080`. Cần backend đang hoạt động.

Build và test:

```bash
npm run test
npm run build
cd backend && go test ./...
```

## Build iOS và Android bằng Capacitor

Bản di động dùng cùng `src/` và gọi API qua HTTPS.

```bash
# Đặt địa chỉ HTTPS thật của backend trong .env.production
VITE_API_URL=https://api.example.com

npm install
npm run build
npx cap add ios
npx cap add android
npm run mobile:sync

# mở Xcode hoặc Android Studio
npm run mobile:ios
npm run mobile:android
```

Không sử dụng địa chỉ `localhost` cho API mobile trên điện thoại thật. **Không** đưa API key, JWT secret hoặc mật khẩu DB vào `VITE_*`. Xem `docs/RELEASE.md` trước khi upload App Store / Play Console.

## Triển khai production

- PostgreSQL được quản lý với backup/PITR và SSL hoặc mạng riêng tin cậy.
- Deploy backend container từ `backend/Dockerfile`; đặt `APP_ENV=production`, `DATABASE_URL`, `CORS_ORIGINS`, `PORT`.
- Deploy frontend từ `Dockerfile.web`, khai báo build arg `VITE_API_URL=https://api.example.com`.
- Cấu hình HTTPS, DNS cho frontend và API; đưa chính xác origin web, `capacitor://localhost` và `http://localhost` vào CORS.
- Tạo và công bố privacy policy, chính sách xóa tài khoản trước khi phát hành. Xem `docs/RELEASE.md`.

## Giới hạn / các bước bổ sung trước khi phát hành

- Chưa có chức năng quên mật khẩu / xác thực email / MFA. **Không sử dụng để quản lý tiền thật trên production trước khi hoàn thiện bảo mật tài khoản và kiểm thử bảo mật.**
- Đồng bộ yêu cầu Internet. Chưa có nền tảng offline-first và tự merge xung đột: khi có xung đột, ứng dụng yêu cầu xuất sao lưu và tải lại.
- API lưu document dữ liệu phiên bản trong PostgreSQL JSONB theo user. Cách này đơn giản, nhất quán và đủ cho bản đầu; giai đoạn quy mô cao nên tách giao dịch thành bảng chuẩn hóa + audit.
- Lãi suất trả nợ đang **ước tính theo tháng**, không bao gồm lãi theo ngày, trả chậm, phí ẩn, tăng/giảm lãi suất hoặc các điều khoản ngân hàng; không xem mô phỏng là tư vấn tài chính chính thức.
- Chưa có notification push, lịch thu/chi tự động, liên kết ngân hàng hoặc dữ liệu báo cáo tín dụng.
- `cloud.financialsteward.app` chỉ là bundle ID đề xuất; phải xác nhận quyền sử dụng và đăng ký identifier riêng của nhà phát hành.
- Native project `ios/` và `android/` được sinh bằng `npx cap add`; hiện không thể khẳng định đã chạy build native trước khi cài dependencies và chạy kiểm thử trên máy.

## Lưu ý an toàn

Không nhập số thẻ, CVV, mã OTP, mật khẩu ngân hàng, CCCD vào ghi chú. Token web lưu trong sessionStorage (chỉ phiên làm việc), token mobile dùng hệ thống Keychain/Keystore. Máy chủ phải được vận hành với HTTPS, backups, hardening, monitoring và kiểm thử trước khi tiếp nhận dữ liệu cá nhân thật.
