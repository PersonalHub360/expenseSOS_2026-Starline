import { useRef, useState } from "react";
import { Building2, Check, Palette, Printer, ReceiptText } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { companyLogoSvg, loadCompanySlip, readSlipImage, saveCompanySlip, type CompanySlipProfile, type SlipPaper, type SlipTemplate } from "@/lib/companySlip";
import { loadTheme, saveTheme, themeChoices, type AppTheme } from "@/lib/theme";

const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-[#d7e0e4] bg-[#f8fafc] px-3 text-sm outline-none focus:border-[#0f766e] focus:bg-white";

type CompanyDraft = Pick<CompanySlipProfile, "name" | "location" | "phone" | "email" | "registrationNumber" | "logo">;
type InvoiceDraft = Pick<CompanySlipProfile, "showBarcode" | "showQr" | "slipTemplate" | "slipTitle" | "slipFooter" | "signLabel" | "stampLabel">;
type SavedSection = "company" | "printer" | "invoice" | "theme";
type SaveStatus = "idle" | "dirty" | "saved";

function companyDraft(profile: CompanySlipProfile): CompanyDraft {
  return {
    name: profile.name,
    location: profile.location,
    phone: profile.phone,
    email: profile.email,
    registrationNumber: profile.registrationNumber,
    logo: profile.logo,
  };
}

export function SettingsPage() {
  const { user } = useAuth();
  const stored = loadCompanySlip();
  const logoInput = useRef<HTMLInputElement>(null);
  const [company, setCompany] = useState<CompanyDraft>(() => companyDraft(stored));
  const [paper, setPaper] = useState<SlipPaper>(stored.paper);
  const [invoice, setInvoice] = useState<InvoiceDraft>({
    showBarcode: stored.showBarcode,
    showQr: stored.showQr,
    slipTemplate: stored.slipTemplate,
    slipTitle: stored.slipTitle,
    slipFooter: stored.slipFooter,
    signLabel: stored.signLabel,
    stampLabel: stored.stampLabel,
  });
  const [theme, setTheme] = useState<AppTheme>(() => loadTheme());
  const [saved, setSaved] = useState<Record<SavedSection, SaveStatus>>({ company: "idle", printer: "idle", invoice: "idle", theme: "idle" });
  const [imageError, setImageError] = useState("");
  const allowed = can(user, "settings", "view");
  const editable = can(user, "settings", "edit");

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to settings.</p>;

  function touch(section: SavedSection) {
    setSaved((current) => (current[section] === "dirty" ? current : { ...current, [section]: "dirty" }));
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setImageError("");
    try {
      const logo = await readSlipImage(file, 240);
      setCompany((current) => ({ ...current, logo }));
      touch("company");
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not read the logo.");
    }
  }

  function saveCompany() {
    const current = loadCompanySlip();
    const next = {
      ...current,
      ...company,
      name: company.name.trim() || "Starline Builder's Limited",
    };
    saveCompanySlip(next);
    setCompany(companyDraft(next));
    setSaved((current) => ({ ...current, company: "saved" }));
  }

  function savePrinter() {
    const current = loadCompanySlip();
    saveCompanySlip({ ...current, paper });
    setSaved((current) => ({ ...current, printer: "saved" }));
  }

  function saveInvoice() {
    const current = loadCompanySlip();
    saveCompanySlip({ ...current, ...invoice });
    setSaved((current) => ({ ...current, invoice: "saved" }));
  }

  function saveThemeChoice() {
    saveTheme(theme);
    setSaved((current) => ({ ...current, theme: "saved" }));
  }

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0c3b34] via-[#0f766e] to-[#115e59] p-5 text-white shadow-[0_16px_40px_rgba(12,59,52,0.22)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e7d3ae]">Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-xl text-sm text-white/80">Company, printer, invoice, and theme each save on their own.</p>
      </header>

      <section className="rounded-[24px] border border-[#99f6e4] bg-white p-4 shadow-[0_10px_28px_rgba(15,118,110,0.05)] sm:p-5">
        <SectionTitle icon={Building2} tint="bg-[#ccfbf1] text-[#0f766e]" title="Company profile" detail="Name, location, logo, phone, and registration print in the middle of every payment slip." />
        <div className="mt-5 grid gap-5 lg:grid-cols-[168px_minmax(0,1fr)]">
          <div className="rounded-2xl bg-[#f0fdfa] p-4 text-center">
            <div className="mx-auto flex h-28 w-fit min-w-36 items-center justify-center rounded-2xl bg-[#0c3b34] px-4">
              {company.logo ? (
                <img src={company.logo} alt="" className="h-20 w-auto max-w-44 rounded-xl object-contain ring-2 ring-white/90" />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white" dangerouslySetInnerHTML={{ __html: companyLogoSvg }} />
              )}
            </div>
            <p className="mt-3 text-sm font-semibold text-[#0f766e]">Company logo</p>
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={!editable}
              onChange={(event) => {
                onLogo(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={!editable}
              onClick={() => logoInput.current?.click()}
              className="mt-3 h-9 w-full rounded-xl bg-[#0f766e] text-sm font-semibold text-white disabled:opacity-50"
            >
              Choose logo
            </button>
            {company.logo && editable ? (
              <button
                type="button"
                onClick={() => {
                  setCompany((current) => ({ ...current, logo: "" }));
                  touch("company");
                }}
                className="mt-2 text-xs font-semibold text-[#be123c]"
              >
                Use the built-in logo
              </button>
            ) : null}
          </div>
          <div className="grid content-start gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Company name" value={company.name} disabled={!editable} onChange={(name) => { setCompany((current) => ({ ...current, name })); touch("company"); }} />
              <Field label="Location" value={company.location} disabled={!editable} placeholder="Office location" onChange={(location) => { setCompany((current) => ({ ...current, location })); touch("company"); }} />
            </div>
            <div className="grid gap-3 rounded-2xl bg-[#f8fafc] p-3 sm:grid-cols-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b] sm:col-span-2">Contact</p>
              <Field label="Phone number" value={company.phone} disabled={!editable} placeholder="Phone" onChange={(phone) => { setCompany((current) => ({ ...current, phone })); touch("company"); }} />
              <Field label="Email" value={company.email} disabled={!editable} placeholder="Email" onChange={(email) => { setCompany((current) => ({ ...current, email })); touch("company"); }} />
              <Field label="Company registration number" value={company.registrationNumber} disabled={!editable} placeholder="Registration number" wide onChange={(registrationNumber) => { setCompany((current) => ({ ...current, registrationNumber })); touch("company"); }} />
            </div>
          </div>
        </div>
        {imageError ? <p className="mt-3 text-sm text-[#b42318]">{imageError}</p> : null}
        <SaveBar status={saved.company} message="Company profile saved. This edit is kept." disabled={!editable} label="Save company profile" onSave={saveCompany} />
      </section>

      <section className="rounded-[24px] border border-[#ddd6fe] bg-white p-4 shadow-[0_10px_28px_rgba(91,33,182,0.05)] sm:p-5">
        <SectionTitle icon={Printer} tint="bg-[#ede9fe] text-[#5b21b6]" title="Printer setting" detail="Paper size for a printed payment slip." />
        <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
          <PaperChoice label="A4" detail="210 × 297 mm" active={paper === "a4"} disabled={!editable} onClick={() => { setPaper("a4"); touch("printer"); }} />
          <PaperChoice label="Letter" detail="8.5 × 11 in" active={paper === "letter"} disabled={!editable} onClick={() => { setPaper("letter"); touch("printer"); }} />
        </div>
        <SaveBar status={saved.printer} message="Printer setting saved. This edit is kept." disabled={!editable} label="Save printer setting" onSave={savePrinter} />
      </section>

      <section className="rounded-[24px] border border-[#fde68a] bg-white p-4 shadow-[0_10px_28px_rgba(146,64,14,0.05)] sm:p-5">
        <SectionTitle icon={ReceiptText} tint="bg-[#fef3c7] text-[#92400e]" title="Invoice settings" detail="Pick a payment slip template, then edit the words. Sign and stamp stay empty for a manual mark." />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TemplateChoice id="classic" title="Classic" detail="Dark header and gold frame" active={invoice.slipTemplate === "classic"} disabled={!editable} onClick={() => { setInvoice((current) => ({ ...current, slipTemplate: "classic" })); touch("invoice"); }} />
          <TemplateChoice id="clean" title="Clean" detail="White page, name in the centre" active={invoice.slipTemplate === "clean"} disabled={!editable} onClick={() => { setInvoice((current) => ({ ...current, slipTemplate: "clean" })); touch("invoice"); }} />
          <TemplateChoice id="compact" title="Compact" detail="Name on the left, amount on the right" active={invoice.slipTemplate === "compact"} disabled={!editable} onClick={() => { setInvoice((current) => ({ ...current, slipTemplate: "compact" })); touch("invoice"); }} />
        </div>
        <div className="mt-4 grid gap-3 rounded-2xl bg-[#fffbeb] p-3 sm:grid-cols-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#92400e] sm:col-span-2">Edit this template</p>
          <Field label="Slip heading" value={invoice.slipTitle} disabled={!editable} placeholder="Payment slip" onChange={(slipTitle) => { setInvoice((current) => ({ ...current, slipTitle })); touch("invoice"); }} />
          <Field label="Footer line" value={invoice.slipFooter} disabled={!editable} placeholder="Issued by the company" onChange={(slipFooter) => { setInvoice((current) => ({ ...current, slipFooter })); touch("invoice"); }} />
          <Field label="Sign label" value={invoice.signLabel} disabled={!editable} placeholder="Sign" onChange={(signLabel) => { setInvoice((current) => ({ ...current, signLabel })); touch("invoice"); }} />
          <Field label="Stamp label" value={invoice.stampLabel} disabled={!editable} placeholder="Company stamp" onChange={(stampLabel) => { setInvoice((current) => ({ ...current, stampLabel })); touch("invoice"); }} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SettingSwitch label="Barcode" detail="Prints under the payment details." checked={invoice.showBarcode} disabled={!editable} onChange={(showBarcode) => { setInvoice((current) => ({ ...current, showBarcode })); touch("invoice"); }} />
          <SettingSwitch label="QR code" detail="Scan shows the slip details." checked={invoice.showQr} disabled={!editable} onChange={(showQr) => { setInvoice((current) => ({ ...current, showQr })); touch("invoice"); }} />
        </div>
        <SaveBar status={saved.invoice} message="Invoice settings saved. This edit is kept." disabled={!editable} label="Save invoice settings" onSave={saveInvoice} />
      </section>

      <section className="rounded-[24px] border border-[#bae6fd] bg-white p-4 shadow-[0_10px_28px_rgba(3,105,161,0.05)] sm:p-5">
        <SectionTitle icon={Palette} tint="bg-[#e0f2fe] text-[#0369a1]" title="Themes" detail="The colour of the sidebar and main buttons." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {themeChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              disabled={!editable}
              onClick={() => {
                setTheme(choice.id);
                touch("theme");
              }}
              className={`rounded-2xl border p-3 text-left disabled:opacity-50 ${theme === choice.id ? "border-[#0369a1] bg-[#f0f9ff] shadow-[inset_0_0_0_1px_#0369a1]" : "border-[#e0f2fe] bg-[#f8fafc]"}`}
            >
              <span className="flex gap-1">
                <span className="h-8 flex-1 rounded-lg" style={{ background: `hsl(${choice.vars["--sidebar"]})` }} />
                <span className="h-8 flex-1 rounded-lg" style={{ background: `hsl(${choice.vars["--primary"]})` }} />
                <span className="h-8 flex-1 rounded-lg" style={{ background: `hsl(${choice.vars["--accent"]})` }} />
              </span>
              <p className="mt-2 text-sm font-semibold text-[#0c4a6e]">{choice.label}</p>
            </button>
          ))}
        </div>
        <SaveBar status={saved.theme} message="Theme saved. This edit is kept." disabled={!editable} label="Save theme" onSave={saveThemeChoice} />
      </section>
    </div>
  );
}

function SaveBar({
  status,
  message,
  label,
  disabled,
  onSave,
}: {
  status: SaveStatus;
  message: string;
  label: string;
  disabled: boolean;
  onSave: () => void;
}) {
  const saved = status === "saved";
  return (
    <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${saved ? "border-[#86efac] bg-[#ecfdf5]" : status === "dirty" ? "border-[#fcd34d] bg-[#fffbeb]" : "border-[#e7eeeb] bg-[#f8fafc]"}`}>
      {saved ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-[#047857]">
          <Check className="h-4 w-4" />
          {message}
        </p>
      ) : status === "dirty" ? (
        <p className="text-sm font-semibold text-[#92400e]">Not saved yet. Press save to keep this edit.</p>
      ) : (
        <p className="text-sm text-[#64748b]">Press save after you edit.</p>
      )}
      <Button
        type="button"
        disabled={disabled}
        onClick={onSave}
        className={saved ? "bg-[#047857] hover:bg-[#065f46]" : undefined}
      >
        {saved ? (
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4" />
            Saved
          </span>
        ) : (
          label
        )}
      </Button>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  tint,
  title,
  detail,
}: {
  icon: typeof Building2;
  tint: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-[#10231f]">{title}</h2>
        <p className="mt-0.5 text-sm text-[#5c6b76]">{detail}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm font-medium text-[#16302c] ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input className={fieldClass} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TemplateChoice({
  id,
  title,
  detail,
  active,
  disabled,
  onClick,
}: {
  id: SlipTemplate;
  title: string;
  detail: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border p-3 text-left disabled:opacity-50 ${active ? "border-[#d97706] bg-[#fffbeb] shadow-[inset_0_0_0_1px_#d97706]" : "border-[#fde68a] bg-white"}`}
    >
      <span className={`mb-3 block h-16 overflow-hidden rounded-xl border ${id === "classic" ? "border-[#0c3b34] bg-[#0c3b34]" : id === "clean" ? "border-[#d7e0e4] bg-white" : "border-[#e7eeeb] bg-[#f8fafc]"}`}>
        <span className={`block h-6 ${id === "classic" ? "bg-[#0c3b34]" : id === "clean" ? "border-b-2 border-[#0f766e] bg-white" : "bg-[#ecfdf5]"}`} />
        <span className={`mx-auto mt-2 block h-2 w-10 rounded-full ${id === "classic" ? "bg-[#e7d3ae]" : "bg-[#0f766e]"}`} />
      </span>
      <p className="text-sm font-semibold text-[#78350f]">{title}</p>
      <p className="mt-0.5 text-xs text-[#a16207]">{detail}</p>
    </button>
  );
}

function PaperChoice({ label, detail, active, disabled, onClick }: { label: string; detail: string; active: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border px-3 py-4 text-left disabled:opacity-50 ${active ? "border-[#7c3aed] bg-[#f5f3ff] shadow-[inset_0_0_0_1px_#7c3aed]" : "border-[#e9e4ff] bg-[#faf8ff]"}`}
    >
      <p className={`text-lg font-semibold ${active ? "text-[#5b21b6]" : "text-[#3f3f46]"}`}>{label}</p>
      <p className="mt-1 text-xs text-[#6b7280]">{detail}</p>
    </button>
  );
}

function SettingSwitch({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
      <span>
        <span className="block text-sm font-semibold text-[#78350f]">{label}</span>
        <span className="mt-0.5 block text-xs text-[#a16207]">{detail}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? "bg-[#d97706]" : "bg-[#e7e5e4]"}`}>
        <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${checked ? "left-5" : "left-0.5"}`} />
      </span>
    </label>
  );
}
