package main

import (
	"financialsteward/backend/internal/finance"
	"testing"
	"time"
)

func TestDailyPhuongCommitmentsAndMCPBudget(t *testing.T) {
	d := finance.Empty()
	d.Preferences.MonthlyIncome = 10000000
	d.Preferences.Essentials = 3000000
	d.Preferences.Reserve = 1000000
	d.PhuongGroups = []finance.PhuongGroup{{ID: "day", Name: "Dây phường ngày", Role: "member", Contribution: 200000, Cycle: "daily",
		StartDate: "2026-10-12", Rounds: 30, PayoutRound: 12, Status: "active"}}
	d.PhuongEntries = []finance.PhuongEntry{{ID: "first", GroupID: "day", Date: "2026-10-12", Round: 1, Kind: "contribution", Amount: 200000}}
	d.AgentChat = []finance.AgentMessage{{ID: "a", Role: "user", Content: "Tôi chơi phường ngày", CreatedAt: "2026-10-12"}}
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 12, 12, 0, 0, 0, time.FixedZone("ICT", 7*3600))
	if n := monthlyPhuongCommitment(d, now); n != 4000000 {
		t.Fatalf("October needs 20 rounds, got %v", n)
	}
	result := mcpFinanceOutputAt(d, "suggest_spending_budget", now).(map[string]any)
	if result["phuongCommitmentThisMonth"].(float64) != 4000000 {
		t.Fatal(result)
	}
	if result["discretionaryMonthlyBudget"].(float64) != 2000000 {
		t.Fatal(result)
	}
	d.PhuongGroups[0].Cycle = "invalid"
	if err := d.Validate(); err == nil {
		t.Fatal("illegal cycle accepted")
	}
}
func TestPhuongJournalRecordsNotChat(t *testing.T) {
	d := finance.Empty()
	d.PhuongGroups = []finance.PhuongGroup{{ID: "group", Name: "Dây A", Role: "member", Contribution: 100000, Cycle: "daily", StartDate: "2026-10-12", Rounds: 30, Status: "active"}}
	d.AgentChat = []finance.AgentMessage{{ID: "secret", Role: "user", Content: "Private chat text", CreatedAt: "2026-10-12"}}
	changes := financeStateChanges(finance.Empty(), d)
	if len(changes) != 1 || changes[0].Kind != "phuong_group" {
		t.Fatal(changes)
	}
}
