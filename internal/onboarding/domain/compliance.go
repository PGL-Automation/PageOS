package domain

import (
	"time"

	"github.com/google/uuid"
)

type CheckOutcome string

const (
	OutcomePass      CheckOutcome = "pass"
	OutcomeFail      CheckOutcome = "fail"
	OutcomeNeedsInfo CheckOutcome = "needs_info"
)

const (
	CheckTypePEP             = "pep_screening"
	CheckTypeSanctions       = "sanctions_screening"
	CheckTypeSourceOfFunds   = "source_of_funds"
	CheckTypeIDVerification  = "id_verification"
	CheckTypeBVN             = "bvn_validation"
	CheckTypeAddress         = "address_verification"
	CheckTypeDuplicateClient = "duplicate_client_check"
)

type ComplianceCheck struct {
	ID          uuid.UUID    `json:"id"`
	CaseID      uuid.UUID    `json:"case_id"`
	CheckType   string       `json:"check_type"`
	Outcome     CheckOutcome `json:"outcome"`
	Notes       string       `json:"notes"`
	Source      string       `json:"source"`
	PerformedBy uuid.UUID    `json:"performed_by"`
	PerformedAt time.Time    `json:"performed_at"`
}

type ScreeningProvider interface {
	// Future API integration hooks will go here
}
