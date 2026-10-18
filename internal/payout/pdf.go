package payout

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GenerateLetter returns a complete, print-optimised HTML document that serves
// as the bank instruction letter for the given payment request.
// The caller sets Content-Type: text/html; charset=utf-8 and writes the result.
func GenerateLetter(req PaymentRequest, account PaymentAccount) string {
	company := companyFromInstructionID(req.InstructionID)
	dateStr := time.Now().Format("2 January 2006")

	nairaPart := req.AmountKobo / 100
	koboPart := req.AmountKobo % 100

	amountFigures := formatNairaFigures(nairaPart, koboPart)
	amountWords := amountInWords(req.AmountKobo)

	var b strings.Builder

	b.WriteString(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bank Instruction Letter – `)
	b.WriteString(req.InstructionID)
	b.WriteString(`</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
  }

  .page {
    max-width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 20mm 18mm 20mm 18mm;
    background: #fff;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    margin-bottom: 24pt;
    padding-bottom: 12pt;
    border-bottom: 2px solid #000;
  }
  .header h1 {
    font-size: 16pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .header p {
    font-size: 10pt;
    margin-top: 4pt;
    color: #333;
  }

  /* ── Date & metadata ── */
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 18pt;
  }
  .meta .date {
    font-size: 11pt;
  }
  .ref-box {
    text-align: right;
  }
  .ref-box .ref-label {
    font-size: 9pt;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .ref-box .ref-value {
    font-size: 14pt;
    font-weight: bold;
    letter-spacing: 0.03em;
  }

  /* ── Title ── */
  .doc-title {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-decoration: underline;
    margin-bottom: 18pt;
  }

  /* ── Address block ── */
  .address-block {
    margin-bottom: 16pt;
    line-height: 1.6;
  }
  .address-block strong {
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
    display: block;
  }

  /* ── Instruction sentence ── */
  .instruction-sentence {
    margin-bottom: 18pt;
    line-height: 1.7;
    font-size: 12pt;
  }

  /* ── Payment table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 18pt;
    font-size: 11pt;
  }
  thead tr {
    background: #000;
    color: #fff;
  }
  thead th {
    padding: 7pt 8pt;
    text-align: left;
    font-weight: bold;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  tbody tr:nth-child(even) {
    background: #f5f5f5;
  }
  tbody td {
    padding: 7pt 8pt;
    vertical-align: top;
    border-bottom: 1px solid #ddd;
  }
  .amount-cell {
    font-weight: bold;
    white-space: nowrap;
  }

  /* ── Amount in words ── */
  .amount-words {
    margin-bottom: 18pt;
    padding: 10pt 12pt;
    border: 1px solid #ccc;
    background: #fafafa;
    font-size: 11pt;
  }
  .amount-words .aw-label {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #555;
    margin-bottom: 4pt;
  }
  .amount-words .aw-value {
    font-weight: bold;
    font-size: 12pt;
  }

  /* ── Narration box ── */
  .narration-box {
    margin-bottom: 24pt;
    padding: 10pt 12pt;
    border-left: 4px solid #000;
    background: #fffbe6;
    font-size: 11pt;
    line-height: 1.6;
  }
  .narration-box strong {
    display: block;
    margin-bottom: 4pt;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ── Signatories ── */
  .signatories {
    margin-top: 32pt;
    margin-bottom: 24pt;
  }
  .signatories h3 {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 20pt;
    padding-bottom: 4pt;
    border-bottom: 1px solid #999;
  }
  .sig-row {
    display: flex;
    gap: 40pt;
    margin-bottom: 32pt;
  }
  .sig-block {
    flex: 1;
  }
  .sig-line {
    display: flex;
    align-items: flex-end;
    margin-bottom: 10pt;
    font-size: 11pt;
  }
  .sig-line .sig-label {
    min-width: 72pt;
    font-size: 10pt;
    color: #555;
    flex-shrink: 0;
  }
  .sig-line .sig-value {
    flex: 1;
    border-bottom: 1px solid #000;
    min-height: 14pt;
    margin-left: 6pt;
  }

  /* ── Footer ── */
  .footer {
    margin-top: 24pt;
    padding-top: 10pt;
    border-top: 1px solid #ccc;
    font-size: 9pt;
    color: #666;
    text-align: center;
    line-height: 1.5;
  }

  /* ── Print overrides ── */
  @media print {
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    body { background: #fff; }
    .page {
      max-width: 100%;
      min-height: auto;
      padding: 0;
      margin: 0;
    }
    .narration-box { background: #fff; border-left: 4px solid #000; }
    .amount-words { background: #fff; }
    thead tr { background: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tbody tr:nth-child(even) { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <h1>`)
	b.WriteString(htmlEscape(company))
	b.WriteString(`</h1>
    <p>Authorized Bank Instruction</p>
  </div>

  <!-- Date + Reference -->
  <div class="meta">
    <div class="date">`)
	b.WriteString(htmlEscape(dateStr))
	b.WriteString(`</div>
    <div class="ref-box">
      <div class="ref-label">Instruction Reference</div>
      <div class="ref-value">`)
	b.WriteString(htmlEscape(req.InstructionID))
	b.WriteString(`</div>
    </div>
  </div>

  <!-- Title -->
  <div class="doc-title">Bank Instruction Letter</div>

  <!-- TO / FROM -->
  <div class="address-block">
    <strong>To:</strong>
    `)
	b.WriteString(htmlEscape(account.BankName))
	b.WriteString(`
  </div>
  <div class="address-block">
    <strong>From:</strong>
    `)
	b.WriteString(htmlEscape(account.AccountName))
	b.WriteString(`
  </div>

  <!-- Instruction sentence -->
  <p class="instruction-sentence">
    Please debit our account number <strong>`)
	b.WriteString(htmlEscape(account.AccountNumber))
	b.WriteString(`</strong> and effect the following payment:
  </p>

  <!-- Payment details table -->
  <table>
    <thead>
      <tr>
        <th>Beneficiary Name</th>
        <th>Beneficiary Bank</th>
        <th>Account Number</th>
        <th>Amount</th>
        <th>Purpose</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>`)
	b.WriteString(htmlEscape(req.BeneficiaryName))
	b.WriteString(`</td>
        <td>`)
	b.WriteString(htmlEscape(req.BeneficiaryBank))
	b.WriteString(`</td>
        <td>`)
	b.WriteString(htmlEscape(req.BeneficiaryAccount))
	b.WriteString(`</td>
        <td class="amount-cell">`)
	b.WriteString(htmlEscape(amountFigures))
	b.WriteString(`</td>
        <td>`)
	b.WriteString(htmlEscape(req.Purpose))
	b.WriteString(`</td>
      </tr>
    </tbody>
  </table>

  <!-- Amount in words -->
  <div class="amount-words">
    <div class="aw-label">Amount in Words</div>
    <div class="aw-value">`)
	b.WriteString(htmlEscape(amountWords))
	b.WriteString(`</div>
  </div>

  <!-- Narration reminder -->
  <div class="narration-box">
    <strong>Important – Bank Narration</strong>
    Payment reference <strong>`)
	b.WriteString(htmlEscape(req.InstructionID))
	b.WriteString(`</strong> must appear in the bank narration for this transaction.
  </div>

  <!-- Authorized Signatories -->
  <div class="signatories">
    <h3>Authorized Signatories</h3>
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-line"><span class="sig-label">Name:</span><span class="sig-value"></span></div>
        <div class="sig-line"><span class="sig-label">Signature:</span><span class="sig-value">`)
	b.WriteString(signatureImgTag(1))
	b.WriteString(`</span></div>
        <div class="sig-line"><span class="sig-label">Date:</span><span class="sig-value"></span></div>
      </div>
      <div class="sig-block">
        <div class="sig-line"><span class="sig-label">Name:</span><span class="sig-value"></span></div>
        <div class="sig-line"><span class="sig-label">Signature:</span><span class="sig-value">`)
	b.WriteString(signatureImgTag(2))
	b.WriteString(`</span></div>
        <div class="sig-line"><span class="sig-label">Date:</span><span class="sig-value"></span></div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    This instruction was generated by PageOS. Reference: `)
	b.WriteString(htmlEscape(req.InstructionID))
	b.WriteString(`
  </div>

</div>
</body>
</html>`)

	return b.String()
}

// ── Item 17: Signature specimens ─────────────────────────────────────────────

// signatureImgTag returns an <img> tag embedding the signatory's specimen
// image as a base64 data URL, or an empty string if no image is configured.
//
// Image files are looked up in PAGEOS_SIGNATURE_DIR (default: /opt/pageos/files/signatures/).
// Expected filenames: signatory_1.png / signatory_1.jpg, signatory_2.png / ...
func signatureImgTag(n int) string {
	dir := os.Getenv("PAGEOS_SIGNATURE_DIR")
	if dir == "" {
		dir = "/opt/pageos/files/signatures"
	}
	for _, ext := range []string{".png", ".jpg", ".jpeg"} {
		path := filepath.Join(dir, fmt.Sprintf("signatory_%d%s", n, ext))
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		mime := "image/png"
		if ext == ".jpg" || ext == ".jpeg" {
			mime = "image/jpeg"
		}
		encoded := base64.StdEncoding.EncodeToString(data)
		return fmt.Sprintf(
			`<img src="data:%s;base64,%s" alt="Signature" style="max-height:36pt;max-width:120pt;object-fit:contain;">`,
			mime, encoded,
		)
	}
	return "" // No image found — blank line will be printed for manual signing
}

// companyFromInstructionID derives the full company name from the three-letter
// prefix of the instruction ID (e.g. "PAM-APR-2026-000001" → "PAM").
func companyFromInstructionID(id string) string {
	prefix := id
	if idx := strings.Index(id, "-"); idx != -1 {
		prefix = id[:idx]
	}
	switch strings.ToUpper(prefix) {
	case "PAM":
		return "Page Asset Management Limited"
	case "PCL":
		return "Page Capital Limited"
	default:
		return "Page Group"
	}
}

// formatNairaFigures returns a human-readable currency string for display in the
// table, e.g. "₦500,000.00".
func formatNairaFigures(nairaPart, koboPart int64) string {
	formatted := formatWithCommas(nairaPart)
	return fmt.Sprintf("₦%s.%02d", formatted, koboPart)
}

// formatWithCommas inserts thousands separators, e.g. 1000000 → "1,000,000".
func formatWithCommas(n int64) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	var result []byte
	rem := len(s) % 3
	for i, ch := range s {
		if i != 0 && (i-rem)%3 == 0 {
			result = append(result, ',')
		}
		result = append(result, byte(ch))
	}
	return string(result)
}

// amountInWords converts a kobo amount to Nigerian English words.
// Examples:
//
//	50000000  → "Five Hundred Thousand Naira Only"
//	50000050  → "Five Hundred Thousand Naira and 50/100 Kobo"
func amountInWords(kobo int64) string {
	nairaPart := kobo / 100
	koboPart := kobo % 100

	nairaWords := integerInWords(nairaPart)

	var sb strings.Builder
	if nairaWords == "" {
		sb.WriteString("Zero")
	} else {
		sb.WriteString(nairaWords)
	}
	sb.WriteString(" Naira")

	if koboPart > 0 {
		sb.WriteString(fmt.Sprintf(" and %02d/100 Kobo", koboPart))
	} else {
		sb.WriteString(" Only")
	}

	return sb.String()
}

// integerInWords converts a non-negative integer to English words.
// Returns an empty string for zero.
func integerInWords(n int64) string {
	if n == 0 {
		return ""
	}
	if n < 0 {
		return "Negative " + integerInWords(-n)
	}

	switch {
	case n < 20:
		return ones[n]
	case n < 100:
		t := tens[n/10]
		if r := n % 10; r != 0 {
			return t + " " + ones[r]
		}
		return t
	case n < 1_000:
		h := ones[n/100] + " Hundred"
		if r := n % 100; r != 0 {
			return h + " " + integerInWords(r)
		}
		return h
	case n < 1_000_000:
		prefix := integerInWords(n/1_000) + " Thousand"
		if r := n % 1_000; r != 0 {
			return prefix + " " + integerInWords(r)
		}
		return prefix
	case n < 1_000_000_000:
		prefix := integerInWords(n/1_000_000) + " Million"
		if r := n % 1_000_000; r != 0 {
			return prefix + " " + integerInWords(r)
		}
		return prefix
	default:
		prefix := integerInWords(n/1_000_000_000) + " Billion"
		if r := n % 1_000_000_000; r != 0 {
			return prefix + " " + integerInWords(r)
		}
		return prefix
	}
}

var ones = []string{
	"", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
	"Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
	"Sixteen", "Seventeen", "Eighteen", "Nineteen",
}

var tens = []string{
	"", "", "Twenty", "Thirty", "Forty", "Fifty",
	"Sixty", "Seventy", "Eighty", "Ninety",
}

// htmlEscape replaces characters that have special meaning in HTML.
// Using a minimal inline version avoids importing html/template.
func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&#34;")
	return s
}
