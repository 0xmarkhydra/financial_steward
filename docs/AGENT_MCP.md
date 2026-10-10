# Financial Steward Agent & MCP (prototype)

## Implemented
- In-app rule-based financial agent: debt priority, repayment projection, debt rollover risks, upcoming deadlines, negative cash flow, minimum-payment shortfall. No external LLM calls.
- Rollover planner: track due dates, fees, funding sources and status. Completing a rollover does NOT change principal automatically.
- Go JSON-RPC endpoint POST /mcp with three **read-only** tools: get_financial_summary, list_upcoming_payments, suggest_spending_budget.
- Every /mcp request requires the existing account bearer token and reads ONLY that account's finance state. Never expose bearer tokens in prompts, logs or public repositories.

## NOT YET READY FOR CHATGPT REMOTE MCP CONNECTION
This is an authenticated JSON-RPC/MCP foundation, not a production ChatGPT connector. Before publishing, implement standards-compliant Streamable HTTP MCP transport (including protocol/session negotiation and required headers), OAuth 2.1 authorization code + PKCE with authorization-server metadata, per-tool scope/consent, audience validation, HTTPS and security tests. ChatGPT must authorize each account; never use a shared API token.

## Web guide and developer validation
The Quản gia web sidebar now includes **Kết nối ChatGPT**, with a clearly marked connection status, developer MCP endpoint, setup prerequisites, real-time authenticated `tools/list` diagnostics, and the three read-only tools.

Run `npm run smoke:staging` to verify all MCP tools with an automatically deleted test account as part of the Railway integration test. **Successful internal tests do not mean ChatGPT can connect.**

Once the compliant remote MCP transport and per-user OAuth are implemented, the user can use ChatGPT web > Settings > Apps > Create (where developer mode and custom apps are supported), enter the public MCP URL, authorize the Quản gia account using OAuth, scan tools, then select the custom app in chat. The exact UI and plan eligibility follow OpenAI's current documentation: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

Never display, export, or copy account bearer tokens in the PWA's connection guide. Do not publish the current bearer-only /mcp endpoint as a ChatGPT-ready connector.

## Notifications
The agent currently calculates warnings on screen only. Server-side scheduled checks, notification delivery, push permissions, deduplication and notification history remain TODO.

## Data safety
No automated payments, loans, rollovers or state writes from MCP. The financial numbers are estimates from user-entered records. Never request card PAN, CVV, bank password or OTP.
