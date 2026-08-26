-- +goose Up
-- Accounting periods: controls which months are open for journal posting.
-- status: open = accepting new journals, closed = reporting only, locked = immutable.

CREATE TABLE finance.period (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    subsidiary_id  uuid        REFERENCES organization.subsidiary(id), -- NULL = applies to all
    year           int         NOT NULL,
    month          int         NOT NULL CHECK (month BETWEEN 1 AND 12),
    name           text        NOT NULL,   -- e.g. "November 2026"
    status         text        NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','closed','locked')),
    opened_at      timestamptz NOT NULL DEFAULT now(),
    opened_by      uuid,                   -- identity.users.id
    closed_at      timestamptz,
    closed_by      uuid,
    UNIQUE (subsidiary_id, year, month)
);

CREATE INDEX idx_period_status ON finance.period (status);
CREATE INDEX idx_period_year   ON finance.period (year, month);

-- Seed 2026 periods (group-wide, subsidiary_id = NULL).
-- Jan–Jul are closed (historical); Aug–Dec are open.
-- +goose StatementBegin
DO $$
DECLARE
    months text[] := ARRAY[
        'January','February','March','April','May','June',
        'July','August','September','October','November','December'
    ];
    m int;
BEGIN
    FOR m IN 1..12 LOOP
        INSERT INTO finance.period (subsidiary_id, year, month, name, status)
        VALUES (
            NULL, 2026, m,
            months[m] || ' 2026',
            CASE WHEN m <= 7 THEN 'closed' ELSE 'open' END
        )
        ON CONFLICT (subsidiary_id, year, month) DO NOTHING;
    END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
DROP TABLE IF EXISTS finance.period;
