import { barcodeSvg } from "@/lib/barcode";
import { companyLogoSvg, type CompanySlipProfile } from "@/lib/companySlip";
import { formatTaka } from "@/lib/money";
import { formatProjectDate } from "@/lib/projects";
import { formatTimestamp, methodLabel, type Receipt } from "@/lib/sales";

export function receiptRows(receipt: Receipt) {
  const rows: { label: string; value: string }[] = [
    { label: "Receipt", value: receipt.receiptNumber },
    { label: "Issued", value: formatTimestamp(receipt.issuedAt) },
    { label: "Type", value: receipt.kind === "refund" ? "Refund" : "Payment" },
    { label: "Buyer", value: receipt.buyer.name },
    { label: "Phone", value: receipt.buyer.phone },
  ];
  if (receipt.buyer.email) rows.push({ label: "Email", value: receipt.buyer.email });
  if (receipt.buyer.address) rows.push({ label: "Address", value: receipt.buyer.address });
  if (receipt.project) rows.push({ label: "Project", value: receipt.project.name });
  if (receipt.unit) rows.push({ label: "Unit", value: `${receipt.unit.number} · ${receipt.unit.type}` });
  if (receipt.booking) rows.push({ label: "Booking", value: `${receipt.booking.reference} · ${formatTaka(receipt.booking.amount)}` });
  if (receipt.sale) {
    rows.push({ label: "Sale", value: receipt.sale.reference });
    rows.push({ label: "Sale price", value: formatTaka(receipt.sale.listPrice) });
    rows.push({ label: "Discount", value: formatTaka(receipt.sale.discount) });
    rows.push({ label: "Price after discount", value: formatTaka(receipt.sale.net) });
  }
  for (const installment of receipt.installments) {
    rows.push({
      label: installment.label || `Installment ${installment.sequence}`,
      value: `${formatTaka(installment.applied)} applied · due ${formatProjectDate(installment.dueDate)}`,
    });
  }
  rows.push({ label: "This receipt", value: formatTaka(receipt.amount) });
  rows.push({ label: "Method", value: methodLabel(receipt.method) });
  if (receipt.note) rows.push({ label: "Note", value: receipt.note });
  rows.push({ label: "Received to date", value: formatTaka(receipt.received) });
  rows.push({
    label: receipt.kind === "refund" ? "Booking money still held" : "Outstanding after this receipt",
    value: formatTaka(receipt.outstanding),
  });
  return rows;
}

export function slipClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };
  return {
    date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(date),
  };
}

export function slipScanText(receipt: Receipt, companyName: string) {
  const clock = slipClock(receipt.issuedAt);
  const lines = [
    companyName || "Starline Builder's Limited",
    receipt.kind === "refund" ? "Refund slip" : "Payment slip",
    `Serial: ${receipt.receiptNumber}`,
    `Date: ${clock.date}`,
    `Time: ${clock.time}`,
    `Buyer: ${receipt.buyer.name}`,
    `Phone: ${receipt.buyer.phone}`,
    ...receiptRows(receipt).map((row) => `${row.label}: ${row.value}`),
  ];
  return lines.join("\n");
}

export type SlipDownload = {
  title: string;
  serial: string;
  issuedAt: string;
  buyerName: string;
  buyerPhone: string;
  rows: { label: string; value: string }[];
};

export function slipDocumentScan(slip: SlipDownload, companyName: string) {
  const clock = slipClock(slip.issuedAt);
  return [
    companyName || "Starline Builder's Limited",
    slip.title,
    `Serial: ${slip.serial}`,
    `Date: ${clock.date}`,
    `Time: ${clock.time}`,
    `Buyer: ${slip.buyerName}`,
    `Phone: ${slip.buyerPhone}`,
    ...slip.rows.map((row) => `${row.label}: ${row.value}`),
  ].join("\n");
}

export function receiptHtml(receipt: Receipt, profile?: CompanySlipProfile, qrDataUrl = "") {
  return slipDownloadHtml(slipFromReceipt(receipt), profile, qrDataUrl);
}

