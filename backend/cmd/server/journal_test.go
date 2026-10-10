package main

import (
	"financialsteward/backend/internal/finance"
	"testing"
)

func TestFinancialJournalTracksChangesWithoutNotes(t *testing.T) {
	before := finance.Empty()
	after := finance.Empty()
	after.Transactions = []finance.Transaction{{ID: "test1", Type: "expense", Amount: 123000, Date: "2026-10-11", Category: "Ăn uống", Note: "do not reveal this sensitive note"}}
	changes := financeStateChanges(before, after)
	if len(changes) != 1 || changes[0].Action != "created" || changes[0].Kind != "transaction" {
		t.Fatal(changes)
	}
	if changes[0].Title != "Chi: Ăn uống" {
		t.Fatal(changes)
	}
	if changes[0].Amount != 123000 {
		t.Fatal(changes)
	}
	revised := after
	revised.Transactions = []finance.Transaction{{ID: "test1", Type: "expense", Amount: 250000, Date: "2026-10-11", Category: "Ăn uống", Note: "new private note"}}
	changes = financeStateChanges(after, revised)
	if len(changes) != 1 || changes[0].Action != "updated" || changes[0].Amount != 250000 {
		t.Fatal(changes)
	}
	changes = financeStateChanges(revised, before)
	if len(changes) != 1 || changes[0].Action != "deleted" {
		t.Fatal(changes)
	}
	if len(financeStateChanges(before, before)) != 0 {
		t.Fatal("Unchanged state must not generate log entries")
	}
}
func TestJournalSummarizesBulkImport(t *testing.T) {
	before := finance.Empty()
	after := finance.Empty()
	for i := 0; i < 250; i++ {
		after.Transactions = append(after.Transactions, finance.Transaction{ID: formatCount(i), Type: "expense", Amount: 1000, Date: "2026-10-01", Category: "Khác"})
	}
	changes := financeStateChanges(before, after)
	if len(changes) != 1 || changes[0].Kind != "bulk" || changes[0].Action != "imported" {
		t.Fatal(changes)
	}
}
