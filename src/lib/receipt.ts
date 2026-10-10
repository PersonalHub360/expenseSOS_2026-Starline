import { barcodeSvg } from "@/lib/barcode";
import type { CompanySlipProfile } from "@/lib/companySlip";
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
    companyName || "Starline Property",
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
    companyName || "Starline Property",
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
  const company = profile?.name?.trim() || "Starline Property";
  const clock = slipClock(slip.issuedAt);
  const title = slip.title;
  const rows = slip.rows
    .map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`)
    .join("");
  const logo = imageTag(profile?.logo, "Company logo");
  const barcode = profile?.showBarcode === false ? "" : `<div class="code">${barcodeSvg(slip.serial)}<p>${escapeHtml(slip.serial)}</p></div>`;
  const qr = profile?.showQr === false || !qrDataUrl.startsWith("data:image/") ? "" : `<div class="code"><img src="${qrDataUrl}" alt="QR code for ${escapeHtml(slip.serial)}" width="160" height="160"/><p>Scan for all details</p></div>`;
  const signature = profile?.showSignature === false ? "" : `<div class="mark"><div class="box">${imageTag(profile?.signature, "Authorised signature")}</div><strong>Authorised sign</strong><span>${escapeHtml(profile?.signatory || "")}</span><span>${escapeHtml(profile?.signatoryTitle || "Authorised signatory")}</span></div>`;
  const stamp = profile?.showStamp === false ? "" : `<div class="mark"><div class="box stamp">${imageTag(profile?.stamp, "Company stamp")}</div><strong>Company stamp</strong></div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(slip.serial)}</title>
  <style>
    body { font-family: Georgia, serif; color: #10231f; margin: 32px; }
    header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 4px solid #0f766e; padding-bottom: 16px; }
    h1 { font-size: 26px; margin: 0; }
    .muted { color: #5c6b76; margin: 4px 0 0; }
    .chips { margin-top: 8px; }
    .chips span { display: inline-block; margin-right: 8px; padding: 4px 8px; background: #ecfdf5; border-radius: 999px; font-size: 13px; }
    img.logo { max-height: 72px; max-width: 160px; }
    .codes { display: flex; gap: 24px; align-items: flex-end; margin-top: 18px; }
    .code svg { width: 240px; height: 56px; }
    .code p, .mark span { margin: 4px 0 0; color: #5c6b76; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e6ebef; vertical-align: top; }
    th { width: 34%; color: #5c6b76; font-weight: 600; }
    .marks { display: flex; gap: 32px; margin-top: 36px; }
    .box { height: 90px; width: 180px; border: 1px dashed #94a3b8; display: grid; place-items: center; }
    .box img { max-height: 84px; max-width: 170px; }
  </style>
</head>
<body>
  <header>
    <div>${logo}<h1>${escapeHtml(company)}</h1><p class="muted">${title}</p><p class="chips"><span>Buyer ${escapeHtml(slip.buyerName)}</span><span>Phone ${escapeHtml(slip.buyerPhone)}</span><span>Serial ${escapeHtml(slip.serial)}</span><span>Date ${escapeHtml(clock.date)}</span><span>Time ${escapeHtml(clock.time)}</span></p></div>
  </header>
  <div class="codes">${barcode}${qr}</div>
  <table>${rows}</table>
  <div class="marks">${signature}${stamp}</div>
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
