package store

import (
	"github.com/jackc/pgx/v5/pgxpool"

	approvaldb "github.com/pagegroup/pageos/internal/approval/store/gen"
)

type Store struct {
	*approvaldb.Queries
}

func New(db *pgxpool.Pool) *Store {
	return &Store{Queries: approvaldb.New(db)}
}
