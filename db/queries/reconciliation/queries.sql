-- ── Bank accounts ─────────────────────────────────────────────────────────────

-- name: CreateBankAccount :one
INSERT INTO reconciliation.bank_account
    (subsidiary_id, bank_name, account_number, account_name, currency, parser_column_map)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListBankAccounts :many
SELECT * FROM reconciliation.bank_account
WHERE subsidiary_id = $1
ORDER BY bank_name;

-- name: GetBankAccount :one
SELECT * FROM reconciliation.bank_account WHERE id = $1;

-- name: UpdateBankAccountColumnMap :one
UPDATE reconciliation.bank_account SET parser_column_map = $2 WHERE id = $1 RETURNING *;

-- ── Bank statements ───────────────────────────────────────────────────────────

-- name: CreateBankStatement :one
INSERT INTO reconciliation.bank_statement
    (bank_account_id, period_start, period_end, opening_balance, closing_balance, imported_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListBankStatements :many
SELECT * FROM reconciliation.bank_statement
WHERE bank_account_id = $1
ORDER BY period_start DESC;

-- name: GetBankStatement :one
SELECT * FROM reconciliation.bank_statement WHERE id = $1;

-- ── Statement lines ───────────────────────────────────────────────────────────

-- name: CreateBankStatementLine :one
INSERT INTO reconciliation.bank_statement_line
    (statement_id, txn_date, value_date, debit_kobo, credit_kobo, balance_kobo, narration, reference, raw)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListStatementLines :many
SELECT * FROM reconciliation.bank_statement_line
WHERE statement_id = $1
ORDER BY txn_date, created_at;

-- name: GetUnmatchedBankLines :many
SELECT l.* FROM reconciliation.bank_statement_line l
JOIN reconciliation.bank_statement s ON s.id = l.statement_id
LEFT JOIN reconciliation.reconciliation_match m
    ON m.bank_line_id = l.id AND m.run_id = $1
WHERE s.bank_account_id = (SELECT bank_account_id FROM reconciliation.reconciliation_run WHERE id = $1)
  AND l.txn_date BETWEEN
      (SELECT period_start FROM reconciliation.reconciliation_run WHERE id = $1)
      AND (SELECT period_end   FROM reconciliation.reconciliation_run WHERE id = $1)
  AND m.id IS NULL
ORDER BY l.txn_date;

-- ── Internal transactions ─────────────────────────────────────────────────────

-- name: CreateInternalTransaction :one
INSERT INTO reconciliation.internal_transaction
    (subsidiary_id, bank_account_id, type, direction, amount_kobo, currency, reference,
     client_id, related_type, related_id, txn_date)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: ListInternalTransactionsByAccount :many
SELECT * FROM reconciliation.internal_transaction
WHERE bank_account_id = $1
  AND txn_date BETWEEN $2 AND $3
ORDER BY txn_date;

-- name: GetUnmatchedInternalTxns :many
SELECT t.* FROM reconciliation.internal_transaction t
LEFT JOIN reconciliation.reconciliation_match m
    ON m.internal_txn_id = t.id AND m.run_id = $1
WHERE t.bank_account_id = (SELECT bank_account_id FROM reconciliation.reconciliation_run WHERE id = $1)
  AND t.txn_date BETWEEN
      (SELECT period_start FROM reconciliation.reconciliation_run WHERE id = $1)
      AND (SELECT period_end   FROM reconciliation.reconciliation_run WHERE id = $1)
  AND m.id IS NULL
ORDER BY t.txn_date;

-- ── Reconciliation runs ───────────────────────────────────────────────────────

-- name: CreateReconciliationRun :one
INSERT INTO reconciliation.reconciliation_run
    (bank_account_id, period_start, period_end)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetReconciliationRun :one
SELECT * FROM reconciliation.reconciliation_run WHERE id = $1;

-- name: ListReconciliationRuns :many
SELECT * FROM reconciliation.reconciliation_run
WHERE bank_account_id = $1
ORDER BY period_start DESC;

-- name: UpdateRunStatus :one
UPDATE reconciliation.reconciliation_run
SET status = $2, reconciled_by = $3, reconciled_at = $4
WHERE id = $1
RETURNING *;

-- ── Matches ───────────────────────────────────────────────────────────────────

-- name: CreateMatch :one
INSERT INTO reconciliation.reconciliation_match
    (run_id, bank_line_id, internal_txn_id, status, match_type, confidence_pct, matched_by, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListMatches :many
SELECT * FROM reconciliation.reconciliation_match
WHERE run_id = $1
ORDER BY created_at;

-- name: GetRunSummary :one
SELECT
    COUNT(*) FILTER (WHERE status = 'matched')             AS matched,
    COUNT(*) FILTER (WHERE status = 'unmatched_bank')      AS unmatched_bank,
    COUNT(*) FILTER (WHERE status = 'unmatched_internal')  AS unmatched_internal,
    COUNT(*) FILTER (WHERE bank_line_id IS NOT NULL)       AS total_bank_lines,
    COUNT(*) FILTER (WHERE internal_txn_id IS NOT NULL)    AS total_internal_txns
FROM reconciliation.reconciliation_match
WHERE run_id = $1;
