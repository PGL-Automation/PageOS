// Package store is the identity module's persistence layer: a thin repository
// over the sqlc-generated queries. Domain/service code depends on this, never
// on the generated package directly.
package store

import (
	"github.com/jackc/pgx/v5/pgxpool"

	identitydb "github.com/pagegroup/pageos/internal/identity/store/gen"
)

// Store wraps the generated Queries with a pgx pool.
type Store struct {
	*identitydb.Queries
}

func New(db *pgxpool.Pool) *Store {
	return &Store{Queries: identitydb.New(db)}
}
