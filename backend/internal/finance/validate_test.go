package finance

import (
	"encoding/json"
	"testing"
)

func TestReconcilesPrincipal(t *testing.T) {
	d := Empty()
	d.Debts = append(d.Debts, Debt{ID: "debt-1", Name: "Vay", Kind: "bank", Original: 1000000, Balance: 700000, CreatedAt: "2026-10-01", DueDay: 10})
	d.Payments = append(d.Payments, Payment{ID: "payment-1", DebtID: "debt-1", Principal: 300000, Interest: 20000, Date: "2026-10-02"})
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	d.Debts[0].Balance = 200000
	if err := d.Validate(); err == nil {
		t.Fatal("expected reconciliation rejection")
	}
}
func TestRejectsUnknownFields(t *testing.T) {
	var d any = map[string]any{"version": 1, "debts": []any{}, "transactions": []any{}, "payments": []any{}, "budgets": []any{}, "preferences": map[string]any{"monthlyIncome": 0, "essentials": 0, "reserve": 0, "strategy": "avalanche"}, "malicious": "payload"}
	b, _ := json.Marshal(d)
	if _, err := Decode(b); err == nil {
		t.Fatal("unknown fields accepted")
	}
}
func TestEmpty(t *testing.T) {
	if err := Empty().Validate(); err != nil {
		t.Fatal(err)
	}
}
