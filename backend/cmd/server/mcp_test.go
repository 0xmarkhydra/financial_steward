package main

import (
	"encoding/json"
	"financialsteward/backend/internal/finance"
	"testing"
	"time"
)

func TestMCPMonthEndAndSortedUpcoming(t *testing.T) {
	d := finance.Empty()
	d.Debts = []finance.Debt{{ID: "card", Name: "Thẻ A", Kind: "card", Original: 2000000, Balance: 2000000, Minimum: 100000, DueDay: 31, CreatedAt: "2026-01-01"}}
	d.Rollovers = []finance.Rollover{{ID: "roll1", DebtID: "card", Kind: "card", DueDate: "2026-02-02", Amount: 500000, Funding: "own", Status: "planned"}}
	now := time.Date(2026, 1, 31, 12, 0, 0, 0, time.FixedZone("ICT", 7*3600))
	output := mcpFinanceOutputAt(d, "list_upcoming_payments", now).(map[string]any)
	raw, err := json.Marshal(output["deadlines"])
	if err != nil {
		t.Fatal(err)
	}
	var deadlines []struct {
		Name   string  `json:"name"`
		Date   string  `json:"date"`
		Amount float64 `json:"amount"`
		Kind   string  `json:"kind"`
	}
	if err := json.Unmarshal(raw, &deadlines); err != nil {
		t.Fatal(err)
	}
	if len(deadlines) != 3 {
		t.Fatalf("expected Jan 31, Feb 2 and Feb 28; got %#v", deadlines)
	}
	if deadlines[0].Date != "2026-01-31" || deadlines[1].Date != "2026-02-02" || deadlines[2].Date != "2026-02-28" {
		t.Fatalf("wrong dates/order: %#v", deadlines)
	}
	if deadlines[1].Name != "Đáo hạn: Thẻ A" {
		t.Fatalf("rollover name must not leak raw internal id: %q", deadlines[1].Name)
	}
}
func TestMCPBudgetShortfall(t *testing.T) {
	d := finance.Empty()
	d.Preferences.MonthlyIncome = 10000000
	d.Preferences.Essentials = 7000000
	d.Preferences.Reserve = 1000000
	d.Debts = []finance.Debt{{ID: "loan", Name: "Vay", Kind: "bank", Original: 3000000, Balance: 3000000, Minimum: 2500000, DueDay: 10, CreatedAt: "2026-01-01"}}
	output := mcpFinanceOutputAt(d, "suggest_spending_budget", time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)).(map[string]any)
	if output["discretionaryMonthlyBudget"].(float64) != 0 || output["minimumPaymentShortfall"].(float64) != 500000 {
		t.Fatalf("wrong budget computation: %#v", output)
	}
}
