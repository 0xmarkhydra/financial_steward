package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const oauthReadScope = "finance:read"
const oauthOfflineScope = "offline_access"
const oauthAccessTTL = 15 * time.Minute
const oauthRefreshTTL = 30 * 24 * time.Hour
const oauthCodeTTL = 5 * time.Minute
const oauthPendingTTL = 10 * time.Minute

var pkcePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func oauthOrigin() string {
	raw := strings.TrimSuffix(strings.TrimSpace(os.Getenv("MCP_PUBLIC_ORIGIN")), "/")
	if raw == "" {
		return ""
	}
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.Host != u.Hostname() && u.Port() != "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return ""
	}
	return raw
}
func oauthResource() string {
	if origin := oauthOrigin(); origin != "" {
		return origin + "/mcp"
	}
	return ""
}
func oauthHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
func oauthRandom() (string, error) { raw, _, err := token(); return raw, err }
func oauthValidScope(raw string) bool {
	fields := strings.Fields(raw)
	if len(fields) < 1 || len(fields) > 2 {
		return false
	}
	seen := map[string]bool{}
	for _, item := range fields {
		if seen[item] || item != oauthReadScope && item != oauthOfflineScope {
			return false
		}
		seen[item] = true
	}
	return seen[oauthReadScope]
}
func oauthHasScope(have, scope string) bool {
	for _, item := range strings.Fields(have) {
		if item == scope {
			return true
		}
	}
	return false
}
func oauthRedirectAllowed(s string) bool {
	u, err := url.Parse(s)
	if err != nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Port() != "" || u.Scheme != "https" || !strings.EqualFold(u.Hostname(), "chatgpt.com") {
		return false
	}
	if s == "https://chatgpt.com/connector_platform_oauth_redirect" {
		return true
	}
	const prefix = "https://chatgpt.com/connector/oauth/"
	id := strings.TrimPrefix(s, prefix)
	return strings.HasPrefix(s, prefix) && len(id) >= 8 && len(id) <= 128 && regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(id)
}
func oauthJson(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	response(w, status, value)
}
func oauthError(w http.ResponseWriter, status int, code string) {
	oauthJson(w, status, map[string]any{"error": code})
}
func oauthChallenge(w http.ResponseWriter) {
	if resource := oauthResource(); resource != "" {
		w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer resource_metadata="%s/.well-known/oauth-protected-resource/mcp", scope="%s"`, oauthOrigin(), oauthReadScope))
	}
	oauthError(w, http.StatusUnauthorized, "invalid_token")
}

func (a *server) protectedMetadata(w http.ResponseWriter, r *http.Request) {
	origin := oauthOrigin()
	if origin == "" {
		oauthError(w, 503, "mcp_oauth_not_configured")
		return
	}
	oauthJson(w, 200, map[string]any{"resource": origin + "/mcp", "authorization_servers": []string{origin}, "scopes_supported": []string{oauthReadScope}})
}
func (a *server) authServerMetadata(w http.ResponseWriter, r *http.Request) {
	origin := oauthOrigin()
	if origin == "" {
		oauthError(w, 503, "mcp_oauth_not_configured")
		return
	}
	oauthJson(w, 200, map[string]any{
		"issuer": origin, "authorization_endpoint": origin + "/oauth/authorize",
		"token_endpoint": origin + "/oauth/token", "registration_endpoint": origin + "/oauth/register",
		"scopes_supported":                               []string{oauthReadScope, oauthOfflineScope},
		"response_types_supported":                       []string{"code"},
		"grant_types_supported":                          []string{"authorization_code", "refresh_token"},
		"token_endpoint_auth_methods_supported":          []string{"none"},
		"code_challenge_methods_supported":               []string{"S256"},
		"authorization_response_iss_parameter_supported": true,
	})
}

type oauthClientRegistration struct {
	ClientName      string   `json:"client_name"`
	RedirectURIs    []string `json:"redirect_uris"`
	GrantTypes      []string `json:"grant_types"`
	ResponseTypes   []string `json:"response_types"`
	TokenAuthMethod string   `json:"token_endpoint_auth_method"`
	Scope           string   `json:"scope"`
	ClientURI       string   `json:"client_uri"`
	SoftwareID      string   `json:"software_id"`
	SoftwareVersion string   `json:"software_version"`
}

func (a *server) oauthRegister(w http.ResponseWriter, r *http.Request) {
	if oauthOrigin() == "" {
		oauthError(w, 503, "mcp_oauth_not_configured")
		return
	}
	// Public clients only. Redirects MUST be constrained so untrusted callers cannot steal codes.
	var in oauthClientRegistration
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		oauthError(w, 400, "invalid_client_metadata")
		return
	}
	if len(in.RedirectURIs) < 1 || len(in.RedirectURIs) > 3 || len(in.ClientName) > 120 {
		oauthError(w, 400, "invalid_client_metadata")
		return
	}
	for _, redirect := range in.RedirectURIs {
		if !oauthRedirectAllowed(redirect) {
			oauthError(w, 400, "invalid_redirect_uri")
			return
		}
	}
	if in.Scope != "" && !oauthValidScope(in.Scope) {
		oauthError(w, 400, "invalid_client_metadata")
		return
	}
	if in.TokenAuthMethod != "" && in.TokenAuthMethod != "none" {
		oauthError(w, 400, "invalid_client_metadata")
		return
	}
	for _, gt := range in.GrantTypes {
		if gt != "authorization_code" && gt != "refresh_token" {
			oauthError(w, 400, "invalid_client_metadata")
			return
		}
	}
	for _, rt := range in.ResponseTypes {
		if rt != "code" {
			oauthError(w, 400, "invalid_client_metadata")
			return
		}
	}
	raw, err := oauthRandom()
	if err != nil {
		oauthError(w, 500, "server_error")
		return
	}
	clientID := "steward-" + raw
	name := strings.TrimSpace(in.ClientName)
	if name == "" {
		name = "ChatGPT (external OAuth client)"
	}
	jsonRedirect, _ := json.Marshal(in.RedirectURIs)
	if _, err = a.db.ExecContext(r.Context(), "INSERT INTO mcp_oauth_clients(client_id,client_name,redirect_uris) VALUES ($1,$2,$3)", clientID, name, jsonRedirect); err != nil {
		oauthError(w, 500, "server_error")
		return
	}
	// No registration_client_uri: this DCR server does not support client edit/read APIs.
	oauthJson(w, 201, map[string]any{"client_id": clientID, "client_name": name, "redirect_uris": in.RedirectURIs,
		"grant_types": []string{"authorization_code", "refresh_token"}, "response_types": []string{"code"}, "token_endpoint_auth_method": "none"})
}

func (a *server) oauthClientRedirect(clientID, redirect string) bool {
	var raw []byte
	if err := a.db.QueryRow("SELECT redirect_uris FROM mcp_oauth_clients WHERE client_id=$1", clientID).Scan(&raw); err != nil {
		return false
	}
	var urls []string
	if json.Unmarshal(raw, &urls) != nil {
		return false
	}
	for _, candidate := range urls {
		if candidate == redirect && oauthRedirectAllowed(candidate) {
			return true
		}
	}
	return false
}

const oauthPage = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Quản gia · Kết nối ChatGPT</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#f4f9f8;min-height:100vh;display:grid;place-items:center;margin:0;color:#193949}
main{max-width:450px;width:calc(100% - 44px);background:white;border-radius:18px;padding:25px;box-shadow:0 12px 45px #1939491a}
h1{font-size:22px;margin:10px 0}p{line-height:1.7;color:#5a7180;font-size:13px}label{display:grid;gap:7px;font-size:13px;font-weight:650;margin-top:16px}
input{border:1px solid #d1dfdf;border-radius:9px;padding:13px;font-size:14px}button{width:100%;border:0;border-radius:9px;padding:14px;margin-top:20px;background:#098a73;color:white;font-weight:800;cursor:pointer}
small{color:#9b5a3a}ul{font-size:13px;line-height:1.7;color:#526d7b}</style></head><body><main>
<p>🔒 <b>Quản gia tài chính</b> · Kết nối MCP</p><h1>Cho phép ChatGPT đọc thông tin tài chính?</h1>
<p>Bạn đang cấp quyền cho một kết nối bên ngoài. Hãy xác nhận đây là yêu cầu do bạn chủ động thực hiện.</p>
<ul><li>Đọc tổng hợp thu chi, lịch thanh toán và hạn mức chi.</li><li>Không đọc mã thẻ, OTP hay mật khẩu.</li><li>Không được tạo, sửa hoặc xóa giao dịch.</li></ul>
<form method="post" action="/oauth/authorize" autocomplete="off">
<input type="hidden" name="request_id" value="{{.RequestID}}">
<label>Email tài khoản Quản gia<input name="email" type="email" required autocomplete="username" maxlength="254"></label>
<label>Mật khẩu Quản gia<input name="password" type="password" required autocomplete="current-password" minlength="12"></label>
<label><input style="margin-right:6px" type="checkbox" name="consent" value="yes" required> Tôi cho phép đọc dữ liệu theo phạm vi này.</label>
<button type="submit">Đăng nhập và cấp quyền đọc</button></form>
<p><small>{{.Error}}</small></p><p>Chỉ tiếp tục nếu đường dẫn trình duyệt bắt đầu bằng <b>{{.Issuer}}</b>. Đóng trang để hủy.</p>
</main></body></html>`

var oauthPageTemplate = template.Must(template.New("oauth").Parse(oauthPage))

func oauthHTML(w http.ResponseWriter, requestID, errorText string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	_ = oauthPageTemplate.Execute(w, map[string]string{"RequestID": requestID, "Issuer": oauthOrigin(), "Error": errorText})
}

func (a *server) oauthAuthorize(w http.ResponseWriter, r *http.Request) {
	if oauthOrigin() == "" {
		oauthError(w, 503, "mcp_oauth_not_configured")
		return
	}
	if r.Method == "GET" {
		q := r.URL.Query()
		clientID, redirect := q.Get("client_id"), q.Get("redirect_uri")
		challenge, scope, resource, state := q.Get("code_challenge"), q.Get("scope"), q.Get("resource"), q.Get("state")
		if q.Get("response_type") != "code" || q.Get("code_challenge_method") != "S256" || !pkcePattern.MatchString(challenge) ||
			!oauthValidScope(scope) || resource != oauthResource() || len(state) < 12 || len(state) > 1024 || !oauthRedirectAllowed(redirect) || !a.oauthClientRedirect(clientID, redirect) {
			oauthError(w, 400, "invalid_request")
			return
		}
		raw, err := oauthRandom()
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		_, err = a.db.ExecContext(r.Context(), `INSERT INTO mcp_oauth_pending(id_hash,client_id,redirect_uri,code_challenge,scope,resource,state,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')`,
			oauthHash(raw), clientID, redirect, challenge, scope, resource, state)
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		oauthHTML(w, raw, "")
		return
	}
	if r.Method != "POST" {
		oauthError(w, 405, "invalid_request")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := r.ParseForm(); err != nil {
		oauthError(w, 400, "invalid_request")
		return
	}
	requestID := r.Form.Get("request_id")
	if len(requestID) < 32 || len(requestID) > 100 || r.Form.Get("consent") != "yes" {
		oauthError(w, 400, "access_denied")
		return
	}
	// The rate limiter covers both account and remote address.
	email := normalizedEmail(r.Form.Get("email"))
	if !a.throttle(w, r, email) {
		return
	}
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		oauthError(w, 500, "server_error")
		return
	}
	defer tx.Rollback()
	var clientID, redirect, challenge, scope, resource, state string
	err = tx.QueryRowContext(r.Context(), `SELECT client_id,redirect_uri,code_challenge,scope,resource,state
   FROM mcp_oauth_pending WHERE id_hash=$1 AND expires_at>now() FOR UPDATE`, oauthHash(requestID)).
		Scan(&clientID, &redirect, &challenge, &scope, &resource, &state)
	if err != nil {
		oauthError(w, 400, "invalid_request")
		return
	}
	var u user
	var hashed string
	err = tx.QueryRowContext(r.Context(), "SELECT id,email,password_hash FROM users WHERE email=$1", email).Scan(&u.ID, &u.Email, &hashed)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hashed), []byte(r.Form.Get("password"))) != nil {
		oauthHTML(w, requestID, "Email hoặc mật khẩu không chính xác.")
		return
	}
	raw, err := oauthRandom()
	if err != nil {
		oauthError(w, 500, "server_error")
		return
	}
	if _, err = tx.ExecContext(r.Context(), `DELETE FROM mcp_oauth_pending WHERE id_hash=$1`, oauthHash(requestID)); err != nil {
		oauthError(w, 500, "server_error")
		return
	}
	_, err = tx.ExecContext(r.Context(), `INSERT INTO mcp_oauth_codes(code_hash,user_id,client_id,redirect_uri,code_challenge,scope,resource,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`,
		oauthHash(raw), u.ID, clientID, redirect, challenge, scope, resource)
	if err != nil {
		oauthError(w, 500, "server_error")
		return
	}
	if err = tx.Commit(); err != nil {
		oauthError(w, 500, "server_error")
		return
	}
	target, _ := url.Parse(redirect)
	q := target.Query()
	q.Set("code", raw)
	q.Set("state", state)
	q.Set("iss", oauthOrigin())
	target.RawQuery = q.Encode()
	http.Redirect(w, r, target.String(), http.StatusSeeOther)
}
