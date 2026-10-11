package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestMCPAuthMetadataAndChallenge(t *testing.T) {
	t.Setenv("MCP_PUBLIC_ORIGIN", "https://api-quan-gia.codelocal.cloud")
	a := &server{}
	protected := httptest.NewRecorder()
	a.protectedMetadata(protected, httptest.NewRequest(http.MethodGet, "https://api-quan-gia.codelocal.cloud/.well-known/oauth-protected-resource/mcp", nil))
	if protected.Code != 200 {
		t.Fatal(protected.Code)
	}
	var resource map[string]any
	if err := json.Unmarshal(protected.Body.Bytes(), &resource); err != nil {
		t.Fatal(err)
	}
	if resource["resource"] != "https://api-quan-gia.codelocal.cloud/mcp" {
		t.Fatal(resource)
	}
	authServers := resource["authorization_servers"].([]any)
	if len(authServers) != 1 || authServers[0] != "https://api-quan-gia.codelocal.cloud" {
		t.Fatal(authServers)
	}
	metadata := httptest.NewRecorder()
	a.authServerMetadata(metadata, httptest.NewRequest(http.MethodGet, "/.well-known/oauth-authorization-server", nil))
	if metadata.Code != 200 {
		t.Fatal(metadata.Code)
	}
	var auth map[string]any
	if err := json.Unmarshal(metadata.Body.Bytes(), &auth); err != nil {
		t.Fatal(err)
	}
	if auth["issuer"] != "https://api-quan-gia.codelocal.cloud" {
		t.Fatal(auth)
	}
	if auth["authorization_endpoint"] != "https://api-quan-gia.codelocal.cloud/oauth/authorize" {
		t.Fatal(auth)
	}
	if auth["token_endpoint"] != "https://api-quan-gia.codelocal.cloud/oauth/token" {
		t.Fatal(auth)
	}
	if auth["registration_endpoint"] != "https://api-quan-gia.codelocal.cloud/oauth/register" {
		t.Fatal(auth)
	}
	response := httptest.NewRecorder()
	oauthChallenge(response)
	if response.Code != 401 || !strings.Contains(response.Header().Get("WWW-Authenticate"), "oauth-protected-resource/mcp") {
		t.Fatal(response.Code, response.Header())
	}
}
func TestMCPAuthRejectsInvalidPKCEAndOpenRedirects(t *testing.T) {
	t.Setenv("MCP_PUBLIC_ORIGIN", "https://api-quan-gia.codelocal.cloud")
	cases := []string{
		"https://evil.example/callback",
		"https://chatgpt.com.evil.test/connector_platform_oauth_redirect",
		"http://chatgpt.com/connector_platform_oauth_redirect",
		"https://chatgpt.com/connector/oauth/1234?goto=https://evil.example",
		"https://chatgpt.com/connector/oauth/../bad",
	}
	for _, uri := range cases {
		if oauthRedirectAllowed(uri) {
			t.Errorf("accepted evil redirect %s", uri)
		}
	}
	if !oauthRedirectAllowed("https://chatgpt.com/connector_platform_oauth_redirect") {
		t.Fatal("stable callback denied")
	}
	if !oauthRedirectAllowed("https://chatgpt.com/connector/oauth/abC123-_9") {
		t.Fatal("scoped callback denied")
	}
	if oauthValidScope("finance:write") || oauthValidScope("finance:read finance:write") || oauthValidScope("finance:read finance:read") {
		t.Fatal("unexpected scope granted")
	}
	if !oauthValidScope("finance:read offline_access") {
		t.Fatal("offline access read-only scope missing")
	}
	verifier := "0123456789abcdefghijklmnopqrstuvwxyz-_ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	digest := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(digest[:])
	if !oauthPKCE(verifier, challenge) || oauthPKCE(verifier+"x", challenge) || oauthPKCE("short", challenge) {
		t.Fatal("PKCE validation failed")
	}
	a := &server{}
	q := url.Values{"client_id": {"unknown"}, "redirect_uri": {"https://evil.example"},
		"response_type": {"code"}, "resource": {oauthResource()}, "scope": {"finance:read"},
		"state": {"state-sufficient-length"}, "code_challenge_method": {"S256"}, "code_challenge": {challenge}}
	w := httptest.NewRecorder()
	a.oauthAuthorize(w, httptest.NewRequest("GET", "/oauth/authorize?"+q.Encode(), nil))
	if w.Code != 400 {
		t.Fatal("unsafe authorization accepted", w.Code)
	}
}
func TestMCPAuthFailsClosedWithoutConfiguredOrigin(t *testing.T) {
	t.Setenv("MCP_PUBLIC_ORIGIN", "")
	w := httptest.NewRecorder()
	(&server{}).protectedMetadata(w, httptest.NewRequest("GET", "/.well-known/oauth-protected-resource", nil))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
	if oauthOrigin() != "" {
		t.Fatal("unconfigured issuer not empty")
	}
	for _, bad := range []string{"http://api.example.com", "https://a.example/mcp", "https://evil.com?query=1"} {
		t.Setenv("MCP_PUBLIC_ORIGIN", bad)
		if oauthOrigin() != "" {
			t.Fatal("unsafe issuer", bad)
		}
	}
}
