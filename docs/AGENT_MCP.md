# Financial Steward Agent & MCP (prototype)

## Implemented
- In-app rule-based financial agent: debt priority, repayment projection, debt rollover risks, upcoming deadlines, negative cash flow, minimum-payment shortfall. No external LLM calls.
- Rollover planner: track due dates, fees, funding sources and status. Completing a rollover does NOT change principal automatically.
- Go JSON-RPC endpoint POST /mcp with three **read-only** tools: get_financial_summary, list_upcoming_payments, suggest_spending_budget.
- Every /mcp request requires the existing account bearer token and reads ONLY that account's finance state. Never expose bearer tokens in prompts, logs or public repositories.

## NOT YET READY FOR CHATGPT REMOTE MCP CONNECTION
This is an authenticated JSON-RPC/MCP foundation, not a production ChatGPT connector. Before publishing, implement standards-compliant Streamable HTTP MCP transport (including protocol/session negotiation and required headers), OAuth 2.1 authorization code + PKCE with authorization-server metadata, per-tool scope/consent, audience validation, HTTPS and security tests. ChatGPT must authorize each account; never use a shared API token.

## Notifications
The agent currently calculates warnings on screen only. Server-side scheduled checks, notification delivery, push permissions, deduplication and notification history remain TODO.

## Data safety
No automated payments, loans, rollovers or state writes from MCP. The financial numbers are estimates from user-entered records. Never request card PAN, CVV, bank password or OTP.
