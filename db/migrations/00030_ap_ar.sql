-- +goose Up
-- Accounts Payable: vendor master + invoices + lines.
-- Accounts Receivable: client invoices + receipts.
-- Both auto-generate reference numbers via the shared document_counter table.

-- Shared counter for AP/AR/vendor reference numbers.
CREATE TABLE finance.document_counter (
    year     int  NOT NULL,
    doc_type text NOT NULL,
    last_seq int  NOT NULL DEFAULT 0,
    PRIMARY KEY (year, doc_type)
);

-- ── Vendor Master ─────────────────────────────────────────────────────────────
CREATE TABLE finance.vendor (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    code               text        NOT NULL UNIQUE,        -- VEN0001
    name               text        NOT NULL,
    short_name         text        NOT NULL DEFAULT '',
    tax_id             text        NOT NULL DEFAULT '',    -- TIN (FIRS)
    address            text        NOT NULL DEFAULT '',
    contact_name       text        NOT NULL DEFAULT '',
    contact_email      text        NOT NULL DEFAULT '',
    contact_phone      text        NOT NULL DEFAULT '',
    bank_name          text        NOT NULL DEFAULT '',
    bank_account_name  text        NOT NULL DEFAULT '',
    bank_account_no    text        NOT NULL DEFAULT '',
    payment_terms_days int         NOT NULL DEFAULT 30,
    default_expense_code text      NOT NULL DEFAULT '',    -- default CoA debit account
    wht_applicable     boolean     NOT NULL DEFAULT false,
    wht_rate           numeric(5,2) NOT NULL DEFAULT 5.00, -- default 5% WHT
    is_active          boolean     NOT NULL DEFAULT true,
    subsidiary_id      uuid        REFERENCES organization.subsidiary(id),
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_name ON finance.vendor (name);

-- ── Accounts Payable (purchase invoices) ──────────────────────────────────────
CREATE TABLE finance.payable (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    reference          text         NOT NULL UNIQUE,       -- AP/2026/001
    vendor_id          uuid         NOT NULL REFERENCES finance.vendor(id),
    subsidiary_id      uuid         REFERENCES organization.subsidiary(id),
    vendor_invoice_no  text         NOT NULL DEFAULT '',   -- vendor's own ref
    invoice_date       date         NOT NULL,
    due_date           date         NOT NULL,
    description        text         NOT NULL DEFAULT '',
    status             text         NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','paid','partial','overdue','cancelled')),
    gross_amount       numeric(18,2) NOT NULL DEFAULT 0,
    wht_amount         numeric(18,2) NOT NULL DEFAULT 0,
    net_payable        numeric(18,2) NOT NULL DEFAULT 0,
    amount_paid        numeric(18,2) NOT NULL DEFAULT 0,
    bank_account_code  text         NOT NULL DEFAULT '1110', -- bank to pay from
    created_by         uuid         NOT NULL,
    created_by_name    text         NOT NULL DEFAULT '',
    approved_by        uuid,
    approved_at        timestamptz,
    journal_id         uuid         REFERENCES finance.journal_header(id),
    payment_journal_id uuid         REFERENCES finance.journal_header(id),
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_payable_vendor  ON finance.payable (vendor_id);
CREATE INDEX idx_payable_status  ON finance.payable (status);
CREATE INDEX idx_payable_due     ON finance.payable (due_date);

CREATE TABLE finance.payable_line (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    payable_id   uuid         NOT NULL REFERENCES finance.payable(id) ON DELETE CASCADE,
    line_number  int          NOT NULL,
    description  text         NOT NULL,
    account_code text         NOT NULL,
    account_name text         NOT NULL DEFAULT '',
    quantity     numeric(10,2) NOT NULL DEFAULT 1,
    unit_price   numeric(18,2) NOT NULL DEFAULT 0,
    amount       numeric(18,2) NOT NULL DEFAULT 0,
    UNIQUE (payable_id, line_number)
);

-- ── Accounts Receivable (client invoices) ─────────────────────────────────────
CREATE TABLE finance.receivable (
    id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    reference         text         NOT NULL UNIQUE,       -- REC/2026/001
    -- client can be linked to onboarding.client or stored as free text
    client_id         uuid,                               -- onboarding.client.id (optional)
    client_name       text         NOT NULL,
    client_email      text         NOT NULL DEFAULT '',
    subsidiary_id     uuid         REFERENCES organization.subsidiary(id),
    invoice_date      date         NOT NULL,
    due_date          date         NOT NULL,
    fee_type          text         NOT NULL DEFAULT '',   -- management_fee, performance_fee, etc.
    description       text         NOT NULL DEFAULT '',
    status            text         NOT NULL DEFAULT 'outstanding'
                          CHECK (status IN ('draft','outstanding','partial','paid','overdue','cancelled')),
    gross_amount      numeric(18,2) NOT NULL DEFAULT 0,
    wht_deducted      numeric(18,2) NOT NULL DEFAULT 0,
    amount_received   numeric(18,2) NOT NULL DEFAULT 0,
    receivable_account_code text   NOT NULL DEFAULT '1130',
    revenue_account_code    text   NOT NULL DEFAULT '4001',
    created_by        uuid         NOT NULL,
    created_by_name   text         NOT NULL DEFAULT '',
    journal_id        uuid         REFERENCES finance.journal_header(id),
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_receivable_status ON finance.receivable (status);
CREATE INDEX idx_receivable_due    ON finance.receivable (due_date);
CREATE INDEX idx_receivable_client ON finance.receivable (client_id);

CREATE TABLE finance.receivable_receipt (
    id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    receivable_id  uuid          NOT NULL REFERENCES finance.receivable(id) ON DELETE CASCADE,
    receipt_date   date          NOT NULL,
    amount         numeric(18,2) NOT NULL,
    bank_account_code text       NOT NULL DEFAULT '1110',
    bank_account_name text       NOT NULL DEFAULT 'Cash at Bank',
    reference      text          NOT NULL DEFAULT '',
    notes          text          NOT NULL DEFAULT '',
    journal_id     uuid          REFERENCES finance.journal_header(id),
    created_by     uuid,
    created_at     timestamptz   NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS finance.receivable_receipt;
DROP TABLE IF EXISTS finance.receivable;
DROP TABLE IF EXISTS finance.payable_line;
DROP TABLE IF EXISTS finance.payable;
DROP TABLE IF EXISTS finance.vendor;
DROP TABLE IF EXISTS finance.document_counter;
