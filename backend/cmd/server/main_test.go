package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestValidEmail(t *testing.T) {
	for _, email := range []string{"user@example.com", "UPPER@EXAMPLE.COM"} {
		if !validEmail(email) {
			t.Errorf("valid email rejected: %s", email)
		}
	}
	for _, email := range []string{"", "bad value@example.com", "just-text", "a@", "foo@example.com\n"} {
		if validEmail(email) {
			t.Errorf("invalid email accepted: %q", email)
		}
	}
}
func TestCORS(t *testing.T) {
	a := &server{origins: map[string]bool{"https://financial.example": true}}
	handler := a.middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }))
	allowed := httptest.NewRequest("GET", "/api/v1/state", nil)
	allowed.Header.Set("Origin", "https://financial.example")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, allowed)
	if w.Code != 200 || w.Header().Get("Access-Control-Allow-Origin") != "https://financial.example" {
		t.Fatalf("allowed CORS: %d, %s", w.Code, w.Header().Get("Access-Control-Allow-Origin"))
	}
	disallowed := httptest.NewRequest("GET", "/api/v1/state", nil)
	disallowed.Header.Set("Origin", "https://evil.example")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, disallowed)
	if w.Code != 403 {
		t.Errorf("disallowed origin got status %d", w.Code)
	}
}
func TestRateLimitSeparatesAccounts(t *testing.T) {
	a := &server{attempts: map[string]attempt{}}
	r := httptest.NewRequest("POST", "/api/v1/auth/login", nil)
	r.RemoteAddr = "127.0.0.1:51234"
	for i := 0; i < 12; i++ {
		w := httptest.NewRecorder()
		if !a.throttle(w, r, "somebody@example.com") {
			t.Fatalf("attempt %d unexpectedly blocked", i)
		}
	}
	w := httptest.NewRecorder()
	if a.throttle(w, r, "somebody@example.com") || w.Code != 429 {
		t.Fatal("throttle did not reject 13th attempt")
	}
	w = httptest.NewRecorder()
	if !a.throttle(w, r, "different@example.com") {
		t.Fatal("different email should use its own quota")
	}
}
