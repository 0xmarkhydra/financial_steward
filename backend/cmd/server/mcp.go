package main

import (
	"encoding/json"
	"financialsteward/backend/internal/finance"
	"net/http"
	"sort"
	"time"
)

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}
type mcpResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   any             `json:"error,omitempty"`
}

func (a *server) mcp(w http.ResponseWriter, r *http.Request, s session) {
	if r.Method != http.MethodPost {
		fail(w, 405, "MCP chỉ hỗ trợ POST.")
		return
	}
	var req mcpRequest
	if !decode(w, r, &req) {
		return
	}
	if req.Method == "notifications/initialized" {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	if len(req.ID) == 0 {
		response(w, 400, mcpResponse{JSONRPC: "2.0", Error: map[string]any{"code": -32600, "message": "Request id required"}})
		return
	}
	if req.JSONRPC != "2.0" || req.Method == "" {
		response(w, 400, mcpResponse{JSONRPC: "2.0", ID: req.ID, Error: map[string]any{"code": -32600, "message": "Invalid Request"}})
		return
	}
	var result any
	switch req.Method {
	case "initialize":
		result = map[string]any{"protocolVersion": "2025-03-26", "capabilities": map[string]any{"tools": map[string]any{}}, "serverInfo": map[string]any{"name": "financial-steward", "version": "0.1.0"}}
	case "ping":
		result = map[string]any{}

	case "tools/list":
		result = map[string]any{"tools": []any{
			map[string]any{"name": "get_financial_summary", "description": "Read-only financial summary for the authenticated account; amounts in VND.", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}},
			map[string]any{"name": "list_upcoming_payments", "description": "Read-only upcoming debt and rollover deadlines, 30 days. Dates are approximate for recurring debts.", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}},
			map[string]any{"name": "suggest_spending_budget", "description": "Read-only budget guidance using user-provided monthly income, essentials, reserve and debt minimums.", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}},
			map[string]any{"name": "analyze_spending_behavior", "description": "Read-only aggregated spending habits and estimated discretionary budget; never returns raw transaction notes.", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}},
		}}
	case "tools/call":
		var p struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			response(w, 200, mcpResponse{JSONRPC: "2.0", ID: req.ID, Error: map[string]any{"code": -32602, "message": "Invalid params"}})
			return
		}
		if p.Name != "get_financial_summary" && p.Name != "list_upcoming_payments" && p.Name != "suggest_spending_budget" && p.Name != "analyze_spending_behavior" {
			response(w, 200, mcpResponse{JSONRPC: "2.0", ID: req.ID, Error: map[string]any{"code": -32602, "message": "Unknown tool"}})
			return
		}
		var raw []byte
		if err := a.db.QueryRowContext(r.Context(), "SELECT data FROM financial_states WHERE user_id=$1", s.user.ID).Scan(&raw); err != nil {
			fail(w, 500, "Không thể đọc dữ liệu.")
			return
		}
		data, err := finance.Decode(raw)
		if err != nil {
			fail(w, 500, "Dữ liệu tài chính không hợp lệ.")
			return
		}
		output := mcpFinanceOutput(data, p.Name)
		bytes, _ := json.Marshal(output)
		result = map[string]any{"content": []any{map[string]any{"type": "text", "text": string(bytes)}}, "isError": false}
	default:
		response(w, 200, mcpResponse{JSONRPC: "2.0", ID: req.ID, Error: map[string]any{"code": -32601, "message": "Method not found"}})
		return
	}
	response(w, 200, mcpResponse{JSONRPC: "2.0", ID: req.ID, Result: result})
}

// mcpFinanceOutput uses Vietnam local calendar dates, not the server's UTC date.
func mcpFinanceOutput(d finance.Data, tool string) any {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		loc = time.FixedZone("ICT", 7*60*60)
	}
	return mcpFinanceOutputAt(d, tool, time.Now().In(loc))
}

