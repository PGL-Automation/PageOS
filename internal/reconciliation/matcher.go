package reconciliation

import (
	"strings"
	"time"
	"unicode"

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

// ────────────────────────────────────────────────────────────────────────────
// ExactMatcher – original behaviour, kept for backwards compatibility.
// ────────────────────────────────────────────────────────────────────────────

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
			s, ok := score(line, txn)
			if !ok {
				continue
			}
			if s > best.score {
				best.score = s
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
// Used exclusively by ExactMatcher.
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

// ────────────────────────────────────────────────────────────────────────────
// MatcherConfig / SmartMatcher
// ────────────────────────────────────────────────────────────────────────────

// MatcherConfig controls the tolerances and weights used by SmartMatcher.
type MatcherConfig struct {
	AmountToleranceKobo int64 // e.g. 1 = ±1 kobo tolerance for rounding errors
	DateToleranceDays   int   // e.g. 3 = ±3 days (default was 1)
	NarrationWeight     int   // 0-20 extra score for narration keyword match
}

// DefaultMatcherConfig returns sensible production defaults.
func DefaultMatcherConfig() MatcherConfig {
	return MatcherConfig{
		AmountToleranceKobo: 1,
		DateToleranceDays:   3,
		NarrationWeight:     15,
	}
}

// SmartMatcher is a configurable matcher that allows fuzzy amount/date
// matching and narration keyword scoring.
type SmartMatcher struct {
	Config MatcherConfig
}

// DefaultSmartMatcher returns a SmartMatcher with sensible production defaults.
func DefaultSmartMatcher() SmartMatcher {
	return SmartMatcher{Config: DefaultMatcherConfig()}
}

// Match implements MatchingStrategy.
// Scoring breakdown (max 100):
//
//	Amount  – exact match: 50 pts; within tolerance: 35 pts
//	Date    – exact match: 25 pts; within 1 day: 20 pts; within tolerance: 10 pts
//	Reference substring: 15 pts
//	Narration keyword:   up to NarrationWeight pts
//
// A candidate must reach ≥ 50 pts to be considered.
func (m SmartMatcher) Match(lines []StatementLine, txns []InternalTransaction) []MatchResult {
	usedTxn := make(map[uuid.UUID]bool, len(txns))
	results := make([]MatchResult, 0, len(lines))

	for _, line := range lines {
		best := smartMatchResult{line: line}

		for _, txn := range txns {
			if usedTxn[txn.ID] {
				continue
			}
			s, ok := m.smartScore(line, txn)
			if !ok {
				continue
			}
			if s > best.score {
				best.score = s
				t := txn
				best.txn = &t
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

// smartScore computes a score for a (line, txn) pair under SmartMatcher rules.
// Returns (score, true) if the pair is a candidate (score ≥ 50), else (0, false).
func (m SmartMatcher) smartScore(line StatementLine, txn InternalTransaction) (int, bool) {
	cfg := m.Config

	// ── Amount ──────────────────────────────────────────────────────────────
	var lineAmt int64
	switch txn.Direction {
	case "credit":
		lineAmt = line.CreditKobo
	case "debit":
		lineAmt = line.DebitKobo
	default:
		return 0, false
	}
	if lineAmt == 0 {
		return 0, false
	}

	amtDiff := lineAmt - txn.AmountKobo
	if amtDiff < 0 {
		amtDiff = -amtDiff
	}

	var amountScore int
	switch {
	case amtDiff == 0:
		amountScore = 50
	case amtDiff <= cfg.AmountToleranceKobo:
		amountScore = 35
	default:
		// Amount is too far off — not a candidate.
		return 0, false
	}

	// ── Date ────────────────────────────────────────────────────────────────
	dateDiff := line.TxnDate.Sub(txn.TxnDate)
	if dateDiff < 0 {
		dateDiff = -dateDiff
	}
	maxDateDiff := time.Duration(cfg.DateToleranceDays) * 24 * time.Hour

	var dateScore int
	switch {
	case dateDiff == 0:
		dateScore = 25
	case dateDiff <= 24*time.Hour:
		dateScore = 20
	case dateDiff <= maxDateDiff:
		dateScore = 10
	default:
		// Date too far off — not a candidate.
		return 0, false
	}

	// ── Reference ───────────────────────────────────────────────────────────
	var refScore int
	if txn.Reference != "" && line.Reference != "" {
		lineLow := strings.ToLower(line.Reference)
		txnLow := strings.ToLower(txn.Reference)
		if strings.Contains(lineLow, txnLow) || strings.Contains(txnLow, lineLow) {
			refScore = 15
		}
	}

	// ── Narration keyword ────────────────────────────────────────────────────
	narrationScore := m.narrationScore(line.Narration, txn.Reference)

	total := amountScore + dateScore + refScore + narrationScore
	if total < 50 {
		return 0, false
	}
	if total > 100 {
		total = 100
	}
	return total, true
}

// narrationScore returns up to cfg.NarrationWeight points if any word from
// txnRef appears in the normalised narration (or vice versa).
func (m SmartMatcher) narrationScore(narration, txnRef string) int {
	if narration == "" || txnRef == "" {
		return 0
	}
	normNarration := normaliseWords(narration)
	normRef := normaliseWords(txnRef)

	for _, w := range normRef {
		if containsWord(normNarration, w) {
			return m.Config.NarrationWeight
		}
	}
	for _, w := range normNarration {
		if containsWord(normRef, w) {
			return m.Config.NarrationWeight
		}
	}
	return 0
}

// ────────────────────────────────────────────────────────────────────────────
// NarrationMatcher – categorise unmatched lines by known narration keywords.
// ────────────────────────────────────────────────────────────────────────────

// NarrationMatcher matches bank lines whose narration contains at least one of
// the supplied keywords.  It is useful for categorising unmatched bank lines
// (e.g. all NIPSS/RTGS/salary lines) rather than matching them to a specific
// internal transaction.
type NarrationMatcher struct {
	Keywords []string // e.g. ["NIPSS", "RTGS", "salary"]
}

// Match implements MatchingStrategy.
// Score = (matched keywords / total keywords) * 100, capped at 100.
// Lines whose narration matches no keyword receive a zero-confidence result
// with nil InternalTxnID.
func (n NarrationMatcher) Match(lines []StatementLine, _ []InternalTransaction) []MatchResult {
	results := make([]MatchResult, 0, len(lines))

	lowKeys := make([]string, len(n.Keywords))
	for i, k := range n.Keywords {
		lowKeys[i] = strings.ToLower(k)
	}

	for _, line := range lines {
		lowNarration := strings.ToLower(line.Narration)
		matched := 0
		for _, k := range lowKeys {
			if strings.Contains(lowNarration, k) {
				matched++
			}
		}
		if matched == 0 {
			results = append(results, MatchResult{BankLineID: line.ID})
			continue
		}
		var pct int
		if len(lowKeys) > 0 {
			pct = (matched * 100) / len(lowKeys)
		}
		if pct > 100 {
			pct = 100
		}
		// NarrationMatcher categorises lines only; InternalTxnID remains nil.
		results = append(results, MatchResult{
			BankLineID:    line.ID,
			InternalTxnID: nil,
			ConfidencePct: int32(pct),
		})
	}
	return results
}

// ────────────────────────────────────────────────────────────────────────────
// internal helpers
// ────────────────────────────────────────────────────────────────────────────

type smartMatchResult struct {
	line  StatementLine
	txn   *InternalTransaction
	score int
}

// normaliseWords lowercases s, strips punctuation and symbols, and returns the
// non-empty whitespace-separated words.  Only stdlib unicode/strings are used.
func normaliseWords(s string) []string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if unicode.IsPunct(r) || unicode.IsSymbol(r) {
			b.WriteRune(' ')
		} else {
			b.WriteRune(unicode.ToLower(r))
		}
	}
	parts := strings.Fields(b.String())
	out := parts[:0]
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// containsWord reports whether word appears in the words slice.
func containsWord(words []string, word string) bool {
	for _, w := range words {
		if w == word {
			return true
		}
	}
	return false
}
