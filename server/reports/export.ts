import type { ReportTable } from "./queries";

export function reportCsv(report: ReportTable) {
  const header = report.columns.map((column) => column.label);
  const body = report.rows.map((row) => report.columns.map((column) => row[column.key] ?? ""));
  const totals = report.totals.map((total) => [total.label, total.value]);
  return [...[header, ...body, [], ...totals].map((line) => line.map(csvCell).join(","))].join("\r\n");
}

export function reportSheet(report: ReportTable) {
  const rows = [
    report.columns.map((column) => column.label),
    ...report.rows.map((row) => report.columns.map((column) => row[column.key] ?? "")),
    [],
    ...report.totals.map((total) => [total.label, total.value]),
  ];
  const table = rows
    .map((line) => `<Row>${line.map((cell) => `<Cell><Data ss:Type="String">${xml(cell)}</Data></Cell>`).join("")}</Row>`)
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Report"><Table>${table}</Table></Worksheet>
</Workbook>`;
}

export function reportPdf(report: ReportTable) {
  const lines = [
    report.title,
    ...report.totals.map((total) => `${total.label}: ${total.value}`),
    "",
    report.columns.map((column) => column.label).join(" | "),
    ...report.rows.map((row) => report.columns.map((column) => row[column.key] ?? "").join(" | ")),
  ];
  return renderPdf(lines);
}

function csvCell(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPdf(lines: string[]) {
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 46) pages.push(lines.slice(index, index + 46));
  if (!pages.length) pages.push(["Report"]);
  const objects: string[] = [];
  const pageIds: number[] = [];
  let nextId = 3;
  const fontId = 3 + pages.length * 2;
  for (const page of pages) {
    const contentId = nextId;
    const pageId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);
    objects[contentId] = streamObject(page);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  }
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${fontId + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let id = 1; id <= fontId; id += 1) body += `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}

function streamObject(lines: string[]) {
  const commands = ["BT", "/F1 9 Tf", "48 760 Td", "14 TL"];
  for (const line of lines) commands.push(`(${pdfText(line)}) Tj`, "T*");
  commands.push("ET");
  const stream = commands.join("\n");
  return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
}

function pdfText(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
