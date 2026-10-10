package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"financialsteward/backend/internal/finance"
	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

//go:embed migrations/*.sql
var migrations embed.FS

type server struct {
	db         *sql.DB
	origins    map[string]bool
	production bool
	limitMu    sync.Mutex
	attempts   map[string]attempt
}
type attempt struct {
	count int
	reset time.Time
}
type user struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}
type authInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type authResponse struct {
	Token string `json:"token"`
	User  user   `json:"user"`
}
type stateResponse struct {
	Revision int64        `json:"revision"`
	Data     finance.Data `json:"data"`
}
type stateInput struct {
	Revision int64           `json:"revision"`
	Data     json.RawMessage `json:"data"`
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	env := getenv("APP_ENV", "development")
	production := env == "production"
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	if production && strings.Contains(strings.ToLower(dbURL), "sslmode=disable") {
		return errors.New("disable SSL is not allowed for database in production")
	}
	origins := map[string]bool{}
	for _, v := range strings.Split(os.Getenv("CORS_ORIGINS"), ",") {
		if v = strings.TrimSpace(v); v != "" {
			origins[v] = true
		}
	}
	if production && len(origins) == 0 {
		return errors.New("configure CORS_ORIGINS in production")
	}
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(15)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		return fmt.Errorf("database connection failed: %w", err)
	}
	if err = migrate(ctx, db); err != nil {
		return err
	}
	a := &server{db: db, origins: origins, production: production, attempts: map[string]attempt{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		response(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/v1/auth/register", a.register)
	mux.HandleFunc("POST /api/v1/auth/login", a.login)
	mux.HandleFunc("POST /api/v1/auth/logout", a.withAuth(a.logout))
	mux.HandleFunc("GET /api/v1/me", a.withAuth(a.me))
	mux.HandleFunc("DELETE /api/v1/account", a.withAuth(a.deleteAccount))
	mux.HandleFunc("GET /api/v1/state", a.withAuth(a.getState))
	mux.HandleFunc("GET /api/v1/journal", a.withAuth(a.getJournal))
	mux.HandleFunc("POST /mcp", a.withAuth(a.mcp))
	mux.HandleFunc("PUT /api/v1/state", a.withAuth(a.putState))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "Không tìm thấy API.") })
	addr := ":" + getenv("PORT", "8080")
	log.Printf("Financial Steward API listening on %s", addr)
	srv := &http.Server{Addr: addr, Handler: a.middleware(mux), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 25 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	return srv.ListenAndServe()
}
func migrate(ctx context.Context, db *sql.DB) error {
	for _, name := range []string{"001_init.sql", "002_journal.sql"} {
		sqlBytes, err := migrations.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		// Statements are developer-owned static SQL, not user input.
		for _, statement := range strings.Split(string(sqlBytes), ";") {
			if strings.TrimSpace(statement) == "" {
				continue
			}
			if _, err = db.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("migration %s failed: %w", name, err)
			}
		}
	}
	return nil
}
func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
func response(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	response(w, status, map[string]string{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		fail(w, 400, "Dữ liệu JSON không hợp lệ.")
		return false
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		fail(w, 400, "Yêu cầu chỉ được chứa một đối tượng JSON.")
		return false
	}
	return true
}
func id() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", buf[:4], buf[4:6], buf[6:8], buf[8:10], buf[10:]), nil
}
func token() (string, string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(buf)
	h := sha256.Sum256([]byte(raw))
	return raw, hex.EncodeToString(h[:]), nil
}
func validEmail(email string) bool {
	if len(email) > 254 || email == "" || strings.ContainsAny(email, " \t\n\r") {
		return false
	}
	a, e := mail.ParseAddress(email)
	return e == nil && strings.EqualFold(a.Address, email) && strings.Count(email, "@") == 1
}
func normalizedEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }
func (a *server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !a.origins[origin] {
				fail(w, http.StatusForbidden, "Nguồn truy cập không được cho phép.")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.URL.Path != "/healthz" && r.URL.Path != "/mcp" && !strings.HasPrefix(r.URL.Path, "/api/v1/") {
			fail(w, 404, "Not found")
			return
		}
		next.ServeHTTP(w, r)
	})
}
func (a *server) throttle(w http.ResponseWriter, r *http.Request, email string) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	emailHash := sha256.Sum256([]byte(normalizedEmail(email)))
	keys := []struct {
		key   string
		limit int
	}{
		{key: "account:" + hex.EncodeToString(emailHash[:]), limit: 12},
		{key: "ip:" + host, limit: 1000},
	}
	now := time.Now()
	a.limitMu.Lock()
	defer a.limitMu.Unlock()
	// In-memory defense in depth. Use a distributed limiter at the edge for multiple instances.
	if len(a.attempts) > 5000 {
		for key, v := range a.attempts {
			if now.After(v.reset) {
				delete(a.attempts, key)
			}
		}
	}
	for _, key := range keys {
		v := a.attempts[key.key]
		if now.After(v.reset) {
			v = attempt{reset: now.Add(15 * time.Minute)}
		}
		if v.count >= key.limit {
			w.Header().Set("Retry-After", strconv.Itoa(int(time.Until(v.reset).Seconds()+1)))
			fail(w, 429, "Quá nhiều lần thử. Hãy thử lại sau.")
			return false
		}
	}
	for _, key := range keys {
		v := a.attempts[key.key]
		if now.After(v.reset) {
			v = attempt{reset: now.Add(15 * time.Minute)}
		}
		v.count++
		a.attempts[key.key] = v
	}
	return true
}
func (a *server) issueSession(ctx context.Context, user user) (authResponse, error) {
	raw, hash, err := token()
	if err != nil {
		return authResponse{}, err
	}
	_, err = a.db.ExecContext(ctx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')", hash, user.ID)
	return authResponse{Token: raw, User: user}, err
}
func (a *server) register(w http.ResponseWriter, r *http.Request) {
	var in authInput
	if !decode(w, r, &in) {
		return
	}
	in.Email = normalizedEmail(in.Email)
	if !a.throttle(w, r, in.Email) {
		return
	}
	if !validEmail(in.Email) || len(in.Password) < 12 || len([]byte(in.Password)) > 72 {
		fail(w, 400, "Email không hợp lệ hoặc mật khẩu cần 12–72 byte.")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(w, 500, "Không thể tạo tài khoản.")
		return
	}
	userID, err := id()
	if err != nil {
		fail(w, 500, "Không thể tạo tài khoản.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		fail(w, 500, "Lỗi cơ sở dữ liệu.")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", userID, in.Email, string(hash)); err != nil {
		fail(w, 409, "Email này đã được sử dụng hoặc không thể đăng ký.")
		return
	}
	initial, _ := json.Marshal(finance.Empty())
	if _, err = tx.ExecContext(ctx, "INSERT INTO financial_states(user_id,revision,data) VALUES($1,0,$2)", userID, initial); err != nil {
		fail(w, 500, "Không thể khởi tạo dữ liệu.")
		return
	}
	raw, hashToken, err := token()
	if err != nil {
		fail(w, 500, "Không thể tạo phiên đăng nhập.")
		return
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", hashToken, userID); err != nil {
		fail(w, 500, "Không thể tạo phiên đăng nhập.")
		return
	}
	if err = tx.Commit(); err != nil {
		fail(w, 500, "Không thể lưu tài khoản.")
		return
	}
	response(w, 201, authResponse{Token: raw, User: user{ID: userID, Email: in.Email}})
}
func (a *server) login(w http.ResponseWriter, r *http.Request) {
	var in authInput
	if !decode(w, r, &in) {
		return
	}
	in.Email = normalizedEmail(in.Email)
	if !a.throttle(w, r, in.Email) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	var u user
	var hash string
	err := a.db.QueryRowContext(ctx, "SELECT id,email,password_hash FROM users WHERE email=$1", in.Email).Scan(&u.ID, &u.Email, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		fail(w, 401, "Email hoặc mật khẩu không chính xác.")
		return
	}
	auth, err := a.issueSession(ctx, u)
	if err != nil {
		fail(w, 500, "Không thể tạo phiên đăng nhập.")
		return
	}
	response(w, 200, auth)
}

type authContextKey struct{}
type session struct {
	user user
	hash string
}

func (a *server) withAuth(next func(http.ResponseWriter, *http.Request, session)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") || len(auth) > 150 {
			fail(w, 401, "Cần đăng nhập.")
			return
		}
		raw := strings.TrimPrefix(auth, "Bearer ")
		h := sha256.Sum256([]byte(raw))
		hash := hex.EncodeToString(h[:])
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		var u user
		err := a.db.QueryRowContext(ctx, "SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", hash).Scan(&u.ID, &u.Email)
		if err != nil {
			fail(w, 401, "Phiên đăng nhập hết hạn hoặc không hợp lệ.")
			return
		}
		next(w, r.WithContext(ctx), session{user: u, hash: hash})
	}
}
func (a *server) me(w http.ResponseWriter, r *http.Request, s session) {
	response(w, 200, map[string]any{"user": s.user})
}
func (a *server) logout(w http.ResponseWriter, r *http.Request, s session) {
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", s.hash); err != nil {
		fail(w, 500, "Không thể đăng xuất.")
		return
	}
	response(w, 200, map[string]bool{"ok": true})
}
func (a *server) deleteAccount(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	var hash string
	err := a.db.QueryRowContext(r.Context(), "SELECT password_hash FROM users WHERE id=$1", s.user.ID).Scan(&hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		fail(w, 403, "Mật khẩu xác nhận không chính xác.")
		return
	}
	if _, err := a.db.ExecContext(r.Context(), "DELETE FROM users WHERE id=$1", s.user.ID); err != nil {
		fail(w, 500, "Không thể xóa tài khoản.")
		return
	}
	response(w, 200, map[string]bool{"deleted": true})
}
func (a *server) getState(w http.ResponseWriter, r *http.Request, s session) {
	var raw []byte
	var rev int64
	err := a.db.QueryRowContext(r.Context(), "SELECT revision,data FROM financial_states WHERE user_id=$1", s.user.ID).Scan(&rev, &raw)
	if err != nil {
		fail(w, 500, "Không thể tải dữ liệu.")
		return
	}
	d, err := finance.Decode(raw)
	if err != nil {
		fail(w, 500, "Dữ liệu đã lưu không hợp lệ.")
		return
	}
	response(w, 200, stateResponse{Revision: rev, Data: d})
}
func (a *server) putState(w http.ResponseWriter, r *http.Request, s session) {
	var in stateInput
	if !decode(w, r, &in) {
		return
	}
	if in.Revision < 0 {
		fail(w, 400, "Phiên bản dữ liệu không hợp lệ.")
		return
	}
	data, err := finance.Decode(in.Data)
	if err != nil {
		fail(w, 400, "Dữ liệu tài chính không hợp lệ: "+err.Error())
		return
	}
	raw, err := json.Marshal(data)
	if err != nil {
		fail(w, 400, "Không thể lưu dữ liệu.")
		return
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		fail(w, 500, "Không thể bắt đầu lưu dữ liệu.")
		return
	}
	defer tx.Rollback()
	var currentRevision int64
	var currentRaw []byte
	err = tx.QueryRowContext(r.Context(), "SELECT revision,data FROM financial_states WHERE user_id=$1 FOR UPDATE", s.user.ID).Scan(&currentRevision, &currentRaw)
	if err != nil {
		fail(w, 500, "Không thể đọc dữ liệu hiện tại.")
		return
	}
	if currentRevision != in.Revision {
		fail(w, 409, "Dữ liệu đã thay đổi ở thiết bị khác. Hãy tải lại trước khi tiếp tục.")
		return
	}
	previous, err := finance.Decode(currentRaw)
	if err != nil {
		fail(w, 500, "Dữ liệu đã lưu không hợp lệ.")
		return
	}
	revision := currentRevision + 1
	if _, err = tx.ExecContext(r.Context(), "UPDATE financial_states SET data=$1,revision=$2,updated_at=now() WHERE user_id=$3", raw, revision, s.user.ID); err != nil {
		fail(w, 500, "Không thể cập nhật dữ liệu.")
		return
	}
	for _, change := range financeStateChanges(previous, data) {
		if _, err = tx.ExecContext(r.Context(), "INSERT INTO financial_journal (user_id,revision,event_type,action,record_id,title,amount) VALUES ($1,$2,$3,$4,$5,$6,$7)",
			s.user.ID, revision, change.Kind, change.Action, change.ID, change.Title, change.Amount); err != nil {
			fail(w, 500, "Không thể ghi nhật ký thay đổi.")
			return
		}
	}
	if err = tx.Commit(); err != nil {
		fail(w, 500, "Không thể hoàn tất lưu dữ liệu.")
		return
	}
	response(w, 200, map[string]any{"revision": revision})
}
