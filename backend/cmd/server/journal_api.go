package main

import (
	"net/http"
	"time"
)

type journalEntry struct {
	ID        int64     `json:"id"`
	Revision  int64     `json:"revision"`
	EventType string    `json:"eventType"`
	Action    string    `json:"action"`
	RecordID  string    `json:"recordId"`
	Title     string    `json:"title"`
	Amount    float64   `json:"amount"`
	CreatedAt time.Time `json:"createdAt"`
}

func (a *server) getJournal(w http.ResponseWriter, r *http.Request, s session) {
	rows, err := a.db.QueryContext(r.Context(),
		"SELECT id,revision,event_type,action,record_id,title,amount,created_at FROM financial_journal WHERE user_id=$1 ORDER BY id DESC LIMIT 100", s.user.ID)
	if err != nil {
		fail(w, 500, "Không thể tải lịch sử thay đổi.")
		return
	}
	defer rows.Close()
	entries := make([]journalEntry, 0, 32)
	for rows.Next() {
		var entry journalEntry
		if err := rows.Scan(&entry.ID, &entry.Revision, &entry.EventType, &entry.Action, &entry.RecordID, &entry.Title, &entry.Amount, &entry.CreatedAt); err != nil {
			fail(w, 500, "Không thể đọc lịch sử thay đổi.")
			return
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		fail(w, 500, "Lỗi đọc nhật ký.")
		return
	}
	response(w, 200, map[string]any{"events": entries})
}
