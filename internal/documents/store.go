package documents

import (
	"github.com/jackc/pgx/v5/pgxpool"

	documentsdb "github.com/pagegroup/pageos/internal/documents/store/gen"
)

type store struct {
	*documentsdb.Queries
}

func newStore(db *pgxpool.Pool) *store {
	return &store{Queries: documentsdb.New(db)}
}
