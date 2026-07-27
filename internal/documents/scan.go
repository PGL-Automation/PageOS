package documents

// ScanProvider scans an uploaded file for malware. The stub implementation
// (used in v1) marks everything clean. A real implementation (ClamAV, cloud
// AV API) swaps in behind this interface with no caller changes.
type ScanProvider interface {
	// Scan returns "clean", "infected", or "error" for the given storage key.
	Scan(storageKey string) (string, error)
}

// StubScanProvider marks all files clean immediately (no actual scan).
type StubScanProvider struct{}

func (StubScanProvider) Scan(_ string) (string, error) { return "clean", nil }
