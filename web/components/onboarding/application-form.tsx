"use client";

import { useForm, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Save, User, Shield, Users, Briefcase,
  Share2, TrendingUp, Building, FileCheck,
} from "lucide-react";

/* ─── Schema ─────────────────────────────────────────────────────── */
const schema = z.object({
  full_name:            z.string().min(2, "Full name is required"),
  gender:               z.string().min(1, "Gender is required"),
  mothers_maiden_name:  z.string().optional(),
  date_of_birth:        z.string().optional(),
  place_of_birth:       z.string().optional(),
  country_of_origin:    z.string().min(1, "Country of origin is required"),
  place_of_residence:   z.string().optional(),
  residential_address:  z.string().min(5, "Residential address is required"),
  phone_numbers:        z.string().min(7, "Phone number is required"),
  email:                z.string().email("Invalid email address"),
  tin:                  z.string().optional(),

  is_us_person: z.boolean(),
  us_address:   z.string().optional(),

  next_of_kin_name:  z.string().optional(),
  next_of_kin_email: z.string().optional(),
  next_of_kin_phone: z.string().optional(),

  employer:         z.string().optional(),
  employer_address: z.string().optional(),
  official_email:   z.string().optional(),
  official_phone:   z.string().optional(),

  is_pep:       z.boolean(),
  pep_position: z.string().optional(),
  pep_period:   z.string().optional(),

  social_facebook:  z.string().optional(),
  social_instagram: z.string().optional(),
  social_twitter:   z.string().optional(),
  social_linkedin:  z.string().optional(),

  source_of_funds:     z.string().min(1, "Source of funds is required"),
  source_of_wealth:    z.string().min(1, "Source of wealth is required"),
  investment_purpose:  z.string().min(1, "Investment purpose is required"),
  investment_currency: z.enum(["NGN", "USD"]),
  investment_amount:   z.number().min(0, "Amount must be positive"),
  tenor:               z.string().optional(),
  interest_rate_bps:   z.number().min(0),

  bank_name:           z.string().min(1, "Bank name is required"),
  bank_account_name:   z.string().min(1, "Account name is required"),
  bank_account_number: z.string().min(10, "Account number must be at least 10 digits"),
  bvn:                 z.string().min(11, "BVN must be 11 digits").max(11, "BVN must be 11 digits"),
  sort_code:           z.string().optional(),

  declaration_legal_capacity: z.boolean(),
  declaration_info_correct:   z.boolean(),
  declaration_tnc_accepted:   z.boolean().refine(v => v === true, "Must accept T&Cs"),
  declaration_min_holding:    z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export interface ApplicationFormProps {
  caseId:         string;
  initialData?:   Record<string, unknown>;
  readOnly?:      boolean;
  onSaveSuccess?: () => void;
}

/* ─── Section card (defined at module level — never re-created) ─── */
function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--pg-card-border)", boxShadow: "0 1px 4px var(--pg-card-shadow)" }}
    >
      <div
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ background: "var(--pg-muted-bg)", borderBottom: "1px solid var(--pg-row-border)" }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "1px solid #bfdbfe" }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h3 className="text-[13px] font-bold leading-none" style={{ color: "var(--pg-text-1)" }}>
            {title}
          </h3>
          {description && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--pg-text-3)" }}>
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

/* ─── Text / date / number field (module level — stable reference) ─ */
function F({
  control,
  readOnly,
  name,
  label,
  placeholder,
  type = "text",
}: {
  control:     Control<FormValues>;
  readOnly?:   boolean;
  name:        keyof FormValues;
  label:       string;
  placeholder?: string;
  type?:       string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
            {label}
          </FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              disabled={readOnly}
              {...field}
              value={typeof field.value === "boolean" ? undefined : String(field.value ?? "")}
              onChange={
                type === "number"
                  ? (e) => field.onChange(e.target.valueAsNumber || 0)
                  : field.onChange
              }
              className="h-9 text-[13px] rounded-lg"
            />
          </FormControl>
          <FormMessage className="text-[11px]" />
        </FormItem>
      )}
    />
  );
}