export function downloadSlipDocument(slip: SlipDownload, profile?: CompanySlipProfile, qrDataUrl = "") {
  const blob = new Blob([slipDownloadHtml(slip, profile, qrDataUrl)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slip.serial}-slip.html`;
  link.click();
  URL.revokeObjectURL(url);
}

function slipFromReceipt(receipt: Receipt): SlipDownload {
  return {
    title: receipt.kind === "refund" ? "Refund slip" : "Payment slip",
    serial: receipt.receiptNumber,
    issuedAt: receipt.issuedAt,
    buyerName: receipt.buyer.name,
    buyerPhone: receipt.buyer.phone,
    rows: receiptRows(receipt),
  };
}

function slipDownloadHtml(slip: SlipDownload, profile?: CompanySlipProfile, qrDataUrl = "") {
  const company = profile?.name?.trim() || "Starline Builder's Limited";
  const location = profile?.location?.trim() || "";
  const clock = slipClock(slip.issuedAt);
  const title = slip.title;
  const template = profile?.slipTemplate === "clean" || profile?.slipTemplate === "compact" ? profile.slipTemplate : "classic";
  const heading = title.toLowerCase().includes("refund") ? title : profile?.slipTitle?.trim() || "Payment slip";
  const footer = profile?.slipFooter?.trim() || `Issued by ${company}`;
  const signWord = profile?.signLabel?.trim() || "Sign";
  const stampWord = profile?.stampLabel?.trim() || "Company stamp";
  const rows = slip.rows
    .filter((row) => !["This receipt", "Buyer", "Phone", "Method"].includes(row.label))
    .map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
    .join("");
  const logo = profile?.logo?.startsWith("data:image/")
    ? `<img class="mark" src="${profile.logo}" alt=""/>`
    : `<span class="builtin">${companyLogoSvg}</span>`;
  const contact = [profile?.phone, profile?.email, profile?.registrationNumber].map((item) => item?.trim() || "").filter(Boolean).join(" · ");
  const paper = profile?.paper === "letter" ? "letter" : "A4";
  const party = title.toLowerCase().includes("refund") ? "Returned to" : "Received from";
  const amount = slip.rows.find((row) => row.label === "This receipt")?.value || "";
  const method = slip.rows.find((row) => row.label === "Method")?.value || "";
  const barcode = profile?.showBarcode === false ? "" : `<div class="code">${barcodeSvg(slip.serial)}</div>`;
  const qr = profile?.showQr === false || !qrDataUrl.startsWith("data:image/") ? "" : `<div class="code"><img src="${qrDataUrl}" alt="QR code for ${escapeHtml(slip.serial)}" width="140" height="140"/><p>Scan for all details</p></div>`;
  const financeName = profile?.signatory?.trim() || "";
  const signature = `<div class="mark"><div class="box">${imageTag(profile?.signature, signWord)}</div><strong>${escapeHtml(signWord)}</strong>${financeName ? `<span>${escapeHtml(financeName)}</span>` : ""}</div>`;
  const stamp = `<div class="mark"><div class="box">${imageTag(profile?.stamp, stampWord)}</div><strong>${escapeHtml(stampWord)}</strong></div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(slip.serial)}</title>
  <style>
    @page { size: ${paper}; margin: 12mm; }
    body { margin: 0; background: #f4efe6; color: #16302c; font-family: Georgia, "Times New Roman", serif; }
    .sheet { max-width: 680px; margin: 28px auto; background: #fffaf3; border: 1px solid #d4b483; box-shadow: 0 18px 50px rgba(8,36,32,0.12); }
    header { background: #0c3b34; color: #fff; padding: 36px 40px 32px; text-align: center; }
    body.clean .sheet { background: #fff; border-color: #d7e0e4; }
    body.clean header { background: #fff; color: #16302c; border-bottom: 3px solid #0f766e; }
    body.clean .muted, body.clean .eyebrow { color: #5c6b76; }
    body.compact .sheet { background: #fff; border-color: #d7e0e4; }
    body.compact header { background: #f8fafc; color: #16302c; text-align: left; }
    body.compact .amount { margin-top: 8px; font-size: 32px; color: #16302c; }
    body.compact .muted, body.compact .eyebrow { color: #64748b; }
    .brand { display: grid; justify-items: center; }
    .brand .mark { display: block; height: 96px; width: auto; max-width: 240px; object-fit: contain; border-radius: 16px; box-shadow: 0 14px 32px rgba(0,0,0,0.28); }
    .brand .builtin { display: grid; place-items: center; width: 64px; height: 64px; background: #fff; border-radius: 16px; }
    .brand .builtin svg { width: 48px; height: 48px; }
    body.compact .brand { justify-items: start; }
    body.compact .brand .mark { height: 64px; max-width: 152px; box-shadow: 0 8px 18px rgba(15,23,42,0.08); }
    h1 { font-family: Inter, Georgia, serif; font-size: 26px; margin: 0; }
    .eyebrow { letter-spacing: 0.34em; text-transform: uppercase; color: #e7d3ae; font-size: 11px; margin: 0 0 4px; font-family: Inter, sans-serif; }
    .amount { margin: 28px 0 0; font-size: 48px; line-height: 1; }
    .muted { color: rgba(255,255,255,0.8); margin: 10px 0 0; font-family: Inter, sans-serif; font-size: 14px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid #eadcc4; text-align: center; }
    .meta div { padding: 12px; }
    .meta p { margin: 0; color: #8a7340; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; font-family: Inter, sans-serif; }
    .meta strong { display: block; margin-top: 4px; font-size: 13px; }
    .body { padding: 32px 40px 36px; }
    .party { margin: 0; color: #8a7340; letter-spacing: 0.28em; text-transform: uppercase; font-size: 11px; font-family: Inter, sans-serif; }
    .who { margin: 6px 0 0; font-size: 30px; }
    .phone { margin: 4px 0 0; color: #5c5346; font-family: Inter, sans-serif; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { text-align: left; padding: 12px 0; border-bottom: 1px solid #efe4cf; vertical-align: top; }
    th { width: 34%; color: #8a7340; font-weight: 600; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; font-family: Inter, sans-serif; }
    .codes { display: flex; gap: 24px; align-items: flex-end; margin-top: 24px; }
    .code svg { width: 220px; height: 48px; }
    .marks { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; }
    .marks .mark:last-child { text-align: right; }
    .marks .mark:last-child .box { justify-items: end; }
    .box { height: 84px; display: grid; align-items: end; }
    .box img { max-height: 76px; max-width: 180px; }
    .mark strong { display: block; border-top: 1px solid #16302c; padding-top: 8px; }
    .mark span, .foot { color: #a08b62; font-size: 12px; }
    .foot { margin: 36px 0 0; text-align: center; letter-spacing: 0.22em; text-transform: uppercase; font-family: Inter, sans-serif; }
  </style>
</head>
<body class="${template}">
  <article class="sheet">
    <header>
      <div class="brand">${logo}<h1 style="margin-top:16px">${escapeHtml(company)}</h1>${location ? `<p class="muted">${escapeHtml(location)}</p>` : ""}${contact ? `<p class="muted">${escapeHtml(contact)}</p>` : ""}</div>
      <p class="eyebrow" style="margin-top:28px">${escapeHtml(heading)}</p>
      <p class="amount">${escapeHtml(amount)}</p>
      ${method ? `<p class="muted">${escapeHtml(method)}</p>` : ""}
    </header>
    <div class="meta">
      <div><p>Date</p><strong>${escapeHtml(clock.date)}</strong></div>
      <div><p>Time</p><strong>${escapeHtml(clock.time)}</strong></div>
      <div><p>Serial</p><strong>${escapeHtml(slip.serial)}</strong></div>
    </div>
    <div class="body">
      <p class="party">${party}</p>
      <p class="who">${escapeHtml(slip.buyerName)}</p>
      <p class="phone">${escapeHtml(slip.buyerPhone)}</p>
      ${rows ? `<table>${rows}</table>` : ""}
      <div class="codes">${barcode}${qr}</div>
      <div class="marks">${signature}${stamp}</div>
      <p class="foot">${escapeHtml(footer)}</p>
    </div>
  </article>
</body>
</html>`;
}

export function downloadReceipt(receipt: Receipt, profile?: CompanySlipProfile, qrDataUrl = "") {
  downloadSlipDocument(slipFromReceipt(receipt), profile, qrDataUrl);
}

function imageTag(src: string | undefined, alt: string) {
  if (!src?.startsWith("data:image/")) return "";
  return `<img class="logo" src="${src}" alt="${escapeHtml(alt)}" />`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
