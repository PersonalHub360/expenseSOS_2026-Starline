import { useState } from "react";
import { Download } from "lucide-react";
import { Dialog, FieldError } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { downloadText } from "@/lib/download";
import { expenseTemplateCsv, parseExpenseCsv, type ExpenseImportRow } from "@/lib/expenseSheet";

export function ExpenseImportForm({
  onClose,
  onDone,
  onRefresh,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
  onRefresh: () => void;
}) {
  const [rows, setRows] = useState<ExpenseImportRow[]>([]);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const parsed = parseExpenseCsv(await file.text());
    setRows(parsed.rows);
    setFileError(parsed.errors.join(" "));
    setError("");
  }

  async function submit() {
    setPending(true);
    setError("");
    const result = await api<{ created: number; pending: number }>("/api/expenses/import", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      if (/saved/i.test(result.error)) onRefresh();
      return;
    }
    const waiting = result.data.pending > 0 ? ` ${result.data.pending} waiting for approval.` : "";
    onDone(`${result.data.created} expense${result.data.created === 1 ? "" : "s"} imported.${waiting}`);
  }

  return (
    <Dialog title="Import expenses" onClose={onClose} wide>
      <div className="grid gap-4">
        <p className="text-sm leading-6 text-[#5c6b76]">
          Each row is a new expense. The amount is taken from the named cash or bank account. Amounts of ৳50,000.00 or more wait for approval. Import does not change expenses that are already saved.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => downloadText("expense-import-template.csv", expenseTemplateCsv())}>
            <Download className="h-4 w-4" />
            Download template
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center rounded-xl bg-[#9a3412] px-4 text-sm font-semibold text-white">
            Choose CSV
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                void onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {fileName ? <span className="text-sm text-[#7c2d12]">{fileName}</span> : null}
        </div>
        {rows.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-[#fed7aa]">
            <p className="bg-[#fff7ed] px-3 py-2 text-xs font-semibold text-[#9a3412]">{rows.length} rows ready</p>
            <div className="max-h-64 overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-[#9a3412]">
                  <tr>
                    {["Row", "Date", "Category", "Amount", "Account", "Project"].map((label) => (
                      <th key={label} className="px-3 py-2 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((row) => (
                    <tr key={row.line} className="border-t border-[#ffedd5]">
                      <td className="px-3 py-2">{row.line}</td>
                      <td className="px-3 py-2">{row.date}</td>
                      <td className="px-3 py-2">{row.category}</td>
                      <td className="px-3 py-2">{row.amount}</td>
                      <td className="px-3 py-2">{row.account}</td>
                      <td className="px-3 py-2">{row.project || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 8 ? <p className="px-3 py-2 text-xs text-[#9a3412]">Showing the first 8 rows.</p> : null}
          </div>
        ) : null}
        <FieldError message={fileError || error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending || rows.length === 0 || Boolean(fileError)} onClick={() => void submit()}>
            {pending ? "Importing…" : "Import expenses"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
