package store

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	onboardingdb "github.com/pagegroup/pageos/internal/onboarding/store/gen"
)

type Store struct {
	*onboardingdb.Queries
	pool *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{Queries: onboardingdb.New(db), pool: db}
}

func (s *Store) ExecTx(ctx context.Context, fn func(*onboardingdb.Queries, pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := onboardingdb.New(tx)
	if err := fn(q, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
