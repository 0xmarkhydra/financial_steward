package finance

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strings"
	"time"
)

const maxRecords = 100000
const maxAmount = float64(9_000_000_000_000_000)

type Debt struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Lender           string  `json:"lender"`
	Kind             string  `json:"kind"`
	Original         float64 `json:"original"`
	Balance          float64 `json:"balance"`
	APR              float64 `json:"apr"`
	Minimum          float64 `json:"minimum"`
	DueDay           int     `json:"dueDay"`
	InterestDueDay   int     `json:"interestDueDay,omitempty"`
	InterestExpected float64 `json:"interestExpected,omitempty"`
	CreatedAt        string  `json:"createdAt"`
	Note             string  `json:"note"`
}
type Transaction struct {
	ID       string  `json:"id"`
	Type     string  `json:"type"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
	Date     string  `json:"date"`
	Note     string  `json:"note"`
	Need     string  `json:"need,omitempty"`
	Trigger  string  `json:"trigger,omitempty"`
}
type Payment struct {
	ID        string  `json:"id"`
	DebtID    string  `json:"debtId"`
	Date      string  `json:"date"`
	Period    string  `json:"period,omitempty"`
	Principal float64 `json:"principal"`
	Interest  float64 `json:"interest"`
	Fee       float64 `json:"fee"`
	Note      string  `json:"note"`
}
type Budget struct {
	Category string  `json:"category"`
	Limit    float64 `json:"limit"`
}
type Preferences struct {
	MonthlyIncome float64 `json:"monthlyIncome"`
	Essentials    float64 `json:"essentials"`
	Reserve       float64 `json:"reserve"`
	Strategy      string  `json:"strategy"`
}
type Rollover struct {
	ID          string  `json:"id"`
	DebtID      string  `json:"debtId"`
	Kind        string  `json:"kind"`
	DueDate     string  `json:"dueDate"`
	Amount      float64 `json:"amount"`
	Fee         float64 `json:"fee"`
	Funding     string  `json:"funding"`
	Status      string  `json:"status"`
	CompletedAt string  `json:"completedAt"`
	Note        string  `json:"note"`
}
type PhuongGroup struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Organizer      string  `json:"organizer"`
	Role           string  `json:"role"`
	Contribution   float64 `json:"contribution"`
	Cycle          string  `json:"cycle"`
	StartDate      string  `json:"startDate"`
	Rounds         int     `json:"rounds"`
	PayoutRound    int     `json:"payoutRound,omitempty"`
	PayoutExpected float64 `json:"payoutExpected,omitempty"`
	Status         string  `json:"status"`
	Note           string  `json:"note"`
}
type PhuongEntry struct {
	ID      string  `json:"id"`
	GroupID string  `json:"groupId"`
	Date    string  `json:"date"`
	Round   int     `json:"round"`
	Kind    string  `json:"kind"`
	Amount  float64 `json:"amount"`
	Note    string  `json:"note"`
}
type AgentMessage struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}
type CashPlan struct {
	ID                  string  `json:"id"`
	Title               string  `json:"title"`
	Direction           string  `json:"direction"`
	Amount              float64 `json:"amount"`
	DueDate             string  `json:"dueDate"`
	Status              string  `json:"status"`
	Note                string  `json:"note"`
	CompletedAt         string  `json:"completedAt,omitempty"`
	LinkedTransactionID string  `json:"linkedTransactionId,omitempty"`
}
type Data struct {
	Version       int            `json:"version"`
	Debts         []Debt         `json:"debts"`
	Transactions  []Transaction  `json:"transactions"`
	Payments      []Payment      `json:"payments"`
	Budgets       []Budget       `json:"budgets"`
	Rollovers     []Rollover     `json:"rollovers,omitempty"`
	PhuongGroups  []PhuongGroup  `json:"phuongGroups,omitempty"`
	PhuongEntries []PhuongEntry  `json:"phuongEntries,omitempty"`
	AgentChat     []AgentMessage `json:"agentChat,omitempty"`
	CashPlans     []CashPlan     `json:"cashPlans,omitempty"`
	Preferences   Preferences    `json:"preferences"`
}

func Empty() Data {
	return Data{Version: 1, Debts: []Debt{}, Transactions: []Transaction{}, Payments: []Payment{}, Budgets: []Budget{}, Preferences: Preferences{Strategy: "avalanche"}}
}
func Decode(raw []byte) (Data, error) {
	var d Data
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&d); err != nil {
		return d, errors.New("invalid JSON")
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return d, errors.New("invalid trailing JSON")
	}
	return d, d.Validate()
}
func amount(n float64) bool {
	return !math.IsNaN(n) && !math.IsInf(n, 0) && n >= 0 && n <= maxAmount && math.Trunc(n) == n
}
func validDate(s string) bool {
	d, e := time.Parse("2006-01-02", s)
	return e == nil && d.Format("2006-01-02") == s
}
func unique(m map[string]bool, id string) bool {
	if id == "" || len(id) > 100 || m[id] {
		return false
	}
	m[id] = true
	return true
}
func (d Data) Validate() error {
	if d.Version != 1 {
		return errors.New("unsupported data version")
	}
	if len(d.Debts) > 10000 || len(d.Transactions) > maxRecords || len(d.Payments) > maxRecords || len(d.Budgets) > 1000 {
		return errors.New("too many records")
	}
	p := d.Preferences
	if !amount(p.MonthlyIncome) || !amount(p.Essentials) || !amount(p.Reserve) || (p.Strategy != "avalanche" && p.Strategy != "snowball") {
		return errors.New("invalid preferences")
	}
	ids := map[string]bool{}
	totals := map[string]float64{}
	for _, v := range d.Debts {
		if !unique(ids, v.ID) || strings.TrimSpace(v.Name) == "" || len(v.Name) > 140 || len(v.Lender) > 140 || len(v.Note) > 2000 || !validDate(v.CreatedAt) ||
			!amount(v.Original) || !amount(v.Balance) || v.Balance > v.Original || !amount(v.Minimum) || v.APR < 0 || v.APR > 1000 || math.IsNaN(v.APR) || math.IsInf(v.APR, 0) || v.DueDay < 1 || v.DueDay > 31 || (v.InterestDueDay != 0 && (v.InterestDueDay < 1 || v.InterestDueDay > 31)) || !amount(v.InterestExpected) {
			return fmt.Errorf("invalid debt record")
		}
		switch v.Kind {
		case "bank", "card", "personal", "installment", "other":
		default:
			return errors.New("invalid debt kind")
		}
	}
	ids = map[string]bool{}
	for _, v := range d.Transactions {
		if !unique(ids, v.ID) || !validDate(v.Date) || !amount(v.Amount) || v.Amount == 0 || len(v.Note) > 2000 || v.Category == "" || len(v.Category) > 100 || (v.Type != "income" && v.Type != "expense") ||
			(v.Need != "" && (v.Type != "expense" || (v.Need != "essential" && v.Need != "flexible"))) ||
			(v.Trigger != "" && (v.Type != "expense" || (v.Trigger != "planned" && v.Trigger != "impulse" && v.Trigger != "promotion" && v.Trigger != "emotion" && v.Trigger != "social"))) {
			return errors.New("invalid transaction record")
		}
	}
	ids = map[string]bool{}
	for _, v := range d.Payments {
		if !unique(ids, v.ID) || !validDate(v.Date) || (v.Period != "" && (len(v.Period) != 7 || v.Period[4] != '-' || !validDate(v.Period+"-01"))) || !amount(v.Principal) || !amount(v.Interest) || !amount(v.Fee) || (v.Principal+v.Interest+v.Fee) <= 0 || len(v.Note) > 2000 {
			return errors.New("invalid payment record")
		}
		if !containsDebt(d.Debts, v.DebtID) {
			return errors.New("payment references missing debt")
		}
		totals[v.DebtID] += v.Principal
	}
	for _, v := range d.Debts {
		if math.Abs((v.Balance+totals[v.ID])-v.Original) > 1 {
			return errors.New("debt principal does not reconcile with payment history")
		}
	}
	ids = map[string]bool{}
	if len(d.Rollovers) > 10000 {
		return errors.New("too many rollover records")
	}
	for _, v := range d.Rollovers {
		if !unique(ids, v.ID) || !containsDebt(d.Debts, v.DebtID) || !validDate(v.DueDate) || !amount(v.Amount) || v.Amount == 0 || !amount(v.Fee) || len(v.Note) > 2000 || (v.CompletedAt != "" && !validDate(v.CompletedAt)) {
			return errors.New("invalid rollover")
		}
		if v.Kind != "card" && v.Kind != "loan" {
			return errors.New("invalid rollover kind")
		}
		if v.Funding != "own" && v.Funding != "bank_transfer" && v.Funding != "refinance" && v.Funding != "other" {
			return errors.New("invalid rollover funding")
		}
		if v.Status != "planned" && v.Status != "completed" && v.Status != "cancelled" {
			return errors.New("invalid rollover status")
		}
	}
	if len(d.PhuongGroups) > 500 || len(d.PhuongEntries) > 20000 || len(d.AgentChat) > 150 {
		return errors.New("too many phuong or chat records")
	}
	ids = map[string]bool{}
	groups := map[string]int{}
	for _, v := range d.PhuongGroups {
		if !unique(ids, v.ID) || strings.TrimSpace(v.Name) == "" || len(v.Name) > 140 || len(v.Organizer) > 140 || !amount(v.Contribution) || v.Contribution <= 0 || !validDate(v.StartDate) || v.Rounds < 1 || v.Rounds > 520 || v.PayoutRound < 0 || v.PayoutRound > v.Rounds || !amount(v.PayoutExpected) || len(v.Note) > 2000 {
			return errors.New("invalid phuong group")
		}
		if v.Cycle != "daily" && v.Cycle != "weekly" && v.Cycle != "monthly" {
			return errors.New("invalid phuong cycle")
		}
		if v.Role != "member" && v.Role != "organizer" {
			return errors.New("invalid phuong role")
		}
		if v.Status != "active" && v.Status != "paused" && v.Status != "completed" {
			return errors.New("invalid phuong status")
		}
		groups[v.ID] = v.Rounds
	}
	ids = map[string]bool{}
	for _, v := range d.PhuongEntries {
		if !unique(ids, v.ID) || !validDate(v.Date) || !amount(v.Amount) || v.Amount <= 0 || v.Round < 1 || v.Round > groups[v.GroupID] || len(v.Note) > 2000 {
			return errors.New("invalid phuong event")
		}
		if v.Kind != "contribution" && v.Kind != "payout" && v.Kind != "fee" {
			return errors.New("invalid phuong event kind")
		}
	}
	ids = map[string]bool{}
	for _, v := range d.AgentChat {
		if !unique(ids, v.ID) || !validDate(v.CreatedAt) || len(v.Content) == 0 || len(v.Content) > 5000 || (v.Role != "user" && v.Role != "assistant") {
			return errors.New("invalid chat message")
		}
	}
	if len(d.CashPlans) > 10000 {
		return errors.New("too many planned cashflows")
	}
	ids = map[string]bool{}
	for _, v := range d.CashPlans {
		if !unique(ids, v.ID) || strings.TrimSpace(v.Title) == "" || len(v.Title) > 140 || !amount(v.Amount) || v.Amount == 0 || !validDate(v.DueDate) || len(v.Note) > 2000 || (v.CompletedAt != "" && !validDate(v.CompletedAt)) || (v.LinkedTransactionID != "" && len(v.LinkedTransactionID) > 100) {
			return errors.New("invalid planned cashflow")
		}
		if v.Direction != "in" && v.Direction != "out" {
			return errors.New("invalid cashflow direction")
		}
		if v.Status != "planned" && v.Status != "completed" && v.Status != "cancelled" {
			return errors.New("invalid cashflow status")
		}
		if v.LinkedTransactionID != "" && v.Status != "completed" {
			return errors.New("linked transaction without completion")
		}
	}
	ids = map[string]bool{}
	for _, v := range d.Budgets {
		if v.Category == "" || len(v.Category) > 100 || !unique(ids, v.Category) || !amount(v.Limit) {
			return errors.New("invalid budget record")
		}
	}
	return nil
}
func containsDebt(debts []Debt, id string) bool {
	for _, d := range debts {
		if d.ID == id {
			return true
		}
	}
	return false
}
