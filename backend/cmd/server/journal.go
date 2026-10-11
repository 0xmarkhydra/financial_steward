package main

import (
	"encoding/json"
	"financialsteward/backend/internal/finance"
	"sort"
)

// Journal entries are produced only after validated finance state updates.
// The public API never offers update/delete methods for journal events.
type journalChange struct {
	Kind   string
	Action string
	ID     string
	Title  string
	Amount float64
}
type auditRecord struct {
	Kind        string
	ID          string
	Title       string
	Amount      float64
	Fingerprint string
}

func financeAuditRecords(d finance.Data) map[string]auditRecord {
	out := make(map[string]auditRecord, len(d.Transactions)+len(d.Payments)+len(d.Debts)+len(d.Rollovers)+len(d.Budgets)+1)
	add := func(kind, id, title string, amount float64, item any) {
		b, _ := json.Marshal(item)
		out[kind+":"+id] = auditRecord{Kind: kind, ID: id, Title: title, Amount: amount, Fingerprint: string(b)}
	}
	for _, t := range d.Transactions {
		title := "Chi: " + t.Category
		if t.Type == "income" {
			title = "Thu: " + t.Category
		}
		add("transaction", t.ID, title, t.Amount, t)
	}
	names := make(map[string]string, len(d.Debts))
	for _, debt := range d.Debts {
		names[debt.ID] = debt.Name
	}
	for _, p := range d.Payments {
		name := names[p.DebtID]
		if name == "" {
			name = "Khoản nợ"
		}
		add("payment", p.ID, "Trả gốc/lãi: "+name, p.Principal+p.Interest+p.Fee, p)
	}
	for _, d := range d.Debts {
		add("debt", d.ID, "Khoản nợ: "+d.Name, d.Balance, d)
	}
	for _, r := range d.Rollovers {
		add("rollover", r.ID, "Lịch đáo hạn", r.Amount, r)
	}
	for _, b := range d.Budgets {
		add("budget", b.Category, "Ngân sách: "+b.Category, b.Limit, b)
	}
	groupNames := make(map[string]string, len(d.PhuongGroups))
	for _, g := range d.PhuongGroups {
		add("phuong_group", g.ID, "Dây phường: "+g.Name, g.Contribution, g)
		groupNames[g.ID] = g.Name
	}
	for _, e := range d.PhuongEntries {
		name := groupNames[e.GroupID]
		if name == "" {
			name = "Dây phường"
		}
		add("phuong_entry", e.ID, "Góp/lĩnh phường: "+name, e.Amount, e)
	}
	// Chat text is not replicated in the audit journal to minimize financial privacy exposure.
	add("preferences", "main", "Cấu hình tài chính", 0, d.Preferences)
	return out
}
func financeStateChanges(before, after finance.Data) []journalChange {
	a, b := financeAuditRecords(before), financeAuditRecords(after)
	changes := make([]journalChange, 0)
	for key, old := range a {
		next, ok := b[key]
		if !ok {
			changes = append(changes, journalChange{Kind: old.Kind, Action: "deleted", ID: old.ID, Title: old.Title, Amount: old.Amount})
		}
		if ok && old.Fingerprint != next.Fingerprint {
			changes = append(changes, journalChange{Kind: next.Kind, Action: "updated", ID: next.ID, Title: next.Title, Amount: next.Amount})
		}
	}
	for key, next := range b {
		if _, ok := a[key]; !ok {
			changes = append(changes, journalChange{Kind: next.Kind, Action: "created", ID: next.ID, Title: next.Title, Amount: next.Amount})
		}
	}
	sort.Slice(changes, func(i, j int) bool {
		if changes[i].Kind != changes[j].Kind {
			return changes[i].Kind < changes[j].Kind
		}
		return changes[i].ID < changes[j].ID
	})
	// Whole-state import can change thousands of records. Log that as a bulk revision instead
	// of generating an unbounded SQL write burst or silently dropping the modification.
	if len(changes) > 200 {
		return []journalChange{{Kind: "bulk", Action: "imported", ID: "state", Title: "Thay đổi hàng loạt: " + formatCount(len(changes)) + " bản ghi", Amount: 0}}
	}
	return changes
}
func formatCount(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}
