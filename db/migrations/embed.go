// Package migrations embeds all SQL migration files so the compiled binary
// can run them without needing the source tree on disk (Docker, staging, prod).
package migrations

import "embed"

// FS holds every *.sql file in this directory.
//
//go:embed *.sql
var FS embed.FS
