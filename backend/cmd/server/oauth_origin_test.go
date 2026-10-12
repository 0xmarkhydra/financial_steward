package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOAuthBrowserNavigationOriginWithoutWideningAPICORS(t *testing.T) {
	t.Setenv("MCP_PUBLIC_ORIGIN", "https://api-quan-gia.codelocal.cloud")
	a := &server{origins: map[string]bool{"https://quan-gia.codelocal.cloud": true}}
	h := a.middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))
	test := func(method, path, origin string, status int, cors string) {
		t.Helper()
		r := httptest.NewRequest(method, path, nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if method == "GET" && path == "/oauth/authorize" {
			r.Header.Set("Sec-Fetch-Mode", "navigate")
			r.Header.Set("Sec-Fetch-Dest", "document")
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != status {
			t.Errorf("%s %s from %s got %d, want %d", method, path, origin, w.Code, status)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != cors {
			t.Errorf("%s %s from %s got CORS %q want %q", method, path, origin, got, cors)
		}
	}
	test("GET", "/oauth/authorize", "https://chatgpt.com", 200, "")
	test("GET", "/oauth/authorize", "https://evil.example", 200, "")
	test("POST", "/oauth/authorize", "https://api-quan-gia.codelocal.cloud", 200, "")
	test("POST", "/oauth/authorize", "https://chatgpt.com", 403, "")
	test("POST", "/oauth/authorize", "https://evil.example", 403, "")
	test("POST", "/oauth/token", "https://chatgpt.com", 403, "")
	test("POST", "/mcp", "https://chatgpt.com", 403, "")
	test("GET", "/api/v1/state", "https://chatgpt.com", 403, "")
	test("OPTIONS", "/api/v1/state", "https://chatgpt.com", 403, "")
	test("GET", "/api/v1/state", "https://quan-gia.codelocal.cloud", 200, "https://quan-gia.codelocal.cloud")
	test("POST", "/oauth/authorize", "https://quan-gia.codelocal.cloud", 200, "https://quan-gia.codelocal.cloud")
}
