package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"
)

func oauthTokenResponse(w http.ResponseWriter, access, refresh, scope string) {
	payload := map[string]any{"access_token": access, "token_type": "Bearer", "expires_in": int(oauthAccessTTL.Seconds()), "scope": scope}
	if refresh != "" {
		payload["refresh_token"] = refresh
	}
	oauthJson(w, 200, payload)
}
func oauthPKCE(verifier, challenge string) bool {
	if len(verifier) < 43 || len(verifier) > 128 {
		return false
	}
	for _, char := range verifier {
		if !strings.ContainsRune("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", char) {
			return false
		}
	}
	h := sha256.Sum256([]byte(verifier))
	expected := base64.RawURLEncoding.EncodeToString(h[:])
	return subtle.ConstantTimeCompare([]byte(expected), []byte(challenge)) == 1
}
func (a *server) oauthToken(w http.ResponseWriter, r *http.Request) {
	if oauthOrigin() == "" {
		oauthError(w, 503, "mcp_oauth_not_configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if err := r.ParseForm(); err != nil {
		oauthError(w, 400, "invalid_request")
		return
	}
	clientID := r.PostForm.Get("client_id")
	if len(clientID) < 10 || len(clientID) > 150 {
		oauthError(w, 401, "invalid_client")
		return
	}
	switch r.PostForm.Get("grant_type") {
	case "authorization_code":
		code, redirect, verifier := r.PostForm.Get("code"), r.PostForm.Get("redirect_uri"), r.PostForm.Get("code_verifier")
		resource := r.PostForm.Get("resource")
		if code == "" || !oauthRedirectAllowed(redirect) || resource != oauthResource() {
			oauthError(w, 400, "invalid_grant")
			return
		}
		tx, err := a.db.BeginTx(r.Context(), nil)
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		defer tx.Rollback()
		var u, storedClient, storedRedirect, challenge, scope, storedResource string
		err = tx.QueryRowContext(r.Context(), `SELECT user_id,client_id,redirect_uri,code_challenge,scope,resource
   FROM mcp_oauth_codes WHERE code_hash=$1 AND expires_at>now() FOR UPDATE`, oauthHash(code)).
			Scan(&u, &storedClient, &storedRedirect, &challenge, &scope, &storedResource)
		if err != nil {
			oauthError(w, 400, "invalid_grant")
			return
		}
		if storedClient != clientID || storedRedirect != redirect || storedResource != resource || !oauthPKCE(verifier, challenge) {
			oauthError(w, 400, "invalid_grant")
			return
		}
		access, err := oauthRandom()
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		refresh := ""
		if oauthHasScope(scope, oauthOfflineScope) {
			refresh, err = oauthRandom()
			if err != nil {
				oauthError(w, 500, "server_error")
				return
			}
		}
		tokenID, err := id()
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		var refreshHash, refreshExpires any
		if refresh != "" {
			refreshHash = oauthHash(refresh)
			refreshExpires = time.Now().Add(oauthRefreshTTL)
		}
		if _, err = tx.ExecContext(r.Context(), `INSERT INTO mcp_oauth_tokens(id,user_id,client_id,access_hash,refresh_hash,scope,resource,access_expires_at,refresh_expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '15 minutes',$8)`,
			tokenID, u, clientID, oauthHash(access), refreshHash, scope, resource, refreshExpires); err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		if _, err = tx.ExecContext(r.Context(), "DELETE FROM mcp_oauth_codes WHERE code_hash=$1", oauthHash(code)); err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		if tx.Commit() != nil {
			oauthError(w, 500, "server_error")
			return
		}
		oauthTokenResponse(w, access, refresh, scope)
	case "refresh_token":
		raw := r.PostForm.Get("refresh_token")
		resource := r.PostForm.Get("resource")
		if len(raw) < 32 || resource != oauthResource() {
			oauthError(w, 400, "invalid_grant")
			return
		}
		tx, err := a.db.BeginTx(r.Context(), nil)
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		defer tx.Rollback()
		var tokenID, storedClient, scope, storedResource string
		err = tx.QueryRowContext(r.Context(), `SELECT id,client_id,scope,resource
   FROM mcp_oauth_tokens WHERE refresh_hash=$1 AND refresh_expires_at>now() FOR UPDATE`, oauthHash(raw)).
			Scan(&tokenID, &storedClient, &scope, &storedResource)
		if err != nil {
			oauthError(w, 400, "invalid_grant")
			return
		}
		if storedClient != clientID || storedResource != resource {
			oauthError(w, 400, "invalid_grant")
			return
		}
		access, err := oauthRandom()
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		refresh, err := oauthRandom()
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		_, err = tx.ExecContext(r.Context(), `UPDATE mcp_oauth_tokens
   SET access_hash=$1,refresh_hash=$2,access_expires_at=now()+interval '15 minutes',refresh_expires_at=now()+interval '30 days'
   WHERE id=$3`, oauthHash(access), oauthHash(refresh), tokenID)
		if err != nil {
			oauthError(w, 500, "server_error")
			return
		}
		if tx.Commit() != nil {
			oauthError(w, 500, "server_error")
			return
		}
		oauthTokenResponse(w, access, refresh, scope)
	default:
		oauthError(w, 400, "unsupported_grant_type")
	}
}

// OAuth tokens are accepted ONLY at MCP. Application sessions continue to work
// for its own PWA and legacy first-party MCP clients.
func (a *server) mcpWithAuth(next func(http.ResponseWriter, *http.Request, session)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Always provide challenge metadata for discovery, including unauthenticated GETs.
		if r.Method != "POST" {
			if r.Method == "GET" {
				w.Header().Set("Allow", "POST")
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}
			w.Header().Set("Allow", "POST")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") || len(header) > 200 {
			oauthChallenge(w)
			return
		}
		raw := strings.TrimPrefix(header, "Bearer ")
		h := oauthHash(raw)
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		defer cancel()
		var u user
		var scope, resource string
		err := a.db.QueryRowContext(ctx, `SELECT u.id,u.email,t.scope,t.resource
   FROM mcp_oauth_tokens t JOIN users u ON u.id=t.user_id
   WHERE t.access_hash=$1 AND t.access_expires_at>now()`, h).Scan(&u.ID, &u.Email, &scope, &resource)
		if err == nil {
			if !oauthHasScope(scope, oauthReadScope) || resource != oauthResource() {
				oauthChallenge(w)
				return
			}
			next(w, r.WithContext(ctx), session{user: u, hash: h})
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			oauthError(w, 500, "server_error")
			return
		}
		// First-party fallback for existing mobile/web integrations. Never use
		// an OAuth access token to authenticate unrelated REST routes.
		var existing user
		err = a.db.QueryRowContext(ctx, `SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id
   WHERE s.token_hash=$1 AND s.expires_at>now()`, h).Scan(&existing.ID, &existing.Email)
		if err != nil {
			oauthChallenge(w)
			return
		}
		next(w, r.WithContext(ctx), session{user: existing, hash: h})
	}
}
