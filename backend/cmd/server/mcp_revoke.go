package main

import "net/http"

// Revokes all MCP OAuth tokens for the signed-in financial-steward account,
// leaving the PWA session intact. Existing authorized codes also become invalid.
func (a *server) revokeMCPAccess(w http.ResponseWriter, r *http.Request, s session) {
	tx, err := a.db.BeginTx(r.Context(), nil)
	if err != nil {
		fail(w, 500, "Không thể bắt đầu thu hồi quyền.")
		return
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(r.Context(), "DELETE FROM mcp_oauth_codes WHERE user_id=$1", s.user.ID); err != nil {
		fail(w, 500, "Không thể thu hồi mã cấp quyền.")
		return
	}
	if _, err = tx.ExecContext(r.Context(), "DELETE FROM mcp_oauth_tokens WHERE user_id=$1", s.user.ID); err != nil {
		fail(w, 500, "Không thể thu hồi phiên MCP.")
		return
	}
	if err = tx.Commit(); err != nil {
		fail(w, 500, "Không thể hoàn tất thu hồi quyền.")
		return
	}
	response(w, 200, map[string]bool{"revoked": true})
}
