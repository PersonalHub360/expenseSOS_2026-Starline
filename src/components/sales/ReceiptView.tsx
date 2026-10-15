import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { barcodeSvg } from "@/lib/barcode";
import { companyLogoSvg, loadCompanySlip, readSlipImage, saveCompanySlip, type CompanySlipProfile } from "@/lib/companySlip";
import { downloadSlipDocument, receiptRows, slipClock, slipDocumentScan, type SlipDownload } from "@/lib/receipt";
import type { Receipt } from "@/lib/sales";

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <SlipView
      slip={{
        title: receipt.kind === "refund" ? "Refund slip" : "Payment slip",
        serial: receipt.receiptNumber,
        issuedAt: receipt.issuedAt,
        buyerName: receipt.buyer.name,
        buyerPhone: receipt.buyer.phone,
        rows: receiptRows(receipt),
      }}
    />
  );
}

export function SlipView({ slip, completion }: { slip: SlipDownload; completion?: { completed: boolean; onComplete: () => void } }) {
  const [profile, setProfile] = useState<CompanySlipProfile | null>(null);
  const [qr, setQr] = useState("");
  const [imageError, setImageError] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(() => window.location.hash === "#slip-options");
  const rows = slip.rows;
  const clock = slipClock(slip.issuedAt);
  const title = slip.title;

  useEffect(() => {
    setProfile(loadCompanySlip());
  }, []);

  useEffect(() => {
    if (!profile) return;
    saveCompanySlip(profile);
  }, [profile]);

  useEffect(() => {
    if (!profile?.showQr) {
      setQr("");
      return;
    }
    let active = true;
    QRCode.toDataURL(slipDocumentScan(slip, profile.name), {
      margin: 1,
      width: 220,
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (active) setQr(url);
    }).catch(() => {
      if (active) setQr("");
    });
    return () => {
      active = false;
    };
  }, [profile, slip]);

  const action = new URLSearchParams(window.location.search).get("action");
  const acted = useRef(false);

  useEffect(() => {
    if (!profile || acted.current) return;
    if (action === "print") {
      acted.current = true;
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
    if (action === "download" && (!profile.showQr || qr)) {
      acted.current = true;
      downloadSlipDocument(slip, profile, qr);
    }
  }, [action, profile, qr, slip]);

  useEffect(() => {
    if (!optionsOpen) return;
    document.getElementById("slip-options")?.scrollIntoView({ block: "start" });
  }, [optionsOpen]);

  if (!profile) return <p className="text-sm text-[#7d8b96]">Preparing slip…</p>;

  function update(patch: Partial<CompanySlipProfile>) {
    setProfile((current) => (current ? { ...current, ...patch } : current));
  }

  async function onImage(file: File | undefined, field: "stamp" | "signature") {
    if (!file) return;
    setImageError("");
    try {
      const dataUrl = await readSlipImage(file, 220);
      update({ [field]: dataUrl });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not read the image.");
    }
  }

  const barcode = barcodeSvg(slip.serial);
  const amount = rowValue(rows, "This receipt") || "—";
  const method = rowValue(rows, "Method");
  const company = profile.name || "Starline Builder's Limited";
  const heading = title.toLowerCase().includes("refund") ? title : profile.slipTitle.trim() || "Payment slip";
  const footer = profile.slipFooter.trim() || `Issued by ${company}`;
  const signLabel = profile.signLabel.trim() || "Sign";
  const stampLabel = profile.stampLabel.trim() || "Company stamp";
  const template = profile.slipTemplate;
  const party = title.toLowerCase().includes("refund") ? "Returned to" : "Received from";
  const details = rows.filter((row) => !["This receipt", "Buyer", "Phone", "Method"].includes(row.label));
  const done = Boolean(completion?.completed);

  return (
    <div className="space-y-5">
      <style>{`@media print { @page { size: ${profile.paper === "letter" ? "letter" : "A4"}; margin: 12mm; } }`}</style>
      <article className={`receipt-sheet relative mx-auto w-full max-w-[680px] overflow-hidden print:max-w-none print:shadow-none ${template === "classic" ? "bg-[#fffaf3] shadow-[0_28px_70px_rgba(8,36,32,0.16)]" : "border border-[#d7e0e4] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]"}`}>
        {template === "classic" ? (
          <>
            <div className="pointer-events-none absolute inset-3 border border-[#d4b483]" />
            <div className="pointer-events-none absolute inset-[18px] border border-[#eadcc4]" />
          </>
        ) : null}
        <SlipBanner template={template} profile={profile} company={company} heading={heading} amount={amount} method={method} done={done} />
        <div className="relative grid grid-cols-3 divide-x divide-[#eadcc4] border-b border-[#eadcc4] bg-[#fffaf3] text-center">
          <Meta label="Date" value={clock.date} />
          <Meta label="Time" value={clock.time || "—"} />
          <Meta label="Serial" value={slip.serial} mono />
        </div>
        <div className="relative px-8 py-8 sm:px-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8a7340]">{party}</p>
          <p className="mt-1 font-serif text-3xl leading-tight text-[#16302c]">{slip.buyerName}</p>
          <p className="mt-1 text-sm tracking-wide text-[#5c5346]">{slip.buyerPhone}</p>
          {details.length ? (
            <dl className="mt-7 divide-y divide-[#efe4cf] border-y border-[#efe4cf]">
              {details.map((row) => (
                <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-baseline">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7340]">{row.label}</dt>
                  <dd className="text-sm font-semibold text-[#16302c]">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {profile.showBarcode || (profile.showQr && qr) ? (
            <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
              {profile.showBarcode && barcode ? (
                <div className="min-w-0 flex-1">
                  <div className="max-w-xs [&_svg]:h-12 [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: barcode }} />
                </div>
              ) : <span />}
              {profile.showQr && qr ? (
                <img src={qr} alt={`QR code for serial ${slip.serial}`} className="h-24 w-24 bg-white p-1" />
              ) : null}
            </div>
          ) : null}
          <div className="mt-14 grid grid-cols-2 gap-10 sm:gap-20">
            <div>
              <div className="flex h-24 items-end">
                {profile.signature ? <img src={profile.signature} alt="" className="max-h-20 max-w-[180px] object-contain" /> : null}
              </div>
              <div className="border-t border-[#16302c]" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7340]">{signLabel}</p>
              {profile.signatory.trim() ? <p className="mt-1 text-sm font-semibold text-[#16302c]">{profile.signatory}</p> : null}
            </div>
            <div className="text-right">
              <div className="flex h-24 items-end justify-end">
                {profile.stamp ? <img src={profile.stamp} alt="" className="max-h-20 max-w-[140px] object-contain" /> : null}
              </div>
              <div className="border-t border-[#16302c]" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a7340]">{stampLabel}</p>
            </div>
          </div>
          <p className="mt-10 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-[#a08b62]">{footer}</p>
        </div>
      </article>

      <div className="mx-auto flex max-w-[680px] flex-wrap items-center justify-center gap-3 print:hidden">
        {completion ? (
          <Button type="button" disabled={done} onClick={completion.onComplete} className="min-w-44">
            {done ? "Payment complete" : "Complete payment"}
          </Button>
        ) : null}
        <Button variant="secondary" className="min-w-32" onClick={() => window.print()}>
          Print
        </Button>
        <button type="button" onClick={() => downloadSlipDocument(slip, profile, qr)} className="h-11 px-2 text-sm font-semibold text-[#0f766e]">
          Download
        </button>
      </div>
      {done ? (
        <p className="text-center text-sm font-medium text-[#047857] print:hidden">This payment is complete and kept in history. It is not added to collected money.</p>
      ) : null}

      <div className="mx-auto max-w-[680px] text-center print:hidden">
        <button type="button" onClick={() => setOptionsOpen((open) => !open)} className="text-sm font-semibold text-[#0f766e]">
          {optionsOpen ? "Hide company name" : "Company name"}
        </button>
        {optionsOpen ? (
          <section id="slip-options" className="mt-3 rounded-[22px] border border-[#eadcc4] bg-white p-4 text-left">
            <p className="text-sm text-[#5c5346]">The sign and stamp places on the slip stay empty. Add a file here only when you want it printed in that place.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium sm:col-span-2">
                Company name
                <input
                  value={profile.name}
                  onChange={(event) => update({ name: event.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-[#d7e0e4] px-3"
                />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Location
                <input
                  value={profile.location}
                  onChange={(event) => update({ location: event.target.value })}
                  placeholder="Office location"
                  className="mt-1 h-11 w-full rounded-xl border border-[#d7e0e4] px-3"
                />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Finance name
                <input
                  value={profile.signatory}
                  onChange={(event) => update({ signatory: event.target.value })}
                  placeholder="Name under the sign"
                  className="mt-1 h-11 w-full rounded-xl border border-[#d7e0e4] px-3"
                />
              </label>
              <label className="block text-sm font-medium">
                Sign
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    onImage(event.target.files?.[0], "signature");
                    event.target.value = "";
                  }}
                  className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#ccfbf1] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#0f766e]"
                />
              </label>
              <label className="block text-sm font-medium">
                Company stamp
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    onImage(event.target.files?.[0], "stamp");
                    event.target.value = "";
                  }}
                  className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#ccfbf1] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#0f766e]"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
              <Toggle label="Barcode" checked={profile.showBarcode} onChange={(showBarcode) => update({ showBarcode })} />
              <Toggle label="QR code" checked={profile.showQr} onChange={(showQr) => update({ showQr })} />
            </div>
            {imageError ? <p className="mt-3 text-sm text-[#b42318]">{imageError}</p> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SlipBanner({
  template,
  profile,
  company,
  heading,
  amount,
  method,
  done,
}: {
  template: CompanySlipProfile["slipTemplate"];
  profile: CompanySlipProfile;
  company: string;
  heading: string;
  amount: string;
  method: string;
  done: boolean;
}) {
  const logo = <SlipMark logo={profile.logo} place={template} />;
  if (template === "compact") {
    return (
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d7e0e4] bg-[#f8fafc] px-6 py-5">
        <div className="flex min-w-0 items-center gap-3">
          {logo}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-[#10231f]">{company}</h1>
            {profile.location.trim() ? <p className="truncate text-sm text-[#64748b]">{profile.location.trim()}</p> : null}
            {contactLine(profile) ? <p className="truncate text-xs text-[#64748b]">{contactLine(profile)}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0f766e]">{heading}</p>
          <p className="mt-1 font-serif text-3xl leading-none text-[#10231f]">{amount}</p>
          {method ? <p className="mt-1 text-sm text-[#64748b]">{method}</p> : null}
        </div>
      </header>
    );
  }
  if (template === "clean") {
    return (
      <header className="border-b-[3px] border-[#0f766e] px-8 py-8 text-center">
        <div className="mx-auto w-fit">{logo}</div>
        <h1 className="mt-4 font-serif text-3xl text-[#10231f]">{company}</h1>
        {profile.location.trim() ? <p className="mt-1 text-sm text-[#5c5346]">{profile.location.trim()}</p> : null}
        {contactLine(profile) ? <p className="mt-1 text-sm text-[#5c5346]">{contactLine(profile)}</p> : null}
        <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.32em] text-[#0f766e]">{heading}</p>
        <p className="mt-2 font-serif text-5xl leading-none text-[#10231f]">{amount}</p>
        {method ? <p className="mt-2 text-sm text-[#5c5346]">{method}</p> : null}
      </header>
    );
  }
  return (
    <header className="relative overflow-hidden bg-[#0c3b34] px-8 pb-8 pt-9 text-white sm:px-10">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#d4b483]/25" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-[#d4b483] to-transparent" />
      <div className="relative text-center">
        <div className="mx-auto w-fit">{logo}</div>
        <h1 className="mt-4 text-[1.7rem] font-semibold leading-tight tracking-tight">{company}</h1>
        {profile.location.trim() ? <p className="mt-1 text-sm text-[#e7d3ae]">{profile.location.trim()}</p> : null}
        {contactLine(profile) ? <p className="mt-1 text-sm text-white/80">{contactLine(profile)}</p> : null}
        <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.42em] text-[#e7d3ae]">{heading}</p>
        <p className="mt-3 font-serif text-5xl leading-none tracking-tight sm:text-6xl">{amount}</p>
        {method ? <p className="mt-3 text-sm text-white/80">{method}</p> : null}
      </div>
      {done ? (
        <div className="absolute right-8 top-8 grid h-[4.5rem] w-[4.5rem] rotate-[-14deg] place-items-center rounded-full border-2 border-[#e7d3ae] text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e7d3ae] sm:right-10">
          Complete
        </div>
      ) : null}
    </header>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a7340]">{label}</p>
      <p className={`mt-1 text-xs font-semibold text-[#16302c] sm:text-sm ${mono ? "break-all font-mono text-[11px] sm:text-xs" : ""}`}>{value}</p>
    </div>
  );
}

function contactLine(profile: CompanySlipProfile) {
  const parts = [profile.phone.trim(), profile.email.trim()].filter(Boolean);
  if (profile.registrationNumber.trim()) parts.push(profile.registrationNumber.trim());
  return parts.join(" · ");
}

function SlipMark({ logo, place }: { logo: string; place: CompanySlipProfile["slipTemplate"] }) {
  if (!logo) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-2xl bg-white ${place === "compact" ? "h-14 w-14" : "h-16 w-16"}`}>
        <CompanyLogo />
      </span>
    );
  }
  const frame = place === "classic"
    ? "rounded-2xl shadow-[0_14px_32px_rgba(0,0,0,0.28)] ring-2 ring-white/90"
    : "rounded-2xl shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1 ring-[#e2e8f0]";
  const size = place === "compact" ? "h-16 max-w-[9.5rem]" : "h-24 max-w-[15rem]";
  return <img src={logo} alt="" className={`block w-auto object-contain ${size} ${frame}`} />;
}

function CompanyLogo() {
  return <span className="inline-flex shrink-0" dangerouslySetInnerHTML={{ __html: companyLogoSvg }} />;
}

function rowValue(rows: { label: string; value: string }[], label: string) {
  return rows.find((row) => row.label === label)?.value ?? "";
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full bg-[#f0fdfa] px-3 py-1.5 text-[#0f766e]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
