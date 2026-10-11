package main

import (
	"financialsteward/backend/internal/finance"
	"testing"
)

func TestCalendarAuditOmitsPrivateNotes(t *testing.T) {
	before := finance.Empty()
	after := finance.Empty()
	after.CashPlans = []finance.CashPlan{{ID: "future", Title: "Khách A phải thu", Direction: "in", Amount: 3000000,
		DueDate: "2026-10-20", Status: "planned", Note: "Private account number should not enter audit"}}
	diff := financeStateChanges(before, after)
	if len(diff) != 1 || diff[0].Kind != "cash_plan" || diff[0].Action != "created" || diff[0].Amount != 3000000 {
		t.Fatal(diff)
	}
	if diff[0].Title != "Lịch thu/chi: Khách A phải thu" {
		t.Fatal(diff)
	}
	after.CashPlans[0].Status = "completed"
	after.CashPlans[0].CompletedAt = "2026-10-12"
	after.CashPlans[0].LinkedTransactionID = "income-1"
	after.Transactions = []finance.Transaction{{ID: "income-1", Type: "income", Amount: 3000000, Category: "Khác", Date: "2026-10-12", Note: "Theo lịch"}}
	changed := financeStateChanges(before, after)
	if len(changed) != 2 {
		t.Fatal(changed)
	}
}
