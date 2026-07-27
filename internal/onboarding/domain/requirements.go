// Package domain contains the onboarding domain model and the hardcoded
// requirement sets. Conditions are plain Go functions — no DSL, no DB config.
// See docs/onboarding-slice-plan.md §6.
package domain

import "time"

// ObligationType describes when a requirement must be satisfied.
type ObligationType string

const (
	Required    ObligationType = "required"
	Optional    ObligationType = "optional"
	Conditional ObligationType = "conditional"
)

// CategoryType classifies what a requirement expects.
type CategoryType string

const (
	DocumentCategory CategoryType = "document"
	FieldCategory    CategoryType = "field"
	ConsentCategory  CategoryType = "consent"
)

// RequirementItem is one entry in a requirement set.
type RequirementItem struct {
	Key        string
	Label      string
	Category   CategoryType
	Obligation ObligationType
	// Condition is evaluated against ApplicationFields; nil = always applies.
	// For Conditional items, obligation is "required" when Condition returns true.
	Condition func(f ApplicationFields) bool
}

// RequirementSet is a versioned list of items for one client type.
type RequirementSet struct {
	ClientType string
	Version    int
	Items      []RequirementItem
}

// ApplicationFields is the subset of application_data the requirement engine
// needs to evaluate conditions. Kept small — don't add fields here unless a
// condition actually reads them.
type ApplicationFields struct {
	IsUSPerson   bool
	IsPEP        bool
	IsMinor      bool     // derived from date_of_birth < 18 years ago
	ClientType   string
	TNCAccepted  bool
}

// FieldsFromDOB computes IsMinor from a date of birth.
func FieldsFromDOB(dob *time.Time) bool {
	if dob == nil {
		return false
	}
	return time.Since(*dob) < 18*365*24*time.Hour
}

// ── Requirement sets (hardcoded until a third genuinely different case) ──────

// individualV1 is the v1 Individual/Joint requirement set drawn directly
// from PAGE Account Opening Form.pdf page 4.
var individualV1 = RequirementSet{
	ClientType: "individual",
	Version:    1,
	Items: []RequirementItem{
		{
			Key: "passport_photo", Label: "Passport Photograph",
			Category: DocumentCategory, Obligation: Required,
		},
		{
			Key: "valid_id", Label: "Valid Means of Identification",
			Category: DocumentCategory, Obligation: Required,
		},
		{
			Key: "utility_bill", Label: "Recent Utility Bill (within last 3 months)",
			Category: DocumentCategory, Obligation: Required,
		},
		{
			Key: "email_indemnity_form", Label: "Email Indemnity Form",
			Category: DocumentCategory, Obligation: Required,
		},
		{
			Key:      "birth_certificate_minor",
			Label:    "Birth Certificate (Minor)",
			Category: DocumentCategory, Obligation: Conditional,
			Condition: func(f ApplicationFields) bool { return f.IsMinor },
		},
		{
			Key:      "us_correspondence_address",
			Label:    "US Correspondence Address",
			Category: FieldCategory, Obligation: Conditional,
			Condition: func(f ApplicationFields) bool { return f.IsUSPerson },
		},
		{
			Key: "tnc_acceptance", Label: "Terms & Conditions Acceptance",
			Category: ConsentCategory, Obligation: Required,
		},
	},
}

// corporateV1 is the v1 Corporate requirement set — 10 documents as per the form.
// Adding this second set validates the RequirementSet abstraction earns its place.
var corporateV1 = RequirementSet{
	ClientType: "corporate",
	Version:    1,
	Items: []RequirementItem{
		{Key: "certificate_of_incorporation", Label: "Certificate of Incorporation", Category: DocumentCategory, Obligation: Required},
		{Key: "memorandum_articles",          Label: "Memorandum & Articles of Association", Category: DocumentCategory, Obligation: Required},
		{Key: "board_resolution",             Label: "Board Resolution (authorising investment)", Category: DocumentCategory, Obligation: Required},
		{Key: "co2_co7",                      Label: "Particulars of Directors (CO2) & Shareholders (CO7)", Category: DocumentCategory, Obligation: Required},
		{Key: "current_status_report",        Label: "Current Status Report", Category: DocumentCategory, Obligation: Required},
		{Key: "signatory_passport_photos",    Label: "Passport Photos of Authorised Signatories", Category: DocumentCategory, Obligation: Required},
		{Key: "signatory_valid_ids",          Label: "Valid IDs for Directors/Authorised Signatories", Category: DocumentCategory, Obligation: Required},
		{Key: "signature_mandate",            Label: "List of Authorised Signatories & Signature Mandate", Category: DocumentCategory, Obligation: Required},
		{Key: "utility_bill",                 Label: "Utility Bill", Category: DocumentCategory, Obligation: Required},
		{Key: "email_indemnity_form",         Label: "Email Indemnity Form", Category: DocumentCategory, Obligation: Required},
		{Key: "tnc_acceptance",               Label: "Terms & Conditions Acceptance", Category: ConsentCategory, Obligation: Required},
	},
}

// GetRequirementSet returns the requirement set for the given client type and
// version. Returns individualV1 as fallback for unknown types (safe for v1).
func GetRequirementSet(clientType string, version int) RequirementSet {
	switch clientType {
	case "corporate":
		return corporateV1
	default:
		return individualV1
	}
}
