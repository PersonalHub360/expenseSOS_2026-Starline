import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { SalarySlipForm } from "@/components/finance/EmployeeForms";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { salaryStatusLabels, type EmployeeRow, type SalarySlipRow } from "@/lib/finance";
import { formatTaka } from "@/lib/money";

export function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const id = params.id ?? "";
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [slips, setSlips] = useState<SalarySlipRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    api<{ employee: EmployeeRow; slips: SalarySlipRow[] }>(`/api/employees/${id}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setEmployee(result.data.employee);
        setSlips(result.data.slips);
      }
    });
  }

  useEffect(() => {
    if (id && can(user, "employees", "view")) load();
  }, [id, user]);

  if (!can(user, "employees", "view")) return <p className="text-sm text-[#b42318]">You do not have access to employees.</p>;
  if (error && !employee) return <p className="text-sm text-[#b42318]">{error}</p>;
  if (!employee) return <p className="text-sm text-[#7d8b96]">Loading employee…</p>;

  return (
    <div>
      <Link href="/employees" className="text-sm font-medium text-[#12786c] hover:underline">
        Employees
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{employee.name}</h1>
          <p className="mt-1 text-sm text-[#5c6b76]">
            {employee.jobTitle || "Staff"} · {salaryStatusLabels[employee.status]} · {formatTaka(employee.monthlySalary)} / month
          </p>
        </div>
        {can(user, "employees", "add") ? <Button onClick={() => setCreating(true)}>Record salary</Button> : null}
      </div>
      {notice ? <p className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      <dl className="mt-5 grid gap-2 text-sm text-[#5c6b76] sm:grid-cols-2">
        <div>Phone: {employee.phone || "—"}</div>
        <div>Email: {employee.email || "—"}</div>
        <div>Address: {employee.address || "—"}</div>
        <div>Joined: {employee.joinedOn || "—"}</div>
      </dl>
      {employee.notes ? <p className="mt-3 text-sm text-[#5c6b76]">{employee.notes}</p> : null}
      <section className="mt-6 rounded-[22px] border border-[#eef1f4] bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold">Salary slips</h2>
        {slips.length === 0 ? (
          <p className="mt-3 text-sm text-[#7d8b96]">No salary recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#f0f3f5] text-sm">
            {slips.map((slip) => (
              <li key={slip.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <Link href={`/employees/${employee.id}/slips/${slip.id}`} className="font-semibold text-[#12786c] hover:underline">
                  {slip.period}
                </Link>
                <span>
                  {salaryStatusLabels[slip.status]}
                  {slip.paidOn ? ` · ${slip.paidOn}` : ""} · {formatTaka(slip.net)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {creating ? (
        <SalarySlipForm
          employeeId={employee.id}
          baseSalary={employee.monthlySalary}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice("Salary slip saved.");
            load();
          }}
        />
      ) : null}
    </div>
  );
}
