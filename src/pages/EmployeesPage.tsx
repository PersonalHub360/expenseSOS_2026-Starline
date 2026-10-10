import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { EmployeeForm } from "@/components/finance/EmployeeForms";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import {
  currentMonth,
  salaryStatusLabels,
  type EmployeeRow,
  type PayrollTotals,
  type SalarySlipRow,
} from "@/lib/finance";
import { formatTaka } from "@/lib/money";

type Summary = {
  month: string;
  slips: (SalarySlipRow & { employee: { id: string; name: string; jobTitle: string } })[];
  totals: PayrollTotals;
};

export function EmployeesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const allowed = can(user, "employees", "view");

  function loadEmployees() {
    api<{ employees: EmployeeRow[] }>("/api/employees").then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setRows(result.data.employees);
      }
    });
  }

  useEffect(() => {
    if (allowed) loadEmployees();
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    api<Summary>(`/api/employees/summary?month=${month}`).then((result) => {
      if (result.ok) setSummary(result.data);
    });
  }, [allowed, month]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to employees.</p>;

  const activeStaff = (rows ?? []).filter((employee) => employee.status === "active").length;

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#6d28d9] via-[#7c3aed] to-[#db2777] p-5 text-white shadow-[0_16px_40px_rgba(109,40,217,0.22)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">People</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Employees</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Staff, phone, monthly salary, and the payroll for the selected month.</p>
          </div>
          {can(user, "employees", "add") ? (
            <Button className="bg-white text-[#6d28d9] hover:bg-[#f5f3ff]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add employee
            </Button>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-3 py-1">{rows?.length ?? 0} staff</span>
          <span className="rounded-full bg-[#ede9fe] px-3 py-1 text-[#5b21b6]">{activeStaff} active</span>
          {summary ? (
            <>
              <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[#1e3a8a]">Base {formatTaka(summary.totals.base)}</span>
              <span className="rounded-full bg-[#d1fae5] px-3 py-1 text-[#065f46]">Bonus {formatTaka(summary.totals.bonus)}</span>
              <span className="rounded-full bg-[#ffedd5] px-3 py-1 text-[#9a3412]">Deduction {formatTaka(summary.totals.deduction)}</span>
              <span className="rounded-full bg-white px-3 py-1 text-[#6d28d9]">Net {formatTaka(summary.totals.net)}</span>
            </>
          ) : null}
        </div>
      </header>
      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      <section className="rounded-[22px] border border-[#ddd6fe] bg-white p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)] sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold text-[#5b21b6]">Monthly salary summary</h2>
          <label className="text-sm font-medium">
            Month
            <input className="ml-2 h-11 rounded-xl border border-[#ddd6fe] bg-[#f5f3ff] px-3 text-sm" type="month" value={month} aria-label="Salary month" onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>
        {summary ? (
          summary.slips.length === 0 ? (
            <p className="text-sm text-[#7d8b96]">No salary slips for this month.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {summary.slips.map((slip) => (
                <Link key={slip.id} href={`/employees/${slip.employee.id}/slips/${slip.id}`} className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff] px-4 py-3">
                  <span className="font-semibold text-[#5b21b6]">{slip.employee.name}</span>
                  <span className="mt-1 block text-sm text-[#6d28d9]">{slip.employee.jobTitle || "Staff"} · {salaryStatusLabels[slip.status]}</span>
                  <span className="mt-2 block text-lg font-semibold text-[#5b21b6]">{formatTaka(slip.net)}</span>
                </Link>
              ))}
            </div>
          )
        ) : (
          <p className="text-sm text-[#7d8b96]">Loading summary…</p>
        )}
      </section>
      {rows === null ? (
        <p className="text-sm text-[#7d8b96]">Loading employees…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[22px] bg-white px-4 py-10 text-center text-sm text-[#7d8b96]">No employees yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((employee) => (
            <article key={employee.id} className="rounded-[22px] border border-[#fbcfe8] bg-white p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/employees/${employee.id}`} className="text-lg font-semibold text-[#9d174d] hover:underline">{employee.name}</Link>
                  <p className="mt-1 text-sm text-[#9d174d]">{employee.jobTitle || "Staff"} · {employee.phone || "No phone"}</p>
                </div>
                <span className="rounded-full bg-[#fce7f3] px-2.5 py-1 text-[11px] font-semibold text-[#9d174d]">{salaryStatusLabels[employee.status] ?? employee.status}</span>
              </div>
              <p className="mt-4 text-right text-lg font-semibold text-[#6d28d9]">{formatTaka(employee.monthlySalary)}</p>
            </article>
          ))}
        </div>
      )}
      {creating ? (
        <EmployeeForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice("Employee added.");
            loadEmployees();
          }}
        />
      ) : null}
    </div>
  );
}
