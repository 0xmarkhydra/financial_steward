package main

import (
	"financialsteward/backend/internal/finance"
	"time"
)

// Returns the nominal dues for the given local month. Payouts are not earnings;
// commitments continue after a participant receives their payout.
func monthlyPhuongCommitment(d finance.Data, now time.Time) float64 {
	month := now.Format("2006-01")
	amount := 0.0
	for _, g := range d.PhuongGroups {
		if g.Status != "active" {
			continue
		}
		start, err := time.ParseInLocation("2006-01-02", g.StartDate, now.Location())
		if err != nil {
			continue
		}
		sy, sm, sd := start.Date()
		for i := 0; i < g.Rounds; i++ {
			var day time.Time
			switch g.Cycle {
			case "daily":
				day = start.AddDate(0, 0, i)
			case "weekly":
				day = start.AddDate(0, 0, 7*i)
			default:
				first := time.Date(sy, sm+time.Month(i), 1, 12, 0, 0, 0, now.Location())
				y, m, _ := first.Date()
				last := time.Date(y, m+1, 0, 12, 0, 0, 0, now.Location()).Day()
				n := sd
				if n > last {
					n = last
				}
				day = time.Date(y, m, n, 12, 0, 0, 0, now.Location())
			}
			dateMonth := day.Format("2006-01")
			if dateMonth > month {
				break
			}
			if dateMonth == month {
				amount += g.Contribution
			}
		}
	}
	return amount
}
