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
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Lender    string  `json:"lender"`
	Kind      string  `json:"kind"`
	Original  float64 `json:"original"`
	Balance   float64 `json:"balance"`
	APR       float64 `json:"apr"`
	Minimum   float64 `json:"minimum"`
	DueDay    int     `json:"dueDay"`
	CreatedAt string  `json:"createdAt"`
	Note      string  `json:"note"`
}
type Transaction struct {
	ID       string  `json:"id"`
	Type     string  `json:"type"`
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
	Date     string  `json:"date"`
	Note     string  `json:"note"`
}
type Payment struct {
	ID        string  `json:"id"`
	DebtID    string  `json:"debtId"`
	Date      string  `json:"date"`
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
type Data struct {
	Version      int           `json:"version"`
	Debts        []Debt        `json:"debts"`
	Transactions []Transaction `json:"transactions"`
	Payments     []Payment     `json:"payments"`
	Budgets      []Budget      `json:"budgets"`
	Preferences  Preferences   `json:"preferences"`
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
			!amount(v.Original) || !amount(v.Balance) || v.Balance > v.Original || !amount(v.Minimum) || v.APR < 0 || v.APR > 1000 || math.IsNaN(v.APR) || math.IsInf(v.APR, 0) || v.DueDay < 1 || v.DueDay > 31 {
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
		if !unique(ids, v.ID) || !validDate(v.Date) || !amount(v.Amount) || v.Amount == 0 || len(v.Note) > 2000 || v.Category == "" || len(v.Category) > 100 || (v.Type != "income" && v.Type != "expense") {
			return errors.New("invalid transaction record")
		}
	}
	ids = map[string]bool{}
	for _, v := range d.Payments {
		if !unique(ids, v.ID) || !validDate(v.Date) || !amount(v.Principal) || !amount(v.Interest) || !amount(v.Fee) || (v.Principal+v.Interest+v.Fee) <= 0 || len(v.Note) > 2000 {
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