// mcpFinanceOutputAt is intentionally pure so the date-sensitive rules can be tested.
func mcpFinanceOutputAt(d finance.Data, tool string, now time.Time) any {
	today := now.Format("2006-01-02")
	debtTotal, minTotal := 0.0, 0.0
	for _, v := range d.Debts {
		if v.Balance <= 0 {
			continue
		}
		debtTotal += v.Balance
		minimum := v.Minimum
		if minimum > v.Balance {
			minimum = v.Balance
		}
		minTotal += minimum
	}
	if tool == "analyze_spending_behavior" {
		return spendingBehaviorMCP(d, now, minTotal)
	}
	if tool == "get_financial_summary" {
		income, expense, paid := 0.0, 0.0, 0.0
		month := now.Format("2006-01")
		for _, v := range d.Transactions {
			if len(v.Date) < 7 || v.Date[:7] != month {
				continue
			}
			if v.Type == "income" {
				income += v.Amount
			} else {
				expense += v.Amount
			}
		}
		for _, v := range d.Payments {
			if len(v.Date) >= 7 && v.Date[:7] == month {
				paid += v.Principal + v.Interest + v.Fee
			}
		}
		phuongIn, phuongOut := 0.0, 0.0
		for _, entry := range d.PhuongEntries {
			if len(entry.Date) < 7 || entry.Date[:7] != month {
				continue
			}
			if entry.Kind == "payout" {
				phuongIn += entry.Amount
			} else {
				phuongOut += entry.Amount
			}
		}
		return map[string]any{
			"currency": "VND", "asOf": today, "debtBalance": debtTotal,
			"monthlyDebtMinimum": minTotal, "monthIncomeRecorded": income,
			"monthExpenseRecorded": expense, "monthDebtPaid": paid,
			"phuongCashReceived": phuongIn, "phuongCashPaid": phuongOut,
			"monthNetRecorded": income + phuongIn - expense - paid - phuongOut,
			"note":             "Recorded transactions only; not a verified bank balance.",
		}
	}
	if tool == "suggest_spending_budget" {
		rawAvailable := d.Preferences.MonthlyIncome - d.Preferences.Essentials - d.Preferences.Reserve - minTotal - monthlyPhuongCommitment(d, now)
		available := rawAvailable
		if available < 0 {
			available = 0
		}
		shortfall := -rawAvailable
		if shortfall < 0 {
			shortfall = 0
		}
		return map[string]any{
			"currency": "VND", "asOf": today, "monthlyIncomeAssumed": d.Preferences.MonthlyIncome,
			"essentialsAssumed":          d.Preferences.Essentials,
			"reserveAssumed":             d.Preferences.Reserve,
			"minimumDebtPayments":        minTotal,
			"phuongCommitmentThisMonth":  monthlyPhuongCommitment(d, now),
			"discretionaryMonthlyBudget": available,
			"minimumPaymentShortfall":    shortfall,
			"warning":                    "Estimates depend on manually entered data. A minimum credit-card payment may be less than the full statement balance.",
		}
	}
	type due struct {
		Name   string  `json:"name"`
		Date   string  `json:"date"`
		Amount float64 `json:"amount"`
		Kind   string  `json:"kind"`
	}
	upcoming := make([]due, 0)
	end := now.AddDate(0, 0, 30).Format("2006-01-02")
	debtNames := map[string]string{}
	for _, v := range d.Debts {
		debtNames[v.ID] = v.Name
	}
	for _, v := range d.Rollovers {
		if v.Status == "planned" && v.DueDate <= end {
			name := debtNames[v.DebtID]
			if name == "" {
				name = "Khoản nợ"
			}
			upcoming = append(upcoming, due{Name: "Đáo hạn: " + name, Date: v.DueDate, Amount: v.Amount, Kind: "rollover"})
		}
	}
	// Anchoring on day 1 prevents Go AddDate from skipping February/short months.
	for _, v := range d.Debts {
		if v.Balance <= 0 {
			continue
		}
		year, month, _ := now.Date()
		for offset := 0; offset < 3; offset++ {
			first := time.Date(year, month+time.Month(offset), 1, 0, 0, 0, 0, now.Location())
			y, m, _ := first.Date()
			last := time.Date(y, m+1, 0, 0, 0, 0, 0, now.Location()).Day()
			day := v.DueDay
			if day > last {
				day = last
			}
			date := time.Date(y, m, day, 0, 0, 0, 0, now.Location()).Format("2006-01-02")
			if date >= today && date <= end {
				minimum := v.Minimum
				if minimum > v.Balance {
					minimum = v.Balance
				}
				upcoming = append(upcoming, due{Name: v.Name, Date: date, Amount: minimum, Kind: "recurring_estimate"})
			}
		}
	}
	sort.SliceStable(upcoming, func(i, j int) bool { return upcoming[i].Date < upcoming[j].Date })
	return map[string]any{
		"asOf": today, "currency": "VND", "deadlines": upcoming,
		"note": "Recurring dates are estimates and may not reflect actual credit-card statement cycles, amounts already paid, or changed loan terms.",
	}
}
