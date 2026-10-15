export const expenseImportHeaders = ["Date", "Category", "Description", "Amount", "Method", "Account", "Project"] as const;

export type ExpenseImportRow = {
  line: number;
  date: string;
  category: string;
  description: string;
  amount: string;
  method: string;
  account: string;
  project: string;
};

export function expenseTemplateCsv() {
  return `${expenseImportHeaders.join(",")}\r\n`;
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function expensesToCsv(
  rows: {
    spentAt: string;
    category: string;
    description: string;
    amount: string;
    method: string;
    account: { name: string } | null;
    project: { name: string } | null;
    status: string;
  }[],
) {
  const header = [...expenseImportHeaders, "Status"];
  const body = rows.map((row) => [
    row.spentAt.slice(0, 10),
    row.category,
    row.description,
    row.amount,
    row.method,
    row.account?.name ?? "",
    row.project?.name ?? "",
    row.status,
  ]);
  return [header, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");
}

export function parseExpenseCsv(text: string): { rows: ExpenseImportRow[]; errors: string[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: ["The file is empty."] };
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const column = (name: string) => header.indexOf(name);
  const missing = expenseImportHeaders.map((name) => name.toLowerCase()).filter((name) => column(name) < 0);
  if (missing.length) return { rows: [], errors: [`Add these columns: ${missing.join(", ")}.`] };
  const data = table.slice(1).filter((line) => line.some((cell) => cell.trim()));
  if (data.length === 0) return { rows: [], errors: ["Add at least one expense row."] };
  if (data.length > 100) return { rows: [], errors: ["Import up to 100 expenses at a time."] };
  const rows = data.map((line, index) => ({
    line: index + 2,
    date: cell(line, column("date")),
    category: cell(line, column("category")),
    description: cell(line, column("description")),
    amount: cell(line, column("amount")),
    method: cell(line, column("method")),
    account: cell(line, column("account")),
    project: cell(line, column("project")),
  }));
  return { rows, errors: [] };
}

function cell(line: string[], index: number) {
  return (line[index] ?? "").trim();
}

function csvCell(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index += 1;
        } else quoted = false;
      } else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
