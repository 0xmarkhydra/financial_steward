package main

import (
	"financialsteward/backend/internal/finance"
	"testing"
	"time"
)

func TestSpendingBehaviorAggregates(t *testing.T) {
	d := finance.Empty()
	d.Preferences.MonthlyIncome = 20000000
	d.Preferences.Essentials = 7000000
	d.Preferences.Reserve = 3000000
	d.Transactions = []finance.Transaction{
		{ID: "x", Type: "expense", Amount: 2000000, Category: "food", Date: "2026-10-07", Need: "essential", Trigger: "planned", Note: "private note"},
		{ID: "y", Type: "expense", Amount: 1000000, Category: "shopping", Date: "2026-10-09", Need: "flexible", Trigger: "impulse", Note: "private note"},
		{ID: "z", Type: "expense", Amount: 500000, Category: "shopping", Date: "2026-09-12", Need: "flexible", Trigger: "planned"},
	}
	result := spendingBehaviorMCP(d, time.Date(2026, 10, 11, 10, 0, 0, 0, time.FixedZone("ICT", 7*3600)), 4000000).(map[string]any)
	if result["estimatedFlexibleMonthlyLimit"].(float64) != 6000000 {
		t.Fatal(result)
	}
	if result["estimatedFlexibleRemaining"].(float64) != 5000000 {
		t.Fatal(result)
	}
	if result["impulsiveOrEmotionDrivenSpent"].(float64) != 1000000 {
		t.Fatal(result)
	}
	if result["expenseTransactions"].(int) != 2 || result["labeledTransactions"].(int) != 2 {
		t.Fatal(result)
	}
}
func TestSpendingWithoutIncomeDoesNotRecommend(t *testing.T) {
	d := finance.Empty()
	result := spendingBehaviorMCP(d, time.Date(2026, 10, 11, 10, 0, 0, 0, time.UTC), 0).(map[string]any)
	if result["estimatedFlexibleDailyLimit"].(float64) != 0 {
		t.Fatal(result)
	}
}
