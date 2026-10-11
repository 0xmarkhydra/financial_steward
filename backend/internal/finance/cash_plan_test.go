package finance

import "testing"

func TestScheduledReceivableAndPayableValidation(t *testing.T) {
	d := Empty()
	d.CashPlans = []CashPlan{
		{ID: "incoming", Title: "Khách trả tiền", Direction: "in", Amount: 3000000, DueDate: "2026-10-20", Status: "planned", Note: ""},
		{ID: "outgoing", Title: "Tiền nhà", Direction: "out", Amount: 2500000, DueDate: "2026-10-15", Status: "planned", Note: ""},
	}
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	d.CashPlans[1].Amount = -10
	if err := d.Validate(); err == nil {
		t.Fatal("negative scheduled cashflow accepted")
	}
	d.CashPlans[1].Amount = 2500000
	d.CashPlans[1].DueDate = "2026-02-30"
	if err := d.Validate(); err == nil {
		t.Fatal("invalid calendar date accepted")
	}
	d.CashPlans[1].DueDate = "2026-10-15"
	d.CashPlans[1].LinkedTransactionID = "txn"
	if err := d.Validate(); err == nil {
		t.Fatal("linked transaction without completed status accepted")
	}
	d.CashPlans[1].Status = "completed"
	d.CashPlans[1].CompletedAt = "2026-10-12"
	if err := d.Validate(); err != nil {
		t.Fatal("completed cashflow rejected:", err)
	}
	d.CashPlans[1].ID = "incoming"
	if err := d.Validate(); err == nil {
		t.Fatal("duplicate planned record accepted")
	}
}
