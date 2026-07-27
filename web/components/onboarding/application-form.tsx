"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

const schema = z.object({
  // Personal
  full_name: z.string().min(2, "Full name is required"),
  gender: z.string().min(1, "Gender is required"),
  mothers_maiden_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  place_of_birth: z.string().optional(),
  country_of_origin: z.string().min(1, "Country of origin is required"),
  place_of_residence: z.string().optional(),
  residential_address: z.string().min(5, "Residential address is required"),
  phone_numbers: z.string().min(7, "Phone number is required"),
  email: z.string().email("Invalid email address"),
  tin: z.string().optional(),

  // Conditional
  is_us_person: z.boolean(),
  us_address: z.string().optional(),

  // Next of kin
  next_of_kin_name: z.string().optional(),
  next_of_kin_email: z.string().optional(),
  next_of_kin_phone: z.string().optional(),

  // Employment
  employer: z.string().optional(),
  employer_address: z.string().optional(),
  official_email: z.string().optional(),
  official_phone: z.string().optional(),

  // PEP
  is_pep: z.boolean(),
  pep_position: z.string().optional(),
  pep_period: z.string().optional(),

  // Social media
  social_facebook: z.string().optional(),
  social_instagram: z.string().optional(),
  social_twitter: z.string().optional(),
  social_linkedin: z.string().optional(),

  // Investment
  source_of_funds: z.string().min(1, "Source of funds is required"),
  source_of_wealth: z.string().min(1, "Source of wealth is required"),
  investment_purpose: z.string().min(1, "Investment purpose is required"),
  investment_amount_kobo: z.number().min(0, "Amount must be positive"),
  investment_amount_words: z.string().optional(),
  tenor: z.string().optional(),
  interest_rate_bps: z.number().min(0),

  // Banking
  bank_name: z.string().min(1, "Bank name is required"),
  bank_account_name: z.string().min(1, "Account name is required"),
  bank_account_number: z.string().min(10, "Account number must be at least 10 digits"),
  bvn: z.string().min(11, "BVN must be 11 digits").max(11, "BVN must be 11 digits"),
  sort_code: z.string().optional(),

  // Declarations
  declaration_legal_capacity: z.boolean(),
  declaration_info_correct: z.boolean(),
  declaration_tnc_accepted: z.boolean().refine(v => v === true, "Must accept T&Cs"),
  declaration_min_holding: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface ApplicationFormProps {
  caseId: string;
  initialData?: Record<string, unknown>;
  readOnly?: boolean;
}

export function ApplicationForm({ caseId, initialData, readOnly }: ApplicationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: (initialData?.full_name as string) ?? "",
      gender: (initialData?.gender as string) ?? "",
      mothers_maiden_name: (initialData?.mothers_maiden_name as string) ?? "",
      date_of_birth: initialData?.date_of_birth ? String(initialData.date_of_birth).slice(0, 10) : "",
      place_of_birth: (initialData?.place_of_birth as string) ?? "",
      country_of_origin: (initialData?.country_of_origin as string) ?? "",
      place_of_residence: (initialData?.place_of_residence as string) ?? "",
      residential_address: (initialData?.residential_address as string) ?? "",
      phone_numbers: (initialData?.phone_numbers as string[])?.join(", ") ?? "",
      email: (initialData?.email as string) ?? "",
      tin: (initialData?.tin as string) ?? "",
      is_us_person: Boolean(initialData?.is_us_person),
      us_address: (initialData?.us_address as string) ?? "",
      next_of_kin_name: (initialData?.next_of_kin_name as string) ?? "",
      next_of_kin_email: (initialData?.next_of_kin_email as string) ?? "",
      next_of_kin_phone: (initialData?.next_of_kin_phone as string) ?? "",
      employer: (initialData?.employer as string) ?? "",
      employer_address: (initialData?.employer_address as string) ?? "",
      official_email: (initialData?.official_email as string) ?? "",
      official_phone: (initialData?.official_phone as string) ?? "",
      is_pep: Boolean(initialData?.is_pep),
      pep_position: (initialData?.pep_position as string) ?? "",
      pep_period: (initialData?.pep_period as string) ?? "",
      social_facebook: (initialData?.social_media as Record<string, string>)?.facebook ?? "",
      social_instagram: (initialData?.social_media as Record<string, string>)?.instagram ?? "",
      social_twitter: (initialData?.social_media as Record<string, string>)?.twitter ?? "",
      social_linkedin: (initialData?.social_media as Record<string, string>)?.linkedin ?? "",
      source_of_funds: (initialData?.source_of_funds as string) ?? "",
      source_of_wealth: (initialData?.source_of_wealth as string) ?? "",
      investment_purpose: (initialData?.investment_purpose as string) ?? "",
      investment_amount_kobo: Number(initialData?.investment_amount_kobo ?? 0),
      investment_amount_words: (initialData?.investment_amount_words as string) ?? "",
      tenor: (initialData?.tenor as string) ?? "",
      interest_rate_bps: Number(initialData?.interest_rate_bps ?? 0),
      bank_name: (initialData?.bank_name as string) ?? "",
      bank_account_name: (initialData?.bank_account_name as string) ?? "",
      bank_account_number: (initialData?.bank_account_number as string) ?? "",
      bvn: (initialData?.bvn as string) ?? "",
      sort_code: (initialData?.sort_code as string) ?? "",
      declaration_legal_capacity: Boolean(initialData?.declaration_legal_capacity),
      declaration_info_correct: Boolean(initialData?.declaration_info_correct),
      declaration_tnc_accepted: Boolean(initialData?.declaration_tnc_accepted),
      declaration_min_holding: Boolean(initialData?.declaration_min_holding),
    },
  });

  const isPEP = form.watch("is_pep");
  const isUSPerson = form.watch("is_us_person");

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data, error } = await api.PUT("/onboarding/cases/{id}/application", {
        params: { path: { id: caseId } },
        body: {
          case_id: caseId,
          full_name: values.full_name,
          gender: values.gender,
          mothers_maiden_name: values.mothers_maiden_name ?? "",
          date_of_birth: values.date_of_birth || undefined,
          place_of_birth: values.place_of_birth ?? "",
          country_of_origin: values.country_of_origin,
          place_of_residence: values.place_of_residence ?? "",
          residential_address: values.residential_address,
          is_us_person: values.is_us_person,
          us_address: values.us_address ?? "",
          phone_numbers: values.phone_numbers.split(",").map(p => p.trim()).filter(Boolean),
          email: values.email,
          tin: values.tin ?? "",
          next_of_kin_name: values.next_of_kin_name ?? "",
          next_of_kin_email: values.next_of_kin_email ?? "",
          next_of_kin_phone: values.next_of_kin_phone ?? "",
          employer: values.employer ?? "",
          employer_address: values.employer_address ?? "",
          official_email: values.official_email ?? "",
          official_phone: values.official_phone ?? "",
          is_pep: values.is_pep,
          pep_position: values.pep_position ?? "",
          pep_period: values.pep_period ?? "",
          social_media: {
            ...(values.social_facebook ? { facebook: values.social_facebook } : {}),
            ...(values.social_instagram ? { instagram: values.social_instagram } : {}),
            ...(values.social_twitter ? { twitter: values.social_twitter } : {}),
            ...(values.social_linkedin ? { linkedin: values.social_linkedin } : {}),
          },
          source_of_funds: values.source_of_funds,
          source_of_wealth: values.source_of_wealth,
          investment_purpose: values.investment_purpose,
          investment_amount_kobo: values.investment_amount_kobo,
          investment_amount_words: values.investment_amount_words ?? "",
          tenor: values.tenor ?? "",
          interest_rate_bps: values.interest_rate_bps,
          bank_name: values.bank_name,
          bank_account_name: values.bank_account_name,
          bank_account_number: values.bank_account_number,
          bvn: values.bvn,
          sort_code: values.sort_code ?? "",
          declaration_legal_capacity: values.declaration_legal_capacity,
          declaration_info_correct: values.declaration_info_correct,
          declaration_tnc_accepted: values.declaration_tnc_accepted,
          declaration_min_holding: values.declaration_min_holding,
        },
      });
      if (error) throw new Error("Failed to save application");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      toast({ title: "Draft Saved", description: "Application data saved successfully." });
    },
    onError: (err) => {
      toast({ title: "Save Failed", description: (err as Error).message, variant: "destructive" });
    },
  });

  function onSubmit(values: FormValues) {
    saveMutation.mutate(values);
  }

  const F = ({ name, label, placeholder, type = "text", description }: {
    name: keyof FormValues; label: string; placeholder?: string; type?: string; description?: string;
  }) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <Input
            type={type}
            placeholder={placeholder}
            disabled={readOnly}
            {...field}
            value={typeof field.value === "boolean" ? undefined : String(field.value ?? "")}
            onChange={type === "number" ? (e) => field.onChange(e.target.valueAsNumber || 0) : field.onChange}
          />
        </FormControl>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    )} />
  );

  const C = ({ name, label, description }: { name: keyof FormValues; label: string; description?: string }) => (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
        <FormControl>
          <Checkbox checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={readOnly} />
        </FormControl>
        <div className="space-y-1 leading-none">
          <FormLabel>{label}</FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
        </div>
      </FormItem>
    )} />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Personal Information ────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="full_name" label="Full Name (Surname First)" placeholder="Doe, John Adebayo" />
              <F name="gender" label="Gender" placeholder="Male / Female / Other" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="mothers_maiden_name" label="Mother's Maiden Name" placeholder="Okafor" />
              <F name="date_of_birth" label="Date of Birth" type="date" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="place_of_birth" label="Place of Birth" placeholder="Lagos, Nigeria" />
              <F name="country_of_origin" label="Country of Origin" placeholder="Nigeria" />
            </div>
            <F name="place_of_residence" label="Place of Residence" placeholder="Lagos" />
            <F name="residential_address" label="Residential Address" placeholder="12 Victoria Island, Lagos" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="phone_numbers" label="Phone Number(s)" placeholder="+234801..." description="Separate multiple numbers with commas" />
              <F name="email" label="Email Address" type="email" placeholder="john@example.com" />
            </div>
            <F name="tin" label="TIN (Tax Identification Number)" placeholder="12345678-0001" />
          </CardContent>
        </Card>

        {/* ── US Person / Conditional ─────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>FATCA / US Person Declaration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <C name="is_us_person" label="I am a US Person / FATCA Subject" description="Check if you have US citizenship, residency, or tax obligations." />
            {isUSPerson && (
              <F name="us_address" label="US Correspondence Address" placeholder="123 Main St, New York, NY 10001" />
            )}
          </CardContent>
        </Card>

        {/* ── Next of Kin ─────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Next of Kin</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <F name="next_of_kin_name" label="Full Name" placeholder="Jane Doe" />
              <F name="next_of_kin_email" label="Email" type="email" placeholder="jane@example.com" />
              <F name="next_of_kin_phone" label="Phone" placeholder="+234..." />
            </div>
          </CardContent>
        </Card>

        {/* ── Employment ──────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Employment Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="employer" label="Current Employer" placeholder="ABC Company Ltd" />
              <F name="employer_address" label="Employer Address" placeholder="5 Broad Street, Lagos" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="official_email" label="Official Email" type="email" placeholder="john@abccompany.com" />
              <F name="official_phone" label="Official Phone" placeholder="+234..." />
            </div>
          </CardContent>
        </Card>

        {/* ── Political Questionnaire (PEP) ───────────────────── */}
        <Card>
          <CardHeader><CardTitle>Political Questionnaire (PEP)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <C name="is_pep" label="I am or have been a Politically Exposed Person (PEP)" description="A PEP holds or has held a prominent public function." />
            {isPEP && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <F name="pep_position" label="Position/Office Held" placeholder="Minister of Finance" />
                <F name="pep_period" label="Period of Office" placeholder="2018–2022" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Social Media ────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Social Media (Optional)</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="social_facebook" label="Facebook" placeholder="@username" />
              <F name="social_instagram" label="Instagram" placeholder="@username" />
              <F name="social_twitter" label="Twitter / X" placeholder="@username" />
              <F name="social_linkedin" label="LinkedIn" placeholder="linkedin.com/in/..." />
            </div>
          </CardContent>
        </Card>

        {/* ── Investment Details ───────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Investment Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="source_of_funds" label="Source of Funds" placeholder="Salary / Business Income / Inheritance" />
              <F name="source_of_wealth" label="Source of Wealth" placeholder="Employment / Investments / Property" />
            </div>
            <F name="investment_purpose" label="Investment Purpose" placeholder="Wealth Generation / Retirement / Education" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="investment_amount_kobo" label="Investment Amount (Kobo)" type="number" placeholder="10000000" description="Enter amount in kobo (₦100 = 10000 kobo)" />
              <F name="investment_amount_words" label="Amount in Words" placeholder="One Hundred Thousand Naira" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="tenor" label="Investment Tenor" placeholder="12 Months / 24 Months" />
              <F name="interest_rate_bps" label="Interest Rate (bps)" type="number" placeholder="1000" description="1000 bps = 10.00%" />
            </div>
          </CardContent>
        </Card>

        {/* ── Banking / Payout ────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Bank Account (Payout)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <F name="bank_name" label="Bank Name" placeholder="GTBank" />
              <F name="bank_account_name" label="Account Name" placeholder="John Adebayo Doe" />
              <F name="bank_account_number" label="Account Number" placeholder="0123456789" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F name="bvn" label="BVN" placeholder="22345678901" description="11-digit Bank Verification Number" />
              <F name="sort_code" label="Sort Code" placeholder="058" />
            </div>
          </CardContent>
        </Card>

        {/* ── Declarations ────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Declarations & Consent</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <C name="declaration_legal_capacity" label="Legal Capacity & Age" description="I confirm I have the legal capacity to enter into this agreement and I am of legal age." />
            <C name="declaration_info_correct" label="Information Correctness" description="I confirm that all information provided is true, accurate, and complete." />
            <C name="declaration_tnc_accepted" label="Terms and Conditions" description="I have read, understood, and accepted the Page Capital Terms and Conditions." />
            <C name="declaration_min_holding" label="Minimum Holding Period" description="I understand and agree to the minimum holding period terms." />
          </CardContent>
        </Card>

        {!readOnly && (
          <div className="flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Save className="mr-2 h-4 w-4" />}
              Save Draft
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
