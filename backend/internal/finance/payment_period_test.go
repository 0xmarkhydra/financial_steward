package finance

import "testing"

func TestInterestReminderFieldsAndLatePaymentPeriod(t *testing.T) {
	d := Empty()
	d.Debts = []Debt{{ID: "credit", Name: "Thẻ", Kind: "card", Original: 1000000, Balance: 900000,
		Minimum: 100000, DueDay: 28, InterestDueDay: 12, InterestExpected: 50000, CreatedAt: "2026-08-01"}}
	d.Payments = []Payment{{ID: "late", DebtID: "credit", Date: "2026-10-11", Period: "2026-09", Principal: 100000, Interest: 50000}}
	if err := d.Validate(); err != nil {
		t.Fatal(err)
	}
	d.Payments[0].Period = "2026-13"
	if err := d.Validate(); err == nil {
		t.Fatal("invalid payment period accepted")
	}
	d.Payments[0].Period = "2026-09"
	d.Debts[0].InterestDueDay = 32
	if err := d.Validate(); err == nil {
		t.Fatal("invalid interest due day accepted")
	}
	d.Debts[0].InterestDueDay = 12
	d.Debts[0].InterestExpected = -1
	if err := d.Validate(); err == nil {
		t.Fatal("negative interest forecast accepted")
	}
}
