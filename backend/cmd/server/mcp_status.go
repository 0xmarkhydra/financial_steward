package main

import "net/http"

func (a *server) mcpOAuthStatus(w http.ResponseWriter, r *http.Request, s session) {
	origin := oauthOrigin()
	count := 0
	if err := a.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM mcp_oauth_tokens
 WHERE user_id=$1 AND (access_expires_at>now() OR refresh_expires_at>now())`, s.user.ID).Scan(&count); err != nil {
		fail(w, 500, "Không thể đọc trạng thái OAuth.")
		return
	}
	response(w, 200, map[string]any{"configured": origin != "", "endpoint": oauthResource(),
		"authorizedConnections": count, "oauthIssuer": origin})
}
