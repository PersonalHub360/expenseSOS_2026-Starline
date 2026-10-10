import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { barcodeSvg } from "@/lib/barcode";
import { loadCompanySlip, readSlipImage, saveCompanySlip, type CompanySlipProfile } from "@/lib/companySlip";
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

export function SlipView({ slip }: { slip: SlipDownload }) {
  const [profile, setProfile] = useState<CompanySlipProfile | null>(null);
  const [qr, setQr] = useState("");
  const [imageError, setImageError] = useState("");
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

  if (!profile) return <p className="text-sm text-[#7d8b96]">Preparing slip…</p>;

  function update(patch: Partial<CompanySlipProfile>) {
    setProfile((current) => (current ? { ...current, ...patch } : current));
  }

  async function onImage(file: File | undefined, field: "logo" | "stamp" | "signature") {
    if (!file) return;
    setImageError("");
    try {
      const dataUrl = await readSlipImage(file, field === "logo" ? 280 : 220);
      update({ [field]: dataUrl });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not read the image.");
    }
  }

  const barcode = barcodeSvg(slip.serial);

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] border border-[#99f6e4] bg-white p-4 print:hidden">
        <h2 className="font-semibold text-[#0f766e]">Slip options</h2>
        <p className="mt-1 text-sm text-[#5c6b76]">Company name, logo, signature, and stamp stay on this browser and print on every slip.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Company name
            <input
              value={profile.name}
              onChange={(event) => update({ name: event.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-[#d7e0e4] px-3"
            />
          </label>
          <label className="block text-sm font-medium">
            Authorised signatory
            <input
              value={profile.signatory}
              onChange={(event) => update({ signatory: event.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-[#d7e0e4] px-3"
              placeholder="Name"
            />
          </label>
          <label className="block text-sm font-medium">
            Signatory title
            <input
              value={profile.signatoryTitle}
              onChange={(event) => update({ signatoryTitle: event.target.value })}
              className="mt-1 h-11 w-full rounded-xl border border-[#d7e0e4] px-3"
            />
          </label>
          <ImageField label="Company logo" hasImage={Boolean(profile.logo)} onFile={(file) => onImage(file, "logo")} onClear={() => update({ logo: "" })} />
          <ImageField label="Authorised signature" hasImage={Boolean(profile.signature)} onFile={(file) => onImage(file, "signature")} onClear={() => update({ signature: "" })} />
          <ImageField label="Company stamp" hasImage={Boolean(profile.stamp)} onFile={(file) => onImage(file, "stamp")} onClear={() => update({ stamp: "" })} />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium">
          <Toggle label="Barcode" checked={profile.showBarcode} onChange={(showBarcode) => update({ showBarcode })} />
          <Toggle label="QR code" checked={profile.showQr} onChange={(showQr) => update({ showQr })} />
          <Toggle label="Authorised sign" checked={profile.showSignature} onChange={(showSignature) => update({ showSignature })} />
          <Toggle label="Company stamp" checked={profile.showStamp} onChange={(showStamp) => update({ showStamp })} />
        </div>
        {imageError ? <p className="mt-3 text-sm text-[#b42318]">{imageError}</p> : null}
      </section>

      <article className="receipt-sheet mx-auto max-w-3xl overflow-hidden rounded-[22px] border border-[#99f6e4] bg-white shadow-[0_16px_40px_rgba(15,118,110,0.08)] print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-[#047857] via-[#0f766e] to-[#2563eb] px-6 py-5 text-white print:bg-white print:text-[#10231f]">
          <div className="flex min-w-0 items-start gap-3">
            {profile.logo ? <img src={profile.logo} alt="" className="h-16 w-16 rounded-2xl bg-white object-contain p-1" /> : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75 print:text-[#0f766e]">{title}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{profile.name || "Starline Property"}</h1>
              <p className="mt-2 text-base font-semibold text-white print:text-[#10231f]">{slip.buyerName}</p>
              <p className="text-sm text-white/90 print:text-[#334155]">Phone {slip.buyerPhone}</p>
              <p className="mt-1 text-sm text-white/85 print:text-[#334155]">Serial {slip.serial}</p>
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button onClick={() => downloadSlipDocument(slip, profile, qr)}>Download</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          <span className="rounded-full bg-[#ccfbf1] px-3 py-1 text-xs font-semibold text-[#115e59]">Buyer {slip.buyerName}</span>
          <span className="rounded-full bg-[#fce7f3] px-3 py-1 text-xs font-semibold text-[#9d174d]">Phone {slip.buyerPhone}</span>
          <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-xs font-semibold text-[#065f46]">Date {clock.date}</span>
          <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-semibold text-[#1e3a8a]">Time {clock.time}</span>
          <span className="rounded-full bg-[#ede9fe] px-3 py-1 text-xs font-semibold text-[#5b21b6]">Serial {slip.serial}</span>
        </div>
        <div className="mt-4 grid gap-3 px-6 sm:grid-cols-3">
          <Highlight label="Buyer" value={slip.buyerName} detail={slip.buyerPhone} tone="bg-[#f0fdfa] text-[#115e59]" />
          <Highlight label="Project" value={rowValue(rows, "Project") || "—"} detail={rowValue(rows, "Unit")} tone="bg-[#eff6ff] text-[#1e3a8a]" />
          <Highlight label="Amount" value={rowValue(rows, "This receipt") || "—"} detail={rowValue(rows, "Method")} tone="bg-[#ecfdf5] text-[#065f46]" />
        </div>
        {profile.showBarcode || profile.showQr ? (
          <div className="mt-4 grid gap-4 px-6 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-end">
            {profile.showBarcode && barcode ? (
              <div>
                <div className="max-w-sm [&_svg]:h-14 [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: barcode }} />
                <p className="mt-1 font-mono text-xs tracking-wide text-[#334155]">{slip.serial}</p>
              </div>
            ) : <span />}
            {profile.showQr && qr ? (
              <div className="justify-self-start sm:justify-self-end">
                <img src={qr} alt={`QR code for serial ${slip.serial}`} className="h-36 w-36 rounded-xl border border-[#dbeafe] bg-white p-1" />
                <p className="mt-1 text-center text-[11px] font-medium text-[#1e3a8a]">Scan for all details</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <dl className="mt-4 grid gap-2 px-6">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 rounded-2xl bg-[#f8fafc] px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)]">
              <dt className="text-sm font-medium text-[#64748b]">{row.label}</dt>
              <dd className="text-sm font-semibold text-[#0f172a]">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 grid gap-6 px-6 py-6 sm:grid-cols-2">
          {profile.showSignature ? (
            <div>
              <div className="grid h-28 place-items-center rounded-2xl border border-dashed border-[#94a3b8] bg-[#f8fafc]">
                {profile.signature ? <img src={profile.signature} alt="" className="max-h-24 max-w-[220px] object-contain" /> : <span className="text-xs text-[#94a3b8]">Authorised sign</span>}
              </div>
              <p className="mt-2 text-sm font-semibold">Authorised sign</p>
              <p className="text-sm text-[#475569]">{profile.signatory || "Signatory"}</p>
              <p className="text-xs text-[#64748b]">{profile.signatoryTitle || "Authorised signatory"}</p>
            </div>
          ) : null}
          {profile.showStamp ? (
            <div>
              <div className="grid h-28 place-items-center rounded-full border border-dashed border-[#0f766e] bg-[#f0fdfa]">
                {profile.stamp ? <img src={profile.stamp} alt="" className="max-h-24 max-w-[160px] object-contain" /> : <span className="text-xs font-semibold text-[#0f766e]">Company stamp</span>}
              </div>
              <p className="mt-2 text-sm font-semibold">Company stamp</p>
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function Highlight({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
      {detail ? <p className="mt-0.5 text-sm opacity-80">{detail}</p> : null}
    </div>
  );
}

function rowValue(rows: { label: string; value: string }[], label: string) {
  return rows.find((row) => row.label === label)?.value ?? "";
}

function ImageField({
  label,
  hasImage,
  onFile,
  onClear,
}: {
  label: string;
  hasImage: boolean;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <label className="block text-sm font-medium">
      <span>{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#ccfbf1] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#0f766e]"
        />
        {hasImage ? (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-[#be123c]">
            Remove
          </button>
        ) : null}
      </div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full bg-[#f0fdfa] px-3 py-1.5 text-[#0f766e]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
