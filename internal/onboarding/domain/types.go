package domain

import (
	"time"

	"github.com/google/uuid"
)

// Client is the customer identity — reusable across future products.
type Client struct {
	ID           uuid.UUID  `json:"ID"`
	SubsidiaryID uuid.UUID  `json:"SubsidiaryID"`
	ClientType   string     `json:"ClientType"`
	DisplayName  string     `json:"DisplayName"`
	Status       string     `json:"Status"`
	BrokerID     *uuid.UUID `json:"BrokerID,omitempty"`
}

// OnboardingCase is one application process instance.
type OnboardingCase struct {
	ID                    uuid.UUID  `json:"ID"`
	ClientID              uuid.UUID  `json:"ClientID"`
	SubsidiaryID          uuid.UUID  `json:"SubsidiaryID"`
	ClientType            string     `json:"ClientType"`
	RequirementSetVersion int32      `json:"RequirementSetVersion"`
	State                 string     `json:"State"`
	RiskFlag              bool       `json:"RiskFlag"`
	RiskNotes             string     `json:"RiskNotes,omitempty"`
	ReturnCount           int32      `json:"ReturnCount"`
	ReturnNotes           string     `json:"ReturnNotes,omitempty"`
	InitiatedBy           uuid.UUID  `json:"InitiatedBy"`
	TNCVersion            string     `json:"TNCVersion,omitempty"`
	TNCAcceptedAt         *time.Time `json:"TNCAcceptedAt,omitempty"`
	SubmittedAt           *time.Time `json:"SubmittedAt,omitempty"`
}

// ApplicationData holds the structured form fields keyed to a case.
type ApplicationData struct {
	CaseID                   uuid.UUID  `json:"case_id"`
	FullName                 string     `json:"full_name"`
	Gender                   string     `json:"gender"`
	MothersMaidenName        string     `json:"mothers_maiden_name"`
	DateOfBirth              *time.Time `json:"date_of_birth,omitempty"`
	PlaceOfBirth             string     `json:"place_of_birth"`
	CountryOfOrigin          string     `json:"country_of_origin"`
	PlaceOfResidence         string     `json:"place_of_residence"`
	ResidentialAddress       string     `json:"residential_address"`
	IsUSPerson               bool       `json:"is_us_person"`
	USAddress                string     `json:"us_address,omitempty"`
	PhoneNumbers             []string   `json:"phone_numbers"`
	Email                    string     `json:"email"`
	TIN                      string     `json:"tin"`
	NextOfKinName            string     `json:"next_of_kin_name"`
	NextOfKinEmail           string     `json:"next_of_kin_email"`
	NextOfKinPhone           string     `json:"next_of_kin_phone"`
	Employer                 string     `json:"employer"`
	EmployerAddress          string     `json:"employer_address"`
	OfficialEmail            string     `json:"official_email"`
	OfficialPhone            string     `json:"official_phone"`
	IsPEP                    bool       `json:"is_pep"`
	PEPPosition              string     `json:"pep_position,omitempty"`
	PEPPeriod                string     `json:"pep_period,omitempty"`
	SocialMedia              map[string]string `json:"social_media,omitempty"`
	SourceOfFunds            string     `json:"source_of_funds"`
	SourceOfWealth           string     `json:"source_of_wealth"`
	InvestmentPurpose        string     `json:"investment_purpose"`
	InvestmentAmountKobo     int64      `json:"investment_amount_kobo"`
	InvestmentAmountWords    string     `json:"investment_amount_words"`
	Tenor                    string     `json:"tenor"`
	InterestRateBps          int32      `json:"interest_rate_bps"`
	BankName                 string     `json:"bank_name"`
	BankAccountName          string     `json:"bank_account_name"`
	BankAccountNumber        string     `json:"bank_account_number"`
	BVN                      string     `json:"bvn"`
	SortCode                 string     `json:"sort_code"`
	DeclarationLegalCapacity bool       `json:"declaration_legal_capacity"`
	DeclarationInfoCorrect   bool       `json:"declaration_info_correct"`
	DeclarationTNCAccepted   bool       `json:"declaration_tnc_accepted"`
	DeclarationMinHolding    bool       `json:"declaration_min_holding"`
}

// ToApplicationFields extracts the fields the requirement engine needs.
func (d ApplicationData) ToApplicationFields() ApplicationFields {
	return ApplicationFields{
		IsUSPerson:  d.IsUSPerson,
		IsPEP:       d.IsPEP,
		IsMinor:     FieldsFromDOB(d.DateOfBirth),
		ClientType:  "",
		TNCAccepted: d.DeclarationTNCAccepted,
	}
}

// RequirementInstance is the per-case materialisation of one requirement item.
type RequirementInstance struct {
	ID             uuid.UUID  `json:"id"`
	CaseID         uuid.UUID  `json:"case_id"`
	RequirementKey string     `json:"requirement_key"`
	Label          string     `json:"label"`
	Category       string     `json:"category"`
	Obligation     string     `json:"obligation"`
	Status         string     `json:"status"` // pending | satisfied | not_applicable
	DocumentID     *uuid.UUID `json:"document_id,omitempty"`
	SatisfiedAt    *time.Time `json:"satisfied_at,omitempty"`
}

// RMClient is an active RM → Client assignment.
type RMClient struct {
	ID           uuid.UUID  `json:"id"`
	ClientID     uuid.UUID  `json:"client_id"`
	RMPersonID   uuid.UUID  `json:"rm_person_id"`
	SubsidiaryID uuid.UUID  `json:"subsidiary_id"`
	AssignedBy   uuid.UUID  `json:"assigned_by"`
	AssignedAt   time.Time  `json:"assigned_at"`
	EndedAt      *time.Time `json:"ended_at,omitempty"`
}

// CaseDetails is the full view returned by GetCaseDetails.
type CaseDetails struct {
	Case         OnboardingCase        `json:"case"`
	Application  *ApplicationData      `json:"application,omitempty"`
	Requirements []RequirementInstance `json:"requirements"`
	CanSubmit    bool                  `json:"can_submit"`
}

// CaseNote is a follow-up or activity note logged by a WM on a case.
type CaseNote struct {
	ID         uuid.UUID `json:"id"`
	CaseID     uuid.UUID `json:"case_id"`
	AuthorID   uuid.UUID `json:"author_id"`
	AuthorName string    `json:"author_name,omitempty"`
	NoteType   string    `json:"note_type"` // internal | client | compliance
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
}

// ComplianceCheckWithName extends ComplianceCheck with the performer's display name.
type ComplianceCheckWithName struct {
	ComplianceCheck
	PerformerName string `json:"performer_name,omitempty"`
}