/* ─── Checkbox field (module level — stable reference) ──────────── */
function C({
  control,
  readOnly,
  name,
  label,
  description,
}: {
  control:     Control<FormValues>;
  readOnly?:   boolean;
  name:        keyof FormValues;
  label:       string;
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className="flex flex-row items-start gap-3 p-3.5 rounded-xl"
          style={{ background: "var(--pg-muted-bg)", border: "1px solid var(--pg-row-border)" }}
        >
          <FormControl>
            <Checkbox
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              disabled={readOnly}
              className="mt-0.5"
            />
          </FormControl>
          <div className="space-y-0.5 leading-none">
            <FormLabel
              className="text-[12px] font-semibold cursor-pointer"
              style={{ color: "var(--pg-text-1)" }}
            >
              {label}
            </FormLabel>
            {description && (
              <p className="text-[11px]" style={{ color: "var(--pg-text-3)" }}>
                {description}
              </p>
            )}
          </div>
        </FormItem>
      )}
    />
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function ApplicationForm({ caseId, initialData, readOnly, onSaveSuccess }: ApplicationFormProps) {
  const { toast }       = useToast();
  const queryClient     = useQueryClient();

  const storedCurrency  = (initialData?.investment_currency as string) ?? "NGN";
  const storedKobo      = Number(initialData?.investment_amount_kobo ?? 0);
  const storedAmount    = storedKobo > 0 ? storedKobo / 100 : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name:            (initialData?.full_name as string)            ?? "",
      gender:               (initialData?.gender as string)               ?? "",
      mothers_maiden_name:  (initialData?.mothers_maiden_name as string)  ?? "",
      date_of_birth:        initialData?.date_of_birth ? String(initialData.date_of_birth).slice(0, 10) : "",
      place_of_birth:       (initialData?.place_of_birth as string)       ?? "",
      country_of_origin:    (initialData?.country_of_origin as string)    ?? "",
      place_of_residence:   (initialData?.place_of_residence as string)   ?? "",
      residential_address:  (initialData?.residential_address as string)  ?? "",
      phone_numbers:        (initialData?.phone_numbers as string[])?.join(", ") ?? "",
      email:                (initialData?.email as string)                ?? "",
      tin:                  (initialData?.tin as string)                  ?? "",
      is_us_person:         Boolean(initialData?.is_us_person),
      us_address:           (initialData?.us_address as string)           ?? "",
      next_of_kin_name:     (initialData?.next_of_kin_name as string)     ?? "",
      next_of_kin_email:    (initialData?.next_of_kin_email as string)    ?? "",
      next_of_kin_phone:    (initialData?.next_of_kin_phone as string)    ?? "",
      employer:             (initialData?.employer as string)             ?? "",
      employer_address:     (initialData?.employer_address as string)     ?? "",
      official_email:       (initialData?.official_email as string)       ?? "",
      official_phone:       (initialData?.official_phone as string)       ?? "",
      is_pep:               Boolean(initialData?.is_pep),
      pep_position:         (initialData?.pep_position as string)         ?? "",
      pep_period:           (initialData?.pep_period as string)           ?? "",
      social_facebook:      (initialData?.social_media as Record<string, string>)?.facebook  ?? "",
      social_instagram:     (initialData?.social_media as Record<string, string>)?.instagram ?? "",
      social_twitter:       (initialData?.social_media as Record<string, string>)?.twitter   ?? "",
      social_linkedin:      (initialData?.social_media as Record<string, string>)?.linkedin  ?? "",
      source_of_funds:      (initialData?.source_of_funds as string)      ?? "",
      source_of_wealth:     (initialData?.source_of_wealth as string)     ?? "",
      investment_purpose:   (initialData?.investment_purpose as string)   ?? "",
      investment_currency:  storedCurrency as "NGN" | "USD",
      investment_amount:    storedAmount,
      tenor:                (initialData?.tenor as string)                ?? "",
      interest_rate_bps:    Number(initialData?.interest_rate_bps ?? 0),
      bank_name:            (initialData?.bank_name as string)            ?? "",
      bank_account_name:    (initialData?.bank_account_name as string)    ?? "",
      bank_account_number:  (initialData?.bank_account_number as string)  ?? "",
      bvn:                  (initialData?.bvn as string)                  ?? "",
      sort_code:            (initialData?.sort_code as string)            ?? "",
      declaration_legal_capacity: Boolean(initialData?.declaration_legal_capacity),
      declaration_info_correct:   Boolean(initialData?.declaration_info_correct),
      declaration_tnc_accepted:   Boolean(initialData?.declaration_tnc_accepted),
      declaration_min_holding:    Boolean(initialData?.declaration_min_holding),
    },
  });

  const isPEP       = form.watch("is_pep");
  const isUSPerson  = form.watch("is_us_person");
  const currency    = form.watch("investment_currency");
  const ctrl        = form.control;

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amountKobo = Math.round(values.investment_amount * 100);
      const { data, error } = await api.PUT("/onboarding/cases/{id}/application", {
        params: { path: { id: caseId } },
        body: {
          case_id:             caseId,
          full_name:           values.full_name,
          gender:              values.gender,
          mothers_maiden_name: values.mothers_maiden_name      ?? "",
          date_of_birth:       values.date_of_birth ? values.date_of_birth + "T00:00:00Z" : undefined,
          place_of_birth:      values.place_of_birth           ?? "",
          country_of_origin:   values.country_of_origin,
          place_of_residence:  values.place_of_residence       ?? "",
          residential_address: values.residential_address,
          is_us_person:        values.is_us_person,
          us_address:          values.us_address               ?? "",
          phone_numbers:       values.phone_numbers.split(",").map(p => p.trim()).filter(Boolean),
          email:               values.email,
          tin:                 values.tin                      ?? "",
          next_of_kin_name:    values.next_of_kin_name         ?? "",
          next_of_kin_email:   values.next_of_kin_email        ?? "",
          next_of_kin_phone:   values.next_of_kin_phone        ?? "",
          employer:            values.employer                 ?? "",
          employer_address:    values.employer_address         ?? "",
          official_email:      values.official_email           ?? "",
          official_phone:      values.official_phone           ?? "",
          is_pep:              values.is_pep,
          pep_position:        values.pep_position             ?? "",
          pep_period:          values.pep_period               ?? "",
          social_media: {
            ...(values.social_facebook  ? { facebook:  values.social_facebook  } : {}),
            ...(values.social_instagram ? { instagram: values.social_instagram } : {}),
            ...(values.social_twitter   ? { twitter:   values.social_twitter   } : {}),
            ...(values.social_linkedin  ? { linkedin:  values.social_linkedin  } : {}),
          },
          source_of_funds:         values.source_of_funds,
          source_of_wealth:        values.source_of_wealth,
          investment_purpose:      values.investment_purpose,
          investment_amount_kobo:  amountKobo,
          investment_amount_words: values.investment_currency,
          tenor:                   values.tenor              ?? "",
          interest_rate_bps:       values.interest_rate_bps,
          bank_name:               values.bank_name,
          bank_account_name:       values.bank_account_name,
          bank_account_number:     values.bank_account_number,
          bvn:                     values.bvn,
          sort_code:               values.sort_code          ?? "",
          declaration_legal_capacity: values.declaration_legal_capacity,
          declaration_info_correct:   values.declaration_info_correct,
          declaration_tnc_accepted:   values.declaration_tnc_accepted,
          declaration_min_holding:    values.declaration_min_holding,
        },
      });
      if (error) throw new Error("Failed to save application");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast({ title: "Draft Saved", description: "Application data saved successfully." });
      onSaveSuccess?.();
    },
    onError: (err) => {
      toast({ title: "Save Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(v => saveMutation.mutate(v))} className="space-y-5">

        {/* ── 1. Personal Information ────────────────────────────── */}
        <Section
          icon={User}
          title="Personal Information"
          description="Legal name, date of birth, and contact details"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="full_name"
               label="Full Name (Surname First)" placeholder="Okonkwo, Chidera James" />

            {/* Gender — Select can't use the F shortcut */}
            <FormField
              control={ctrl}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                    Gender
                  </FormLabel>
                  <Select disabled={readOnly} onValueChange={field.onChange} value={field.value as string}>
                    <FormControl>
                      <SelectTrigger className="h-9 text-[13px] rounded-lg">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                      <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="mothers_maiden_name"
               label="Mother's Maiden Name" placeholder="Okafor" />
            <F control={ctrl} readOnly={readOnly} name="date_of_birth"
               label="Date of Birth" type="date" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="place_of_birth"
               label="Place of Birth" placeholder="Lagos, Nigeria" />
            <F control={ctrl} readOnly={readOnly} name="country_of_origin"
               label="Country of Origin" placeholder="Nigeria" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="place_of_residence"
               label="City of Residence" placeholder="Lagos" />
            <F control={ctrl} readOnly={readOnly} name="tin"
               label="TIN" placeholder="12345678-0001" />
          </div>

          <F control={ctrl} readOnly={readOnly} name="residential_address"
             label="Residential Address" placeholder="12 Victoria Island, Lagos" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="phone_numbers"
               label="Phone Number(s)" placeholder="+234 801 234 5678" />
            <F control={ctrl} readOnly={readOnly} name="email"
               label="Email Address" type="email" placeholder="john@example.com" />
          </div>
        </Section>

        {/* ── 2. FATCA ───────────────────────────────────────────── */}
        <Section
          icon={Shield}
          title="FATCA / US Person"
          description="Required for US citizens, residents, or tax obligees"
        >
          <C control={ctrl} readOnly={readOnly} name="is_us_person"
             label="I am a US Person / FATCA Subject"
             description="Check if you have US citizenship, residency, or tax obligations." />
          {isUSPerson && (
            <F control={ctrl} readOnly={readOnly} name="us_address"
               label="US Correspondence Address" placeholder="123 Main St, New York, NY 10001" />
          )}
        </Section>

        {/* ── 3. Next of Kin ─────────────────────────────────────── */}
        <Section icon={Users} title="Next of Kin">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <F control={ctrl} readOnly={readOnly} name="next_of_kin_name"
               label="Full Name" placeholder="Jane Doe" />
            <F control={ctrl} readOnly={readOnly} name="next_of_kin_email"
               label="Email" type="email" placeholder="jane@example.com" />
            <F control={ctrl} readOnly={readOnly} name="next_of_kin_phone"
               label="Phone" placeholder="+234..." />
          </div>
        </Section>

        {/* ── 4. Employment ──────────────────────────────────────── */}
        <Section icon={Briefcase} title="Employment">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="employer"
               label="Current Employer" placeholder="ABC Company Ltd" />
            <F control={ctrl} readOnly={readOnly} name="employer_address"
               label="Employer Address" placeholder="5 Broad Street, Lagos" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="official_email"
               label="Official Email" type="email" placeholder="john@abccompany.com" />
            <F control={ctrl} readOnly={readOnly} name="official_phone"
               label="Official Phone" placeholder="+234..." />
          </div>
        </Section>

        {/* ── 5. PEP ─────────────────────────────────────────────── */}
        <Section
          icon={Shield}
          title="Political Exposure (PEP)"
          description="Declare if you hold or have held a prominent public function"
        >
          <C control={ctrl} readOnly={readOnly} name="is_pep"
             label="I am or have been a Politically Exposed Person"
             description="A PEP holds or has held a prominent public function." />
          {isPEP && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F control={ctrl} readOnly={readOnly} name="pep_position"
                 label="Position / Office Held" placeholder="Minister of Finance" />
              <F control={ctrl} readOnly={readOnly} name="pep_period"
                 label="Period of Office" placeholder="2018–2022" />
            </div>
          )}
        </Section>

        {/* ── 6. Social Media ────────────────────────────────────── */}
        <Section
          icon={Share2}
          title="Social Media"
          description="Optional — helps with identity verification"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="social_facebook"
               label="Facebook" placeholder="@username" />
            <F control={ctrl} readOnly={readOnly} name="social_instagram"
               label="Instagram" placeholder="@username" />
            <F control={ctrl} readOnly={readOnly} name="social_twitter"
               label="Twitter / X" placeholder="@username" />
            <F control={ctrl} readOnly={readOnly} name="social_linkedin"
               label="LinkedIn" placeholder="linkedin.com/in/..." />
          </div>
        </Section>

        {/* ── 7. Investment Details ──────────────────────────────── */}
        <Section
          icon={TrendingUp}
          title="Investment Details"
          description="Source of funds and investment preferences"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="source_of_funds"
               label="Source of Funds" placeholder="Salary / Business Income" />
            <F control={ctrl} readOnly={readOnly} name="source_of_wealth"
               label="Source of Wealth" placeholder="Employment / Investments" />
          </div>

          <F control={ctrl} readOnly={readOnly} name="investment_purpose"
             label="Investment Purpose" placeholder="Wealth Generation / Retirement / Education" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Investment amount with inline currency picker */}
            <FormItem>
              <FormLabel className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                Investment Amount
              </FormLabel>
              <div className="flex gap-2">
                <FormField
                  control={ctrl}
                  name="investment_currency"
                  render={({ field }) => (
                    <Select disabled={readOnly} onValueChange={field.onChange} value={field.value as string}>
                      <SelectTrigger
                        className="w-[90px] shrink-0 h-9 text-[13px] rounded-lg font-semibold"
                        style={{ color: "var(--pg-text-1)" }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NGN">₦ NGN</SelectItem>
                        <SelectItem value="USD">$ USD</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FormField
                  control={ctrl}
                  name="investment_amount"
                  render={({ field }) => (
                    <FormControl>
                      <div className="relative flex-1">
                        <span
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium select-none pointer-events-none"
                          style={{ color: "var(--pg-text-3)" }}
                        >
                          {currency === "USD" ? "$" : "₦"}
                        </span>
                        <Input
                          type="number"
                          placeholder="0.00"
                          disabled={readOnly}
                          {...field}
                          value={field.value === 0 ? "" : String(field.value)}
                          onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                          className="h-9 text-[13px] rounded-lg pl-7"
                        />
                      </div>
                    </FormControl>
                  )}
                />
              </div>
            </FormItem>

            <F control={ctrl} readOnly={readOnly} name="tenor"
               label="Investment Tenor" placeholder="12 Months / 24 Months" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={ctrl}
              name="interest_rate_bps"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[12px] font-medium" style={{ color: "var(--pg-text-2)" }}>
                    Interest Rate (bps)
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="1000"
                      disabled={readOnly}
                      {...field}
                      value={field.value === 0 ? "" : String(field.value)}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      className="h-9 text-[13px] rounded-lg"
                    />
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />
          </div>
        </Section>

        {/* ── 8. Bank Account ────────────────────────────────────── */}
        <Section
          icon={Building}
          title="Bank Account (Payout)"
          description="Account where returns will be remitted"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <F control={ctrl} readOnly={readOnly} name="bank_name"
               label="Bank Name" placeholder="GTBank" />
            <F control={ctrl} readOnly={readOnly} name="bank_account_name"
               label="Account Name" placeholder="John Adebayo Doe" />
            <F control={ctrl} readOnly={readOnly} name="bank_account_number"
               label="Account Number" placeholder="0123456789" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F control={ctrl} readOnly={readOnly} name="bvn"
               label="BVN" placeholder="22345678901" />
            <F control={ctrl} readOnly={readOnly} name="sort_code"
               label="Sort Code" placeholder="058" />
          </div>
        </Section>

        {/* ── 9. Declarations ────────────────────────────────────── */}
        <Section
          icon={FileCheck}
          title="Declarations & Consent"
          description="Please read and confirm each declaration before proceeding"
        >
          <C control={ctrl} readOnly={readOnly} name="declaration_legal_capacity"
             label="Legal Capacity & Age"
             description="I confirm I have the legal capacity to enter into this agreement and I am of legal age." />
          <C control={ctrl} readOnly={readOnly} name="declaration_info_correct"
             label="Information Correctness"
             description="I confirm that all information provided is true, accurate, and complete." />
          <C control={ctrl} readOnly={readOnly} name="declaration_tnc_accepted"
             label="Terms and Conditions"
             description="I have read, understood, and accepted the Page Capital Terms and Conditions." />
          <C control={ctrl} readOnly={readOnly} name="declaration_min_holding"
             label="Minimum Holding Period"
             description="I understand and agree to the minimum holding period terms." />
        </Section>

        {!readOnly && (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="h-9 px-5 text-[13px] rounded-xl font-semibold"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
            >
              {saveMutation.isPending ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Saving…</>
              ) : onSaveSuccess ? (
                <><Save className="mr-2 h-3.5 w-3.5" /> Save &amp; Continue</>
              ) : (
                <><Save className="mr-2 h-3.5 w-3.5" /> Save Draft</>
              )}
            </Button>
          </div>
        )}

      </form>
    </Form>
  );
}
