package reconciliation

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

// MatchingStrategy pairs bank statement lines against internal transactions.
type MatchingStrategy interface {
	Match(lines []StatementLine, txns []InternalTransaction) []MatchResult
}

// MatchResult is the outcome for one bank statement line.
type MatchResult struct {
	BankLineID    uuid.UUID
	InternalTxnID *uuid.UUID // nil = no match found
	ConfidencePct int32
}

// ExactMatcher matches by amount + date (±1 day), preferring reference overlap.
type ExactMatcher struct{}

func (ExactMatcher) Match(lines []StatementLine, txns []InternalTransaction) []MatchResult {
	usedTxn := make(map[uuid.UUID]bool, len(txns))
	results := make([]MatchResult, 0, len(lines))

	for _, line := range lines {
		best := matchResult{line: line}
		for _, txn := range txns {
			if usedTxn[txn.ID] {
				continue
			}
			score, ok := score(line, txn)
			if !ok {
				continue
			}
			if score > best.score {
				best.score = score
				best.txn = &txn
			}
		}
		if best.txn != nil {
			usedTxn[best.txn.ID] = true
			id := best.txn.ID
			results = append(results, MatchResult{
				BankLineID:    line.ID,
				InternalTxnID: &id,
				ConfidencePct: int32(best.score),
			})
		} else {
			results = append(results, MatchResult{BankLineID: line.ID})
		}
	}
	return results
}

type matchResult struct {
	line  StatementLine
	txn   *InternalTransaction
	score int // 0–100
}

// score returns whether line and txn are a candidate match and a confidence score.
func score(line StatementLine, txn InternalTransaction) (int, bool) {
	// Amount must match direction and value exactly.
	var lineAmt int64
	switch txn.Direction {
	case "credit":
		lineAmt = line.CreditKobo
	case "debit":
		lineAmt = line.DebitKobo
	default:
		return 0, false
	}
	if lineAmt == 0 || lineAmt != txn.AmountKobo {
		return 0, false
	}

	// Date must be within ±1 day.
	diff := line.TxnDate.Sub(txn.TxnDate)
	if diff < 0 {
		diff = -diff
	}
	if diff > 25*time.Hour {
		return 0, false
	}

	// Base score: 80 for amount+date match.
	s := 80

	// Bonus: reference overlap.
	if txn.Reference != "" && line.Reference != "" {
		if strings.Contains(strings.ToLower(line.Reference), strings.ToLower(txn.Reference)) ||
			strings.Contains(strings.ToLower(txn.Reference), strings.ToLower(line.Reference)) {
			s = 100
		}
	}

	return s, true
}
