package main

import (
	"financialsteward/backend/internal/finance"
	"math"
	"sort"
	"time"
)

// spendingBehaviorMCP exposes aggregate patterns only, never individual notes or transaction IDs.
func spendingBehaviorMCP(d finance.Data, now time.Time, minimumDebt float64) any {
	month := now.Format("2006-01")
	today := now.Format("2006-01-02")
	_, m, _ := now.Date()
	first := time.Date(now.Year(), m, 1, 0, 0, 0, 0, now.Location())
	historyMonths := make(map[string]bool, 3)
	for i := 1; i <= 3; i++ {
		historyMonths[first.AddDate(0, -i, 0).Format("2006-01")] = true
	}
	expenses := 0
	tagged := 0
	essentialSpent := 0.0
	flexibleSpent := 0.0
	impulseSpent := 0.0
	historySum := make(map[string]float64)
	historyCount := make(map[string]bool)
	for _, t := range d.Transactions {
		if t.Type != "expense" || len(t.Date) < 7 {
			continue
		}
		ym := t.Date[:7]
		if ym == month && t.Date <= today {
			expenses++
			if t.Need != "" && t.Trigger != "" {
				tagged++
			}
			if t.Need == "essential" {
				essentialSpent += t.Amount
			} else {
				flexibleSpent += t.Amount // conservative for unclassified purchases
			}
			if t.Trigger == "impulse" || t.Trigger == "promotion" || t.Trigger == "emotion" {
				impulseSpent += t.Amount
			}
		}
		if historyMonths[ym] {
			historyCount[ym] = true
			if t.Need != "essential" {
				historySum[t.Category] += t.Amount
			}
		}
	}
	income := d.Preferences.MonthlyIncome
	reserve := d.Preferences.Reserve
	essentials := d.Preferences.Essentials
	available := math.Max(0, income-reserve-minimumDebt)
	flexibleCap := math.Max(0, available-essentials)
	excessEssentials := math.Max(0, essentialSpent-essentials)
	remaining := math.Max(0, flexibleCap-flexibleSpent-excessEssentials)
	lastDay := first.AddDate(0, 1, -1).Day()
	daysLeft := lastDay - now.Day() + 1
	if daysLeft < 1 {
		daysLeft = 1
	}
	dayLimit := math.Floor(remaining / float64(daysLeft))
	if income <= 0 {
		flexibleCap = 0
		remaining = 0
		dayLimit = 0
	}
	type category struct {
		Name                     string  `json:"category"`
		HistoricalMonthlyAverage float64 `json:"historicalMonthlyAverage"`
		SuggestedMonthlyLimit    float64 `json:"suggestedMonthlyLimit"`
	}
	var top []category
	allHistorical := 0.0
	for _, value := range historySum {
		allHistorical += value
	}
	for name, value := range historySum {
		target := 0.0
		if allHistorical > 0 && income > 0 {
			target = math.Floor(flexibleCap*value/allHistorical/10000) * 10000
		}
		top = append(top, category{Name: name, HistoricalMonthlyAverage: math.Round(value / float64(len(historyCount))), SuggestedMonthlyLimit: target})
	}
	sort.Slice(top, func(i, j int) bool { return top[i].HistoricalMonthlyAverage > top[j].HistoricalMonthlyAverage })
	if len(top) > 6 {
		top = top[:6]
	}
	if top == nil {
		top = []category{}
	}
	return map[string]any{
		"asOf": today, "currency": "VND", "month": month,
		"configuredIncome": income > 0, "monthlyIncomeAssumed": income,
		"minimumDebtPayments": minimumDebt, "reserveAssumed": reserve, "essentialsAssumed": essentials,
		"estimatedFlexibleMonthlyLimit": flexibleCap, "estimatedFlexibleRemaining": remaining,
		"estimatedFlexibleDailyLimit": dayLimit, "daysLeft": daysLeft,
		"essentialSpentRecorded": essentialSpent, "flexibleOrUnclassifiedSpent": flexibleSpent,
		"impulsiveOrEmotionDrivenSpent": impulseSpent, "labeledTransactions": tagged,
		"expenseTransactions": expenses, "completeMonthsWithHistory": len(historyCount),
		"categorySuggestions": top,
		"warning":             "Read-only advisory estimate. Historic records without behavior tags are treated conservatively as flexible; amounts are self-reported, not bank-verified. No transaction notes or bank credentials are exposed.",
	}
}
